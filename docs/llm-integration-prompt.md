# LLM integration prompt

> **Prefer the integration skill.** The dashboard's *One-click integration* panel
> gives you a one-line install command that drops a packaged skill into your
> project; your coding agent then registers the app for you via a browser approval
> — no client id/secret to paste. Use the prompt below if you'd rather drive the
> integration manually.

Copy everything in the fenced block below into your coding agent (Claude Code,
Cursor, etc.). Fill in the four values at the top first. It tells the agent
exactly how to integrate with the Friend Group Auth server.

---

````text
You are integrating my web app with our group's "Friend Group Auth" server — a
standard OAuth 2.0 + PKCE provider that also handles a credit/payment system.
Implement BOTH login and (if my app charges) the pay flow, following this spec
exactly. Do not invent endpoints or parameters beyond what's written here.

## Config (these are mine — use them)
- AUTH_BASE_URL = "https://CHANGE_ME"        # base URL of the auth server
- CLIENT_ID     = "CHANGE_ME"                # from the auth dashboard (Register a new app)
- CLIENT_SECRET = "CHANGE_ME"                # server-side secret, never exposed to the browser
- REDIRECT_URI  = "https://CHANGE_ME/callback"  # must be registered on the app in the auth dashboard
- Discovery (RFC 8414): {AUTH_BASE_URL}/.well-known/oauth-authorization-server

## Hard rules
- PKCE (S256) is REQUIRED on the authorization request.
- CLIENT_SECRET is used only in server-to-server calls. It must never reach the browser.
- All token/pay POSTs are `application/x-www-form-urlencoded`.
- Client auth at token/pay endpoints: client_secret in the body (client_secret_post)
  OR HTTP Basic (client_secret_basic) — either is accepted.
- `redirect_uri` must match a registered URI EXACTLY.
- Gate access on `allowed === true` from userinfo. If false, deny — the user
  is not in the Discord server with a required role.
- Store the user keyed on `sub` (the stable primary key; `id` is the same value).
- Verify state on the login callback, and re-verify payments server-side.

## Scopes (request only what you need, space-separated)
- identify : username, global_name, avatar, discord_id
- roles    : roles[], allowed, in_guild
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
         &scope=identify%20roles%20credits
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
   -> { sub, id, username, global_name, avatar, discord_id, roles, allowed, in_guild, credits }
   Require allowed === true to grant access.

Token lifetimes: access = 1h, refresh = 30d. Refreshing rotates the refresh
token (old one becomes invalid). Always use the newest one; presenting an
already-rotated refresh token triggers reuse detection and revokes the whole
token family — re-authorize the user if that happens:
   POST {AUTH_BASE_URL}/api/oauth/token
   body: grant_type=refresh_token&refresh_token={rt}&client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}
Revoke: POST {AUTH_BASE_URL}/api/oauth/revoke  body: token={t}&client_id=...&client_secret=...

## PAY — charge a user credits (only if my app needs it)

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

2) Redirect the user to `url`. After they confirm/cancel they return to your
   return URL with: ?intent_id=...&ref=...&status=...&state=...
   status ∈ { completed, cancelled, insufficient_funds, access_denied }

3) ALWAYS verify server-side before granting value (don't trust the redirect):
   POST {AUTH_BASE_URL}/api/pay/verify
   body: client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}&intent_id={intent_id}
   -> { intent_id, status, amount, ref, description, user_id, paid }
   Grant value only when paid === true.

4) OPTIONAL (recommended) webhook: if a webhook URL is configured in the dashboard,
   you'll receive POST JSON on settle with headers X-Webhook-Id (idempotency key)
   and X-Webhook-Signature: t=<unix>,v1=<base64url HMAC-SHA256 of `<t>.<rawBody>`
   keyed by the webhook signing secret>. Verify the signature, de-dupe on the id,
   and still treat /api/pay/verify as authoritative. Delivery is best-effort.

## Deliverables
- A login route that redirects to /oauth/authorize with a fresh PKCE pair + state.
- A callback route that verifies state, exchanges the code, calls userinfo,
  enforces allowed===true, and creates a local session.
- Secure refresh + logout (revoke).
- If charging: a "buy" route that creates an intent and redirects to its url,
  and a return route that calls /api/pay/verify and grants value on paid===true.
- Keep CLIENT_SECRET in server-side config/env only.
- Match my app's existing framework and session conventions.

Implement it, then show me the routes and how to set the three secrets.
````
