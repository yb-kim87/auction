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
import { attachChapterAutoPause } from "@/lib/bunny-playerjs";

const PLAYER_IFRAME_ID = "bunny-player-my-course";

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

/** 영상 하나를 챕터(구간) 단위 행으로 펼친다. 챕터가 없으면 영상
 * 자체를 그대로 행 1개로 반환한다(startSeconds는 undefined) — 관리자가
 * 타임스탬프를 입력한 영상만 강의 화면에서 여러 섹션처럼 나뉘어 보인다
 * (사용자 요청, 2026-08-04: "영상 1개를 올리면 시간을 알려주면 알려준
 * 시간으로 섹션을 구분해서 나눠서 영상이 보이도록"). */
function expandVideoRows(v: LecturePublicVideo): Array<{
  key: string;
  video: LecturePublicVideo;
  title: string;
  startSeconds?: number;
  /** 자동 정지 지점 — 명시적으로 지정했거나 다음 챕터가 있을 때만
   * 값이 있다. 마지막 챕터(다음 챕터도 명시 종료도 없음)는 undefined로
   * 두어 영상 끝까지 자연스럽게 재생되게 한다(억지 추정값으로 끊지
   * 않음). */
  endSeconds?: number;
  durationSeconds: number | null;
}> {
  if (!v.chapters || v.chapters.length === 0) {
    return [{ key: v.id, video: v, title: v.title, startSeconds: undefined, durationSeconds: v.durationSeconds }];
  }
  const chapters = v.chapters;
  return chapters.map((c, i) => {
    const next = chapters[i + 1];
    const endSeconds = c.endSeconds ?? next?.startSeconds;
    const durationSeconds =
      endSeconds != null
        ? endSeconds - c.startSeconds
        : v.durationSeconds != null
          ? v.durationSeconds - c.startSeconds
          : null;
    return {
      key: `${v.id}:${c.startSeconds}`,
      video: v,
      title: c.title,
      startSeconds: c.startSeconds,
      endSeconds,
      durationSeconds,
    };
  });
}

