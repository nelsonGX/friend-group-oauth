import { eq } from "drizzle-orm";
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

  const url = client.webhookUrl;
  const { body, headers } = buildWebhookRequest(intent, client.webhookSecret);
  const db = getDb();

  let lastError = "delivery failed";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt - 1]) await sleep(BACKOFF_MS[attempt - 1]);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (res.ok) {
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
      lastError = `HTTP ${res.status}`;
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
