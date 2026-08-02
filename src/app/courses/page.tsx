"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearAuthCookie, getLoginRedirect } from "@/lib/auth";
import { fetchMyCourses, fetchMyProfile, logoutUser, type LectureMyCourse } from "@/lib/api";
import type { UserProfile } from "@/types/auction";

// ── palette (강의상세 페이지와 동일한 보라 톤) ─────────────────────────────────
const C = {
  bg: "#f5f6f8",
  white: "#ffffff",
  border: "#f3f4f6",
  accent: "#5244d4",
  accentLight: "#ede9ff",
  textPrimary: "#111827",
  textSecondary: "#374151",
  textMuted: "#6b7280",
  textDim: "#9ca3af",
};

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR");
}

const STATUS_LABEL: Record<LectureMyCourse["effectiveStatus"], string> = {
  ACTIVE: "수강 중",
  NOT_STARTED: "시작 전",
  EXPIRED: "만료됨",
  REVOKED: "접근 종료",
};

const PlayIcon = ({ size = 24, color = C.accent }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const QuestionIcon = ({ size = 24, color = C.accent }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const MegaphoneIcon = ({ size = 16, color = C.accent }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export default function MyCoursesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [courses, setCourses] = useState<LectureMyCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyProfile()
      .then(setProfile)
      .catch(() => {});
    fetchMyCourses()
      .then(setCourses)
      .catch((err) => setError(err instanceof Error ? err.message : "불러오지 못했습니다."));
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // ignore
    }
    clearAuthCookie();
    router.replace("/login");
  };

  const homeHref = profile ? getLoginRedirect(profile.role) : "/";

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      {/* ── nav ── */}
      <nav style={{ background: C.white, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 50 }}>
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 24px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link href={homeHref} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${C.accent}, #8b7cf8)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 800,
                color: "#fff",
              }}
            >
              강
            </div>
            <span style={{ fontWeight: 800, color: C.textPrimary, fontSize: 17, letterSpacing: "-0.02em" }}>
              내 강의실
            </span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link
              href="/account"
              style={{
                padding: "8px 16px",
                color: C.textSecondary,
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 999,
                textDecoration: "none",
              }}
            >
              내 정보
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              style={{
                padding: "8px 16px",
                color: C.textSecondary,
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 999,
                border: "none",
                background: "none",
                cursor: "pointer",
              }}
            >
              로그아웃
            </button>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 32 }}>
        {/* ── welcome banner ── */}
        <div style={{ background: C.white, borderRadius: 16, padding: "24px 32px", border: `1px solid ${C.border}` }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.textPrimary, margin: 0 }}>
            반가워요{profile ? `, ${profile.name}님` : ""}! 👋
          </h1>
          <p style={{ fontSize: 13, color: C.textDim, marginTop: 4 }}>오늘도 목표 달성을 위해 달려볼까요?</p>
        </div>

        {/* ── 수강 중인 강의 ── */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              <span style={{ width: 4, height: 20, background: C.accent, borderRadius: 999, display: "inline-block" }} />
              수강 중인 강의
            </h2>
          </div>

          {error && (
            <div style={{ marginBottom: 12, fontSize: 13, color: "#dc2626" }}>{error}</div>
          )}

          {courses === null ? (
            <p style={{ fontSize: 13, color: C.textDim }}>불러오는 중...</p>
          ) : courses.length === 0 ? (
            <div
              style={{
                background: C.white,
                borderRadius: 16,
                border: `1px solid ${C.border}`,
                padding: "56px 0",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.accentLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PlayIcon size={24} />
              </div>
              <p style={{ fontWeight: 600, color: C.textSecondary, margin: 0 }}>현재 수강 가능한 강의가 없습니다</p>
              <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>관리자에게 수강권 부여를 요청해주세요</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {courses.map((c) => (
                <div
                  key={c.enrollmentId}
                  style={{
                    background: C.white,
                    borderRadius: 16,
                    border: `1px solid ${C.border}`,
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: 0 }}>{c.courseTitle}</h3>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: c.effectiveStatus === "ACTIVE" ? C.accentLight : "#f3f4f6",
                        color: c.effectiveStatus === "ACTIVE" ? C.accent : C.textDim,
                      }}
                    >
                      {STATUS_LABEL[c.effectiveStatus]}
                    </span>
                  </div>
                  {c.courseDescription && (
                    <p style={{ fontSize: 13, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>{c.courseDescription}</p>
                  )}
                  {!c.isAuto && (
                    <div style={{ fontSize: 12, color: C.textDim }}>
                      {formatDate(c.startsAt)} ~ {formatDate(c.expiresAt)}
                      {c.effectiveStatus === "ACTIVE" && ` · 남은 ${c.remainingDays}일`}
                    </div>
                  )}
                  {c.effectiveStatus === "ACTIVE" ? (
                    <Link
                      href={`/courses/${c.courseId}`}
                      style={{
                        marginTop: 4,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        padding: "9px 0",
                        background: C.accent,
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: 10,
                        textDecoration: "none",
                      }}
                    >
                      강의 보기
                    </Link>
                  ) : (
                    <span
                      style={{
                        marginTop: 4,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "9px 0",
                        background: "#f3f4f6",
                        color: C.textDim,
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: 10,
                      }}
                    >
                      강의 보기
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 공지사항 ── */}
        <section>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px" }}>
            <span style={{ width: 4, height: 20, background: C.accent, borderRadius: 999, display: "inline-block" }} />
            공지사항
          </h2>
          <div
            style={{
              background: C.white,
              borderRadius: 16,
              border: `1px solid ${C.border}`,
              padding: "32px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <MegaphoneIcon size={20} />
            <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>등록된 공지사항이 없습니다</p>
          </div>
        </section>

        {/* ── 질문하기 ── */}
        <section style={{ paddingBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px" }}>
            <span style={{ width: 4, height: 20, background: C.accent, borderRadius: 999, display: "inline-block" }} />
            질문하기
          </h2>
          <div
            style={{
              background: C.white,
              borderRadius: 16,
              border: `1px solid ${C.border}`,
              padding: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.accentLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <QuestionIcon size={24} />
              </div>
              <div>
                <p style={{ fontSize: 12, color: C.textDim, margin: "0 0 2px" }}>Q&A</p>
                <p style={{ fontWeight: 700, color: C.textPrimary, margin: 0 }}>수업 중 궁금한 점이 있나요?</p>
                <p style={{ fontSize: 13, color: C.textDim, margin: "2px 0 0" }}>강의 시청 페이지에서 질문을 남겨보세요</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
