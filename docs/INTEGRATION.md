# Integrating with the Friend Group Auth server

This service is a standard **OAuth 2.0 + PKCE** authorization server plus a
**credit/payment** system. Use it to (a) log your users in with their Discord
identity and gate access on server membership/role, and (b) charge them credits.

Throughout, `AUTH` is the base URL of the auth server (e.g.
`https://auth.example.com`).

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

### Scopes

| Scope      | userinfo fields returned                          |
| ---------- | ------------------------------------------------- |
| `identify` | `username`, `global_name`, `avatar`, `discord_id` |
| `roles`    | `roles[]`, `allowed`, `in_guild`                  |
| `credits`  | `credits` (current balance, integer)              |

`allowed` is the key authorization signal: `true` means the user is in the
Discord server with a required role.

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

### Token lifetimes & refresh

- Access tokens last **1 hour**. Refresh tokens last **30 days**.
- Refreshing **rotates** the refresh token (the old one is invalidated):

```
POST AUTH/api/oauth/token
grant_type=refresh_token&refresh_token=…&client_id=…&client_secret=…
```

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

### Endpoints

| Purpose          | Method & path                |
| ---------------- | ---------------------------- |
| Create intent    | `POST AUTH/api/pay/intent`   |
| User confirms    | `GET  AUTH/pay?intent=…`     |
| Verify result    | `POST AUTH/api/pay/verify`   |

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

`ref` is idempotent per client: creating again with the same `ref` returns the
same intent.

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

---

## Notes & gotchas

- `redirect_uri` must **exactly** match a registered URI (scheme, host, path).
- Keep `client_secret` server-side only. The browser never sees it.
- Always verify `state` (login) and re-verify payments server-side.
- Credits are whole numbers. There's no currency conversion here — "credits" are
  whatever your group decides they're worth.
- A user can have `allowed: false` even while logged in (left the server / lost
  the role). Re-check `allowed` on each login.
