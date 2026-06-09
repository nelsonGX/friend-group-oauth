import { env } from "@/lib/env";
import { deviceEndpoints } from "@/lib/devices";
import type { ZipEntry } from "@/lib/zip";

/**
 * Generates the downloadable coding-agent skill, personalized with this server's
 * base URL. The skill drives the browser-approved device flow (so the user never
 * registers an app or copies a secret by hand) and then implements the OAuth +
 * pay integration using the bundled reference. Source of truth for the spec
 * mirrors docs/INTEGRATION.md and lib/integrationPrompt.ts — keep them aligned.
 */

const SKILL_DIR = "friend-group-auth";

export function skillFileName(): string {
  return "friend-group-auth-skill.zip";
}

export function buildSkillBundle(): ZipEntry[] {
  const base = env.APP_URL;
  const { startEndpoint, pollEndpoint, verificationUri } = deviceEndpoints();
  const discoveryUrl = `${base}/.well-known/oauth-authorization-server`;

  return [
    { name: `${SKILL_DIR}/SKILL.md`, content: skillMd({ base, startEndpoint, pollEndpoint, verificationUri }) },
    { name: `${SKILL_DIR}/reference.md`, content: referenceMd({ base, discoveryUrl }) },
  ];
}

function bundleContent(suffix: string): string {
  return buildSkillBundle().find((e) => e.name.endsWith(suffix))?.content ?? "";
}

/** The two one-line install commands shown on the dashboard. */
export function installCommands(): { sh: string; ps1: string } {
  const base = env.APP_URL;
  return {
    sh: `curl -fsSL ${base}/api/skill/install.sh | sh`,
    ps1: `irm ${base}/api/skill/install.ps1 | iex`,
  };
}

/**
 * POSIX shell installer: writes the skill into ./.claude/skills/ in the current
 * directory. The file bodies go in quoted heredocs so nothing is expanded (the
 * skill text is full of `$` and backticks).
 */
export function buildInstallSh(): string {
  return `#!/bin/sh
set -e
DIR=".claude/skills/${SKILL_DIR}"
mkdir -p "$DIR"
cat > "$DIR/SKILL.md" <<'FGA_SKILL_EOF'
${bundleContent("SKILL.md")}
FGA_SKILL_EOF
cat > "$DIR/reference.md" <<'FGA_REFERENCE_EOF'
${bundleContent("reference.md")}
FGA_REFERENCE_EOF
echo "Installed the Friend Group Auth skill to $DIR/"
echo "Now ask your coding agent to set up Friend Group Auth."
`;
}

/**
 * PowerShell installer (Windows). Uses single-quoted here-strings so the skill
 * text is written literally.
 */
export function buildInstallPs1(): string {
  return `$ErrorActionPreference = 'Stop'
$dir = ".claude/skills/${SKILL_DIR}"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$skill = @'
${bundleContent("SKILL.md")}
'@
$reference = @'
${bundleContent("reference.md")}
'@
Set-Content -Path (Join-Path $dir 'SKILL.md') -Value $skill -Encoding utf8
Set-Content -Path (Join-Path $dir 'reference.md') -Value $reference -Encoding utf8
Write-Host "Installed the Friend Group Auth skill to $dir/"
Write-Host "Now ask your coding agent to set up Friend Group Auth."
`;
}

