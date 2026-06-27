import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  AUTH_ROLE_COOKIE,
  type UserRole,
} from "@/lib/auth";
import { canAccessSearch, getLoginRedirect, isValidRole } from "@/lib/roles";

function getAuthUser(request: NextRequest) {
  return request.cookies.get(AUTH_COOKIE)?.value ?? null;
}

function getAuthRole(request: NextRequest): UserRole | null {
  const role = request.cookies.get(AUTH_ROLE_COOKIE)?.value;
  return isValidRole(role) ? role : null;
}

function isAuthenticated(request: NextRequest) {
  return Boolean(getAuthUser(request) && getAuthRole(request));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const loggedIn = isAuthenticated(request);
  const role = getAuthRole(request);

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/pending", "/admin/:path*", "/consultant/:path*"],
};
