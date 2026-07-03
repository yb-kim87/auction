export const AUTH_TOKEN_COOKIE = "auc-token";

export type UserRole =
  | "admin"
  | "consultant"
  | "consulting_student"
  | "student"
  | "member";

const VALID_ROLES = new Set<UserRole>([
  "admin",
  "consultant",
  "consulting_student",
  "student",
  "member",
]);

export function isValidRole(role: string | null | undefined): role is UserRole {
  return Boolean(role && VALID_ROLES.has(role as UserRole));
}

/** @deprecated JWT HttpOnly 쿠키 사용 — 클라이언트에서 역할 쿠키를 설정하지 않습니다. */
export function clearAuthCookie() {
  if (typeof document === "undefined") return;
  document.cookie = "auc-auth=; path=/; max-age=0; SameSite=Lax";
  document.cookie = "auc-role=; path=/; max-age=0; SameSite=Lax";
}

export { canAccessSearch, getLoginRedirect } from "@/lib/roles";
