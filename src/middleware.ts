import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { type UserRole, isValidRole } from "@/lib/auth";
import { canAccessSearch, getLoginRedirect } from "@/lib/roles";
import { readAuthToken, verifySessionToken } from "@/lib/session";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:3001";
const REFRESH_TOKEN_COOKIE = "auc-refresh-token";

async function getSession(request: NextRequest) {
  const token = readAuthToken(request);
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * access 토큰(30분)이 만료됐어도 refresh 토큰(30일)이 살아있으면 백엔드에서
 * 새 토큰 쌍을 발급받아 로그인 세션을 이어간다. 이 재발급을 시도하지 않으면
 * 홈 화면에 30분 넘게 머물다 다른 페이지로 이동할 때 로그아웃된 것처럼
 * /login으로 튕기는 문제가 생긴다(2026-07-19).
 */
async function tryRefreshSession(
  request: NextRequest,
): Promise<{ claims: { username: string; role: string }; setCookie: string[] } | null> {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_ORIGIN}/auth/refresh`, {
      method: "POST",
      headers: { cookie: request.headers.get("cookie") ?? "" },
    });
    if (!res.ok) return null;

    const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const setCookie = getSetCookie ? getSetCookie.call(res.headers) : [];
    const newAccessToken = setCookie
      .find((c) => c.startsWith("auc-token="))
      ?.split(";")[0]
      ?.split("=")[1];
    if (!newAccessToken) return null;

    const claims = await verifySessionToken(newAccessToken);
    if (!claims) return null;

    return { claims, setCookie };
  } catch {
    return null;
  }
}

function withRefreshedCookies(response: NextResponse, setCookie: string[]): NextResponse {
  for (const cookie of setCookie) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let session = await getSession(request);
  let refreshedCookies: string[] | null = null;

  if (!session) {
    const refreshed = await tryRefreshSession(request);
    if (refreshed) {
      session = refreshed.claims as { username: string; role: UserRole };
      refreshedCookies = refreshed.setCookie;
    }
  }

  const loggedIn = Boolean(session);
  const role = session?.role && isValidRole(session.role) ? session.role : null;
  const finish = (response: NextResponse) =>
    refreshedCookies ? withRefreshedCookies(response, refreshedCookies) : response;

  if (pathname === "/login") {
    if (loggedIn && role) {
      return finish(NextResponse.redirect(new URL(getLoginRedirect(role), request.url)));
    }
    return finish(NextResponse.next());
  }

  if (pathname === "/pending") {
    if (!loggedIn) {
      return finish(NextResponse.redirect(new URL("/login", request.url)));
    }
    if (role && canAccessSearch(role)) {
      return finish(NextResponse.redirect(new URL(getLoginRedirect(role), request.url)));
    }
    return finish(NextResponse.next());
  }

  if (pathname.startsWith("/admin")) {
    if (role !== "admin") {
      return finish(
        NextResponse.redirect(
          new URL(loggedIn ? getLoginRedirect(role ?? "member") : "/login", request.url),
        ),
      );
    }
    return finish(NextResponse.next());
  }

  if (pathname.startsWith("/consultant")) {
    if (role !== "consultant") {
      return finish(
        NextResponse.redirect(
          new URL(loggedIn ? getLoginRedirect(role ?? "member") : "/login", request.url),
        ),
      );
    }
    return finish(NextResponse.next());
  }

  if (pathname === "/" || pathname === "/search") {
    if (!loggedIn) {
      return finish(NextResponse.redirect(new URL("/login", request.url)));
    }
    if (role && !canAccessSearch(role)) {
      return finish(NextResponse.redirect(new URL("/pending", request.url)));
    }
    return finish(NextResponse.next());
  }

  if (pathname.startsWith("/account")) {
    if (!loggedIn) {
      return finish(NextResponse.redirect(new URL("/login", request.url)));
    }
    return finish(NextResponse.next());
  }

  return finish(NextResponse.next());
}

export const config = {
  matcher: ["/", "/search", "/login", "/pending", "/account", "/admin/:path*", "/consultant/:path*"],
};

