import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  deviceAuthorizations,
  type DeviceAuthorization,
  type User,
} from "@/db/schema";
import { hashSecret, hashToken, randomToken } from "@/lib/crypto";
import {
  findInvalidRedirectUri,
  unknownScopes,
} from "@/lib/apps";
import { env } from "@/lib/env";

/**
 * Browser-approved device authorization (RFC 8628-style), used so a coding-agent
 * skill can register an OAuth app on the user's behalf without a copied token.
 *
 *  - The skill calls {@link startDeviceAuthorization} and gets a secret
 *    `device_code` (returned once, stored hashed) plus a short `user_code`.
 *  - The user opens the verification URL, reviews the request, and approves via
 *    {@link approveDevice}; we create the client and stash the plaintext secret
 *    on the row transiently.
 *  - The skill polls {@link pollDeviceAuthorization}; on the first poll after
 *    approval it gets the credentials once, then the secret is nulled and the
 *    row marked consumed.
 */

const DEVICE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const POLL_INTERVAL_SECONDS = 5;

/** Crockford base32 without ambiguous chars (no I, L, O, U). */
const USER_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A short, human-typable code in canonical form (8 chars, no separator). */
function generateUserCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
  }
  return out;
}

/** Canonicalize a code for storage/lookup: uppercase, alphabet chars only. */
export function normalizeUserCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Group the canonical code as XXXX-XXXX for display. */
export function formatUserCode(code: string): string {
  const c = normalizeUserCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export type StartResult =
  | {
      ok: true;
      deviceCode: string;
      userCode: string;
      expiresIn: number;
      interval: number;
    }
  | { ok: false; error: string; errorDescription: string };

/**
 * Create a pending device authorization for a proposed app registration. The
 * proposed name/redirect_uris/scopes are validated here so the approval screen
 * never shows a request that couldn't be fulfilled.
 */
export async function startDeviceAuthorization(input: {
  name: string;
  redirectUris: string[];
  scopes: string[];
}): Promise<StartResult> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "invalid_request", errorDescription: "name is required." };
  }
  if (input.redirectUris.length === 0) {
    return {
      ok: false,
      error: "invalid_request",
      errorDescription: "At least one redirect_uri is required.",
    };
  }
  const badUri = findInvalidRedirectUri(input.redirectUris);
  if (badUri) {
    return {
      ok: false,
      error: "invalid_request",
      errorDescription: `redirect_uri is not a valid URL: ${badUri}`,
    };
  }
  const scopes = input.scopes.length ? input.scopes : ["identify"];
  const bad = unknownScopes(scopes);
  if (bad.length) {
    return {
      ok: false,
      error: "invalid_scope",
      errorDescription: `Unknown scope(s): ${bad.join(", ")}`,
    };
  }

  const deviceCode = randomToken(32);
  const userCode = generateUserCode();
  const db = getDb();
  await db.insert(deviceAuthorizations).values({
    deviceCodeHash: hashToken(deviceCode),
    userCode,
    requestedName: name,
    requestedRedirectUris: input.redirectUris,
    requestedScopes: scopes,
    expiresAt: new Date(Date.now() + DEVICE_TTL_MS),
  });

  return {
    ok: true,
    deviceCode,
    // Returned grouped for readability; lookups normalize the separator away.
    userCode: formatUserCode(userCode),
    expiresIn: Math.floor(DEVICE_TTL_MS / 1000),
    interval: POLL_INTERVAL_SECONDS,
  };
}

export type PollResult =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "invalid" }
  | {
      status: "approved";
      credentials: {
        clientId: string;
        clientSecret: string;
        redirectUris: string[];
        scopes: string[];
      };
    };

/**
 * Poll a device authorization by its secret `device_code`. On the first poll
 * after approval, returns the credentials once and consumes the row; subsequent
 * polls report `invalid`.
 */