function skillMd(o: {
  base: string;
  startEndpoint: string;
  pollEndpoint: string;
  verificationUri: string;
}): string {
  return `---
name: friend-group-auth
description: >-
  Integrate this app with Friend Group Auth (${o.base}) — a Discord-gated OAuth 2.0
  + PKCE provider with a shared credit/payment system. Use when the user wants to
  add "login with our group", gate access on Discord membership/role, or charge
  credits. Registers the OAuth app automatically via a browser-approved device
  flow (no manual dashboard setup, no copied secrets) and writes the login,
  callback, and (optional) payment code.
---

# Friend Group Auth integration

This skill connects the current project to **Friend Group Auth** at \`${o.base}\`.
You will register the OAuth app *for* the user via a browser-approval flow, then
implement the integration. The user's only manual step is clicking **Approve** in
a browser tab.

Read \`reference.md\` (next to this file) for the exact endpoint contracts. Do not
invent endpoints or parameters beyond what it documents.

## Step 1 — Understand the project
- Detect the web framework, language, and existing session/auth conventions. Match them.
- Determine the **local dev URL** (e.g. \`http://localhost:3000\`). Check the dev
  script / config for the port; ask the user if ambiguous.
- Choose a callback path that fits the framework (e.g. \`/api/auth/callback\`,
  \`/auth/callback\`). The dev redirect URI is \`<dev-url><callback-path>\`.

## Step 2 — Collect the redirect URIs
- Always include the **dev** redirect URI.
- Ask the user once for their **production base URL** (e.g.
  \`https://myapp.example.com\`). If they give one, add \`<prod-url><callback-path>\`.
  If they skip it, proceed with dev only and tell them they can re-run this skill
  later to add prod.
- If the app charges credits, also register a **payment return** URI for each base
  (e.g. \`<base>/pay/return\`).

## Step 3 — Start the device authorization
POST JSON to the start endpoint. \`redirect_uris\` is the full list from Step 2;
\`scopes\` is what the app needs (\`identify\`, optionally \`roles\`, \`credits\`).

\`\`\`bash
curl -sS -X POST ${o.startEndpoint} \\
  -H 'content-type: application/json' \\
  -d '{
    "name": "<app name the user will recognise>",
    "redirect_uris": ["http://localhost:3000/api/auth/callback"],
    "scopes": ["identify", "roles"]
  }'
\`\`\`

Response: \`{ device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval }\`.

## Step 4 — Send the user to approve
Show the user this prominently and wait:

> **Approve the app registration:** open \`<verification_uri_complete>\`
> (code: \`<user_code>\`) and click **Approve**.

The approval screen is at \`${o.verificationUri}\`. The user must be signed in with a
Discord account that has access to the group.

## Step 5 — Poll for the credentials
Poll the poll endpoint every \`interval\` seconds with the \`device_code\`:

\`\`\`bash
curl -sS -X POST ${o.pollEndpoint} \\
  -H 'content-type: application/json' \\
  -d '{ "device_code": "<device_code>" }'
\`\`\`

- \`{"error":"authorization_pending"}\` → keep waiting.
- \`{"error":"slow_down"}\` → wait longer, then retry.
- \`{"error":"access_denied"}\` → the user denied; stop and tell them.
- \`{"error":"expired_token"}\` → the request expired; restart from Step 3.
- Success → \`{ client_id, client_secret, redirect_uris, scopes, app_url, discovery_url }\`.
  These are returned **once** — capture them immediately.

## Step 6 — Store the credentials (server-side only)
Write to the project's server-side env (e.g. \`.env\` / \`.env.local\`), and ensure
it's git-ignored. **Never** expose \`client_secret\` to the browser/client bundle.

\`\`\`
AUTH_BASE_URL=${o.base}
AUTH_CLIENT_ID=<client_id>
AUTH_CLIENT_SECRET=<client_secret>
AUTH_REDIRECT_URI=<the dev redirect URI you registered>
\`\`\`

## Step 7 — Implement the integration
Follow \`reference.md\` exactly:
- A login route that redirects to \`/oauth/authorize\` with a fresh PKCE pair + state.
- A callback route that verifies \`state\`, exchanges the code at the token endpoint,
  calls userinfo, and **requires \`allowed === true\`** before creating a local session.
- Key the local user on \`sub\` (stable). Store tokens server-side; refresh rotates.
- If charging: a route that creates a payment intent and redirects to its \`url\`, and
  a return route that calls the verify endpoint and grants value only when \`paid === true\`.

## Step 8 — Report back
Tell the user which routes/files you created, that the app is registered (it shows
under **Provider apps** in their dashboard at \`${o.base}/dashboard\`), and how to set
the env vars in production. Remind them to add the prod redirect URI if they
skipped it (re-run this skill or edit the app in the dashboard).
`;
}

