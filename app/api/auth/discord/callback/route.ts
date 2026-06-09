import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
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
  store.delete("fg_login");

  if (!code || !state || !loginCookie) {
    redirect("/login?error=invalid_request");
  }

  let returnTo = "/explore";
  try {
    const { payload } = await jwtVerify(
      loginCookie,
      new TextEncoder().encode(env.SESSION_SECRET),
    );
    if (payload.state !== state) {
      redirect("/login?error=state_mismatch");
    }
    returnTo = sanitizeReturnPath(payload.returnTo as string | undefined);
  } catch {
    redirect("/login?error=invalid_state");
  }

  let allowed = false;
  try {
    const accessToken = await exchangeCode(code);
    const discordUser = await getDiscordUser(accessToken);
    const member = await getGuildMember(discordUser.id);
    const access = evaluateAccess(member);
    allowed = access.allowed;

    const isAdmin = env.ADMIN_DISCORD_IDS.includes(discordUser.id);
    const profile = {
      discordId: discordUser.id,
      username: discordUser.username,
      globalName: discordUser.global_name,
      avatar: discordUser.avatar,
      inGuild: access.inGuild,
      allowed: access.allowed,
      roles: access.roles,
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
  } catch (err) {
    console.error("Discord callback failed:", err);
    redirect("/login?error=discord");
  }

  // Gated users land on the dashboard, which explains their access status.
  redirect(allowed ? returnTo : "/login?error=no_access");
}
