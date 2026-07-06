"use client";

import {
  analysisTone,
  displayTenantDetail,
  opposabilityTone,
  parseAnyTenantStatus,
} from "@/lib/tenant-status";

const toneClass: Record<string, string> = {
  danger: "text-red-600 font-medium",
  warning: "text-amber-600",
  info: "text-muted-foreground",
  default: "text-muted-foreground",
};

const headCellClass =
  "px-3 py-2 text-left text-[0.68rem] font-medium text-muted-foreground whitespace-nowrap";
const bodyCellClass = "px-3 py-2 text-[0.78rem] text-foreground align-top";

function extractSuccessorKey(tenantName: string): string | null {
  const match = tenantName.match(/\(([^)]*승계인[^)]*)\)/);
  if (!match) return null;
  const cleaned = match[1].replace(/승계인|임차권자|양수인|양도인|의/g, " ");
  const nameMatch = cleaned.match(/([가-힣]{2,4})/);
  return nameMatch ? nameMatch[1] : null;
}

export function TenantStatusPanel({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
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

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full border-collapse">
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
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className={bodyCellClass}>{row.occupancyNo || "-"}</td>
                <td className={`${bodyCellClass} whitespace-normal font-medium`}>
                  {row.tenantName || "-"}
                </td>
                <td className={`${bodyCellClass} whitespace-normal`}>{row.occupancy || "-"}</td>
                <td className={`${bodyCellClass} whitespace-normal`}>
                  {row.dates
                    ? row.dates.split(" / ").map((part, idx) => <div key={idx}>{part}</div>)
                    : "-"}
                </td>
                <td className={`${bodyCellClass} whitespace-normal font-semibold`}>
                  {row.depositRent || "-"}
                </td>
                <td
                  className={`${bodyCellClass} whitespace-normal ${
                    opposabilityTone(row.opposability) === "danger" ? "text-red-600 font-semibold" : ""
                  }`}
                >
                  {row.opposability || "-"}
                </td>
                <td className={`${bodyCellClass} whitespace-normal`}>
                  {row.analysis.length > 0
                    ? row.analysis.map((line, idx) => (
                        <div key={idx} className={toneClass[analysisTone(line)]}>
                          {line}
                        </div>
                      ))
                    : "-"}
                </td>
                <td className={`${bodyCellClass} whitespace-normal text-muted-foreground`}>
                  {row.other || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/60 bg-secondary/20 text-[0.72rem] text-muted-foreground">
          <span>계 (승계된 임차인이 중복으로 표기될 수 있습니다.)</span>
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
  );
}
