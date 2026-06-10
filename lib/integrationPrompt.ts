/**
 * Builds the copy-paste coding-agent prompt for integrating a site with this
 * auth server, pre-filled with a specific app's values. Mirrors
 * docs/llm-integration-prompt.md — keep the two in sync.
 */
export function buildIntegrationPrompt(opts: {
  appUrl: string;
  clientId: string;
  /** Plaintext secret, available only at creation/regeneration. When omitted,
   *  a placeholder is used (the secret can't be recovered later — it's hashed). */
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
}): string {
  const scope = (opts.scopes.length ? opts.scopes : ["identify"]).join(" ");
  const scopeParam = encodeURIComponent(scope);
  const clientSecret =
    opts.clientSecret ?? "PASTE_THE_SECRET_SHOWN_WHEN_YOU_REGISTERED";
  return `You are integrating my web app with our group's "Friend Group Auth" server — a
standard OAuth 2.0 + PKCE provider that also handles a credit/payment system.
Implement BOTH login and (if my app charges) the pay flow, following this spec
exactly. Do not invent endpoints or parameters beyond what's written here.

## Config (these are mine — use them)
- AUTH_BASE_URL = "${opts.appUrl}"
- CLIENT_ID     = "${opts.clientId}"
- CLIENT_SECRET = "${clientSecret}"  # server-side secret, never exposed to the browser
- REDIRECT_URI  = "${opts.redirectUri}"  # must match a registered redirect URI exactly
- Discovery (RFC 8414): ${opts.appUrl}/.well-known/oauth-authorization-server

## Hard rules
- PKCE (S256) is REQUIRED on the authorization request.
- CLIENT_SECRET is used only in server-to-server calls. It must never reach the browser.
- All token/pay POSTs are \`application/x-www-form-urlencoded\`.
- Client auth at token/pay endpoints: client_secret in the body (client_secret_post)
  OR HTTP Basic (client_secret_basic) — either is accepted.
- \`redirect_uri\` must match a registered URI EXACTLY.
- Gate access on \`allowed === true\` from userinfo. If false, deny — the user
  is not in the Discord server with a required role.
- Store the user keyed on \`sub\` (the stable primary key; \`id\` is the same value).
- Verify state on the login callback, and re-verify payments server-side.

## Scopes (this app is allowed: ${scope})
- identify : username, global_name, avatar, discord_id
- roles    : allowed, in_guild (access status only — role IDs are never exposed)
- credits  : credits (integer balance)

## LOGIN — OAuth 2.0 Authorization Code + PKCE

1) Begin login (server-side):
   - code_verifier  = base64url(32 random bytes)
   - code_challenge = base64url(sha256(code_verifier))
   - state          = base64url(16 random bytes)
   - Persist {code_verifier, state} in the user's session.
   - Redirect the browser to:
     GET {AUTH_BASE_URL}/oauth/authorize?response_type=code
         &client_id={CLIENT_ID}
         &redirect_uri={REDIRECT_URI}
         &scope=${scopeParam}
         &state={state}
         &code_challenge={code_challenge}
         &code_challenge_method=S256

2) Callback at {REDIRECT_URI}:
   - Receives ?code=...&state=...  (or ?error=...&error_description=...&state=...)
   - Verify state == stored state. Abort on error.

3) Exchange code (server-side):
   POST {AUTH_BASE_URL}/api/oauth/token
   body: grant_type=authorization_code
         &code={code}
         &redirect_uri={REDIRECT_URI}
         &code_verifier={code_verifier}
         &client_id={CLIENT_ID}
         &client_secret={CLIENT_SECRET}
   -> { access_token, token_type:"Bearer", expires_in:3600, refresh_token, scope }

4) Get the user:
   GET {AUTH_BASE_URL}/api/oauth/userinfo
   header: Authorization: Bearer {access_token}
   -> { sub, id, username, global_name, avatar, discord_id, allowed, in_guild, credits }
   Require allowed === true to grant access.

Token lifetimes: access = 1h, refresh = 30d. Refreshing rotates the refresh
token (old one becomes invalid). Always use the newest one; presenting an
already-rotated refresh token triggers reuse detection and revokes the whole
token family — re-authorize the user if that happens:
   POST {AUTH_BASE_URL}/api/oauth/token
   body: grant_type=refresh_token&refresh_token={rt}&client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}
Revoke: POST {AUTH_BASE_URL}/api/oauth/revoke  body: token={t}&client_id=...&client_secret=...

## PAY — charge a user credits (only if my app needs it)

Credit value is FIXED across every app on this server: **1 credit = 1 TWD**. Price
in credits at this anchor — \`amount\` (integer credits) must equal the price in TWD.
Never apply your own conversion, markup, or rounding, so the same item costs the
same number of credits on every platform.

1) Create a payment intent (server-side; the user must not be able to change the amount):
   POST {AUTH_BASE_URL}/api/pay/intent
   body: client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}
         &amount={positive integer credits}
         &ref={your unique idempotency key for this charge}
         &redirect_uri={a registered return URL}
         &description={optional}
         &state={optional opaque}
   -> { intent_id, url, amount, status:"pending", expires_at }
   (Idempotent on (client, ref): same ref + same amount returns the same intent;
    same ref + a DIFFERENT amount/description is rejected 409 — use a fresh ref.)

2) Redirect the user to \`url\`. After they confirm/cancel they return to your
   return URL with: ?intent_id=...&ref=...&status=...&state=...
   status ∈ { completed, cancelled, insufficient_funds, access_denied }

3) ALWAYS verify server-side before granting value (don't trust the redirect):
   POST {AUTH_BASE_URL}/api/pay/verify
   body: client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}&intent_id={intent_id}
   -> { intent_id, status, amount, ref, description, user_id, paid }
   Grant value only when paid === true.

4) REVERSE PAY (only if my app needs to pay/reward users): first fund the app's
   app balance in the dashboard or route new payment income into app balance.
   Then call server-side:
   POST {AUTH_BASE_URL}/api/pay/reverse
   body: client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}
         &user_id={user sub/uuid}
         &amount={positive integer credits}
         &ref={your unique payout idempotency key}
         &description={optional}
   -> { payout_id, status:"completed", amount, user_id, ref, duplicate, app_balance, paid:true }
   Retrying the same ref is safe and won't pay twice. A low app balance returns
   402 insufficient_funds. Reverse-paid credits are spendable user credits, not
   withdrawable developer income.

5) OPTIONAL (recommended) webhook: if I configure a webhook URL in the dashboard,
   you'll receive POST JSON on settle with headers X-Webhook-Id (idempotency key)
   and X-Webhook-Signature: t=<unix>,v1=<base64url HMAC-SHA256 of \`<t>.<rawBody>\`
   keyed by the webhook signing secret>. Verify the signature, de-dupe on the id,
   and still treat /api/pay/verify as authoritative. Delivery is best-effort.

## DATA — store/fetch JSON (only if my app needs to persist data)

**When to use this — read first.** This store is a *fallback for apps that have
no database of their own*. If my project already has a database (Postgres, SQLite,
Mongo, Supabase, an ORM, etc.), use that — do NOT reach for this. Only consider it
when there is genuinely no datastore and I'd otherwise have to set one up. Before
using it, **ASK ME** ("Your app has no database — want me to use Friend Group
Auth's hosted JSON store instead of setting one up?") and wait for a yes. Don't
wire it in unprompted.

A hosted JSON key-value store scoped to my app, for persisting data from a
serverless/edge backend without its own database. Plain client-authenticated
HTTPS + JSON (no driver/pool). Server-to-server only — never call it from the
browser. Two scopes:
- scope="user": data keyed to one of my users — pass their \`sub\` (from userinfo)
  as \`user_id\`. For per-user state/preferences/saves.
- scope="app": one namespace shared across the whole app. Omit \`user_id\`.
Data is isolated per app. Authenticate like the pay endpoints (client_id +
client_secret in the JSON body, or HTTP Basic).

All endpoints are POST with a JSON body:
- Set:    POST {AUTH_BASE_URL}/api/data/set
          { client_id, client_secret, scope, user_id?, key, value }
          -> { key, ok:true, updated_at }   (upsert, last-write-wins)
- Get:    POST {AUTH_BASE_URL}/api/data/get
          { client_id, client_secret, scope, user_id?, key }
          -> { key, value, found }          (value is null when found===false)
- Delete: POST {AUTH_BASE_URL}/api/data/delete
          { client_id, client_secret, scope, user_id?, key }
          -> { key, deleted }
- List:   POST {AUTH_BASE_URL}/api/data/list
          { client_id, client_secret, scope, user_id?, prefix?, limit?, cursor? }
          -> { entries:[{ key, value, updated_at }], next_cursor }
          (ordered by key; page by passing next_cursor back as cursor until null)

\`value\` may be any JSON (including null) — use \`found\` to distinguish a stored
null from a missing key. Limits: key ≤ 256 chars, value ≤ 256 KB JSON-encoded;
bad input -> 400 invalid_request, bad creds -> 401 invalid_client.

## Deliverables
- A login route that redirects to /oauth/authorize with a fresh PKCE pair + state.
- A callback route that verifies state, exchanges the code, calls userinfo,
  enforces allowed===true, and creates a local session.
- Secure refresh + logout (revoke).
- If charging: a "buy" route that creates an intent and redirects to its url,
  and a return route that calls /api/pay/verify and grants value on paid===true.
- Keep CLIENT_SECRET in server-side config/env only.
- Match my app's existing framework and session conventions.

Implement it, then show me the routes and how to set the secrets.`;
}
