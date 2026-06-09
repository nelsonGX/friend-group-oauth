import { getCreditBalance, resolveAccessToken } from "@/lib/oauth";

/**
 * OAuth2 userinfo endpoint. Returns claims scoped to the access token:
 *  - identify : username, global_name, avatar, discord_id
 *  - roles    : roles[], allowed, in_guild
 *  - credits  : credits (current balance)
 */
async function handle(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return Response.json(
      { error: "invalid_token" },
      { status: 401, headers: { "www-authenticate": "Bearer" } },
    );
  }

  const resolved = await resolveAccessToken(auth.slice(7));
  if (!resolved) {
    return Response.json(
      { error: "invalid_token", error_description: "Token invalid or expired." },
      { status: 401, headers: { "www-authenticate": "Bearer" } },
    );
  }

  const { user, scopes } = resolved;
  const body: Record<string, unknown> = { sub: user.id, id: user.id };

  if (scopes.includes("identify")) {
    body.username = user.username;
    body.global_name = user.globalName;
    body.avatar = user.avatar;
    body.discord_id = user.discordId;
  }
  if (scopes.includes("roles")) {
    body.roles = user.roles;
    body.allowed = user.allowed;
    body.in_guild = user.inGuild;
  }
  if (scopes.includes("credits")) {
    body.credits = await getCreditBalance(user.id);
  }

  return Response.json(body, { headers: { "cache-control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
