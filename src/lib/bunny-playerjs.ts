/** Bunny Stream iframe embed를 Player.js(postMessage 기반 재생 제어/이벤트
 * API)로 제어하기 위한 로더. 챕터(구간) 재생 시 다음 챕터 시작 지점(또는
 * 관리자가 지정한 종료 시각)에서 자동으로 멈추기 위해 필요하다(사용자
 * 요청, 2026-08-04: "다음 시작시간전에 끝나는걸로 하게는 못하나?").
 * 자체 진행바(BunnyChapterPlayer)까지 만들었다가 "복잡하게 보인다"는
 * 피드백으로 되돌림(2026-08-04) — 최종적으로는 Bunny 기본 재생바를
 * 그대로 쓰고, 구간별로 목록이 나뉘어 보이는 것 + 자동 정지만 유지한다.
 * 공식 문서: https://bunny.net/docs/stream/playback-api */
const PLAYERJS_SRC = "https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js";

type PlayerJsPlayer = {
  on: (event: string, cb: (data?: { seconds: number; duration: number }) => void) => void;
  pause: () => void;
};

declare global {
  interface Window {
    playerjs?: { Player: new (idOrElement: string | HTMLElement) => PlayerJsPlayer };
  }
}

let loadPromise: Promise<void> | null = null;

export function loadBunnyPlayerJs(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.playerjs) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PLAYERJS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("playerjs load failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = PLAYERJS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("playerjs load failed"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

/** iframe(id)을 Player.js로 감싸, currentTime이 endSeconds에 도달하면
 * 자동으로 pause()를 호출한다. endSeconds가 없으면(마지막 챕터거나 챕터
 * 없는 영상) 아무 것도 하지 않고 끝까지 재생되게 둔다. */
export function attachChapterAutoPause(iframeId: string, endSeconds: number | undefined): void {
  if (endSeconds == null || typeof window === "undefined") return;
  loadBunnyPlayerJs()
    .then(() => {
      const el = document.getElementById(iframeId);
      if (!el || !window.playerjs) return;
      const player = new window.playerjs.Player(el);
      let paused = false;
      player.on("ready", () => {
        player.on("timeupdate", (data) => {
          if (!data || paused) return;
          if (data.seconds >= endSeconds) {
            paused = true;
            player.pause();
          }
        });
      });
    })
    .catch(() => {
      // Player.js를 못 불러와도 재생 자체(시작 지점 이동)는 되므로
      // 자동 정지만 조용히 포기한다.
    });
}

/** Bunny 기본 UI는 유지하면서 재생 위치와 종료 이벤트만 전달한다. */
export function attachLearningProgress(
  iframeId: string,
  options: {
    endSeconds?: number;
    onTimeUpdate: (seconds: number, duration: number) => void;
    onEnded: () => void;
  },
): void {
  if (typeof window === "undefined") return;
  loadBunnyPlayerJs()
    .then(() => {
      const el = document.getElementById(iframeId);
      if (!el || !window.playerjs) return;
      const player = new window.playerjs.Player(el);
      let finished = false;
      player.on("ready", () => {
        player.on("timeupdate", (data) => {
          if (!data) return;
          options.onTimeUpdate(data.seconds, data.duration);
          if (!finished && options.endSeconds != null && data.seconds >= options.endSeconds) {
            finished = true;
            player.pause();
            options.onEnded();
          }
        });
        player.on("ended", () => {
          if (finished) return;
          finished = true;
          options.onEnded();
        });
      });
    })
    .catch(() => {});
}
