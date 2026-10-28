"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAuctionCoordBackfillStatus,
  startAuctionCoordBackfill,
  type AuctionCoordBackfillStatus,
  type RedevelopmentZone,
} from "@/lib/api";

/** 경매물건 좌표 채우기 — 서버가 처리한다.
 * 크롤링(매일 작업·나이스·대법원 수집)으로 새로 저장되는 서울 빌라 물건은 저장 즉시 서버가 좌표를 채워 구역 근처일 때만 저장하므로,
 * 이 화면이 열릴 때마다 돌릴 필요가 없다(2026-10-28). 이 버튼은 서버 처리 이전에 저장된 기존 물건이나
 * 연결되지 않은 경로(엑셀·수동 등록)의 물건을 한 번에 채우는 용도다. */
export function RedevelopmentEditAuctionCoordFiller({
  onDone,
}: {
  zones?: RedevelopmentZone[];
  knownAuctionIds?: Set<string>;
  targetGu?: string[];
  toleranceM?: number;
  autoRun?: boolean;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<AuctionCoordBackfillStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wasRunning = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchAuctionCoordBackfillStatus();
      setStatus(s);
      if (wasRunning.current && !s.running) onDone();
      wasRunning.current = s.running;
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태를 불러오지 못했습니다.");
    }
  }, [onDone]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status?.running) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [status?.running, refresh]);

  async function start() {
    setError(null);
    setOpen(true);
    try {
      const s = await startAuctionCoordBackfill();
      wasRunning.current = s.running;
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "시작하지 못했습니다.");
    }
  }

  const running = !!status?.running;
  const finishedAt = status?.finishedAt ? new Date(status.finishedAt).toLocaleString("ko-KR") : null;
  return (
    <div className="relative shrink-0 text-xs">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded-sm border border-border px-3 py-1.5 font-semibold text-foreground hover:bg-muted">
        경매물건 업데이트 <span className={running ? "text-blue-600" : "text-muted-foreground"}>{running ? `진행 중 ${status?.done}/${status?.total}` : "대기"}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[min(440px,85vw)] rounded-md border border-border bg-white p-3 text-muted-foreground shadow-lg">
          <div className="mb-2 font-semibold text-foreground">경매물건 좌표 채우기 (서버)</div>
          <p className="leading-relaxed">
            매일 작업·나이스·대법원 수집으로 새로 들어오는 서울 빌라 물건은 저장 즉시 서버가 자동으로 좌표를 채웁니다. 이 버튼은 그 전에 저장된 기존 물건을 한 번에 채울 때만 누르면 됩니다. 구역 안이거나 경계 100m 이내인 물건만 좌표가 저장됩니다.
          </p>
          <div className="mt-2 space-y-1 leading-relaxed">
            {status && (status.total > 0 || status.startedAt) && (
              <p>
                {running ? "진행 중" : "마지막 실행"}: 대상 {status.total}건 중 {status.done}건 처리, 구역 근처 {status.saved}건 저장
                {finishedAt && !running ? ` (완료 ${finishedAt})` : ""}
              </p>
            )}
            {status?.error && <p className="text-destructive">오류: {status.error}</p>}
            {error && <p className="text-destructive">{error}</p>}
          </div>
          <button type="button" disabled={running} onClick={() => void start()} className="mt-3 rounded-sm border border-border px-3 py-1.5 font-semibold text-foreground hover:bg-muted disabled:opacity-50">
            {running ? "서버에서 처리 중..." : "기존 물건 좌표 채우기 시작"}
          </button>
        </div>
      )}
    </div>
  );
}
