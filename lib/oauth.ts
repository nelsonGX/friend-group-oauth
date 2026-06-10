import { and, eq, gt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import {
  accessTokens,
  authorizationCodes,
  clients,
  refreshTokens,
  users,
  type Client,
  type User,
} from "@/db/schema";
import {
  hashToken,
  randomToken,
  verifyPkceS256,
  verifySecret,
} from "@/lib/crypto";

/**
 * Core of the OAuth2 + PKCE authorization server (the layer where WE are the
 * provider to friends' sites). Authorization codes and tokens are stored hashed;
 * all clients are confidential (server-side) AND must use PKCE S256.
 */

export const SUPPORTED_SCOPES = ["identify", "roles", "credits"] as const;

const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ACCESS_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function parseScopes(raw: string | null | undefined): string[] {
  const scopes = (raw ?? "identify").split(/\s+/).filter(Boolean);
  return scopes.length ? scopes : ["identify"];
}

export async function getClientByClientId(
  clientId: string,
): Promise<Client | null> {
  if (!clientId) return null;
  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);
  return client ?? null;
}

/** Authenticate a confidential client by id + secret. */
export async function authenticateClient(
  clientId: string,
  clientSecret: string,
): Promise<Client | null> {
  if (!clientId || !clientSecret) return null;
  const client = await getClientByClientId(clientId);
  if (!client || !client.isActive) return null;
  if (!verifySecret(clientSecret, client.clientSecretHash)) return null;
  return client;
}

export interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

/** Decode HTTP Basic credentials (client_secret_basic), or null if absent. */
function parseBasicAuth(request: Request): ClientCredentials | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const i = decoded.indexOf(":");
  if (i < 0) return null;
  return {
    clientId: decodeURIComponent(decoded.slice(0, i)),
    clientSecret: decodeURIComponent(decoded.slice(i + 1)),
  };
}

/** Read client credentials from HTTP Basic auth or the form body. */
export function getClientCredentials(
  request: Request,
  form: FormData,
): ClientCredentials {
  return (
    parseBasicAuth(request) ?? {
      clientId: form.get("client_id")?.toString() ?? "",
      clientSecret: form.get("client_secret")?.toString() ?? "",
    }
  );
}

/**
 * Read client credentials from HTTP Basic auth or a parsed JSON body. The JSON
 * data-store endpoints accept either client_secret_basic or `client_id`/
 * `client_secret` fields in the body (client_secret_post), mirroring the
 * form-encoded OAuth/pay endpoints.
 */
export function getClientCredentialsJson(
  request: Request,
  body: Record<string, unknown>,
): ClientCredentials {
  return (
    parseBasicAuth(request) ?? {
      clientId: typeof body.client_id === "string" ? body.client_id : "",
      clientSecret:
        typeof body.client_secret === "string" ? body.client_secret : "",
    }
  );
}

