"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accessTokens,
  authorizationCodes,
  clients,
  paymentIntents,
  refreshTokens,
} from "@/db/schema";
import { auth } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { hashSecret, randomToken } from "@/lib/crypto";
import { SUPPORTED_SCOPES } from "@/lib/oauth";
import { registerClient } from "@/lib/apps";
import {
  deleteData,
  getAppDataStats,
  listAppDataForOwner,
  type AppDataStats,
} from "@/lib/data";
import { buildIntegrationPrompt } from "@/lib/integrationPrompt";
import { createWithdrawal, cancelWithdrawal as cancelWithdrawalRequest } from "@/lib/withdrawals";
import { env } from "@/lib/env";
import { validateWebhookUrl } from "@/lib/webhooks";

type ActionDict = Dictionary["dashboardActions"];

/** Revoke all of the current user's tokens for one connected app. */
export async function revokeAppAccess(formData: FormData) {
  const user = await auth();
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
  revalidatePath("/explore");
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
  const user = await auth();
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
  return (raw ?? "").split(/[\s,]+/).flatMap((s) => {
    const item = s.trim();
    return item ? [item] : [];
  });
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
  const user = await auth();
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

  const { clientId, secret } = await registerClient({
    ownerUserId: user.id,
    name,
    redirectUris,
    scopes: requested,
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

/** Rename an app the user owns (or any, if admin). */
export async function updateAppName(
  _prev: SecretState,
  formData: FormData,
): Promise<SecretState> {
  const { t } = await getDictionary();
  const d = t.dashboardActions;
  const user = await auth();
  if (!user) return { ok: false, message: d.notAuthorized };
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return { ok: false, message: d.missingApp };

  const name = formData.get("name")?.toString().trim();
  if (!name) return { ok: false, message: d.appNameRequired };

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);
  if (!client || (client.ownerUserId !== user.id && !user.isAdmin)) {
    return { ok: false, message: d.notYourApp };
  }

  await db.update(clients).set({ name }).where(eq(clients.clientId, clientId));
  revalidatePath("/dashboard");
  revalidatePath("/explore");
  return { ok: true, message: d.appNameUpdated };
}

/** Update the redirect URIs of an app the user owns (or any, if admin). */
export async function updateAppRedirects(
  _prev: SecretState,
  formData: FormData,
): Promise<SecretState> {
  const { t } = await getDictionary();
  const d = t.dashboardActions;
  const user = await auth();
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

export interface WebhookState {
  ok: boolean;
  message: string;
  /** The webhook signing secret, returned once when a URL is (re)configured. */
  secret?: string;
  /** Whether a webhook is currently configured (drives the cleared message). */
  configured?: boolean;
}

/**
 * Set or clear the payment webhook URL for an app the user owns (or admin).
 * Setting a URL (re)generates a signing secret, returned once. Clearing it
 * (blank input) removes both the URL and the secret.
 */
export async function updateAppWebhook(
  _prev: WebhookState,
  formData: FormData,
): Promise<WebhookState> {
  const { t } = await getDictionary();
  const d = t.dashboardActions;
  const user = await auth();
  if (!user) return { ok: false, message: d.notAuthorized };
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return { ok: false, message: d.missingApp };

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);
  if (!client || (client.ownerUserId !== user.id && !user.isAdmin)) {
    return { ok: false, message: d.notYourApp };
  }

  const webhookUrl = formData.get("webhookUrl")?.toString().trim() ?? "";

  if (!webhookUrl) {
    await db
      .update(clients)
      .set({ webhookUrl: null, webhookSecret: null })
      .where(eq(clients.clientId, clientId));
    revalidatePath("/dashboard");
    return { ok: true, message: d.webhookCleared, configured: false };
  }

  const validatedWebhook = await validateWebhookUrl(webhookUrl);
  if (!validatedWebhook.ok) {
    return { ok: false, message: format(d.invalidRedirectUri, { uri: webhookUrl }) };
  }

  const secret = randomToken(32);
  await db
    .update(clients)
    .set({ webhookUrl: validatedWebhook.url, webhookSecret: secret })
    .where(eq(clients.clientId, clientId));
  revalidatePath("/dashboard");
  return { ok: true, message: d.webhookSaved, secret, configured: true };
}

/**
 * Update an app's public directory presence: title, description, icon, website,
 * and whether it's listed in /explore. Owner (or admin) only. All text fields are
 * optional — blank clears them; `listed` is the opt-in toggle.
 */
export async function updateAppListing(
  _prev: SecretState,
  formData: FormData,
): Promise<SecretState> {
  const { t } = await getDictionary();
  const d = t.dashboardActions;
  const user = await auth();
  if (!user) return { ok: false, message: d.notAuthorized };
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return { ok: false, message: d.missingApp };

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);
  if (!client || (client.ownerUserId !== user.id && !user.isAdmin)) {
    return { ok: false, message: d.notYourApp };
  }

  const displayTitle = formData.get("displayTitle")?.toString().trim() || null;
  const description = formData.get("description")?.toString().trim() || null;
  const iconUrl = formData.get("iconUrl")?.toString().trim() || null;
  const websiteUrl = formData.get("websiteUrl")?.toString().trim() || null;
  const listed = formData.get("listed") != null;

  // Validate the two URL fields when present.
  for (const url of [iconUrl, websiteUrl]) {
    if (!url) continue;
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    } catch {
      return { ok: false, message: format(d.invalidUrl, { url }) };
    }
  }

  await db
    .update(clients)
    .set({ displayTitle, description, iconUrl, websiteUrl, listed })
    .where(eq(clients.clientId, clientId));
  revalidatePath("/dashboard");
  revalidatePath("/explore");
  return { ok: true, message: d.displaySaved };
}

