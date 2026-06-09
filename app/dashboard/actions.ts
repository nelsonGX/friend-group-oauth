"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accessTokens, clients, refreshTokens } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { hashSecret, randomToken } from "@/lib/crypto";
import { SUPPORTED_SCOPES } from "@/lib/oauth";

/** Revoke all of the current user's tokens for one connected app. */
export async function revokeAppAccess(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return;

  const db = getDb();
  await db
    .update(accessTokens)
    .set({ revoked: true })
    .where(and(eq(accessTokens.userId, user.id), eq(accessTokens.clientId, clientId)));
  await db
    .update(refreshTokens)
    .set({ revoked: true })
    .where(and(eq(refreshTokens.userId, user.id), eq(refreshTokens.clientId, clientId)));
  revalidatePath("/dashboard");
}

export interface SecretState {
  ok: boolean;
  message: string;
  secret?: string;
}

/** Regenerate the client secret for a provider the user owns (or admin). */
export async function regenerateSecret(
  _prev: SecretState,
  formData: FormData,
): Promise<SecretState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Not authorized." };
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return { ok: false, message: "Missing client." };

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);
  if (!client || (client.ownerUserId !== user.id && !user.isAdmin)) {
    return { ok: false, message: "Not your client." };
  }

  const secret = randomToken(32);
  await db
    .update(clients)
    .set({ clientSecretHash: hashSecret(secret) })
    .where(eq(clients.clientId, clientId));
  revalidatePath("/dashboard");
  return { ok: true, message: "New secret generated — copy it now.", secret };
}

/** Split a textarea/comma list into trimmed, non-empty entries. */
function parseList(raw: string | undefined): string[] {
  return (raw ?? "").split(/[\s,]+/).filter(Boolean);
}

/** Validate redirect URIs (absolute URLs). Returns an error message or null. */
function validateRedirectUris(uris: string[]): string | null {
  if (uris.length === 0) return "Add at least one redirect URI.";
  for (const uri of uris) {
    try {
      new URL(uri);
    } catch {
      return `Invalid redirect URI: ${uri}`;
    }
  }
  return null;
}

export interface AppState {
  ok: boolean;
  message: string;
  clientId?: string;
  secret?: string;
}

/**
 * Self-service provider registration: any user with access can register their
 * own OAuth app. Owner-created apps are never `trusted` (they always show the
 * consent screen); only an admin can grant trust. The secret is returned once.
 */
export async function createOwnApp(
  _prev: AppState,
  formData: FormData,
): Promise<AppState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Not signed in." };
  if (!user.allowed && !user.isAdmin) {
    return { ok: false, message: "You need access before you can register an app." };
  }

  const name = formData.get("name")?.toString().trim();
  const redirectUris = parseList(formData.get("redirectUris")?.toString());
  const scopes = parseList(formData.get("scopes")?.toString());
  const requested = scopes.length ? scopes : ["identify"];

  if (!name) return { ok: false, message: "App name is required." };
  const uriError = validateRedirectUris(redirectUris);
  if (uriError) return { ok: false, message: uriError };
  const invalid = requested.filter(
    (s) => !(SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
  if (invalid.length) {
    return { ok: false, message: `Unknown scope(s): ${invalid.join(", ")}` };
  }

  const db = getDb();
  const clientId = `fgc_${randomToken(8)}`;
  const secret = randomToken(32);
  await db.insert(clients).values({
    name,
    clientId,
    clientSecretHash: hashSecret(secret),
    redirectUris,
    allowedScopes: requested,
    trusted: false,
    ownerUserId: user.id,
  });

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: "App registered. Copy the secret now — it won't be shown again.",
    clientId,
    secret,
  };
}

/** Update the redirect URIs of an app the user owns (or any, if admin). */
export async function updateAppRedirects(
  _prev: SecretState,
  formData: FormData,
): Promise<SecretState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Not authorized." };
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return { ok: false, message: "Missing app." };

  const redirectUris = parseList(formData.get("redirectUris")?.toString());
  const uriError = validateRedirectUris(redirectUris);
  if (uriError) return { ok: false, message: uriError };

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);
  if (!client || (client.ownerUserId !== user.id && !user.isAdmin)) {
    return { ok: false, message: "Not your app." };
  }

  await db
    .update(clients)
    .set({ redirectUris })
    .where(eq(clients.clientId, clientId));
  revalidatePath("/dashboard");
  return { ok: true, message: "Redirect URIs updated." };
}
