/**
 * Typed, validated access to environment variables.
 *
 * Required vars are exposed via getters that throw only when accessed at
 * runtime — never at import time — so `next build` (which may run without a
 * populated environment) does not fail. List-shaped vars are parsed into
 * arrays; optional vars have sensible fallbacks.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const env = {
  /** Public base URL of this server, no trailing slash. */
  get APP_URL(): string {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get DATABASE_URL(): string {
    return required("DATABASE_URL");
  },
  get SESSION_SECRET(): string {
    return required("SESSION_SECRET");
  },
  get DISCORD_CLIENT_ID(): string {
    return required("DISCORD_CLIENT_ID");
  },
  get DISCORD_CLIENT_SECRET(): string {
    return required("DISCORD_CLIENT_SECRET");
  },
  get DISCORD_BOT_TOKEN(): string {
    return required("DISCORD_BOT_TOKEN");
  },
  get DISCORD_GUILD_ID(): string {
    return required("DISCORD_GUILD_ID");
  },
  /** Role IDs that grant access; empty array means membership-only gating. */
  get DISCORD_REQUIRED_ROLE_IDS(): string[] {
    return list("DISCORD_REQUIRED_ROLE_IDS");
  },
  /** Discord user IDs bootstrapped as admins on first login. */
  get ADMIN_DISCORD_IDS(): string[] {
    return list("ADMIN_DISCORD_IDS");
  },
  /** Discord OAuth2 redirect URI back to this server. */
  get DISCORD_REDIRECT_URI(): string {
    return `${this.APP_URL}/api/auth/discord/callback`;
  },
};
