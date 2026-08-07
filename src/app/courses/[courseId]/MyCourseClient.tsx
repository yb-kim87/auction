"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearAuthCookie } from "@/lib/auth";
import { canAccessSearch } from "@/lib/roles";
import {
  fetchMyCourseAccessInfo,
  fetchMyProfile,
  fetchMyCourseNotes,
  fetchMyCourseQuestions,
  fetchMyCoursePlayUrl,
  createMyCourseNote,
  createMyCourseQuestion,
  deleteMyCourseNote,
  logoutUser,
  saveMyCourseProgress,
  type LectureCourseProgress,
  type LectureCourseNote,
  type LectureCourseQuestion,
  type LectureMyCourseAccessInfo,
  type LecturePublicSection,
  type LecturePublicVideo,
} from "@/lib/api";
import { attachLearningProgress } from "@/lib/bunny-playerjs";

const PLAYER_IFRAME_ID = "bunny-player-my-course";
const COURSE_TABS = ["강의정보", "Q&A", "노트", "수강후기"] as const;
type CourseTab = (typeof COURSE_TABS)[number];

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
  progressByRow,
}: {
  section: LecturePublicSection;
  activeId: string | null;
  activeStartSeconds: number | undefined;
  onSelect: (v: LecturePublicVideo, startSeconds?: number) => void;
  progressByRow: Map<string, LectureCourseProgress>;
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
          const completed = progressByRow.get(row.key)?.isCompleted ?? false;
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
                  background: completed ? "#16a34a" : active ? C.accent : "#e5e7eb",
                  color: locked ? C.textDim : "#fff",
                }}
              >
                {locked ? <LockIcon /> : completed ? <span style={{ color: "#fff", fontSize: 12 }}>✓</span> : <PlayIcon size={9} color={active ? "#fff" : C.textMuted} />}
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
  const [canOpenAuction, setCanOpenAuction] = useState(false);

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
  const [progress, setProgress] = useState<LectureCourseProgress[]>([]);
  const lastSavedSecond = useRef(0);
  const [activeTab, setActiveTab] = useState<CourseTab>("강의정보");
  const [noteText, setNoteText] = useState("");
  const [notes, setNotes] = useState<LectureCourseNote[]>([]);
  const [questionText, setQuestionText] = useState("");
  const [questions, setQuestions] = useState<LectureCourseQuestion[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activitySaving, setActivitySaving] = useState(false);

  useEffect(() => {
    fetchMyProfile()
      .then((profile) => setCanOpenAuction(canAccessSearch(profile.role)))
      .catch(() => setCanOpenAuction(false));
  }, []);

  useEffect(() => {
    Promise.all([fetchMyCourseNotes(courseId), fetchMyCourseQuestions(courseId)])
      .then(([savedNotes, savedQuestions]) => {
        setNotes(savedNotes);
        setQuestions(savedQuestions);
      })
      .catch((err) => setActivityError(err instanceof Error ? err.message : "학습 기록을 불러오지 못했습니다."));
  }, [courseId]);

  const saveNote = async () => {
    const text = noteText.trim();
    if (!text || !selectedVideo) return;
    setActivitySaving(true); setActivityError(null);
    try {
      const saved = await createMyCourseNote(courseId, {
        videoId: selectedVideo.id,
        chapterStartSeconds: selectedStartSeconds ?? 0,
        positionSeconds: lastSavedSecond.current,
        content: text,
      });
      setNotes((items) => [saved, ...items]); setNoteText("");
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : "노트를 저장하지 못했습니다.");
    } finally { setActivitySaving(false); }
  };

  const submitQuestion = async () => {
    const text = questionText.trim();
    if (!text || !selectedVideo) return;
    setActivitySaving(true); setActivityError(null);
    try {
      const saved = await createMyCourseQuestion(courseId, {
        videoId: selectedVideo.id,
        chapterStartSeconds: selectedStartSeconds ?? 0,
        positionSeconds: lastSavedSecond.current,
        question: text,
      });
      setQuestions((items) => [saved, ...items]); setQuestionText("");
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : "질문을 등록하지 못했습니다.");
    } finally { setActivitySaving(false); }
  };

  const removeNote = async (noteId: string) => {
    try {
      await deleteMyCourseNote(courseId, noteId);
      setNotes((items) => items.filter((item) => item.id !== noteId));
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : "노트를 삭제하지 못했습니다.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMyCourseAccessInfo(courseId)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setProgress(data.progress ?? []);
        const latest = [...(data.progress ?? [])].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0];
        const firstPublished = data.sections.flatMap((s) => s.videos).find((v) => v.isPublished);
        if (latest) {
          setSelectedVideoId(latest.videoId);
          const latestVideo = data.sections
            .flatMap((s) => s.videos)
            .find((v) => v.id === latest.videoId);
          // 챕터의 시작 시각 0초는 유효한 값이다. `|| undefined`를 사용하면
          // 첫 챕터가 챕터 없는 일반 영상처럼 처리되어 행 선택과 진도가
          // 서로 다른 키를 사용하게 된다.
          setSelectedStartSeconds(
            latestVideo?.chapters?.length ? latest.chapterStartSeconds : undefined,
          );
        } else if (firstPublished) {
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
  const progressByRow = useMemo(() => {
    const byRow = new Map<string, LectureCourseProgress>();
    for (const row of publishedRows) {
      const saved = progress.find(
        (item) =>
          item.videoId === row.video.id &&
          item.chapterStartSeconds === (row.startSeconds ?? 0),
      );
      if (saved) byRow.set(row.key, saved);
    }
    return byRow;
  }, [progress, publishedRows]);
  const selectedProgress = selectedVideo
    ? progress.find(
        (item) =>
          item.videoId === selectedVideo.id &&
          item.chapterStartSeconds === (selectedStartSeconds ?? 0),
      )
    : undefined;

  useEffect(() => {
    if (!selectedVideo || !selectedVideo.isPublished) {
      setEmbedUrl(null);
      return;
    }
    let cancelled = false;
    setPlayLoading(true);
    setPlayError(null);
    const resumeAt = selectedProgress && !selectedProgress.isCompleted
      ? Math.max(selectedStartSeconds ?? 0, selectedProgress.lastPositionSeconds)
      : selectedStartSeconds;
    fetchMyCoursePlayUrl(courseId, selectedVideo.id, resumeAt)
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
    if (!embedUrl || !selectedVideo) return;
    lastSavedSecond.current = selectedProgress?.lastPositionSeconds ?? selectedStartSeconds ?? 0;
    const save = (seconds: number, isCompleted = false) => {
      void saveMyCourseProgress(courseId, selectedVideo.id, {
        chapterStartSeconds: selectedStartSeconds ?? 0,
        lastPositionSeconds: seconds,
        isCompleted,
      }).then((saved) => {
        setProgress((items) => [...items.filter(
          (item) => !(item.videoId === saved.videoId && item.chapterStartSeconds === saved.chapterStartSeconds),
        ), saved]);
      }).catch(() => {});
    };
    attachLearningProgress(PLAYER_IFRAME_ID, {
      endSeconds: selectedRow?.endSeconds,
      onTimeUpdate: (seconds, duration) => {
        if (seconds - lastSavedSecond.current >= 15) {
          lastSavedSecond.current = seconds;
          const rowStart = selectedStartSeconds ?? 0;
          const rowEnd = selectedRow?.endSeconds ?? duration;
          const watchedRatio = rowEnd > rowStart ? (seconds - rowStart) / (rowEnd - rowStart) : 0;
          save(seconds, watchedRatio >= 0.9);
        }
      },
      onEnded: () => save(selectedRow?.endSeconds ?? lastSavedSecond.current, true),
    });
  }, [embedUrl, courseId, selectedVideo?.id, selectedStartSeconds, selectedRow?.endSeconds]);

  const curIdx = publishedRows.findIndex(
    (r) => r.video.id === selectedVideoId && r.startSeconds === selectedStartSeconds,
  );
  const hasPrev = curIdx > 0;
  const hasNext = curIdx >= 0 && curIdx < publishedRows.length - 1;
  const completedCount = publishedRows.filter((row) => progressByRow.get(row.key)?.isCompleted).length;
  const progressPercent = publishedRows.length > 0 ? Math.round((completedCount / publishedRows.length) * 100) : 0;
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
          <Link href="/courses" aria-label="내 강의실" className="flex items-center shrink-0" style={{ textDecoration: "none" }}>
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
          </Link>

          <div className="flex-1" />

          <div className="hidden md:flex items-center gap-2 mr-2" style={{ minWidth: 150 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: C.border, overflow: "hidden" }}>
              <div style={{ width: `${progressPercent}%`, height: "100%", background: C.accent, borderRadius: 999 }} />
            </div>
            <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{progressPercent}%</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto sm:ml-0">
            {canOpenAuction && (
              <Link
                href="/"
                className="px-2.5 py-1.5 sm:px-4 sm:py-2 whitespace-nowrap"
                style={{
                  background: C.white,
                  border: `1px solid ${C.accentLight}`,
                  color: C.accent,
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 999,
                  textDecoration: "none",
                }}
              >
                물건 검색
              </Link>
            )}
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
              href="/account?context=lecture"
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

          {/* 학습 탭 */}
          <div style={{ paddingBottom: 28 }}>
            <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, background: C.white, padding: "0 8px", borderRadius: "12px 12px 0 0" }}>
              {COURSE_TABS.map((tab) => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{ padding: "13px 12px", background: "none", border: "none", borderBottom: activeTab === tab ? `2px solid ${C.accent}` : "2px solid transparent", color: activeTab === tab ? C.accent : C.textMuted, fontSize: 13, fontWeight: activeTab === tab ? 700 : 500, cursor: "pointer" }}>
                  {tab}
                </button>
              ))}
            </div>
            <div style={{ background: C.white, padding: 20, minHeight: 150, borderRadius: "0 0 12px 12px", border: `1px solid ${C.border}`, borderTop: "none" }}>
              {activityError && <p style={{ margin: "0 0 12px", padding: "9px 11px", borderRadius: 8, background: "#fef2f2", color: "#dc2626", fontSize: 12 }}>{activityError}</p>}
              {activeTab === "강의정보" && (
                <>
                  <div className="grid grid-cols-3" style={{ gap: 10, marginBottom: 20 }}>
                    {[{ label: "전체 강의", value: `${publishedRows.length}강` }, { label: "학습 완료", value: `${completedCount}강` }, { label: "총 재생시간", value: formatTotalDuration(totalDurationSeconds) }].map((item) => (
                      <div key={item.label} style={{ padding: "13px 14px", background: C.bg, borderRadius: 9 }}>
                        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>{item.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: C.accent }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.7, margin: 0 }}>{info.course.description ?? "강의 소개가 준비 중입니다."}</p>
                </>
              )}
              {activeTab === "Q&A" && (
                <div>
                  <textarea value={questionText} onChange={(event) => setQuestionText(event.target.value)} placeholder="현재 강의에서 궁금한 점을 남겨주세요. 영상과 재생 시점이 함께 저장됩니다." style={{ width: "100%", minHeight: 88, resize: "vertical", border: `1px solid ${C.border}`, background: C.bg, borderRadius: 9, padding: 12, fontSize: 13, color: C.textPrimary, outline: "none" }} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: C.textDim }}>{selectedRow?.title ?? selectedVideo?.title ?? "현재 강의"} · {formatDuration(lastSavedSecond.current)}</span>
                    <button type="button" disabled={activitySaving || !questionText.trim()} onClick={() => void submitQuestion()} style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: questionText.trim() ? C.accent : C.border, color: "#fff", fontSize: 12, fontWeight: 700, cursor: questionText.trim() ? "pointer" : "not-allowed" }}>질문 등록</button>
                  </div>
                  <div style={{ display: "grid", gap: 9, marginTop: 18 }}>
                    {questions.map((question) => {
                      const video = allVideos.find((item) => item.id === question.videoId);
                      const chapter = video?.chapters?.find((item) => item.startSeconds === question.chapterStartSeconds);
                      return <div key={question.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ padding: 14 }}>
                          <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 7 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>{chapter?.title ?? video?.title ?? "강의 질문"}</span>
                            <span style={{ fontSize: 11, color: C.textDim }}>{formatDuration(question.positionSeconds)}</span>
                            <span style={{ marginLeft: "auto", padding: "2px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: question.answer ? "#dcfce7" : C.accentLight, color: question.answer ? "#15803d" : C.accent }}>{question.answer ? "답변완료" : "답변대기"}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.textSecondary }}>{question.question}</p>
                        </div>
                        {question.answer && <div style={{ padding: "12px 14px", background: C.accentLight, borderTop: `1px solid ${C.border}` }}><strong style={{ display: "block", fontSize: 11, color: C.accent, marginBottom: 5 }}>강사 답변</strong><p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.textSecondary }}>{question.answer}</p></div>}
                      </div>;
                    })}
                    {questions.length === 0 && <p style={{ margin: 0, textAlign: "center", fontSize: 12, color: C.textDim }}>등록된 질문이 없습니다.</p>}
                  </div>
                </div>
              )}
              {activeTab === "노트" && (
                <div>
                  <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="현재 강의의 핵심 내용이나 권리분석 포인트를 기록해보세요." style={{ width: "100%", minHeight: 88, resize: "vertical", border: `1px solid ${C.border}`, background: C.bg, borderRadius: 9, padding: 12, fontSize: 13, color: C.textPrimary, outline: "none" }} />
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                    <button type="button" disabled={activitySaving || !noteText.trim()} onClick={() => void saveNote()} style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: noteText.trim() ? C.accent : C.border, color: "#fff", fontSize: 12, fontWeight: 700, cursor: noteText.trim() ? "pointer" : "not-allowed" }}>노트 저장</button>
                  </div>
                  <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
                    {notes.map((note) => (
                      <div key={note.id} style={{ padding: 13, border: `1px solid ${C.border}`, borderRadius: 9 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>{allVideos.find((item) => item.id === note.videoId)?.title ?? "강의 노트"} · {formatDuration(note.positionSeconds)}</span>
                          <button type="button" onClick={() => void removeNote(note.id)} style={{ marginLeft: "auto", border: "none", background: "none", color: C.textDim, fontSize: 11, cursor: "pointer" }}>삭제</button>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.textSecondary }}>{note.content}</p>
                      </div>
                    ))}
                    {notes.length === 0 && <p style={{ margin: 0, textAlign: "center", fontSize: 12, color: C.textDim }}>아직 작성한 노트가 없습니다.</p>}
                  </div>
                </div>
              )}
              {activeTab === "수강후기" && (
                <div style={{ textAlign: "center", padding: "26px 12px" }}>
                  <p style={{ margin: 0, fontWeight: 700, color: C.textPrimary }}>과정을 학습한 뒤 후기를 남겨주세요</p>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: C.textDim }}>수강 완료 상태와 연결되는 후기 기능을 준비하고 있습니다.</p>
                </div>
              )}
            </div>
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
                progressByRow={progressByRow}
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
