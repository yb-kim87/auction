"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchLectureAccessInfo,
  fetchLecturePlayUrl,
  type LectureAccessInfo,
  type LecturePublicVideo,
} from "@/lib/api";
import { BunnyChapterPlayer } from "@/components/BunnyChapterPlayer";

const PLAYER_IFRAME_ID = "bunny-player-lecture-replay";

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

/** 영상 하나를 챕터(구간) 단위 행으로 펼친다. 챕터가 없으면 영상
 * 자체를 행 1개로 반환한다(startSeconds는 undefined). */
function expandVideoRows(v: LecturePublicVideo): Array<{
  key: string;
  video: LecturePublicVideo;
  title: string;
  startSeconds?: number;
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

export function LectureReplayClient({ token }: { token: string }) {
  const [info, setInfo] = useState<LectureAccessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedStartSeconds, setSelectedStartSeconds] = useState<number | undefined>(undefined);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [playLoading, setPlayLoading] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchLectureAccessInfo(token)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        const firstPublished = data.sections
          .flatMap((s) => s.videos)
          .find((v) => v.isPublished);
        if (firstPublished) {
          setSelectedVideoId(firstPublished.id);
          setSelectedStartSeconds(firstPublished.chapters?.[0]?.startSeconds);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "접근할 수 없는 강의입니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const allVideos = useMemo<LecturePublicVideo[]>(
    () => info?.sections.flatMap((s) => s.videos) ?? [],
    [info],
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
    fetchLecturePlayUrl(token, selectedVideo.id, selectedStartSeconds)
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
  }, [token, selectedVideo?.id, selectedVideo?.isPublished, selectedStartSeconds]);

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
        <div className="max-w-sm text-center space-y-2">
          <p className="text-lg font-semibold text-foreground">접근할 수 없는 강의입니다.</p>
          <p className="text-sm text-muted-foreground">
            링크가 만료되었거나 유효하지 않습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-5 sm:px-8">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{info.course.title}</h1>
        {info.course.description && (
          <p className="mt-1 text-sm text-muted-foreground">{info.course.description}</p>
        )}
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
            ) : selectedRow?.startSeconds != null ? (
              <BunnyChapterPlayer
                embedUrl={embedUrl}
                startSeconds={selectedRow.startSeconds}
                endSeconds={selectedRow.endSeconds}
                iframeId={PLAYER_IFRAME_ID}
                title={selectedRow.title}
              />
            ) : (
              <iframe
                key={embedUrl}
                id={PLAYER_IFRAME_ID}
                src={embedUrl}
                title={selectedRow?.title ?? selectedVideo.title}
                loading="lazy"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            )}
          </div>

          {selectedVideo && (
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedRow?.title ?? selectedVideo.title}
              </h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {(selectedRow?.durationSeconds ?? selectedVideo.durationSeconds) != null && (
                  <span>{formatDuration(selectedRow?.durationSeconds ?? selectedVideo.durationSeconds)}</span>
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
          {info.sections.map((section) => {
            const rows = section.videos.flatMap(expandVideoRows);
            return (
              <div key={section.id} className="rounded-sm border border-border bg-card">
                <div className="px-4 py-2.5 border-b border-border text-sm font-semibold text-foreground">
                  {section.title}
                </div>
                <ul>
                  {rows.map((row) => {
                    const active =
                      row.video.id === selectedVideoId && row.startSeconds === selectedStartSeconds;
                    return (
                      <li key={row.key}>
                        <button
                          type="button"
                          disabled={!row.video.isPublished}
                          onClick={() => {
                            setSelectedVideoId(row.video.id);
                            setSelectedStartSeconds(row.startSeconds);
                          }}
                          className={`w-full text-left px-4 py-3 text-sm border-b border-border last:border-b-0 flex items-center justify-between gap-3 transition-colors ${
                            active
                              ? "bg-primary/10 text-primary font-semibold"
                              : row.video.isPublished
                                ? "text-foreground hover:bg-secondary/50"
                                : "text-muted-foreground cursor-not-allowed"
                          }`}
                        >
                          <span className="truncate">{row.title}</span>
                          {row.video.isPublished ? (
                            row.durationSeconds != null && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {formatDuration(row.durationSeconds)}
                              </span>
                            )
                          ) : (
                            <span className="shrink-0 text-xs">준비 중</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {rows.length === 0 && (
                    <li className="px-4 py-3 text-sm text-muted-foreground">영상이 없습니다.</li>
                  )}
                </ul>
              </div>
            );
          })}
          {info.sections.length === 0 && (
            <p className="text-sm text-muted-foreground px-2">등록된 강의 목록이 없습니다.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
