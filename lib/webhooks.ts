import { eq } from "drizzle-orm";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { getDb } from "@/db";
import { paymentIntents } from "@/db/schema";
import { type PaymentIntent } from "@/lib/payments";
import { getClientByClientId } from "@/lib/oauth";
import { hmacSign } from "@/lib/crypto";

/**
 * Best-effort, signed server-to-server delivery of payment state changes.
 *
 * Redirect-then-verify is the happy path, but a user can pay and then lose the
 * redirect (closed tab, dropped wifi). A webhook lets the provider learn about a
 * settled intent regardless. This is *best-effort*: `/api/pay/verify` remains the
 * authoritative source of truth, so a permanently-failed webhook is always
 * recoverable. There is no background queue, so we retry a few times inline.
 */

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 500, 1500];
const TIMEOUT_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type HeaderMap = Record<string, string>;

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateIPv4(mappedIpv4);
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("ff")
  );
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

export async function validateWebhookUrl(
  rawUrl: string,
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "invalid_scheme" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "userinfo_not_allowed" };
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "private_host" };
  }
  if (isIP(host)) {
    return isBlockedAddress(host)
      ? { ok: false, reason: "private_host" }
      : { ok: true, url: url.toString() };
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: "host_lookup_failed" };
  }
  if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address))) {
    return { ok: false, reason: "private_host" };
  }

  return { ok: true, url: url.toString() };
}

async function safeLookup(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  const publicAddresses = addresses.filter((a) => !isBlockedAddress(a.address));
  if (!publicAddresses.length) {
    throw new Error("Webhook host resolved to a private address.");
  }
  const selected = publicAddresses[0];
  return { address: selected.address, family: selected.family as 4 | 6 };
}

function postWebhook(
  rawUrl: string,
  headers: HeaderMap,
  body: string,
): Promise<number> {
  const url = new URL(rawUrl);
  const transport = url.protocol === "https:" ? https : http;
  const lookupFn: LookupFunction = (hostname, _options, callback) => {
    safeLookup(hostname)
      .then(({ address, family }) => callback(null, address, family))
      .catch((err) => callback(err as NodeJS.ErrnoException, "", 4));
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "POST",
        headers,
        timeout: TIMEOUT_MS,
        lookup: lookupFn,
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Webhook delivery timed out.")));
    req.on("error", reject);
    req.end(body);
  });
}

/** Build the signed body + headers for a payment webhook. Exported for tests. */
export function buildWebhookRequest(
  intent: PaymentIntent,
  secret: string,
): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify({
    event: `payment.${intent.status}`,
    intent_id: intent.id,
    ref: intent.ref,
    status: intent.status,
    amount: intent.amount,
    description: intent.description,
    user_id: intent.userId,
    created_at: intent.createdAt,
  });
  const ts = Math.floor(Date.now() / 1000);
  const signature = hmacSign(`${ts}.${body}`, secret);
  return {
    body,
    headers: {
      "content-type": "application/json",
      // Idempotency key — the receiver should de-dupe on this.
      "x-webhook-id": intent.id,
      // Signature over `${timestamp}.${rawBody}`; verify before trusting.
      "x-webhook-signature": `t=${ts},v1=${signature}`,
    },
  };
}

/**
 * Deliver a webhook for an intent whose status just changed. No-op if the
 * client has no webhook configured. Records delivery state on the intent row.
 */
export async function deliverPaymentWebhook(
  intent: PaymentIntent,
): Promise<void> {
  const client = await getClientByClientId(intent.clientId);
  if (!client?.webhookUrl || !client.webhookSecret) return;

  const validated = await validateWebhookUrl(client.webhookUrl);
  if (!validated.ok) return;

  const url = validated.url;
  const { body, headers } = buildWebhookRequest(intent, client.webhookSecret);
  const db = getDb();

  let lastError = "delivery failed";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt - 1]) await sleep(BACKOFF_MS[attempt - 1]);
    try {
      const status = await postWebhook(url, headers, body);
      if (status >= 200 && status < 300) {
        await db
          .update(paymentIntents)
          .set({
            webhookStatus: "delivered",
            webhookAttempts: attempt,
            webhookLastError: null,
            webhookDeliveredAt: new Date(),
          })
          .where(eq(paymentIntents.id, intent.id));
        return;
      }
      lastError = `HTTP ${status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  await db
    .update(paymentIntents)
    .set({
      webhookStatus: "failed",
      webhookAttempts: MAX_ATTEMPTS,
      webhookLastError: lastError.slice(0, 500),
    })
    .where(eq(paymentIntents.id, intent.id));
}
