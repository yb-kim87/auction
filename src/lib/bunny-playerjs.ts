/** Bunny Stream iframe embed를 Player.js(postMessage 기반 재생 제어/이벤트
 * API)로 제어하기 위한 로더. 챕터(구간) 재생 시 챕터 전용 진행바(0부터
 * 시작해서 챕터 길이에서 끝나는, "따로 올라간 영상처럼 보이는" 게이지)를
 * 만들고, 다음 챕터 시작 지점(또는 관리자가 지정한 종료 시각)에서
 * 자동으로 멈추기 위해 필요하다(사용자 요청, 2026-08-04: "다음
 * 시작시간전에 끝나는걸로 하게는 못하나?" → "아예 영상이 따로따로
 * 올라간거처럼 보이게"). 공식 문서: https://bunny.net/docs/stream/playback-api */
const PLAYERJS_SRC = "https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js";

export type PlayerJsPlayer = {
  on: (event: string, cb: (data?: { seconds: number; duration: number }) => void) => void;
  play: () => void;
  pause: () => void;
  setCurrentTime: (seconds: number) => void;
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
