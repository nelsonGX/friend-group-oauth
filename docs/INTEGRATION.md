# Integrating with the Friend Group Auth server

This service is a standard **OAuth 2.0 + PKCE** authorization server plus a
**credit/payment** system. Use it to (a) log your users in with their Discord
identity and gate access on server membership/role, and (b) charge them credits.

Throughout, `AUTH` is the base URL of the auth server (e.g.
`https://auth.example.com`).

> **Fastest path — the integration skill.** Don't want to wire this up by hand?
> Sign in at `AUTH/dashboard`, open *One-click integration*, and run the install
> command in your project root:
>
> ```sh
> curl -fsSL AUTH/api/skill/install.sh | sh          # macOS / Linux
> irm AUTH/api/skill/install.ps1 | iex               # Windows PowerShell
> ```
>
> That installs the skill into `.claude/skills/friend-group-auth/` **and**
> `.agents/skills/friend-group-auth/`. **Claude Code** picks it up automatically;
> **other agents** (Codex, Cursor, …) can read
> `.agents/skills/friend-group-auth/SKILL.md`. Either way the agent registers your
> OAuth app for you (redirect URIs included) via a browser-approval step (you just
> click **Approve**; no secrets to copy), then writes the login and payment code.
> The manual steps below remain available as the reference and fallback.

> **Tip:** every endpoint below is also published as a machine-readable
> [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414) discovery document at
> `AUTH/.well-known/oauth-authorization-server`. Point your OAuth client at that
> URL to auto-configure instead of transcribing endpoints by hand. It also lists
> the (non-standard) `payment_*` endpoints for the credit flow.

---

## 1. Get registered

Register your app yourself: sign in at `AUTH/dashboard` and use **Register a new
app** under *Provider apps*. (An admin can also register one for you.) You'll
receive:

- `client_id` — public identifier
- `client_secret` — **shown once**; store it as a server-side secret
- one or more **redirect URIs** — every `redirect_uri` you use must match exactly
- allowed **scopes** (see below)

After registering, open **Setup instructions** on your app in the dashboard for
the exact endpoint URLs and a copy-paste env block. You can edit your redirect
URIs and regenerate the secret there at any time.

Self-registered apps always show the consent screen. An admin can mark an app
**trusted** to skip consent for your users.

### Automatic registration (device flow)

The integration skill uses this instead of the dashboard form, but you can drive
it yourself. It's an RFC 8628-style flow that creates the app after a human
approves it in the browser — no copied tokens.

1. **Start** (no auth) — POST JSON with the proposed registration:

   ```
   POST AUTH/api/manage/device/start
   { "name": "My App", "redirect_uris": ["https://myapp.com/callback"], "scopes": ["identify","roles"] }
   ```
   ```json
   {
     "device_code": "…",            // secret you poll with
     "user_code": "WXYZ-1234",      // short code the user confirms
     "verification_uri": "AUTH/device",
     "verification_uri_complete": "AUTH/device?code=WXYZ-1234",
     "expires_in": 900,
     "interval": 5
   }
   ```

2. **Send the user** to `verification_uri_complete`. Signed in (with access), they
   review the name/redirect URIs/scopes and click **Approve**.

3. **Poll** every `interval` seconds until settled:

   ```
   POST AUTH/api/manage/device/poll
   { "device_code": "…" }
   ```
   While pending you get `{"error":"authorization_pending"}` (or `slow_down`);
   denial is `access_denied`, expiry is `expired_token`. On approval, **once**:
   ```json
   {
     "client_id": "fgc_…",
     "client_secret": "…",
     "redirect_uris": ["https://myapp.com/callback"],
     "scopes": ["identify","roles"],
     "app_url": "AUTH",
     "discovery_url": "AUTH/.well-known/oauth-authorization-server"
   }
   ```
   The credentials are returned exactly once — store them server-side immediately.

### Scopes

