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
    .flatMap((s) => {
      const item = s.trim();
      return item ? [item] : [];
    });
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

  // --- Crypto (USDT) top-ups ---

  /**
   * Account-level extended PUBLIC key (BIP44 `m/44'/60'/0'`) of the wallet that
   * receives USDT top-ups. Per-member deposit addresses are derived from this
   * watch-only — the server never holds private keys.
   */
  get USDT_HD_XPUB(): string {
    return required("USDT_HD_XPUB");
  },
  /** Shared secret that authorizes the background top-up poller endpoint. */
  get TOPUP_POLL_SECRET(): string {
    return required("TOPUP_POLL_SECRET");
  },
  /**
   * Whether top-ups are configured. Lets the UI hide the feature (and the poller
   * no-op) when the xpub / poll secret aren't set, without throwing. Deposit
   * scanning uses public RPCs (no API key required), optionally overridden per
   * chain via `EVM_RPC_<chainId>`.
   */
  get TOPUPS_ENABLED(): boolean {
    return Boolean(process.env.USDT_HD_XPUB && process.env.TOPUP_POLL_SECRET);
  },
};
