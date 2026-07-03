import { jwtVerify } from "jose";
import type { UserRole } from "@/lib/auth";

const AUTH_TOKEN_COOKIE = "auc-token";
const DEFAULT_SECRET = "auction-dev-jwt-secret-change-me";

function jwtSecretKey() {
  const secret = process.env.JWT_SECRET?.trim() || DEFAULT_SECRET;
  return new TextEncoder().encode(secret);
}

export interface SessionClaims {
  username: string;
  role: UserRole;
}

export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecretKey());
    const sub = payload.sub;
    const role = payload.role;
    if (typeof sub !== "string" || typeof role !== "string") {
      return null;
    }
    return { username: sub, role: role as UserRole };
  } catch {
    return null;
  }
}

export function readAuthToken(request: {
  cookies: { get: (name: string) => { value: string } | undefined };
}): string | null {
  return request.cookies.get(AUTH_TOKEN_COOKIE)?.value ?? null;
}