export interface AuthorizeParams {
  responseType?: string;
  clientId?: string;
  redirectUri?: string;
  scope?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

/** Stable keys for render errors, so the UI can localize the message. */
export type RenderErrorCode =
  | "missing_client_id"
  | "unknown_client"
  | "invalid_redirect_uri";

export type AuthorizeError =
  // Cannot safely redirect (untrusted client/redirect) — render an error page.
  // `message` is an English fallback; `code` lets the page localize it.
  | { kind: "render"; message: string; code?: RenderErrorCode }
  // Validated redirect_uri — bounce back to the client with an OAuth error.
  | { kind: "redirect"; error: string; description?: string };

export type AuthorizeValidation =
  | { ok: true; client: Client; scopes: string[]; redirectUri: string }
  | { ok: false; error: AuthorizeError };

/** Validate an /oauth/authorize request per RFC 6749 + PKCE (RFC 7636). */
export async function validateAuthorizeRequest(
  p: AuthorizeParams,
): Promise<AuthorizeValidation> {
  if (!p.clientId) {
    return {
      ok: false,
      error: { kind: "render", code: "missing_client_id", message: "Missing client_id." },
    };
  }
  const client = await getClientByClientId(p.clientId);
  if (!client || !client.isActive) {
    return {
      ok: false,
      error: { kind: "render", code: "unknown_client", message: "Unknown or inactive client." },
    };
  }
  if (!p.redirectUri || !client.redirectUris.includes(p.redirectUri)) {
    return {
      ok: false,
      error: {
        kind: "render",
        code: "invalid_redirect_uri",
        message: "Invalid redirect_uri for this client.",
      },
    };
  }
  // redirect_uri is trusted from here — OAuth errors go back to the client.
  if (p.responseType !== "code") {
    return {
      ok: false,
      error: { kind: "redirect", error: "unsupported_response_type" },
    };
  }
  if (!p.codeChallenge || p.codeChallengeMethod !== "S256") {
    return {
      ok: false,
      error: {
        kind: "redirect",
        error: "invalid_request",
        description: "PKCE with code_challenge_method=S256 is required.",
      },
    };
  }
  const scopes = parseScopes(p.scope);
  const invalid = scopes.filter(
    (s) =>
      !(SUPPORTED_SCOPES as readonly string[]).includes(s) ||
      !client.allowedScopes.includes(s),
  );
  if (invalid.length) {
    return {
      ok: false,
      error: {
        kind: "redirect",
        error: "invalid_scope",
        description: `Unsupported scope(s): ${invalid.join(", ")}`,
      },
    };
  }
  return { ok: true, client, scopes, redirectUri: p.redirectUri };
}

/** Append query params to a (validated) client redirect URI. */
export function buildClientRedirect(
  uri: string,
  params: Record<string, string | undefined>,
): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.searchParams.set(k, v);
  }
  return u.toString();
}

export async function issueAuthorizationCode(opts: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}): Promise<string> {
  const code = randomToken(32);
  await getDb()
    .insert(authorizationCodes)
    .values({
      codeHash: hashToken(code),
      clientId: opts.clientId,
      userId: opts.userId,
      redirectUri: opts.redirectUri,
      scope: opts.scope,
      codeChallenge: opts.codeChallenge,
      codeChallengeMethod: opts.codeChallengeMethod,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    });
  return code;
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokens(opts: {
  clientId: string;
  userId: string;
  scope: string;
  /** Token-family id. Omit to start a fresh family (authorization_code grant);
   *  pass the existing id to keep a rotated refresh token in its lineage. */
  familyId?: string;
}): Promise<TokenResponse> {
  const db = getDb();
  const accessToken = randomToken(32);
  const refreshToken = randomToken(32);
  const familyId = opts.familyId ?? randomUUID();
  const now = Date.now();
  await db.insert(accessTokens).values({
    tokenHash: hashToken(accessToken),
    clientId: opts.clientId,
    userId: opts.userId,
    scope: opts.scope,
    familyId,
    expiresAt: new Date(now + ACCESS_TTL_SECONDS * 1000),
  });
  await db.insert(refreshTokens).values({
    tokenHash: hashToken(refreshToken),
    clientId: opts.clientId,
    userId: opts.userId,
    scope: opts.scope,
    familyId,
    expiresAt: new Date(now + REFRESH_TTL_SECONDS * 1000),
  });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: opts.scope,
  };
}

/**
 * Exchange an authorization code for tokens. Claims the code atomically
 * (used=false → true) to defeat replay, then validates binding + PKCE.
 */
