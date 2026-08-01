"use client";

import { useEffect, useState } from "react";
import {
  analysisTone,
  displayTenantDetail,
  opposabilityTone,
  parseAnyTenantStatus,
} from "@/lib/tenant-status";
import { fetchTenantSummary } from "@/lib/api";
import type { AuctionAnalysisResult } from "@/types/auction";

const toneClass: Record<string, string> = {
  danger: "text-red-600 font-medium",
  warning: "text-amber-600",
  info: "text-muted-foreground",
  default: "text-muted-foreground",
};

const headCellClass =
  "px-3 py-2 text-left text-[0.68rem] font-medium text-muted-foreground whitespace-nowrap";
const bodyCellClass = "px-3 py-2.5 text-[0.78rem] leading-relaxed text-foreground align-top";

function extractSuccessorKey(tenantName: string): string | null {
  const match = tenantName.match(/\(([^)]*승계인[^)]*)\)/);
  if (!match) return null;
  const cleaned = match[1].replace(/승계인|임차권자|양수인|양도인|의/g, " ");
  const nameMatch = cleaned.match(/([가-힣]{2,4})/);
  return nameMatch ? nameMatch[1] : null;
}

/** 원문(법률 용어 위주)을 AI가 1~2문장으로 풀어쓴 핵심요약 배너. 물건당
 * 1회만 생성/캐싱되므로 모달을 다시 열어도 추가 비용 없이 캐시를 받는다.
 * 원문은 이 배너 아래(표/기타사항)에 그대로 유지된다 — 요약은 "먼저 보는
 * 헤드라인"이지 원문을 대체하지 않는다(사용자 요청, 2026-08-01). */
function TenantSummaryBanner({ auctionId, hasContent }: { auctionId?: string; hasContent: boolean }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auctionId || !hasContent) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchTenantSummary(auctionId)
      .then((res) => {
        if (!cancelled) setSummary(res.summary || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "요약을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auctionId, hasContent]);

  if (!auctionId || !hasContent) return null;
  if (!loading && !error && !summary) return null;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2.5 mb-3 flex gap-2">
      <span className="text-primary shrink-0" aria-hidden>
        ✨
      </span>
      <div className="min-w-0">
        <p className="text-[0.68rem] font-semibold text-primary mb-0.5">AI 핵심요약</p>
        {loading && <p className="text-[0.8rem] text-muted-foreground">요약 생성 중...</p>}
        {error && <p className="text-[0.75rem] text-muted-foreground">{error}</p>}
        {!loading && summary && (
          <p className="text-[0.82rem] text-foreground leading-relaxed">{summary}</p>
        )}
      </div>
    </div>
  );
}

/** 임차인 이름에 이 이름들이 포함되면 보증기관 승계로 보고, [기타사항]에
 * 임차보증금반환채권 포기 문구가 있으면 "임차권 포기" 배지를 붙인다
 * (사용자 요청, 2026-08-01 — 인수조건변경이면서 보증금반환채권을 포기한
 * 경우를 표에서 바로 알아볼 수 있게). rights-analysis-context.util.ts의
 * hasCreditorWaiver 정규식과 동일 패턴을 프론트에서도 재사용. */
const GUARANTEE_CORP_RE = /보증공사|주택도시보증|\bHUG\b|\bLH\b/;
const CREDITOR_WAIVER_RE =
  /잔존\s*임차보증금반환채권을?\s*포기|보증금\s*전액을\s*(배당받지|변제받지)\s*못하더라도[^.\n]*포기|대항력은?\s*포기/;

/**
 * 대항력은 탱크옥션이 내려주는 원본 값을 그대로 믿지 않고, 전입일과
 * 말소기준등기일을 직접 비교해 우리가 판단한다(전입일이 말소기준일보다
 * 빠르면 대항력 있음). 원본 값이 행마다 서로 다른 임차인(양도인/승계인
 * 등)을 뭉뚱그려 잘못 표시하는 사례가 실측 확인됨(2026-08-01,
 * "최연정" 케이스 — 양도인 행은 "없음", 승계인 행은 "인수조건변경"인데
 * 실제 전입일 기준으로는 대항력이 있는 임차인이었음). 날짜를 비교할 수
 * 없는 경우에만 원본 값으로 폴백한다. */
function computeOpposability(moveInDate: string, baselineDate?: string): "있음" | "없음" | null {
  if (!baselineDate || !moveInDate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baselineDate) || !/^\d{4}-\d{2}-\d{2}$/.test(moveInDate)) {
    return null;
  }
  return moveInDate < baselineDate ? "있음" : "없음";
}

