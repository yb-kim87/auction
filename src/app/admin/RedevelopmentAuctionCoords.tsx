"use client";

import { useEffect, useState } from "react";
import { fetchAuctionCoordBackfillStatus, startAuctionCoordBackfill, type AuctionCoordBackfillStatus } from "@/lib/api";

const POLL_MS = 4000;

/** 구역도 업데이트 탭 — 경매물건 좌표 채우기(경기·인천). 주소를 카카오로 좌표로 바꿔, 재개발 구역 경계 100m 이내인 물건만 저장한다. 이후 새로 가져오는 물건은 크롤링 때 자동으로 채운다. */
export function RedevelopmentAuctionCoords() {
  const [status, setStatus] = useState<AuctionCoordBackfillStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = !!status?.running;

  useEffect(() => {
    fetchAuctionCoordBackfillStatus().then(setStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      fetchAuctionCoordBackfillStatus().then(setStatus).catch((e) => setError(e instanceof Error ? e.message : "상태 확인 실패"));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running]);

  async function start() {
    if (!window.confirm("경기·인천 경매물건 중 좌표가 없는 물건의 주소를 카카오로 변환합니다(수천 건일 수 있고 몇 분 걸립니다). 진행할까요?")) return;
    setError(null);
    setStarting(true);
    try {
      setStatus(await startAuctionCoordBackfill(true));
    } catch (e) {
      setError(e instanceof Error ? e.message : "시작하지 못했습니다.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="rounded-sm border border-border bg-card px-4 py-3 text-xs space-y-1.5">
      <p className="font-semibold text-foreground">
        경매물건 좌표 채우기 <span className="font-normal text-muted-foreground">— 경기·인천 경매물건 중 좌표가 없는 물건의 주소를 카카오로 좌표로 바꿔 모두 저장합니다. 재개발 구역 안이거나 경계 100m 이내인 물건은 따로 표시해 지도에 보여 줍니다. 새로 가져오는 물건은 크롤링할 때 자동으로 채우고, 구역이 바뀌면 표시가 자동으로 다시 계산됩니다.</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={running || starting} onClick={() => void start()} className="rounded-sm border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
          {running ? "채우는 중…" : starting ? "시작 중…" : "경기·인천 좌표 채우기"}
        </button>
        {status && status.startedAt && (
          <span className="text-muted-foreground">
            {running ? "진행 중" : "최근 실행"}: {status.done.toLocaleString("ko-KR")}/{status.total.toLocaleString("ko-KR")}건 처리 · <b className="text-foreground">{status.saved.toLocaleString("ko-KR")}건 좌표 저장</b>
            {!running && status.finishedAt ? ` · 완료 ${new Date(status.finishedAt).toLocaleString("ko-KR")}` : ""}
          </span>
        )}
      </div>
      {(error || status?.error) && <p className="text-destructive">{error ?? status?.error}</p>}
    </div>
  );
}
