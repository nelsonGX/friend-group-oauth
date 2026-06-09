import { env } from "@/lib/env";

/**
 * Discord integration. Two uses:
 *  - OAuth2 authorization-code flow to log a user in (identify scope only).
 *  - Bot-token REST lookup of the user's guild membership + roles, so we never
 *    need a persistent gateway connection.
 */

const API = "https://discord.com/api/v10";

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export interface AccessEvaluation {
  inGuild: boolean;
  allowed: boolean;
}

/**
 * Build the Discord authorize URL the user is redirected to at login. Pass
 * `prompt: "consent"` to force Discord's authorization screen even when the app
 * was already authorized — that screen is where a user can switch accounts.
 */
export function buildAuthorizeUrl(
  state: string,
  prompt?: "consent" | "none",
): string {
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    state,
  });
  if (prompt) params.set("prompt", prompt);
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/** Exchange an authorization code for a user access token. */
export async function exchangeCode(code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI,
  });
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(
      `Discord token exchange failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/** Fetch the authenticated Discord user (identify scope). */
export async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${API}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Discord user fetch failed: ${res.status}`);
  }
  return (await res.json()) as DiscordUser;
}

/**
 * Look up the user's roles in the configured guild via the bot token.
 * Returns null if the user is not a member (HTTP 404).
 */
export async function getGuildMember(
  userId: string,
): Promise<{ roles: string[] } | null> {
  const res = await fetch(
    `${API}/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`,
    { headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `Discord guild member fetch failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { roles?: string[] };
  return { roles: json.roles ?? [] };
}

/**
 * Decide whether a member may use the platform. With no required roles
 * configured, guild membership alone is sufficient; otherwise the member must
 * hold at least one required role. The member's role IDs are consumed here to
 * compute `allowed` but are never returned — we don't store or expose them.
 */
export function evaluateAccess(
  member: { roles: string[] } | null,
): AccessEvaluation {
  if (!member) return { inGuild: false, allowed: false };
  const required = env.DISCORD_REQUIRED_ROLE_IDS;
  const allowed =
    required.length === 0 || member.roles.some((r) => required.includes(r));
  return { inGuild: true, allowed };
}
