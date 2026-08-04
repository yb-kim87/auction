"use client";

import { useEffect, useRef, useState } from "react";
import { loadBunnyPlayerJs, type PlayerJsPlayer } from "@/lib/bunny-playerjs";

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** 챕터(구간) 재생 전용 플레이어. Bunny iframe의 재생바는 영상 전체
 * 길이 기준이라 챕터 구간만 보면 "몇 % 지점"인지 알 수 없고, 다음
 * 챕터까지 계속 재생되어 버린다. 그래서 Bunny의 기본 컨트롤 바(하단
 * 크롬)를 불투명 오버레이로 가리고, 그 위에 챕터 시작을 0으로 두는
 * 자체 진행바/재생버튼/시간 표시를 그려서 "이 챕터 하나가 통째로 별도
 * 영상인 것처럼" 보이게 한다(사용자 요청, 2026-08-04: "아예 영상이
 * 따로따로 올라간거처럼 보이게"). 실제 파일은 원본 영상 하나 그대로고,
 * Player.js(postMessage API)로 currentTime을 받아 계산만 새로 한다. */
export function BunnyChapterPlayer({
  embedUrl,
  startSeconds,
  endSeconds,
  videoDurationSeconds,
  iframeId,
  title,
}: {
  embedUrl: string;
  startSeconds: number;
  /** 이 값에 도달하면 자동으로 멈춘다(명시 지정 또는 다음 챕터 시작).
   * 마지막 챕터처럼 없을 수 있다 — 이땐 자동 정지하지 않고 영상 끝까지
   * 자연스럽게 재생한다. */
  endSeconds: number | undefined;
  /** 진행바/탐색 범위 계산용 폴백 — endSeconds가 없는 마지막 챕터도
   * 진행바가 멈춰 있지 않고(0%에 고정) 정상적으로 채워지고 탐색도
   * 되도록, 영상 전체 길이를 "이 챕터의 끝"으로 대신 쓴다(사용자 보고,
   * 2026-08-04: "두번째 섹션 전화조사방법은 게이지 조절이 아예 안돼" —
   * endSeconds가 없어 진행바 계산 자체가 막혀 있던 버그). 자동 정지에는
   * 쓰지 않는다(끝까지 재생돼야 하므로). */
  videoDurationSeconds: number | null;
  iframeId: string;
  title: string;
}) {
  const [current, setCurrent] = useState(startSeconds);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<PlayerJsPlayer | null>(null);
  const pausedAtEndRef = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setCurrent(startSeconds);
    setPlaying(false);
    pausedAtEndRef.current = false;
    playerRef.current = null;

    loadBunnyPlayerJs()
      .then(() => {
        if (cancelled) return;
        const el = document.getElementById(iframeId);
        if (!el || !window.playerjs) return;
        const player = new window.playerjs.Player(el);
        player.on("ready", () => {
          if (cancelled) return;
          playerRef.current = player;
          player.on("play", () => setPlaying(true));
          player.on("pause", () => setPlaying(false));
          player.on("timeupdate", (data) => {
            if (!data || cancelled) return;
            setCurrent(data.seconds);
            if (endSeconds != null && data.seconds >= endSeconds && !pausedAtEndRef.current) {
              pausedAtEndRef.current = true;
              player.pause();
            }
          });
        });
      })
      .catch(() => {
        // Player.js 로드 실패 시 자체 컨트롤은 못 쓰지만, embedUrl의 t=
        // 파라미터로 시작 지점 이동 자체는 되므로 조용히 넘어간다.
      });

    return () => {
      cancelled = true;
    };
    // embedUrl이 바뀌면(챕터/영상 전환) iframe이 새로 마운트되므로 다시 연결한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl, iframeId]);

  const relative = Math.max(0, current - startSeconds);
  const displayEndSeconds = endSeconds ?? videoDurationSeconds ?? undefined;
  const chapterDuration = displayEndSeconds != null ? Math.max(0, displayEndSeconds - startSeconds) : null;
  const progressPct = chapterDuration ? Math.min(100, (relative / chapterDuration) * 100) : 0;

  function seekAt(clientX: number) {
    if (!playerRef.current || chapterDuration == null || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    pausedAtEndRef.current = false;
    playerRef.current.setCurrentTime(startSeconds + frac * chapterDuration);
  }

  function togglePlay() {
    if (!playerRef.current) return;
    if (playing) {
      playerRef.current.pause();
    } else {
      pausedAtEndRef.current = false;
      playerRef.current.play();
    }
  }

  return (
    <div className="relative w-full h-full">
      <iframe
        id={iframeId}
        key={embedUrl}
        src={embedUrl}
        title={title}
        loading="lazy"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
        className="absolute inset-0 w-full h-full border-0"
      />
      {/* Bunny 기본 하단 컨트롤을 가리는 불투명 바 + 챕터 전용 커스텀 컨트롤 */}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-black flex items-center gap-3 px-3 sm:px-4">
        <button
          type="button"
          onClick={togglePlay}
          className="shrink-0 text-white text-base leading-none w-6 text-center"
          aria-label={playing ? "일시정지" : "재생"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div
          ref={trackRef}
          onClick={(e) => seekAt(e.clientX)}
          className="flex-1 h-1.5 bg-white/25 rounded-full cursor-pointer relative"
        >
          <div className="h-full bg-white rounded-full pointer-events-none" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="shrink-0 text-white text-[11px] tabular-nums">
          {formatClock(relative)}
          {chapterDuration != null ? ` / ${formatClock(chapterDuration)}` : ""}
        </span>
      </div>
    </div>
  );
}
