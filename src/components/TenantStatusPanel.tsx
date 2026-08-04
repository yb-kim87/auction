"use client";

import {
  analysisTone,
  displayTenantDetail,
  opposabilityTone,
  parseAnyTenantStatus,
} from "@/lib/tenant-status";
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
  baselineDate,
}: {
  value: string;
  compact?: boolean;
  rightsAnalysis?: AuctionAnalysisResult | null;
  baselineDate?: string;
}) {
  const parsed = parseAnyTenantStatus(value);

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
  const rowMeta = (row: (typeof rows)[number]) => {
    const moveInDate = row.dates.match(/전입:(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
    const ownOpposability = computeOpposability(
      moveInDate,
      baselineDate || rightsAnalysis?.structuredRights?.baselineRight.date,
    );
    const displayedOpposability = ownOpposability ?? (row.opposability && row.opposability !== "-" ? row.opposability : "-");
    const hasWaiver = GUARANTEE_CORP_RE.test(row.tenantName) && CREDITOR_WAIVER_RE.test(miscNotes || "");
    const dangerous = opposabilityTone(displayedOpposability) === "danger" || row.analysis.some((line) => analysisTone(line) === "danger");
    return { moveInDate, ownOpposability, displayedOpposability, hasWaiver, dangerous };
  };
  const riskCount = rows.filter((row) => rowMeta(row).dangerous).length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-secondary/20">
        <div className="px-3 py-2.5"><p className="text-[0.62rem] text-muted-foreground">임차인</p><p className="mt-0.5 text-sm font-bold text-foreground">{rows.length}명</p></div>
        <div className="px-3 py-2.5"><p className="text-[0.62rem] text-muted-foreground">보증금 합계</p><p className="mt-0.5 text-sm font-bold text-foreground">{totalDeposit.toLocaleString("ko-KR")}원</p></div>
        <div className="px-3 py-2.5"><p className="text-[0.62rem] text-muted-foreground">확인 필요</p><p className={`mt-0.5 text-sm font-bold ${riskCount > 0 ? "text-red-600" : "text-emerald-700"}`}>{riskCount > 0 ? `${riskCount}건` : "없음"}</p></div>
      </div>

      <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2 2xl:hidden">
        {rows.map((row, i) => {
          const meta = rowMeta(row);
          return (
            <article key={i} className={`rounded-xl border p-3.5 ${meta.dangerous ? "border-red-200 bg-red-50/35" : "border-border bg-card"}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-foreground">{row.tenantName || "임차인 미상"}</span>
                    {row.occupancyNo && <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.62rem] text-muted-foreground">점유 {row.occupancyNo}</span>}
                  </div>
                  <p className="mt-1 text-[0.72rem] leading-relaxed text-muted-foreground whitespace-pre-line">{row.occupancy || "점유 부분 미확인"}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[0.65rem] font-bold ${meta.displayedOpposability === "없음" ? "bg-emerald-100 text-emerald-700" : meta.dangerous ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  대항력 {meta.displayedOpposability}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[0.72rem]">
                <div className="rounded-lg bg-secondary/45 px-2.5 py-2"><p className="text-[0.62rem] text-muted-foreground">전입·확정·배당</p><div className="mt-1 whitespace-pre-line leading-relaxed text-foreground">{row.dates ? row.dates.split(" / ").join("\n") : "-"}</div></div>
                <div className="rounded-lg bg-secondary/45 px-2.5 py-2"><p className="text-[0.62rem] text-muted-foreground">보증금·차임</p><p className="mt-1 whitespace-pre-line font-bold leading-relaxed text-foreground">{row.depositRent || "-"}</p></div>
              </div>
              {row.analysis.length > 0 && <div className="mt-2.5 space-y-1 border-t border-border/60 pt-2.5">{row.analysis.map((line, idx) => <p key={idx} className={`text-[0.72rem] leading-relaxed ${toneClass[analysisTone(line)]}`}>{line}</p>)}</div>}
              {(row.other || meta.hasWaiver) && <div className="mt-2 flex flex-wrap gap-1.5">{meta.hasWaiver && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-700">임차권 포기</span>}{row.other && <span className="text-[0.68rem] text-muted-foreground">{row.other}</span>}</div>}
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto max-h-72 overflow-y-auto 2xl:block">
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
              const { moveInDate, ownOpposability, displayedOpposability, hasWaiver } = rowMeta(row);
              return (
              <tr key={i} className="border-t border-border/60">
                <td className={bodyCellClass}>{row.occupancyNo || "-"}</td>
                <td className={`${bodyCellClass} break-words font-medium`}>
                  <span className="break-words">{row.tenantName || "-"}</span>
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
                  {hasWaiver && (
                    <span className="mt-1 block w-fit px-1.5 py-0.5 rounded text-[0.6rem] font-semibold bg-amber-100 text-amber-700 whitespace-nowrap">
                      임차권 포기
                    </span>
                  )}
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
      {miscNotes && (
        <div className="px-3 py-2.5 border-t border-border/60 text-[0.75rem] text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {miscNotes}
        </div>
      )}
    </div>
  );
}
