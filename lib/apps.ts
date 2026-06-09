import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { hashSecret, randomToken } from "@/lib/crypto";
import { SUPPORTED_SCOPES } from "@/lib/oauth";

/**
 * Provider-app (OAuth client) registration, shared by every path that creates
 * one: the dashboard's self-service form and the browser-approved device flow.
 * Keeping it here means a device-registered app is byte-for-byte identical to a
 * dashboard-registered one (owner-owned, untrusted, always consent).
 */

export interface RegisterClientInput {
  /** Owner of the app (the registering/approving user), or null for admin-created. */
  ownerUserId: string | null;
  name: string;
  redirectUris: string[];
  scopes: string[];
}

export interface RegisteredClient {
  clientId: string;
  /** Plaintext secret — returned once, never recoverable (stored hashed). */
  secret: string;
}

/** Validate a list of redirect URIs as absolute URLs. Returns the bad one, or null. */
export function findInvalidRedirectUri(uris: string[]): string | null {
  for (const uri of uris) {
    try {
      new URL(uri);
    } catch {
      return uri;
    }
  }
  return null;
}

/** Scopes that aren't part of SUPPORTED_SCOPES. Empty array means all are valid. */
export function unknownScopes(scopes: string[]): string[] {
  return scopes.filter(
    (s) => !(SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
}

/**
 * Insert a new OAuth client and return its public id + freshly minted secret.
 * Callers are responsible for validating `name`/`redirectUris`/`scopes` first
 * (use {@link findInvalidRedirectUri} / {@link unknownScopes}); this performs the
 * insert only. Owner-created clients are never trusted.
 */
export async function registerClient(
  input: RegisterClientInput,
): Promise<RegisteredClient> {
  const db = getDb();
  const clientId = `fgc_${randomToken(8)}`;
  const secret = randomToken(32);
  await db.insert(clients).values({
    name: input.name,
    clientId,
    clientSecretHash: hashSecret(secret),
    redirectUris: input.redirectUris,
    allowedScopes: input.scopes.length ? input.scopes : ["identify"],
    trusted: false,
    ownerUserId: input.ownerUserId,
  });
  return { clientId, secret };
}
