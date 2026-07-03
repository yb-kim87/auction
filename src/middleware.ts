import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { type UserRole, isValidRole } from "@/lib/auth";
import { canAccessSearch, getLoginRedirect } from "@/lib/roles";
import { readAuthToken, verifySessionToken } from "@/lib/session";

async function getSession(request: NextRequest) {
  const token = readAuthToken(request);
  if (!token) return null;
  return verifySessionToken(token);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getSession(request);
  const loggedIn = Boolean(session);
  const role = session?.role && isValidRole(session.role) ? session.role : null;

  if (pathname === "/login") {
    if (loggedIn && role) {
      return NextResponse.redirect(new URL(getLoginRedirect(role), request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/pending") {
    if (!loggedIn) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (role && canAccessSearch(role)) {
      return NextResponse.redirect(new URL(getLoginRedirect(role), request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (role !== "admin") {
      return NextResponse.redirect(
        new URL(loggedIn ? getLoginRedirect(role ?? "member") : "/login", request.url),
      );
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/consultant")) {
    if (role !== "consultant") {
      return NextResponse.redirect(
        new URL(loggedIn ? getLoginRedirect(role ?? "member") : "/login", request.url),
      );
    }
    return NextResponse.next();
  }

  if (pathname === "/") {
    if (!loggedIn) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (role && !canAccessSearch(role)) {
      return NextResponse.redirect(new URL("/pending", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/account")) {
    if (!loggedIn) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/pending", "/account", "/admin/:path*", "/consultant/:path*"],
};