function SectionBlock({
  section,
  activeId,
  activeStartSeconds,
  onSelect,
}: {
  section: LecturePublicSection;
  activeId: string | null;
  activeStartSeconds: number | undefined;
  onSelect: (v: LecturePublicVideo, startSeconds?: number) => void;
}) {
  const hasActive = section.videos.some((v) => v.isPublished);
  const [open, setOpen] = useState(hasActive);
  const rows = section.videos.flatMap(expandVideoRows);

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
        <span style={{ fontSize: 11, color: C.textDim }}>{rows.length}강</span>
        <ChevronDownIcon open={open} />
      </button>
      {open &&
        rows.map((row) => {
          const active = row.video.id === activeId && row.startSeconds === activeStartSeconds;
          const locked = !row.video.isPublished;
          return (
            <button
              key={row.key}
              type="button"
              disabled={locked}
              onClick={() => onSelect(row.video, row.startSeconds)}
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
                  {row.title}
                </div>
              </div>
              <span style={{ fontSize: 11, color: C.textDim, flexShrink: 0 }}>
                {locked ? "준비중" : formatDuration(row.durationSeconds)}
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
  const [selectedStartSeconds, setSelectedStartSeconds] = useState<number | undefined>(undefined);
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
        if (firstPublished) {
          setSelectedVideoId(firstPublished.id);
          setSelectedStartSeconds(firstPublished.chapters?.[0]?.startSeconds);
        }
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
  // 챕터가 있는 영상은 챕터별로, 없으면 영상 그대로 — "이전/다음 강의"
  // 이동과 총 재생시간 계산 모두 이 펼쳐진 목록 기준으로 한다.
  const publishedRows = useMemo(() => publishedVideos.flatMap(expandVideoRows), [publishedVideos]);
  const totalDurationSeconds = useMemo(
    () => publishedVideos.reduce((sum, v) => sum + (v.durationSeconds ?? 0), 0),
    [publishedVideos],
  );
  const selectedVideo = allVideos.find((v) => v.id === selectedVideoId) ?? null;
  const selectedRow = selectedVideo
    ? expandVideoRows(selectedVideo).find((r) => r.startSeconds === selectedStartSeconds) ?? null
    : null;

  useEffect(() => {
    if (!selectedVideo || !selectedVideo.isPublished) {
      setEmbedUrl(null);
      return;
    }
    let cancelled = false;
    setPlayLoading(true);
    setPlayError(null);
    fetchMyCoursePlayUrl(courseId, selectedVideo.id, selectedStartSeconds)
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
  }, [courseId, selectedVideo?.id, selectedVideo?.isPublished, selectedStartSeconds]);

  // 챕터에 종료 시각이 있으면(명시 지정 또는 다음 챕터 시작), 그 지점에서
  // 자동으로 멈춘다 — iframe이 새로 마운트(embedUrl 변경)될 때마다
  // 다시 연결해야 한다. 자체 진행바까지 만들었다가 "복잡하게 보인다"는
  // 피드백으로 되돌리고(2026-08-04), Bunny 기본 재생바 + 자동 정지만 유지.
  useEffect(() => {
    if (!embedUrl) return;
    attachChapterAutoPause(PLAYER_IFRAME_ID, selectedRow?.endSeconds);
  }, [embedUrl, selectedRow?.endSeconds]);

  const curIdx = publishedRows.findIndex(
    (r) => r.video.id === selectedVideoId && r.startSeconds === selectedStartSeconds,
  );
  const hasPrev = curIdx > 0;
  const hasNext = curIdx >= 0 && curIdx < publishedRows.length - 1;
  const goToRow = (row: { video: LecturePublicVideo; startSeconds?: number }) => {
    setSelectedVideoId(row.video.id);
    setSelectedStartSeconds(row.startSeconds);
  };

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
          <div className="flex items-center shrink-0">
            <div
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 8,
                background: `linear-gradient(135deg, ${C.accent}, #8b7cf8)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 800,
                color: "#fff",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              코치픽
            </div>
          </div>

          <div className="flex-1" />

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
          className="flex flex-col md:grid md:grid-cols-[1fr_300px] md:items-start"
          style={{ maxWidth: 1400, margin: "0 auto", paddingTop: 20 }}
        >
          {/* ── main ── */}
          <div
            className="w-full"
            style={{ maxWidth: 1060, minWidth: 0, padding: "0 20px", boxSizing: "border-box" }}
          >
          {/* video */}
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16/9",
              background: "#000",
              overflow: "hidden",
              borderRadius: 16,
              marginBottom: 20,
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
                  id={PLAYER_IFRAME_ID}
                  src={embedUrl}
                  title={selectedRow?.title ?? selectedVideo.title}
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
                  {selectedRow?.title ?? selectedVideo.title}
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
              onClick={() => hasPrev && goToRow(publishedRows[curIdx - 1])}
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
                <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>
                  {selectedRow?.title ?? selectedVideo.title}
                </div>
                {(selectedRow?.durationSeconds ?? selectedVideo.durationSeconds) != null && (
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                    {formatDuration(selectedRow?.durationSeconds ?? selectedVideo.durationSeconds)}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => hasNext && goToRow(publishedRows[curIdx + 1])}
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
              <p style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6 }}>
                {info.course.description}
              </p>
            )}
          </div>
          </div>

          {/* ── sidebar ── */}
          <aside
            className="w-full md:w-[300px] shrink-0 border-t md:border-t-0 md:border-l"
            style={{
              background: C.white,
              borderColor: C.border,
            }}
          >
            {info.sections.map((section) => (
              <SectionBlock
                key={section.id}
                section={section}
                activeId={selectedVideoId}
                activeStartSeconds={selectedStartSeconds}
                onSelect={(v, startSeconds) => {
                  setSelectedVideoId(v.id);
                  setSelectedStartSeconds(startSeconds);
                }}
              />
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}
