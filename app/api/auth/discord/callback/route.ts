import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type JWTPayload, jwtVerify } from "jose";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  evaluateAccess,
  exchangeCode,
  getDiscordUser,
  getGuildMember,
} from "@/lib/discord";
import { createSession } from "@/lib/session";
import { sanitizeReturnPath } from "@/lib/url";
import { env } from "@/lib/env";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Discord OAuth callback: validate CSRF state, exchange the code, look up guild
 * membership/roles, upsert the user, open a session, then return to the path
 * the login started from.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const loginCookie = store.get("fg_login")?.value;

  if (!code || !state || !loginCookie) {
    redirect("/login?error=invalid_request");
  }

  let statePayload: JWTPayload | null = null;
  try {
    const { payload } = await jwtVerify(
      loginCookie,
      new TextEncoder().encode(env.SESSION_SECRET),
    );
    statePayload = payload;
  } catch {
    statePayload = null;
  }
  if (!statePayload) {
    redirect("/login?error=invalid_state");
  }
  if (statePayload.state !== state) {
    redirect("/login?error=state_mismatch");
  }

  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Completing login</title>
  </head>
  <body>
    <form id="complete-login" action="/api/auth/discord/callback" method="post">
      <input type="hidden" name="code" value="${escapeHtml(code)}">
      <input type="hidden" name="state" value="${escapeHtml(state)}">
      <button type="submit">Continue</button>
    </form>
    <script>document.getElementById("complete-login").requestSubmit();</script>
  </body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  const form = await request.formData();
  const code = form.get("code")?.toString();
  const state = form.get("state")?.toString();

  const store = await cookies();
  const loginCookie = store.get("fg_login")?.value;

  if (!code || !state || !loginCookie) {
    redirect("/login?error=invalid_request");
  }

  let statePayload: JWTPayload | null = null;
  try {
    const { payload } = await jwtVerify(
      loginCookie,
      new TextEncoder().encode(env.SESSION_SECRET),
    );
    statePayload = payload;
  } catch {
    statePayload = null;
  }
  if (!statePayload) {
    redirect("/login?error=invalid_state");
  }
  if (statePayload.state !== state) {
    redirect("/login?error=state_mismatch");
  }
  const returnTo = sanitizeReturnPath(
    statePayload.returnTo as string | undefined,
  );
  store.delete("fg_login");

  let callbackResult:
    | { ok: true; allowed: boolean; inGuild: boolean }
    | { ok: false } = { ok: false };
  try {
    const accessToken = await exchangeCode(code);
    const discordUser = await getDiscordUser(accessToken);
    const member = await getGuildMember(discordUser.id);
    const access = evaluateAccess(member);
    const isAdmin = env.ADMIN_DISCORD_IDS.includes(discordUser.id);
    const profile = {
      discordId: discordUser.id,
      username: discordUser.username,
      globalName: discordUser.global_name,
      avatar: discordUser.avatar,
      inGuild: access.inGuild,
      allowed: access.allowed,
      lastRoleCheck: new Date(),
      lastLogin: new Date(),
    };

    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ ...profile, isAdmin })
      .onConflictDoUpdate({
        target: users.discordId,
        set: {
          ...profile,
          // Never demote an existing admin; elevate if configured as one.
          isAdmin: sql`${users.isAdmin} OR ${isAdmin}`,
        },
      })
      .returning();

    await createSession(user.id);
    callbackResult = {
      ok: true,
      allowed: access.allowed,
      inGuild: access.inGuild,
    };
  } catch (err) {
    console.error("Discord callback failed:", err);
    callbackResult = { ok: false };
  }
  if (!callbackResult.ok) {
    redirect("/login?error=discord");
  }

  // Users who aren't in the server at all get a dedicated full-screen gate that
  // prompts them to switch accounts. Members who are in the server but lack a
  // required role land on /explore, which shows their access status inline.
  redirect(callbackResult.allowed || callbackResult.inGuild ? returnTo : "/no-access");
}
