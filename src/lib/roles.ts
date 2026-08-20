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
  "ot_student",
];

export function canAccessSearch(role: UserRole | null | ""): boolean {
  return Boolean(role && SEARCH_ACCESS_ROLES.includes(role as UserRole));
}

export function isValidRole(role: string | null | undefined): role is UserRole {
  return Boolean(role && ALL_ROLES.includes(role as UserRole));
}

export function getLoginRedirect(role: UserRole): string {
  if (canAccessSearch(role)) return "/";
  // OT수강생은 물건 검색 권한이 없지만 강의 다시보기가 로그인 목적이므로
  // 승인대기(/pending) 대신 바로 내 강의로 보낸다(2026-08-02).
  // /courses는 강의실 소개 페이지가 되었으므로 실제 수강 목록인 /courses/my로 보낸다.
  if (role === "ot_student") return "/courses/my";
  return "/pending";
}
