import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight gate for the server's own UI. This only checks for the presence
 * of the session cookie (it runs in the edge runtime and cannot reach Postgres);
 * the protected pages themselves call getCurrentUser() for real validation.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!request.cookies.get("fg_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?return=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