| Scope      | userinfo fields returned                          |
| ---------- | ------------------------------------------------- |
| `identify` | `username`, `global_name`, `avatar`, `discord_id` |
| `roles`    | `roles[]`, `allowed`, `in_guild`                  |
| `credits`  | `credits` (current balance, integer)              |

`allowed` is the key authorization signal: `true` means the user is in the
Discord server with a required role.

**Requesting a scope your app isn't allowed is rejected** with
`error=invalid_scope` (we never silently down-scope). The `scope` you actually
got is echoed in the token response. Userinfo fields are gated by the granted
scope — e.g. `credits` is omitted unless the `credits` scope was granted. Scope
values are space-separated; `+` and `%20` are both accepted as the separator.

---

## 2. Login flow (OAuth 2.0 Authorization Code + PKCE)

PKCE is **required**. All clients are confidential (you authenticate with your
`client_secret` at the token endpoint) **and** must send a PKCE challenge.

### Endpoints

| Purpose       | Method & path                  |
| ------------- | ------------------------------ |
| Authorize     | `GET  AUTH/oauth/authorize`    |
| Token         | `POST AUTH/api/oauth/token`    |
| Userinfo      | `GET  AUTH/api/oauth/userinfo` |
| Revoke        | `POST AUTH/api/oauth/revoke`   |

### Step-by-step

**1. Create a PKCE pair and redirect the user to authorize:**

```
code_verifier  = base64url(random 32 bytes)
code_challenge = base64url(sha256(code_verifier))     // method: S256
```

Redirect the browser to:

```
AUTH/oauth/authorize
  ?response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourapp.com/callback     (must be pre-registered)
  &scope=identify%20roles%20credits              (space-separated)
  &state=RANDOM_OPAQUE                            (CSRF; you verify on return)
  &code_challenge=CODE_CHALLENGE
  &code_challenge_method=S256
```

Store `code_verifier` and `state` in the user's session.

**2. User logs in with Discord and consents.** They're redirected back to:

```
https://yourapp.com/callback?code=AUTH_CODE&state=RANDOM_OPAQUE
```

On error you get `?error=...&error_description=...&state=...` instead
(e.g. `access_denied`, `invalid_scope`). Always check `state` matches.

**3. Exchange the code for tokens** (server-side, form-encoded):

```
POST AUTH/api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTH_CODE
&redirect_uri=https://yourapp.com/callback     (same as step 1)
&code_verifier=CODE_VERIFIER
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET               (or HTTP Basic auth)
```

> **Client authentication** accepts either `client_secret_post` (the
> `client_id`/`client_secret` form fields above) **or** `client_secret_basic`
> (HTTP Basic: `Authorization: Basic base64(client_id:client_secret)`). The
> authorization `code` is single-use, ~256-bit, and expires 10 minutes after
> issue; a 400 `invalid_grant` means it was already used, expired, or mismatched.
> On a `401`, the response is `invalid_client` with a `WWW-Authenticate: Basic`
> header — your credentials are wrong, not the code.

Response:

```json
{
  "access_token": "…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "…",
  "scope": "identify roles credits"
}
```

**4. Fetch the user:**

```
GET AUTH/api/oauth/userinfo
Authorization: Bearer ACCESS_TOKEN
```

```json
{
  "sub": "uuid",
  "id": "uuid",
  "username": "alice",
  "global_name": "Alice",
  "avatar": "abc123",
  "discord_id": "123456789",
  "roles": ["111", "222"],
  "allowed": true,
  "in_guild": true,
  "credits": 100
}
```

> Gate access on `allowed === true`. If it's `false`, the user isn't in the
> server with a required role — refuse access.

> **Which identifier do I store?** Key your user rows on **`sub`** — it's the
> stable primary key and never changes. `id` is the same value (an alias). Don't
> key on `username`/`global_name` (a user can change those). `discord_id` is
> also stable, but `sub` is the canonical choice for this provider.

### Token lifetimes & refresh

- Access tokens last **1 hour**. Refresh tokens last **30 days**.
- Refreshing **rotates** the refresh token (the old one is invalidated):

