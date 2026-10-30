"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJaegebalZoneSummary, type JaegebalZoneSummary } from "@/lib/api";
import { RedevelopmentJaegebalSync } from "./RedevelopmentJaegebalSync";

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** 재개발물건 → 구역도 업데이트 탭 — 재개발닷컴 구역을 지정한 구만 지금 업데이트하거나, 자동 업데이트(주기마다 새벽에 서버가 실행)를 설정한다.
 *  (구역·지도 탭에서 분리됨, 2026-10-30) 변경 이력은 "구역 업데이트 이력" 탭에서 날짜별로 본다. */
export function RedevelopmentUpdateTab() {
  const [summary, setSummary] = useState<JaegebalZoneSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(() => {
    fetchJaegebalZoneSummary()
      .then((s) => {
        setSummary(s);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "요약을 불러오지 못했습니다."));
  }, []);

  useEffect(loadSummary, [loadSummary]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-bold text-foreground">구역도 업데이트</h2>
        <span className="text-xs text-muted-foreground">재개발닷컴의 구역 경계·단계·사업유형을 새로 가져와 반영합니다. 업데이트가 끝나면 구역·지도 탭에 바로 보입니다.</span>
      </div>

      <div className="rounded-sm border border-border bg-card px-4 py-3 text-xs space-y-1.5">
        {error && <p className="text-destructive">{error}</p>}
        <p className="text-muted-foreground">
          지금 반영된 재개발닷컴 구역 <b className="text-foreground">{summary ? summary.zoneCount.toLocaleString("ko-KR") : "-"}개</b>
          {summary?.lastUpdatedAt ? ` · 구역 마지막 변경 ${dateTime(summary.lastUpdatedAt)}` : ""}
          {summary?.lastRunAt ? ` · 마지막 업데이트 실행 ${dateTime(summary.lastRunAt)}` : ""}
        </p>
        {!!summary?.missingCount && (
          <p className="text-muted-foreground">
            사라진 구역 <b className="text-foreground">{summary.missingCount.toLocaleString("ko-KR")}개</b> — 재개발닷컴 최신 수집에서 보이지 않아 지도에 회색 점선으로 표시 중입니다(삭제하지 않음).
          </p>
        )}
        <RedevelopmentJaegebalSync onFinished={loadSummary} />
        <p className="text-muted-foreground">
          마지막 반영 후 <b className="text-foreground">2주</b>가 지나면 재개발 텔레그램 채널로 업데이트 요청 알림이 옵니다(매일 오전 10시 확인). 자동 업데이트를 켜 두면 성공한 실행도 마지막 반영으로 봅니다.
        </p>
      </div>
    </div>
  );
}
