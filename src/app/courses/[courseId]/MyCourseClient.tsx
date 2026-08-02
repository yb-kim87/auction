"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchMyCourseAccessInfo,
  fetchMyCoursePlayUrl,
  type LectureMyCourseAccessInfo,
  type LecturePublicVideo,
} from "@/lib/api";

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

export function MyCourseClient({ courseId }: { courseId: string }) {
  const [info, setInfo] = useState<LectureMyCourseAccessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-5 sm:px-8 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{info.course.title}</h1>
          {info.course.description && (
            <p className="mt-1 text-sm text-muted-foreground">{info.course.description}</p>
          )}
        </div>
        <Link href="/courses" className="shrink-0 text-sm text-primary hover:underline">
          내 강의
        </Link>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          <div className="relative w-full overflow-hidden rounded-sm bg-black aspect-video">
            {!selectedVideo ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
                재생할 영상이 없습니다.
              </div>
            ) : !selectedVideo.isPublished ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
                준비 중인 영상입니다.
              </div>
            ) : playLoading || !embedUrl ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
                {playError ?? "영상을 불러오는 중..."}
              </div>
            ) : (
              <iframe
                key={embedUrl}
                src={embedUrl}
                title={selectedVideo.title}
                loading="lazy"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            )}
          </div>

          {selectedVideo && (
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">{selectedVideo.title}</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {selectedVideo.durationSeconds != null && (
                  <span>{formatDuration(selectedVideo.durationSeconds)}</span>
                )}
                {!selectedVideo.isPublished && (
                  <span className="inline-flex px-2 py-0.5 rounded-sm border border-border bg-secondary/50 text-foreground">
                    준비 중
                  </span>
                )}
              </div>
              {selectedVideo.description && (
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {selectedVideo.description}
                </p>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {info.sections.map((section) => (
            <div key={section.id} className="rounded-sm border border-border bg-card">
              <div className="px-4 py-2.5 border-b border-border text-sm font-semibold text-foreground">
                {section.title}
              </div>
              <ul>
                {section.videos.map((video) => {
                  const active = video.id === selectedVideoId;
                  return (
                    <li key={video.id}>
                      <button
                        type="button"
                        disabled={!video.isPublished}
                        onClick={() => setSelectedVideoId(video.id)}
                        className={`w-full text-left px-4 py-3 text-sm border-b border-border last:border-b-0 flex items-center justify-between gap-3 transition-colors ${
                          active
                            ? "bg-primary/10 text-primary font-semibold"
                            : video.isPublished
                              ? "text-foreground hover:bg-secondary/50"
                              : "text-muted-foreground cursor-not-allowed"
                        }`}
                      >
                        <span className="truncate">{video.title}</span>
                        {video.isPublished ? (
                          video.durationSeconds != null && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatDuration(video.durationSeconds)}
                            </span>
                          )
                        ) : (
                          <span className="shrink-0 text-xs">준비 중</span>
                        )}
                      </button>
                    </li>
                  );
                })}
                {section.videos.length === 0 && (
                  <li className="px-4 py-3 text-sm text-muted-foreground">영상이 없습니다.</li>
                )}
              </ul>
            </div>
          ))}
          {info.sections.length === 0 && (
            <p className="text-sm text-muted-foreground px-2">등록된 강의 목록이 없습니다.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
