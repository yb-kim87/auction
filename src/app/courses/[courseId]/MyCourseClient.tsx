"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearAuthCookie } from "@/lib/auth";
import {
  fetchMyCourseAccessInfo,
  fetchMyCoursePlayUrl,
  logoutUser,
  type LectureMyCourseAccessInfo,
  type LecturePublicSection,
  type LecturePublicVideo,
} from "@/lib/api";

// ── palette (피그마 디자인 그대로, 이 페이지 전용) ──────────────────────────────
const C = {
  bg: "#f5f6f8",
  white: "#ffffff",
  border: "#e5e7eb",
  accent: "#5244d4",
  accentLight: "#ede9ff",
  textPrimary: "#111827",
  textSecondary: "#374151",
  textMuted: "#6b7280",
  textDim: "#9ca3af",
};

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTotalDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "-";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

const PlayIcon = ({ size = 16, color = "#fff" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <polygon points="5,3 19,12 5,21" />
  </svg>
);

const LockIcon = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ChevronDownIcon = ({ open }: { open: boolean }) => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
  >
    <polyline points="6,9 12,15 18,9" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polyline points="9,18 15,12 9,6" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polyline points="15,18 9,12 15,6" />
  </svg>
);

// ── 섹션 아코디언 ────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  activeId,
  onSelect,
}: {
  section: LecturePublicSection;
  activeId: string | null;
  onSelect: (v: LecturePublicVideo) => void;
}) {
  const hasActive = section.videos.some((v) => v.isPublished);
  const [open, setOpen] = useState(hasActive);

  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "12px 16px",
          background: open ? "#fafafa" : C.white,
          border: "none",
          cursor: "pointer",
        }}
      >
        <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 700, color: C.textPrimary }}>
          {section.title}
        </span>
        <span style={{ fontSize: 11, color: C.textDim }}>{section.videos.length}강</span>
        <ChevronDownIcon open={open} />
      </button>
      {open &&
        section.videos.map((v) => {
          const active = v.id === activeId;
          const locked = !v.isPublished;
          return (
            <button
              key={v.id}
              type="button"
              disabled={locked}
              onClick={() => onSelect(v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 16px",
                width: "100%",
                border: "none",
                cursor: locked ? "not-allowed" : "pointer",
                background: active ? C.accentLight : "transparent",
                borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent",
                textAlign: "left",
                opacity: locked ? 0.55 : 1,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: active ? C.accent : locked ? "#e5e7eb" : "#e5e7eb",
                  color: locked ? C.textDim : "#fff",
                }}
              >
                {locked ? <LockIcon /> : <PlayIcon size={9} color={active ? "#fff" : C.textMuted} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.4,
                    fontWeight: active ? 600 : 400,
                    color: active ? C.accent : C.textSecondary,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {v.title}
                </div>
              </div>
              <span style={{ fontSize: 11, color: C.textDim, flexShrink: 0 }}>
                {locked ? "준비중" : formatDuration(v.durationSeconds)}
              </span>
            </button>
          );
        })}
    </div>
  );
}

