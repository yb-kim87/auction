"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logoutUser } from "@/lib/api";
import { clearAuthCookie } from "@/lib/auth";
import type { UserProfile } from "@/types/auction";
import { useProfileStore } from "@/store/useProfileStore";

/** /courses, /courses/apply, /courses/webinar 공통 헤더의 알림·로그인 영역.
 * 세 페이지가 동일한 마크업을 각자 복붙해 갖고 있던 것을 한 곳으로 모으고,
 * 유저 프로필도 페이지마다 따로 fetch하지 않도록 전역 스토어를 공유한다. */

export function BellIcon({ size = 20, color = "#4b5563" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </svg>
  );
}

export function useHeaderAuth() {
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const status = useProfileStore((s) => s.status);
  const fetchProfile = useProfileStore((s) => s.fetchProfile);
  const clearProfile = useProfileStore((s) => s.clearProfile);

  useEffect(() => {
    if (status === "idle") {
      fetchProfile().catch(() => {});
    }
  }, [status, fetchProfile]);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // ignore
    }
    clearAuthCookie();
    clearProfile();
    router.replace("/login");
  };

  return { profile, handleLogout };
}

export function HeaderBell({ profile }: { profile: UserProfile | null }) {
  if (!profile) return null;
  return (
    <button
      type="button"
      aria-label="알림"
      style={{ width: 40, height: 40, borderRadius: 999, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
    >
      <BellIcon />
    </button>
  );
}

export function HeaderAuthArea({ profile, handleLogout }: { profile: UserProfile | null; handleLogout: () => Promise<void> }) {
  if (!profile) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Link
        href="/account?context=lecture"
        style={{ padding: "8px 20px", borderRadius: 999, border: "2px solid #d1d5db", color: "#374151", fontWeight: 500, fontSize: 18, textDecoration: "none" }}
      >
        내 정보
      </Link>
      <button
        type="button"
        onClick={() => void handleLogout()}
        style={{ padding: "8px 20px", borderRadius: 999, border: "2px solid #d1d5db", color: "#374151", fontWeight: 500, fontSize: 18, background: "#fff", cursor: "pointer" }}
      >
        로그아웃
      </button>
    </div>
  );
}