/**
 * Permanently delete an app the user owns (or any, if admin). The token tables
 * key on the *text* `client_id` with no FK cascade, so we clear those by hand;
 * `ledger.providerId` is ON DELETE SET NULL, so accounting history survives the
 * delete while the provider link is dropped.
 */
export async function deleteOwnApp(
  _prev: SecretState,
  formData: FormData,
): Promise<SecretState> {
  const { t } = await getDictionary();
  const d = t.dashboardActions;
  const user = await auth();
  if (!user) return { ok: false, message: d.notAuthorized };
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return { ok: false, message: d.missingApp };

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);
  if (!client || (client.ownerUserId !== user.id && !user.isAdmin)) {
    return { ok: false, message: d.notYourApp };
  }

  await Promise.all([
    db.delete(accessTokens).where(eq(accessTokens.clientId, clientId)),
    db.delete(refreshTokens).where(eq(refreshTokens.clientId, clientId)),
    db.delete(authorizationCodes).where(eq(authorizationCodes.clientId, clientId)),
    db.delete(paymentIntents).where(eq(paymentIntents.clientId, clientId)),
  ]);
  await db.delete(clients).where(eq(clients.clientId, clientId));

  revalidatePath("/dashboard");
  revalidatePath("/explore");
  return { ok: true, message: d.appDeleted };
}

export interface WithdrawState {
  ok: boolean;
  message: string;
}

/**
 * Request a payout of earned credits. The amount is escrowed immediately (see
 * {@link createWithdrawal}); an admin settles it off-platform. Only income the
 * developer earned is withdrawable — never transfers, top-ups, or redeems.
 */
export async function requestWithdrawal(
  _prev: WithdrawState,
  formData: FormData,
): Promise<WithdrawState> {
  const { t } = await getDictionary();
  const d = t.dashboardActions;
  const user = await auth();
  if (!user) return { ok: false, message: d.notSignedIn };

  const amount = Number(formData.get("amount"));
  const payoutDetails = formData.get("payoutDetails")?.toString() ?? "";
  const note = formData.get("note")?.toString() ?? "";

  const result = await createWithdrawal({
    userId: user.id,
    amount,
    payoutDetails,
    note,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "invalid_amount":
        return { ok: false, message: d.withdrawInvalidAmount };
      case "missing_details":
        return { ok: false, message: d.withdrawMissingDetails };
      case "exceeds_available":
        return {
          ok: false,
          message: format(d.withdrawExceeds, { available: result.available }),
        };
    }
  }

  revalidatePath("/dashboard");
  return { ok: true, message: format(d.withdrawRequested, { amount }) };
}

/** Cancel one of the current user's own pending withdrawal requests. */
export async function cancelWithdrawal(formData: FormData) {
  const user = await auth();
  if (!user) return;
  const id = formData.get("id")?.toString();
  if (!id) return;
  await cancelWithdrawalRequest({ id, userId: user.id });
  revalidatePath("/dashboard");
}

// --- Data store viewer --------------------------------------------------------

/** Load a client by its public id and confirm the caller owns it (or is admin). */
async function ownedClient(
  clientId: string | undefined,
  user: { id: string; isAdmin: boolean },
) {
  if (!clientId) return null;
  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);
  if (!client || (client.ownerUserId !== user.id && !user.isAdmin)) return null;
  return client;
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export interface AppDataRow {
  key: string;
  /** The stored value, pretty-printed as JSON for display. */
  valueJson: string;
  updatedAt: string;
  /** null for app-global rows; the owning user's id otherwise. */
  userId: string | null;
  /** Display name for a per-user row's owner (null for app-global). */
  userLabel: string | null;
}

export interface AppDataResult {
  ok: boolean;
  scope: "app" | "user";
  entries: AppDataRow[];
  nextCursor: string | null;
  stats: AppDataStats;
}

const EMPTY_STATS: AppDataStats = { appKeys: 0, userKeys: 0, users: 0 };

/**
 * Read a page of an owned app's stored data for the dashboard viewer. Values and
 * dates are serialized to strings so the result can cross to the client.
 */
export async function fetchAppData(input: {
  clientId: string;
  scope: "app" | "user";
  prefix?: string;
  cursor?: string;
}): Promise<AppDataResult> {
  const scope = input.scope === "user" ? "user" : "app";
  const user = await auth();
  if (!user) return { ok: false, scope, entries: [], nextCursor: null, stats: EMPTY_STATS };

  const client = await ownedClient(input.clientId, user);
  if (!client) {
    return { ok: false, scope, entries: [], nextCursor: null, stats: EMPTY_STATS };
  }

  const prefix = input.prefix?.trim() || undefined;
  const [{ entries, nextCursor }, stats] = await Promise.all([
    listAppDataForOwner(client.id, { scope, prefix, cursor: input.cursor }),
    getAppDataStats(client.id),
  ]);

  return {
    ok: true,
    scope,
    entries: entries.map((e) => ({
      key: e.key,
      valueJson: JSON.stringify(e.value, null, 2),
      updatedAt: fmtDate(e.updatedAt),
      userId: e.userId,
      userLabel:
        e.userId === null ? null : e.globalName ?? e.username ?? e.userId,
    })),
    nextCursor,
    stats,
  };
}

/** Delete one stored key from an owned app's data store. */
export async function deleteAppDataEntry(input: {
  clientId: string;
  scope: "app" | "user";
  userId?: string | null;
  key: string;
}): Promise<{ ok: boolean }> {
  const user = await auth();
  if (!user) return { ok: false };
  const client = await ownedClient(input.clientId, user);
  if (!client || !input.key) return { ok: false };

  const userId = input.scope === "user" ? input.userId ?? null : null;
  await deleteData({ clientId: client.id, userId }, input.key);
  return { ok: true };
}
