# Friend Group Auth

A small, self-hosted **OAuth 2.0 + PKCE** authorization server with a **credit
system**, built for a Discord friend group that shares self-hosted tools.

- **Log in with Discord**, gated on server membership + a required role.
- Acts as an **OAuth provider** so the group's other sites integrate with any
  standard OAuth client library.
- **Credits**: users hold a balance (admins top up manually); provider sites
  charge against it through a hosted confirm flow.

Integrating a site? See [`docs/INTEGRATION.md`](docs/INTEGRATION.md) and the
copy-paste agent prompt in
[`docs/llm-integration-prompt.md`](docs/llm-integration-prompt.md).

## Stack

Next.js 16 (App Router) · React 19 · Postgres + Drizzle ORM · `jose` sessions ·
Tailwind v4. Discord membership/roles are read via the bot REST API (no
persistent gateway bot).

## Prerequisites

- Node 20+ and a Postgres database.
- A [Discord application](https://discord.com/developers/applications) with:
  - OAuth2 credentials (client id + secret),
  - a **bot** added to your server (so we can read members via REST),
  - your **guild (server) id** and the **role id(s)** that grant access.

## Setup

```bash
npm install
cp .env.example .env      # then fill it in (see below)
npm run db:migrate        # apply the schema to DATABASE_URL
npm run dev               # http://localhost:3000
```

### Environment

Fill in `.env` (all documented in `.env.example`):

| Var | What |
| --- | --- |
| `APP_URL` | Public base URL, no trailing slash. Drives the Discord redirect URI. |
| `DATABASE_URL` | Postgres connection string. |
| `SESSION_SECRET` | Signing key. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | From your Discord app's OAuth2 settings. |
| `DISCORD_BOT_TOKEN` | Bot token; the bot must be a member of your guild. |
| `DISCORD_GUILD_ID` | Your server id. |
| `DISCORD_REQUIRED_ROLE_IDS` | Comma-separated role ids. Empty = membership-only. |
| `ADMIN_DISCORD_IDS` | Comma-separated Discord user ids bootstrapped as admins. |

> In the Discord app's OAuth2 settings, add the redirect URI
> **`{APP_URL}/api/auth/discord/callback`** exactly.

### First run

1. Start the app and visit `/login`. Sign in with a Discord account whose id is
   in `ADMIN_DISCORD_IDS` — it becomes an admin.
2. Go to `/admin` to grant credits and register provider apps. Registering an
   app shows its `client_id` + `client_secret` **once** — copy the secret then.

## Verification

The credit ledger and the OAuth/PKCE flow are covered by in-process checks that
run against an embedded Postgres (PGlite) — no external database needed:

```bash
npm run verify          # OAuth (11 checks) + credits (14 checks)
```

> PGlite is used **only** for these checks. The app itself requires a real
> Postgres via `DATABASE_URL`.

## Deploy (VPS)

Build and run the production server:

```bash
npm run build
APP_URL=https://auth.example.com npm run start   # listens on :3000
```

Run it under a process manager and put TLS in front. Example **systemd** unit:

```ini
# /etc/systemd/system/friend-auth.service
[Unit]
Description=Friend Group Auth
After=network.target postgresql.service

[Service]
WorkingDirectory=/srv/friend-group-oauth
EnvironmentFile=/srv/friend-group-oauth/.env
ExecStart=/usr/bin/npm run start
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

Example **Caddy** reverse proxy (handles HTTPS automatically):

```
auth.example.com {
    reverse_proxy localhost:3000
}
```

Then set `APP_URL=https://auth.example.com` and make sure the Discord redirect
URI matches.

## Project layout

```
app/                # routes: login, oauth/authorize, pay, dashboard, admin, api/*
db/                 # Drizzle schema, client, migrations
lib/                # env, session, discord, crypto, oauth, credits, payments, admin
scripts/            # PGlite-backed verification harness + suites
docs/               # integration guide + LLM agent prompt
proxy.ts            # auth gate for /dashboard and /admin
```

> Note: this repo pins a modified Next.js whose conventions differ from older
> versions (async `cookies()`/`headers()`, `proxy.ts` instead of
> `middleware.ts`). See `AGENTS.md`.
