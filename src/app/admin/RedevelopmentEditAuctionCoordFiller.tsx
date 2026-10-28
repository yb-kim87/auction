"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchAdminAuctions,
  geocodeAddress,
  saveResaleMatchCoords,
  type RedevelopmentZone,
} from "@/lib/api";
import { buildZoneBoxes, findZoneIds, NEAR_BOUNDARY_MAX_M } from "@/lib/zone-geometry";

/** (과거 기본값) 좌표를 채울 구 — 이제는 구역이 있는 서울 전체 구를 화면에서 계산해 넘긴다. */
export const TARGET_GU = ["금천구", "영등포구", "은평구"];
/** 주소를 좌표로 바꿔 봤지만 구역 근처가 아니었던 물건 — 다시 변환하지 않도록 이 브라우저에 기억(일주일). */
const MISS_KEY = "redev-edit-coord-miss";
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function loadMisses(): Map<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(MISS_KEY) ?? "{}") as Record<string, number>;
    const now = Date.now();
    return new Map(Object.entries(raw).filter(([, at]) => now - at < MISS_TTL_MS));
  } catch {
    return new Map();
  }
}

function saveMisses(m: Map<string, number>) {
  try {
    localStorage.setItem(MISS_KEY, JSON.stringify(Object.fromEntries(m)));
  } catch {
    // 저장 불가 환경이면 다음에 다시 변환한다.
  }
}
const GEOCODE_CONCURRENCY = 5;
const SAVE_BATCH = 50;
const PAGE_SIZE = 100;
const AUTO_RUN_KEY = "redev-edit-coord-fill-at";
const AUTO_RUN_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** 지오코딩이 잘 먹도록 "(건물명)" 같은 괄호 부분과 층·호수를 뗀다. */
function cleanAddress(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+제?\d+층.*$/, "")
    .replace(/\s+\d+호.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function recentlyAutoRan(): boolean {
  try {
    const at = Number(localStorage.getItem(AUTO_RUN_KEY));
    return Number.isFinite(at) && Date.now() - at < AUTO_RUN_INTERVAL_MS;
  } catch {
    return false;
  }
}

function markAutoRan() {
  try {
    localStorage.setItem(AUTO_RUN_KEY, String(Date.now()));
  } catch {
    // 저장 불가 환경이면 그냥 넘어간다.
  }
}

/** 경매코치에 이미 수집돼 있는 물건 중 재개발 구역 안(경계 오차범위 포함)에 있는 것만
 * 좌표를 채워 저장한다. 새 물건을 수집하지 않고, 좌표가 없는 기존 물건을 구 단위로 주소
 * 검색 → 주소를 좌표로 변환(프론트 지오코딩, Railway는 VWorld에 연결 못 함) → 구역 경계
 * 안이거나 경계에서 toleranceM 이내인 것만 저장한다.
 * 사용자 요청, 2026-10-24: "경매코치에 이미 수집된 물건 중 재개발구역 내(경계 오차범위
 * 포함) 물건만 좌표 찍어줘 — 버튼 없이 알아서". 그래서 구역이 준비되면 탭을 열 때 자동으로
 * 한 번 돌고(12시간 이내 재실행 방지), 버튼으로 다시 돌릴 수도 있다. */
export function RedevelopmentEditAuctionCoordFiller({
  zones,
  knownAuctionIds,
  targetGu,
  toleranceM,
  autoRun,
  onDone,
}: {
  zones: RedevelopmentZone[];
  knownAuctionIds: Set<string>;
  targetGu: string[];
  toleranceM: number;
  /** true가 되면(데이터 로딩이 끝나고 구역이 준비되면) 자동으로 한 번 실행한다. */
  autoRun: boolean;
  onDone: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const stopRef = useRef(false);
  const startedRef = useRef(false);

  async function run() {
    setRunning(true);
    setMessage(null);
    stopRef.current = false;
    const summary: string[] = [];
    try {
      for (const gu of targetGu) {
        if (stopRef.current) break;
        const guZones = zones.filter((z) => z.region === gu);
        if (guZones.length === 0) {
          summary.push(`${gu}: 구역 없음`);
          continue;
        }
        const boxes = buildZoneBoxes(guZones);

        // 1) 경매코치에 이미 있는 그 구 물건 전부 조회(페이지 순회) — 새로 수집하지 않는다.
        setProgress(`${gu} 물건 조회 중...`);
        const all: { id: string; address: string }[] = [];
        let page = 1;
        for (;;) {
          const res = await fetchAdminAuctions({ page, pageSize: PAGE_SIZE, search: gu });
          for (const a of res.items) {
            // 용도는 빌라(다세대·연립주택·도시형생활주택)만 — 아파트·오피스텔은 좌표를 채우지 않는다.
            if (a.propType === "빌라" && a.address.includes(gu) && a.address.includes("서울")) all.push({ id: a.id, address: a.address });
          }
          if (page >= res.totalPages || stopRef.current) break;
          page += 1;
        }
        const misses = loadMisses();
        const candidates = all.filter((a) => !knownAuctionIds.has(a.id) && !misses.has(a.id));

        // 2) 주소 → 좌표, 구역 안(경계 오차범위 포함)인지 판정
        const hits: { auctionId: string; latitude: number; longitude: number }[] = [];
        let edgeOnly = 0;
        let failed = 0;
        for (let i = 0; i < candidates.length && !stopRef.current; i += GEOCODE_CONCURRENCY) {
          const chunk = candidates.slice(i, i + GEOCODE_CONCURRENCY);
          await Promise.all(
            chunk.map(async (a) => {
              let c = await geocodeAddress(cleanAddress(a.address));
              if (c.latitude == null || c.longitude == null) c = await geocodeAddress(a.address);
              if (c.latitude == null || c.longitude == null) {
                failed += 1;
                return;
              }
              const { latitude: lat, longitude: lng } = c;
              // 지오코딩 오차를 감안해 경계에서 NEAR_BOUNDARY_MAX_M(100m) 이내까지는 저장한다 — 구역 안인지(오차범위 이내)/근처인지는 화면에서 나눠 표시.
              const strict = findZoneIds(lat, lng, boxes, 0);
              const near = strict.length > 0 ? strict : findZoneIds(lat, lng, boxes, Math.max(toleranceM, NEAR_BOUNDARY_MAX_M));
              if (near.length === 0) {
                misses.set(a.id, Date.now());
                return;
              }
              if (strict.length === 0) edgeOnly += 1;
              hits.push({ auctionId: a.id, latitude: lat, longitude: lng });
            }),
          );
          setProgress(`${gu} 좌표 변환 ${Math.min(i + GEOCODE_CONCURRENCY, candidates.length)}/${candidates.length}건 (구역 안 ${hits.length}건)`);
        }

        saveMisses(misses);
        // 3) 구역 안(경계 근처 포함) 물건만 좌표 저장
        for (let i = 0; i < hits.length; i += SAVE_BATCH) {
          await saveResaleMatchCoords(hits.slice(i, i + SAVE_BATCH));
        }
        summary.push(
          `${gu}: 물건 ${all.length}건 중 좌표 없는 ${candidates.length}건 처리 → 구역 안 ${hits.length}건 저장(경계 밖 ${NEAR_BOUNDARY_MAX_M}m 이내 ${edgeOnly}건 포함, 변환 실패 ${failed}건)`,
        );
      }
      setMessage(summary.join(" / ") + (stopRef.current ? " (중단됨)" : ""));
      if (!stopRef.current) markAutoRan();
      onDone();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "좌표 채우기 중 오류가 발생했습니다.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  // 구역이 준비되면 자동으로 한 번 실행한다(버튼 없이 알아서).
  const hasTargetZones = targetGu.some((gu) => zones.some((z) => z.region === gu));
  useEffect(() => {
    if (!autoRun || !hasTargetZones || startedRef.current || recentlyAutoRan()) return;
    startedRef.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, hasTargetZones]);

  const status = running ? `좌표 자동 갱신 중 · ${progress ?? "준비 중..."}` : message ?? "이번 화면에서 표시할 업데이트 내역이 없습니다. 자동 업데이트는 완료 후 12시간 동안 다시 실행되지 않습니다.";
  return (
    <div className="relative shrink-0 text-xs">
      <button type="button" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen} className="rounded-sm border border-border px-3 py-1.5 font-semibold text-foreground hover:bg-muted">
        경매물건 업데이트 <span className={running ? "text-blue-600" : "text-muted-foreground"}>{running ? "진행 중" : message ? "상세" : "대기"}</span>
      </button>
      {detailsOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[min(440px,85vw)] rounded-md border border-border bg-white p-3 text-muted-foreground shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-3 font-semibold text-foreground">
            <span>{running ? "경매물건 좌표 갱신 중" : "경매물건 업데이트 내역"}</span>
            {running && <button type="button" onClick={() => (stopRef.current = true)} className="text-destructive hover:underline">중단</button>}
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto leading-relaxed">
            {status.split(" / ").map((line, index) => <p key={index}>{line}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}