export function MyCourseClient({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<LectureMyCourseAccessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // ignore
    }
    clearAuthCookie();
    router.replace("/login");
  };

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [playLoading, setPlayLoading] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMyCourseAccessInfo(courseId)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        const firstPublished = data.sections.flatMap((s) => s.videos).find((v) => v.isPublished);
        if (firstPublished) setSelectedVideoId(firstPublished.id);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "수강 권한이 없는 강의입니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const allVideos = useMemo<LecturePublicVideo[]>(
    () => info?.sections.flatMap((s) => s.videos) ?? [],
    [info],
  );
  const publishedVideos = useMemo(() => allVideos.filter((v) => v.isPublished), [allVideos]);
  const totalDurationSeconds = useMemo(
    () => publishedVideos.reduce((sum, v) => sum + (v.durationSeconds ?? 0), 0),
    [publishedVideos],
  );
  const selectedVideo = allVideos.find((v) => v.id === selectedVideoId) ?? null;

  useEffect(() => {
    if (!selectedVideo || !selectedVideo.isPublished) {
      setEmbedUrl(null);
      return;
    }
    let cancelled = false;
    setPlayLoading(true);
    setPlayError(null);
    fetchMyCoursePlayUrl(courseId, selectedVideo.id)
      .then((res) => {
        if (!cancelled) setEmbedUrl(res.embedUrl);
      })
      .catch((err) => {
        if (!cancelled) {
          setPlayError(err instanceof Error ? err.message : "영상을 재생할 수 없습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setPlayLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, selectedVideo?.id, selectedVideo?.isPublished]);

  const curIdx = publishedVideos.findIndex((v) => v.id === selectedVideoId);
  const hasPrev = curIdx > 0;
  const hasNext = curIdx >= 0 && curIdx < publishedVideos.length - 1;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-lg font-semibold text-foreground">
            {error ?? "수강 권한이 없는 강의입니다."}
          </p>
          <Link href="/courses" className="inline-block text-sm text-primary hover:underline">
            내 강의로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      {/* ── header ── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: C.white,
          borderBottom: `1px solid ${C.border}`,
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <div
          className="flex items-center gap-2 sm:gap-3.5 px-3 sm:px-5"
          style={{ maxWidth: 1400, margin: "0 auto", height: 56 }}
        >
          <Link href="/courses" className="flex items-center gap-1.5 sm:gap-1.5 shrink-0" style={{ textDecoration: "none" }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${C.accent}, #8b7cf8)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 800,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              강
            </div>
            <span className="hidden sm:inline" style={{ fontWeight: 800, fontSize: 15, color: C.textPrimary }}>
              내 강의실
            </span>
          </Link>

          <div className="hidden sm:block shrink-0" style={{ width: 1, height: 18, background: C.border }} />

          <span
            className="hidden sm:block flex-1 truncate"
            style={{ fontSize: 13, color: C.textSecondary }}
          >
            {info.course.title}
          </span>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto sm:ml-0">
            <Link
              href="/courses"
              className="px-2.5 py-1.5 sm:px-4 sm:py-2 whitespace-nowrap"
              style={{
                background: C.accent,
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 999,
                textDecoration: "none",
              }}
            >
              내 강의실
            </Link>
            <Link
              href="/account"
              className="hidden sm:inline-block px-2.5 py-1.5 sm:px-4 sm:py-2 whitespace-nowrap"
              style={{
                background: C.white,
                border: `1px solid ${C.border}`,
                color: C.textSecondary,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 999,
                textDecoration: "none",
              }}
            >
              내 정보
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="px-2.5 py-1.5 sm:px-4 sm:py-2 whitespace-nowrap"
              style={{
                background: C.white,
                border: `1px solid ${C.border}`,
                color: C.textSecondary,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* ── body ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          className="flex flex-col md:flex-row items-stretch md:items-start"
          style={{ maxWidth: 1400, margin: "0 auto" }}
        >
          {/* ── main ── */}
          <div className="w-full md:w-auto" style={{ maxWidth: 1060, padding: "0 20px", boxSizing: "border-box" }}>
          {/* video */}
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16/9",
              background: "#000",
              overflow: "hidden",
              borderRadius: 16,
              margin: "20px 0",
            }}
          >
            {!selectedVideo ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                재생할 영상이 없습니다.
              </div>
            ) : !selectedVideo.isPublished ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                준비 중인 영상입니다.
              </div>
            ) : playLoading || !embedUrl ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                {playError ?? "영상을 불러오는 중..."}
              </div>
            ) : (
              <>
                <iframe
                  key={embedUrl}
                  src={embedUrl}
                  title={selectedVideo.title}
                  loading="lazy"
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                  allowFullScreen
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 14,
                    left: 16,
                    background: "rgba(0,0,0,0.6)",
                    backdropFilter: "blur(4px)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 6,
                    pointerEvents: "none",
                  }}
                >
                  {selectedVideo.title}
                </div>
              </>
            )}
          </div>

          {/* nav bar */}
          <div
            className="flex items-center justify-between gap-2"
            style={{
              padding: "12px 16px",
              marginBottom: 20,
              background: C.white,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
            }}
          >
            <button
              type="button"
              onClick={() => hasPrev && setSelectedVideoId(publishedVideos[curIdx - 1].id)}
              disabled={!hasPrev}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: C.white,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: hasPrev ? C.textSecondary : C.textDim,
                cursor: hasPrev ? "pointer" : "not-allowed",
              }}
              className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm shrink-0 whitespace-nowrap"
            >
              <ChevronLeftIcon />
              <span className="hidden sm:inline">이전 강의</span>
            </button>

            {selectedVideo && (
              <div className="text-center min-w-0 flex-1 px-1">
                <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{selectedVideo.title}</div>
                {selectedVideo.durationSeconds != null && (
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                    {formatDuration(selectedVideo.durationSeconds)}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => hasNext && setSelectedVideoId(publishedVideos[curIdx + 1].id)}
              disabled={!hasNext}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: hasNext ? C.accent : C.border,
                border: "none",
                borderRadius: 8,
                color: "#fff",
                fontWeight: 600,
                cursor: hasNext ? "pointer" : "not-allowed",
              }}
              className="px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm shrink-0 whitespace-nowrap"
            >
              <span className="hidden sm:inline">다음 강의</span>
              <ChevronRightIcon />
            </button>
          </div>

          {/* 커리큘럼 */}
          <div style={{ paddingBottom: 24 }}>
            <div className="grid grid-cols-2" style={{ gap: 12, marginBottom: 28 }}>
              <div style={{ padding: "14px 16px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>총 강의 수</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>{allVideos.length}강</div>
              </div>
              <div style={{ padding: "14px 16px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>총 재생 시간</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>
                  {formatTotalDuration(totalDurationSeconds)}
                </div>
              </div>
            </div>

            {info.course.description && (
              <p style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, marginBottom: 20 }}>
                {info.course.description}
              </p>
            )}

            {info.sections.map((section) => (
              <div
                key={section.id}
                style={{ marginBottom: 12, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}
              >
                <div style={{ padding: "11px 16px", background: "#f9fafb", fontSize: 13, fontWeight: 700, color: C.textPrimary }}>
                  {section.title}
                </div>
                {section.videos.map((v) => {
                  const locked = !v.isPublished;
                  const active = v.id === selectedVideoId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={locked}
                      onClick={() => setSelectedVideoId(v.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 16px",
                        width: "100%",
                        border: "none",
                        borderTop: `1px solid ${C.border}`,
                        background: active ? C.accentLight : C.white,
                        cursor: locked ? "not-allowed" : "pointer",
                        textAlign: "left",
                        opacity: locked ? 0.55 : 1,
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: active ? C.accent : "#e5e7eb",
                          color: locked ? C.textDim : "#fff",
                        }}
                      >
                        {locked ? <LockIcon /> : <PlayIcon size={9} color={active ? "#fff" : C.textMuted} />}
                      </div>
                      <span style={{ flex: 1, fontSize: 13, color: active ? C.accent : C.textSecondary, fontWeight: active ? 600 : 400 }}>
                        {v.title}
                      </span>
                      <span style={{ fontSize: 11, color: C.textDim }}>
                        {locked ? "준비중" : formatDuration(v.durationSeconds)}
                      </span>
                    </button>
                  );
                })}
                {section.videos.length === 0 && (
                  <div style={{ padding: "9px 16px", fontSize: 13, color: C.textDim, borderTop: `1px solid ${C.border}` }}>
                    영상이 없습니다.
                  </div>
                )}
              </div>
            ))}
            {info.sections.length === 0 && (
              <p style={{ fontSize: 13, color: C.textDim }}>등록된 강의 목록이 없습니다.</p>
            )}
          </div>
          </div>

          {/* ── sidebar ── */}
          <aside
            className="w-full md:w-[300px] shrink-0 border-t md:border-t-0 md:border-l md:mt-5 md:sticky md:top-[76px] md:max-h-[calc(100vh-76px)] md:overflow-y-auto"
            style={{
              background: C.white,
              borderColor: C.border,
            }}
          >
            <div
              className="md:sticky md:top-0 md:z-[1]"
              style={{
                padding: "14px 16px 10px",
                borderBottom: `1px solid ${C.border}`,
                background: C.white,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 8 }}>강의 목록</div>
              <div style={{ fontSize: 11, color: C.textDim }}>{allVideos.length}개 영상</div>
            </div>

            {info.sections.map((section) => (
              <SectionBlock
                key={section.id}
                section={section}
                activeId={selectedVideoId}
                onSelect={(v) => setSelectedVideoId(v.id)}
              />
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}