export async function pollDeviceAuthorization(
  deviceCode: string,
): Promise<PollResult> {
  if (!deviceCode) return { status: "invalid" };
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(deviceAuthorizations)
      .where(eq(deviceAuthorizations.deviceCodeHash, hashToken(deviceCode)))
      .limit(1)
      .for("update");

    if (!row) return { status: "invalid" };
    if (row.status === "consumed") return { status: "invalid" };
    if (row.expiresAt.getTime() < Date.now()) return { status: "expired" };
    if (row.status === "denied") return { status: "denied" };

    // Enforce a minimum poll interval (slow-down without erroring the flow).
    const now = Date.now();
    const tooSoon =
      row.lastPolledAt != null &&
      now - row.lastPolledAt.getTime() < (POLL_INTERVAL_SECONDS - 1) * 1000;
    if (tooSoon && row.status === "pending") return { status: "slow_down" };
    if (row.status === "pending") {
      await tx
        .update(deviceAuthorizations)
        .set({ lastPolledAt: new Date(now) })
        .where(eq(deviceAuthorizations.id, row.id));
      return { status: "pending" };
    }

    // status === "approved": hand over the credentials once, then consume.
    if (!row.clientId || !row.clientSecret) return { status: "invalid" };
    await tx
      .update(deviceAuthorizations)
      .set({ status: "consumed", clientSecret: null })
      .where(
        and(
          eq(deviceAuthorizations.id, row.id),
          eq(deviceAuthorizations.status, "approved"),
        ),
      );

    return {
      status: "approved",
      credentials: {
        clientId: row.clientId,
        clientSecret: row.clientSecret,
        redirectUris: row.requestedRedirectUris,
        scopes: row.requestedScopes,
      },
    };
  });
}

/** Look up a still-pending, unexpired request by its short user code. */
export async function getPendingByUserCode(
  userCode: string,
): Promise<DeviceAuthorization | null> {
  const code = normalizeUserCode(userCode);
  if (!code) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(deviceAuthorizations)
    .where(
      and(
        eq(deviceAuthorizations.userCode, code),
        eq(deviceAuthorizations.status, "pending"),
        gt(deviceAuthorizations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type ApproveResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" };

/**
 * Approve a pending request: create the client owned by the approving user and
 * stash its id + plaintext secret on the row for the next poll to retrieve.
 */
export async function approveDevice(
  userCode: string,
  user: User,
): Promise<ApproveResult> {
  const db = getDb();
  const code = normalizeUserCode(userCode);
  if (!code) return { ok: false, reason: "not_found" };

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(deviceAuthorizations)
      .where(eq(deviceAuthorizations.userCode, code))
      .limit(1)
      .for("update");
    if (!row || row.status !== "pending") return { ok: false, reason: "not_found" };
    if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

    const clientId = `fgc_${randomToken(8)}`;
    const secret = randomToken(32);
    await tx.insert(clients).values({
      name: row.requestedName,
      clientId,
      clientSecretHash: hashSecret(secret),
      redirectUris: row.requestedRedirectUris,
      allowedScopes: row.requestedScopes.length ? row.requestedScopes : ["identify"],
      trusted: false,
      ownerUserId: user.id,
    });

    await tx
      .update(deviceAuthorizations)
      .set({ status: "approved", userId: user.id, clientId, clientSecret: secret })
      .where(
        and(
          eq(deviceAuthorizations.id, row.id),
          eq(deviceAuthorizations.status, "pending"),
        ),
      );
    return { ok: true };
  });
}

/** Deny a pending request. */
export async function denyDevice(userCode: string): Promise<ApproveResult> {
  const db = getDb();
  const code = normalizeUserCode(userCode);
  if (!code) return { ok: false, reason: "not_found" };
  const [row] = await db
    .update(deviceAuthorizations)
    .set({ status: "denied" })
    .where(
      and(
        eq(deviceAuthorizations.userCode, code),
        eq(deviceAuthorizations.status, "pending"),
        gt(deviceAuthorizations.expiresAt, new Date()),
      ),
    )
    .returning({ id: deviceAuthorizations.id });
  return row ? { ok: true } : { ok: false, reason: "not_found" };
}

/** Endpoint URLs advertised to skills + used in the verification doc. */
export function deviceEndpoints() {
  const base = env.APP_URL;
  return {
    startEndpoint: `${base}/api/manage/device/start`,
    pollEndpoint: `${base}/api/manage/device/poll`,
    verificationUri: `${base}/device`,
  };
}
