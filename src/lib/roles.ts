import type { UserRole } from "@/types/auction";

/** 물건 검색 페이지 접근 가능 등급 */
export const SEARCH_ACCESS_ROLES: UserRole[] = [
  "student",
  "consulting_student",
  "consultant",
  "admin",
];

export const ALL_ROLES: UserRole[] = [
  "member",
  "student",
  "consulting_student",
  "consultant",
  "admin",
];

export function canAccessSearch(role: UserRole | null | ""): boolean {
  return Boolean(role && SEARCH_ACCESS_ROLES.includes(role as UserRole));
}

export function isValidRole(role: string | null | undefined): role is UserRole {
  return Boolean(role && ALL_ROLES.includes(role as UserRole));
}

export function getLoginRedirect(role: UserRole): string {
  if (role === "admin") return "/admin";
  if (role === "consultant") return "/consultant";
  if (canAccessSearch(role)) return "/";
  return "/pending";
}
