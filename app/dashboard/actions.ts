"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accessTokens, clients, refreshTokens } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { hashSecret, randomToken } from "@/lib/crypto";
import { SUPPORTED_SCOPES } from "@/lib/oauth";
import { buildIntegrationPrompt } from "@/lib/integrationPrompt";
import { env } from "@/lib/env";

type ActionDict = Dictionary["dashboardActions"];

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
  /** A complete, copy-paste integration prompt with this secret baked in. */
  prompt?: string;
}

/** Regenerate the client secret for a provider the user owns (or admin). */
export async function regenerateSecret(
  _prev: SecretState,
  formData: FormData,
): Promise<SecretState> {
  const { t } = await getDictionary();
  const d = t.dashboardActions;
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: d.notAuthorized };
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return { ok: false, message: d.missingClient };

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);
  if (!client || (client.ownerUserId !== user.id && !user.isAdmin)) {
    return { ok: false, message: d.notYourClient };
  }

  const secret = randomToken(32);
  await db
    .update(clients)
    .set({ clientSecretHash: hashSecret(secret) })
    .where(eq(clients.clientId, clientId));
  revalidatePath("/dashboard");
  const prompt = buildIntegrationPrompt({
    appUrl: env.APP_URL,
    clientId,
    clientSecret: secret,
    redirectUri: client.redirectUris[0] ?? "https://your-site.example/callback",
    scopes: client.allowedScopes,
  });
  return { ok: true, message: d.newSecret, secret, prompt };
}

/** Split a textarea/comma list into trimmed, non-empty entries. */
function parseList(raw: string | undefined): string[] {
  return (raw ?? "").split(/[\s,]+/).filter(Boolean);
}

/** Validate redirect URIs (absolute URLs). Returns an error message or null. */
function validateRedirectUris(uris: string[], d: ActionDict): string | null {
  if (uris.length === 0) return d.addRedirectUri;
  for (const uri of uris) {
    try {
      new URL(uri);
    } catch {
      return format(d.invalidRedirectUri, { uri });
    }
  }
  return null;
}

export interface AppState {
  ok: boolean;
  message: string;
  clientId?: string;
  secret?: string;
  /** A complete, copy-paste integration prompt with this secret baked in. */
  prompt?: string;
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
  const { t } = await getDictionary();
  const d = t.dashboardActions;
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: d.notSignedIn };
  if (!user.allowed && !user.isAdmin) {
    return { ok: false, message: d.needAccessToRegister };
  }

  const name = formData.get("name")?.toString().trim();
  const redirectUris = parseList(formData.get("redirectUris")?.toString());
  const scopes = parseList(formData.get("scopes")?.toString());
  const requested = scopes.length ? scopes : ["identify"];

  if (!name) return { ok: false, message: d.appNameRequired };
  const uriError = validateRedirectUris(redirectUris, d);
  if (uriError) return { ok: false, message: uriError };
  const invalid = requested.filter(
    (s) => !(SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
  if (invalid.length) {
    return { ok: false, message: format(d.unknownScopes, { scopes: invalid.join(", ") }) };
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
  const prompt = buildIntegrationPrompt({
    appUrl: env.APP_URL,
    clientId,
    clientSecret: secret,
    redirectUri: redirectUris[0],
    scopes: requested,
  });
  return {
    ok: true,
    message: d.appRegistered,
    clientId,
    secret,
    prompt,
  };
}

/** Update the redirect URIs of an app the user owns (or any, if admin). */
export async function updateAppRedirects(
  _prev: SecretState,
  formData: FormData,
): Promise<SecretState> {
  const { t } = await getDictionary();
  const d = t.dashboardActions;
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: d.notAuthorized };
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return { ok: false, message: d.missingApp };

  const redirectUris = parseList(formData.get("redirectUris")?.toString());
  const uriError = validateRedirectUris(redirectUris, d);
  if (uriError) return { ok: false, message: uriError };

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);
  if (!client || (client.ownerUserId !== user.id && !user.isAdmin)) {
    return { ok: false, message: d.notYourApp };
  }

  await db
    .update(clients)
    .set({ redirectUris })
    .where(eq(clients.clientId, clientId));
  revalidatePath("/dashboard");
  return { ok: true, message: d.redirectUrisUpdated };
}