```
POST AUTH/api/oauth/token
grant_type=refresh_token&refresh_token=…&client_id=…&client_secret=…
```

> **Reuse detection:** always use the newest refresh token and discard the old
> one immediately. If a previously-rotated (already-used) refresh token is ever
> presented again, the server treats it as a leak and revokes the **entire token
> family** — every access and refresh token from that login. You'll get
> `invalid_grant` and must send the user through authorize again. Don't retry a
> failed refresh with the same token.

- Revoke a token: `POST AUTH/api/oauth/revoke` with `token=…` + client auth.

### Minimal Node example (no OAuth library)

```js
import crypto from "node:crypto";

const AUTH = "https://auth.example.com";
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "https://yourapp.com/callback";

// --- begin login ---
function startLogin(session) {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url");
  session.pkce = { verifier, state };

  const p = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "identify roles credits",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH}/oauth/authorize?${p}`;
}

// --- handle callback ---
async function handleCallback(query, session) {
  if (query.state !== session.pkce.state) throw new Error("bad state");
  if (query.error) throw new Error(query.error);

  const tokenRes = await fetch(`${AUTH}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: query.code,
      redirect_uri: REDIRECT_URI,
      code_verifier: session.pkce.verifier,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  const tokens = await tokenRes.json();

  const me = await fetch(`${AUTH}/api/oauth/userinfo`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  }).then((r) => r.json());

  if (!me.allowed) throw new Error("not authorized");
  return { tokens, user: me };
}
```

---

## 3. Charging credits (the pay flow)

Credits are integers held per user. You charge them through a **payment intent**
you create server-side (so the amount can't be tampered with), then send the
user to confirm.

> **Credit value is fixed: 1 credit = 1 TWD**, the same across every app on this
> server. Set `amount` (integer credits) equal to the price in TWD — don't apply
> your own conversion or markup, so a given item costs the same number of credits
> on every platform.

### Endpoints

| Purpose          | Method & path                |
| ---------------- | ---------------------------- |
| Create intent    | `POST AUTH/api/pay/intent`   |
| User confirms    | `GET  AUTH/pay?intent=…`     |
| Verify result    | `POST AUTH/api/pay/verify`   |
| Reverse pay      | `POST AUTH/api/pay/reverse`  |

### Step-by-step

**1. Create an intent** (server-side, form-encoded, client auth):

```
POST AUTH/api/pay/intent
client_id=…&client_secret=…
&amount=20                         (positive integer credits)
&ref=order_8421                    (YOUR idempotency key)
&redirect_uri=https://yourapp.com/pay/return   (must be registered)
&description=Pro plan – 1 month    (optional)
&state=opaque                      (optional, echoed back)
```

Response:

```json
{
  "intent_id": "uuid",
  "url": "https://auth.example.com/pay?intent=uuid",
  "amount": 20,
  "status": "pending",
  "expires_at": "2026-06-09T12:30:00.000Z"
}
```

`ref` is idempotent per client: creating again with the same `ref` **and the
same `amount`/`description`** returns the same intent. Reusing a `ref` with a
**different** `amount` or `description` is rejected with `409 conflict` (pick a
fresh `ref` per distinct charge). `expires_at` is an ISO 8601 UTC timestamp
(e.g. `2026-06-09T12:30:00.000Z`); intents expire 30 minutes after creation.

**2. Redirect the user to `url`.** They confirm or cancel, then return to your
`redirect_uri` with:

```
?intent_id=uuid&ref=order_8421&status=completed&state=opaque
```

`status` is one of `completed`, `cancelled`, `insufficient_funds`,
`access_denied`.

**3. Verify before granting value** (server-side — never trust the redirect
alone):

```
POST AUTH/api/pay/verify
client_id=…&client_secret=…&intent_id=uuid
```

```json
{
  "intent_id": "uuid",
  "status": "completed",
  "amount": 20,
  "ref": "order_8421",
  "description": "Pro plan – 1 month",
  "user_id": "uuid",
  "paid": true
}
```

Only treat the payment as real when `paid === true` (or `status === "completed"`).

### Reverse pay: pay credits to a user

Apps can also pay users from the app's own balance. Fund that balance in the
dashboard under **Manage -> Funding**, or route new payment income into the app
balance instead of the owner's withdrawable balance. Reverse-paid credits are
normal spendable user credits, but they are not developer `income` and are not
withdrawable by the recipient.

The owner can also move unused app balance back to their regular credit balance
from the same Funding tab by entering a negative amount. That returns spendable
credits, but does not create withdrawable developer `income`.

Call this server-side with client auth:

```
POST AUTH/api/pay/reverse
client_id=...&client_secret=...
&user_id=uuid
&amount=10
&ref=reward_8421
&description=Quest reward
```

Response:

```json
{
  "payout_id": "uuid",
  "status": "completed",
  "amount": 10,
  "user_id": "uuid",
  "ref": "reward_8421",
  "description": "Quest reward",
  "duplicate": false,
  "app_balance": 90,
  "paid": true
}
```

`ref` is idempotent per app. Retrying the same `ref` returns `duplicate: true`
without paying twice. If the app balance is too low, the endpoint returns
`402 insufficient_funds` with the current `balance`.

### Node example

```js
// create intent
const intent = await fetch(`${AUTH}/api/pay/intent`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    amount: "20",
    ref: "order_8421",
    redirect_uri: "https://yourapp.com/pay/return",
    description: "Pro plan – 1 month",
  }),
}).then((r) => r.json());
// redirect the user to intent.url

// on return, verify:
const result = await fetch(`${AUTH}/api/pay/verify`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    intent_id: req.query.intent_id,
  }),
}).then((r) => r.json());

if (result.paid) grantValue(result.user_id, result.ref);
```

### Webhooks (optional — recommended)

The redirect-then-verify flow above is the happy path, but a user can pay and
then lose the redirect (closed tab, dropped connection). A **webhook** lets your
server learn about a settled intent regardless.

Configure a webhook URL on your app in the dashboard (**Manage → Webhook**).
Saving it reveals a **signing secret once** — store it server-side. When an
intent settles (`completed` or `cancelled`), we `POST` JSON to your URL:

```http
POST https://yourapp.com/webhooks/payments
Content-Type: application/json
X-Webhook-Id: <intent_id>                      # idempotency key — de-dupe on this
X-Webhook-Signature: t=1749472200,v1=<base64url-hmac>

{
  "event": "payment.completed",                 // or payment.cancelled
  "intent_id": "uuid",
  "ref": "order_8421",
  "status": "completed",
  "amount": 20,
  "description": "Pro plan – 1 month",
  "user_id": "uuid",
  "created_at": "2026-06-09T12:00:00.000Z"
}
```

**Verify the signature** before trusting the body. `v1` is
`base64url(HMAC_SHA256(secret, \`${t}.${rawBody}\`))` — compute it over the raw
request body and compare in constant time:

```js
import crypto from "node:crypto";

function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=")),
  );
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("base64url");
  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}
```

Delivery is **best-effort** (a few quick retries, no long queue). Treat
`/api/pay/verify` as the source of truth: on receipt, look up the intent and/or
call verify before granting value, and de-dupe on `X-Webhook-Id`. A missed
webhook is always recoverable via verify. Respond `2xx` to acknowledge.

---

## 4. Data store (JSON key–value)

A hosted JSON key–value store scoped to your app, so a serverless/edge backend
(Cloudflare Workers, Vercel, Deno Deploy) can persist data without standing up
its own database. It's plain client-authenticated HTTPS + JSON — **no driver, no
connection pool**, just `fetch`. Two scopes:

- **`user`** — data keyed to one of your users (pass their `sub` from userinfo as
  `user_id`). Use it for per-user state, preferences, saves.
- **`app`** — a single namespace shared across your whole app (config, shared
  lists, counters).

Data is isolated per app: one app can never read another's keys. Authenticate the
same way as the pay endpoints — `client_id`/`client_secret` in the JSON body, or
HTTP Basic. **These are server-to-server calls; never expose `client_secret` to
the browser.**

### Endpoints

All are `POST` with a JSON body and return JSON.

| Purpose | Method & path |
| ------- | ------------- |
| Get a key    | `POST AUTH/api/data/get`    |
| Set a key    | `POST AUTH/api/data/set`    |
| Delete a key | `POST AUTH/api/data/delete` |
| List a scope | `POST AUTH/api/data/list`   |

### Get / Set / Delete

```jsonc
// POST AUTH/api/data/set
{
  "client_id": "…", "client_secret": "…",
  "scope": "user",            // "user" | "app"
  "user_id": "uuid",          // required when scope=user (the user's `sub`); omit for app
  "key": "preferences",       // 1–256 chars
  "value": { "theme": "dark" } // any JSON, including null
}
// -> { "key": "preferences", "ok": true, "updated_at": "2026-06-10T12:00:00.000Z" }
```

```jsonc
// POST AUTH/api/data/get   (same auth + scope/user_id/key, no value)
// -> { "key": "preferences", "value": { "theme": "dark" }, "found": true }
//    missing key -> { "key": "preferences", "value": null, "found": false }
```

```jsonc
// POST AUTH/api/data/delete   (same auth + scope/user_id/key)
// -> { "key": "preferences", "deleted": true }   // false if it didn't exist
```

`set` is an upsert (last-write-wins). `value` may be any JSON value — objects,
arrays, strings, numbers, booleans, or `null`. Use `found` (not `value`) to tell
"stored `null`" apart from "no such key".

### List

```jsonc
// POST AUTH/api/data/list
{
  "client_id": "…", "client_secret": "…",
  "scope": "app",
  "prefix": "item:",   // optional: only keys starting with this
  "limit": 100,        // optional: 1–1000, default 100
  "cursor": null       // optional: pass back next_cursor for the next page
}
// -> {
//      "entries": [ { "key": "item:1", "value": { … }, "updated_at": "…" }, … ],
//      "next_cursor": "item:100"   // null when there are no more pages
//    }
```

Entries are ordered by key ascending. Keep calling with `cursor = next_cursor`
until `next_cursor` is `null`.

### Limits & errors

- Key: 1–256 characters. Value: ≤ 256 KB JSON-encoded.
- A bad `scope`/`user_id`, oversized key/value, missing `value` on set, or an
  unknown `user_id` returns `400 invalid_request` with an `error_description`.
- Bad credentials return `401 invalid_client`.

### Node / edge example

```js
const AUTH = process.env.AUTH_BASE_URL;
const auth = { client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET };

async function dataSet(scope, key, value, userId) {
  const res = await fetch(`${AUTH}/api/data/set`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...auth, scope, user_id: userId, key, value }),
  });
  if (!res.ok) throw new Error(`data set failed: ${res.status}`);
  return res.json();
}

async function dataGet(scope, key, userId) {
  const res = await fetch(`${AUTH}/api/data/get`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...auth, scope, user_id: userId, key }),
  });
  const { value, found } = await res.json();
  return found ? value : undefined;
}

// per-user: pass the user's `sub`; app-global: omit user_id and use scope "app".
await dataSet("user", "preferences", { theme: "dark" }, user.sub);
await dataSet("app", "config", { maintenance: false });
```

---

## Notes & gotchas

- `redirect_uri` must **exactly** match a registered URI (scheme, host, path).
- Keep `client_secret` server-side only. The browser never sees it.
- Always verify `state` (login) and re-verify payments server-side.
- Credits are whole numbers, fixed at **1 credit = 1 TWD** across every app on
  this server — price in credits at that rate; don't apply your own conversion.
- A user can have `allowed: false` even while logged in (left the server / lost
  the role). Re-check `allowed` on each login.
- The data store is per-app isolated and server-to-server only — its keys are not
  shared between apps, and `client_secret` must stay on your backend.
