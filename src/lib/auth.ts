export const AUTH_COOKIE = "auc-auth";
export const AUTH_ROLE_COOKIE = "auc-role";

export type UserRole =
  | "admin"
  | "consultant"
  | "consulting_student"
  | "student"
  | "member";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

const VALID_ROLES = new Set<UserRole>([
  "admin",
  "consultant",
  "consulting_student",
  "student",
  "member",
]);

export function setAuthCookies(
  username: string,
  role: UserRole,
  persistent = false,
) {
  if (typeof document === "undefined") return;

  const maxAge = persistent ? `; max-age=${THIRTY_DAYS_IN_SECONDS}` : "";
  document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(username)}; path=/; SameSite=Lax${maxAge}`;
  document.cookie = `${AUTH_ROLE_COOKIE}=${role}; path=/; SameSite=Lax${maxAge}`;
}

export function getAuthUser(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${AUTH_COOKIE}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function getAuthRole(): UserRole | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${AUTH_ROLE_COOKIE}=([^;]*)`),
  );
  const role = match?.[1];
  if (role && VALID_ROLES.has(role as UserRole)) {
    return role as UserRole;
  }
  return null;
}

export function isAdminSession() {
  return getAuthRole() === "admin";
}

export function isConsultantSession() {
  return getAuthRole() === "consultant";
}

export function isAuthenticatedSession() {
  return Boolean(getAuthUser() && getAuthRole());
}

export function clearAuthCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `${AUTH_ROLE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export { canAccessSearch, getLoginRedirect } from "@/lib/roles";