export async function redeemAuthorizationCode(opts: {
  client: Client;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<
  { ok: true; tokens: TokenResponse } | { ok: false; description: string }
> {
  const db = getDb();
  const [row] = await db
    .update(authorizationCodes)
    .set({ used: true })
    .where(
      and(
        eq(authorizationCodes.codeHash, hashToken(opts.code)),
        eq(authorizationCodes.used, false),
      ),
    )
    .returning();

  if (!row) return { ok: false, description: "Authorization code is invalid or already used." };
  if (row.clientId !== opts.client.clientId) {
    return { ok: false, description: "Code was not issued to this client." };
  }
  if (row.expiresAt < new Date()) {
    return { ok: false, description: "Authorization code has expired." };
  }
  if (row.redirectUri !== opts.redirectUri) {
    return { ok: false, description: "redirect_uri does not match." };
  }
  if (!row.codeChallenge || !verifyPkceS256(opts.codeVerifier, row.codeChallenge)) {
    return { ok: false, description: "PKCE verification failed." };
  }

  const tokens = await issueTokens({
    clientId: row.clientId,
    userId: row.userId,
    scope: row.scope,
  });
  return { ok: true, tokens };
}

/**
 * Rotate a refresh token: revoke the presented one and mint a fresh pair in the
 * same family. If an already-rotated (revoked) token from a family is presented,
 * we treat it as theft and revoke the entire family — the main reason rotation
 * exists (RFC 6819 §5.2.2.3 / OAuth 2.1 refresh-token reuse detection).
 */
export async function rotateRefreshToken(opts: {
  client: Client;
  refreshToken: string;
}): Promise<
  { ok: true; tokens: TokenResponse } | { ok: false; description: string }
> {
  const db = getDb();
  const hash = hashToken(opts.refreshToken);

  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hash))
    .limit(1);

  if (!row || row.clientId !== opts.client.clientId) {
    return { ok: false, description: "Refresh token is invalid or expired." };
  }

  // Reuse of a token we already rotated away → assume the family is compromised.
  if (row.revoked) {
    await revokeFamily(row.familyId);
    return {
      ok: false,
      description:
        "Refresh token reuse detected; all tokens for this session were revoked. Re-authorize the user.",
    };
  }

  if (row.expiresAt < new Date()) {
    return { ok: false, description: "Refresh token is invalid or expired." };
  }

  // Claim the token atomically; losing the race means a concurrent use of the
  // same token — also reuse, so revoke the family.
  const [claimed] = await db
    .update(refreshTokens)
    .set({ revoked: true })
    .where(
      and(eq(refreshTokens.tokenHash, hash), eq(refreshTokens.revoked, false)),
    )
    .returning();
  if (!claimed) {
    await revokeFamily(row.familyId);
    return {
      ok: false,
      description:
        "Refresh token reuse detected; all tokens for this session were revoked. Re-authorize the user.",
    };
  }

  const tokens = await issueTokens({
    clientId: row.clientId,
    userId: row.userId,
    scope: row.scope,
    familyId: row.familyId,
  });
  return { ok: true, tokens };
}

/** Revoke every access + refresh token in a token family. */
async function revokeFamily(familyId: string): Promise<void> {
  const db = getDb();
  await db
    .update(accessTokens)
    .set({ revoked: true })
    .where(eq(accessTokens.familyId, familyId));
  await db
    .update(refreshTokens)
    .set({ revoked: true })
    .where(eq(refreshTokens.familyId, familyId));
}

/** Resolve a bearer access token to its user + scopes, or null. */
export async function resolveAccessToken(
  token: string,
): Promise<{ user: User; scopes: string[] } | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(accessTokens)
    .where(
      and(
        eq(accessTokens.tokenHash, hashToken(token)),
        eq(accessTokens.revoked, false),
        gt(accessTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  if (!user) return null;
  return { user, scopes: row.scope.split(/\s+/).filter(Boolean) };
}

/** Revoke an access or refresh token belonging to the given client. */
export async function revokeToken(
  clientId: string,
  token: string,
): Promise<void> {
  const db = getDb();
  const hash = hashToken(token);
  await db
    .update(accessTokens)
    .set({ revoked: true })
    .where(and(eq(accessTokens.tokenHash, hash), eq(accessTokens.clientId, clientId)));
  await db
    .update(refreshTokens)
    .set({ revoked: true })
    .where(and(eq(refreshTokens.tokenHash, hash), eq(refreshTokens.clientId, clientId)));
}
