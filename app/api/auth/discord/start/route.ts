import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { randomToken } from "@/lib/crypto";
import { buildAuthorizeUrl } from "@/lib/discord";
import { sanitizeReturnPath } from "@/lib/url";
import { env } from "@/lib/env";

/**
 * Begin Discord login: mint a CSRF state bound to the post-login return path,
 * stash it in a short-lived signed cookie, and redirect to Discord.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = sanitizeReturnPath(url.searchParams.get("return"));
  // Only "consent" is honored — used by the "switch account" action to force
  // Discord's screen so a user can pick a different account.
  const prompt = url.searchParams.get("prompt") === "consent" ? "consent" : undefined;
  const state = randomToken(16);

  const jwt = await new SignJWT({ state, returnTo })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(env.SESSION_SECRET));

  const store = await cookies();
  store.set("fg_login", jwt, {
    httpOnly: true,
    secure: env.APP_URL.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthorizeUrl(state, prompt));
}