export function TenantStatusPanel({
  value,
  compact = false,
  rightsAnalysis,
  auctionId,
  baselineDate,
}: {
  value: string;
  compact?: boolean;
  rightsAnalysis?: AuctionAnalysisResult | null;
  auctionId?: string;
  baselineDate?: string;
}) {
  const parsed = parseAnyTenantStatus(value);
  const hasContent = Boolean(displayTenantDetail(value));

  if (!parsed || parsed.rows.length === 0) {
    const text = displayTenantDetail(value);
    if (!text) return <span className="text-muted-foreground/50">-</span>;
    return (
      <div
        className={
          compact
            ? "min-w-0"
            : "min-w-0 rounded-sm border border-border/70 bg-secondary/5 px-3 py-2.5"
        }
      >
        {!compact && <TenantSummaryBanner auctionId={auctionId} hasContent={hasContent} />}
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {text}
        </div>
      </div>
    );
  }

  const { rows, miscNotes } = parsed;
  const seenSuccessorKeys = new Set<string>();
  const totalDeposit = rows.reduce((sum, row) => {
    const successorKey = extractSuccessorKey(row.tenantName);
    if (successorKey) {
      if (seenSuccessorKeys.has(successorKey)) return sum;
      seenSuccessorKeys.add(successorKey);
    }
    const match = row.depositRent.match(/([\d,]+)/);
    const n = match ? Number(match[1].replace(/,/g, "")) : 0;
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);

  return (
    <div>
      {!compact && <TenantSummaryBanner auctionId={auctionId} hasContent={hasContent} />}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full min-w-[1020px] table-fixed border-collapse">
          <colgroup>
            <col className="w-[72px]" />
            <col className="w-[105px]" />
            <col className="w-[150px]" />
            <col className="w-[155px]" />
            <col className="w-[135px]" />
            <col className="w-[90px]" />
            <col className="w-[140px]" />
            <col className="w-[173px]" />
          </colgroup>
          <thead className="sticky top-0 bg-card border-b border-border shadow-[0_1px_0_0_var(--border)]">
            <tr>
              <th className={headCellClass}>점유목록</th>
              <th className={headCellClass}>임차인</th>
              <th className={headCellClass}>점유부분/기간</th>
              <th className={headCellClass}>전입/확정/배당</th>
              <th className={headCellClass}>보증금/차임</th>
              <th className={headCellClass}>대항력</th>
              <th className={headCellClass}>분석</th>
              <th className={headCellClass}>기타</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const moveInDate =
                row.dates.match(/전입:(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
              // 등기부에서 파싱한 말소기준일(props)을 우선 쓰고, 없으면
              // 이미 AI 권리분석을 돌린 적이 있을 때만 그 결과를 보조로 쓴다.
              const ownOpposability = computeOpposability(
                moveInDate,
                baselineDate || rightsAnalysis?.structuredRights?.baselineRight.date,
              );
              const displayedOpposability =
                ownOpposability ??
                (row.opposability && row.opposability !== "-" ? row.opposability : "-");
              const isGuaranteeCorp = GUARANTEE_CORP_RE.test(row.tenantName);
              const hasWaiver = isGuaranteeCorp && CREDITOR_WAIVER_RE.test(miscNotes || "");
              return (
              <tr key={i} className="border-t border-border/60">
                <td className={bodyCellClass}>{row.occupancyNo || "-"}</td>
                <td className={`${bodyCellClass} whitespace-nowrap font-medium`}>
                  {row.tenantName || "-"}
                  {hasWaiver && (
                    <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[0.6rem] font-semibold bg-amber-100 text-amber-700 align-middle">
                      임차권 포기
                    </span>
                  )}
                </td>
                <td className={`${bodyCellClass} whitespace-pre-line break-words`}>{row.occupancy || "-"}</td>
                <td className={`${bodyCellClass} whitespace-nowrap`}>
                  {row.dates
                    ? row.dates.split(" / ").map((part, idx) => <div key={idx}>{part}</div>)
                    : "-"}
                </td>
                <td className={`${bodyCellClass} whitespace-pre-line break-words font-semibold`}>
                  {row.depositRent || "-"}
                </td>
                <td
                  className={`${bodyCellClass} whitespace-nowrap ${
                    ownOpposability === "없음"
                      ? "text-emerald-700 font-bold"
                      : opposabilityTone(displayedOpposability) === "danger"
                        ? "text-red-600 font-semibold"
                        : ""
                  }`}
                  title={
                    ownOpposability
                      ? `전입일(${moveInDate})과 말소기준등기일 비교로 코치픽이 직접 판단한 값`
                      : undefined
                  }
                >
                  {displayedOpposability}
                </td>
                <td className={`${bodyCellClass} whitespace-pre-line break-words`}>
                  {row.analysis.length > 0
                    ? row.analysis.map((line, idx) => (
                        <div key={idx} className={toneClass[analysisTone(line)]}>
                          {line}
                        </div>
                      ))
                    : "-"}
                </td>
                <td className={`${bodyCellClass} whitespace-pre-line break-words text-muted-foreground`}>
                  {row.other || "-"}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && (
        <div className="flex items-center justify-end px-3 py-2 border-t border-border/60 bg-secondary/20 text-[0.72rem] text-muted-foreground">
          <span className="font-semibold text-foreground">
            임차인 {rows.length}건, 임차보증금합계: {totalDeposit.toLocaleString("ko-KR")}원
          </span>
        </div>
      )}
      {miscNotes && (
        <div className="px-3 py-2.5 border-t border-border/60 text-[0.75rem] text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {miscNotes}
        </div>
      )}
      </div>
    </div>
  );
}
