import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { env } from "@/lib/env";

/**
 * This server's own login session (distinct from the OAuth tokens issued to
 * provider sites). The httpOnly cookie holds a `jose`-signed JWT whose only
 * claim is a session id; the session row in Postgres is the source of truth,
 * so deleting the row revokes the session immediately.
 */

const COOKIE = "fg_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function key(): Uint8Array {
  return new TextEncoder().encode(env.SESSION_SECRET);
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.APP_URL.startsWith("https"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

/** Create a session row for the user and set the signed session cookie. */
export async function createSession(userId: string): Promise<void> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000);
  const [row] = await db
    .insert(sessions)
    .values({ userId, expiresAt })
    .returning({ id: sessions.id });

  const jwt = await new SignJWT({ sid: row.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key());

  const store = await cookies();
  store.set(COOKIE, jwt, cookieOptions());
}

/** Resolve the logged-in user from the session cookie, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  let sid: string | undefined;
  try {
    const { payload } = await jwtVerify(token, key());
    sid = payload.sid as string | undefined;
  } catch {
    return null;
  }
  if (!sid) return null;

  const db = getDb();
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!session) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  return user ?? null;
}

/** Delete the current session row and clear the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, key());
      const sid = payload.sid as string | undefined;
      if (sid) await getDb().delete(sessions).where(eq(sessions.id, sid));
    } catch {
      // invalid token — nothing to delete
    }
  }
  store.delete(COOKIE);
}
