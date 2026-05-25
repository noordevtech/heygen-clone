import { NextRequest, NextResponse } from "next/server";

/**
 * Edge middleware can't reach Postgres (postgres-js + bcryptjs both need
 * Node APIs), so it only enforces cookie presence here. The real session
 * lookup + role check happens in API routes and server components via
 * `getSessionUser` — middleware just bounces obviously-unauthenticated
 * traffic to /login before it touches a route handler.
 */

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
];

const PUBLIC_PREFIXES = [
  "/_next/",
  "/favicon",
];

const SESSION_COOKIE = "studio_session";

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  if (hasSession) return NextResponse.next();

  // API requests get JSON 401; browser navigation gets redirected to /login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  // Preserve the original destination so we can bounce back after login —
  // except for the root "/" which is the default landing anyway.
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Match everything except Next internals + static assets. Public paths
  // are filtered above instead of via the matcher so the list stays
  // co-located with the rest of the auth logic.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