function referenceMd(o: { base: string; discoveryUrl: string }): string {
  return `# Friend Group Auth — integration reference

Base URL (this instance): \`${o.base}\`
Discovery (RFC 8414): \`${o.discoveryUrl}\` — lists every endpoint below, including
the non-standard \`payment_*\` and \`device_*\` extensions. Point an OAuth client at
it to auto-configure.

## Endpoints
| Purpose            | Method & path                          |
| ------------------ | -------------------------------------- |
| Authorize          | \`GET  ${o.base}/oauth/authorize\`        |
| Token              | \`POST ${o.base}/api/oauth/token\`        |
| Userinfo           | \`GET  ${o.base}/api/oauth/userinfo\`     |
| Revoke             | \`POST ${o.base}/api/oauth/revoke\`       |
| Create pay intent  | \`POST ${o.base}/api/pay/intent\`         |
| User confirms pay  | \`GET  ${o.base}/pay?intent=…\`           |
| Verify pay         | \`POST ${o.base}/api/pay/verify\`         |

## Hard rules
- PKCE (S256) is **required** on the authorization request.
- \`client_secret\` is server-side only — never send it to the browser.
- All token/pay POSTs are \`application/x-www-form-urlencoded\`.
- Client auth: \`client_secret\` in the body (\`client_secret_post\`) **or** HTTP Basic
  (\`client_secret_basic\`) — either is accepted.
- \`redirect_uri\` must **exactly** match a registered URI.
- Gate access on \`allowed === true\` from userinfo; deny otherwise.
- Store the user keyed on \`sub\` (stable; \`id\` is the same value). Verify \`state\` on
  the callback and re-verify payments server-side.

## Scopes (request only what you need, space-separated)
- \`identify\` : \`username\`, \`global_name\`, \`avatar\`, \`discord_id\`
- \`roles\`    : \`roles[]\`, \`allowed\`, \`in_guild\`
- \`credits\`  : \`credits\` (integer balance)

Requesting a scope the app isn't allowed is rejected with \`invalid_scope\` (no
silent down-scoping). The granted \`scope\` is echoed in the token response.

## Login — Authorization Code + PKCE
1. **Begin (server-side):**
   - \`code_verifier = base64url(32 random bytes)\`
   - \`code_challenge = base64url(sha256(code_verifier))\`
   - \`state = base64url(16 random bytes)\`; persist \`{code_verifier, state}\` in session.
   - Redirect to:
     \`\`\`
     GET ${o.base}/oauth/authorize?response_type=code
       &client_id={CLIENT_ID}
       &redirect_uri={REDIRECT_URI}
       &scope=identify%20roles
       &state={state}
       &code_challenge={code_challenge}
       &code_challenge_method=S256
     \`\`\`
2. **Callback** at \`{REDIRECT_URI}\`: receives \`?code=…&state=…\` (or \`?error=…&error_description=…&state=…\`). Verify \`state\`.
3. **Exchange code (server-side, form-encoded):**
   \`\`\`
   POST ${o.base}/api/oauth/token
   grant_type=authorization_code&code={code}&redirect_uri={REDIRECT_URI}
   &code_verifier={code_verifier}&client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}
   \`\`\`
   → \`{ access_token, token_type:"Bearer", expires_in:3600, refresh_token, scope }\`
4. **Userinfo:**
   \`\`\`
   GET ${o.base}/api/oauth/userinfo
   Authorization: Bearer {access_token}
   \`\`\`
   → \`{ sub, id, username, global_name, avatar, discord_id, roles, allowed, in_guild, credits }\`
   Require \`allowed === true\`.

### Tokens & refresh
Access tokens last 1h, refresh tokens 30d. Refreshing **rotates** the refresh
token (old one invalidated) — always use the newest. Presenting an already-rotated
refresh token triggers reuse detection and revokes the whole token family;
re-authorize if that happens.
\`\`\`
POST ${o.base}/api/oauth/token
grant_type=refresh_token&refresh_token={rt}&client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}
\`\`\`
Revoke: \`POST ${o.base}/api/oauth/revoke\` with \`token={t}\` + client auth.

## Pay — charge a user credits (only if the app needs it)
1. **Create an intent (server-side):**
   \`\`\`
   POST ${o.base}/api/pay/intent
   client_id=…&client_secret=…&amount={positive int}&ref={your idempotency key}
   &redirect_uri={a registered return URL}&description={optional}&state={optional}
   \`\`\`
   → \`{ intent_id, url, amount, status:"pending", expires_at }\`
   Idempotent on (client, ref): same ref + same amount returns the same intent;
   same ref + a different amount/description is rejected \`409\` — use a fresh ref.
2. **Redirect the user to \`url\`.** They return with
   \`?intent_id=…&ref=…&status=…&state=…\`, where \`status\` ∈
   \`{ completed, cancelled, insufficient_funds, access_denied }\`.
3. **Verify server-side before granting value:**
   \`\`\`
   POST ${o.base}/api/pay/verify
   client_id=…&client_secret=…&intent_id={intent_id}
   \`\`\`
   → \`{ intent_id, status, amount, ref, description, user_id, paid }\`. Grant only when \`paid === true\`.

### Webhooks (optional, recommended)
Configure a webhook URL on the app in the dashboard (**Manage → Webhook**); saving
reveals a signing secret once. On settle we POST JSON with headers
\`X-Webhook-Id\` (idempotency key) and
\`X-Webhook-Signature: t=<unix>,v1=<base64url HMAC-SHA256 of \\\`<t>.<rawBody>\\\`>\`.
Verify the signature, de-dupe on the id, and still treat verify as authoritative.
Delivery is best-effort.

## Gotchas
- \`redirect_uri\` mismatch (scheme/host/path) is the most common failure.
- A user can be \`allowed: false\` even while logged in (left the server / lost the
  role) — re-check on each login.
- Credits are whole numbers; there's no currency conversion.
`;
}
