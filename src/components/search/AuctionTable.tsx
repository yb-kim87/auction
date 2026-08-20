"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type { AuctionItem } from "@/types/auction";
import { getFailureRateRatio } from "@/lib/failure-rate";
import { hasNaverPrice } from "@/lib/naver-price";
import type { InvestmentCriteria } from "@/lib/investment-criteria";
import type { LoanPolicy } from "@/lib/api";
import { LIST_TEXT } from "@/lib/search-format";
import { buildColumns } from "./columns";

type SortDir = "asc" | "desc" | null;

function getSortValue(row: AuctionItem, key: string): string | number | null {
  switch (key) {
    case "failureRate":
      return getFailureRateRatio(row.minPrice, row.appraisedValue);
    case "diff1":
      if (!hasNaverPrice(row.naverPrice)) return null;
      return row.diffNaverSale ?? (row.salePrice != null ? row.naverPrice - row.salePrice : null);
    case "diff2":
      if (!hasNaverPrice(row.naverPrice)) return null;
      return row.diffNaverMin ?? row.naverPrice - row.minPrice;
    case "diff3":
      if (!hasNaverPrice(row.naverPrice)) return null;
      return row.diffNaverAppraised ?? row.naverPrice - row.appraisedValue;
    default: {
      const value = row[key as keyof AuctionItem];
      return typeof value === "string" || typeof value === "number" ? value : null;
    }
  }
}

export function AuctionTable({
  data,
  isAdmin,
  onRowClick,
  recommendCriteria,
  loanPolicies,
  regulatedRegionNames,
  incomeLoanMultiplier,
}: {
  data: AuctionItem[];
  isAdmin: boolean;
  onRowClick: (item: AuctionItem) => void;
  recommendCriteria: InvestmentCriteria | null;
  loanPolicies: LoanPolicy[];
  regulatedRegionNames: string[];
  incomeLoanMultiplier: number | undefined;
}) {
  const columns = useMemo(
    () =>
      buildColumns(isAdmin, recommendCriteria, loanPolicies, regulatedRegionNames, incomeLoanMultiplier),
    [isAdmin, recommendCriteria, loanPolicies, regulatedRegionNames, incomeLoanMultiplier],
  );
  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      buildColumns(false, null, [], [], undefined).map((c) => [c.key, c.defaultWidth]),
    )
  );

  useEffect(() => {
    setColWidths((prev) => {
      const missing = columns.filter((c) => !(c.key in prev));
      if (missing.length === 0) return prev;
      return { ...prev, ...Object.fromEntries(missing.map((c) => [c.key, c.defaultWidth])) };
    });
  }, [columns]);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const resizing = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const onMouseDown = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = { key, startX: e.clientX, startW: colWidths[key] };
  }, [colWidths]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const { key: rKey, startX, startW } = resizing.current;
      const delta = e.clientX - startX;
      const newW = Math.max(48, startW + delta);
      setColWidths((prev) => ({ ...prev, [rKey]: newW }));
    };
    const onUp = () => { resizing.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const handleSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey(null); setSortDir(null); }
  };

  const sorted = [...data].sort((a, b) => {
    if (!sortKey || !sortDir) return 0;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return 0;
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const SortIcon = ({ k }: { k: string }) => {
    if (sortKey !== k) return <ChevronsUpDown size={12} className="opacity-30 ml-0.5 inline shrink-0" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="ml-0.5 inline text-primary shrink-0" /> : <ChevronDown size={12} className="ml-0.5 inline text-primary shrink-0" />;
  };

  return (
    <div className="relative overflow-auto border border-border rounded-sm bg-card shadow-sm" style={{ maxHeight: "calc(100vh - 420px)" }}>
      <table className={`border-collapse ${LIST_TEXT}`} style={{ width: "max-content", minWidth: "100%" }}>
        <thead className="sticky top-0 z-20 bg-secondary/80 backdrop-blur-sm">
          <tr>
            <th className={`sticky left-0 z-30 bg-secondary/80 backdrop-blur-sm w-10 text-center border-b border-r border-border px-2 py-3 ${LIST_TEXT} font-semibold text-muted-foreground select-none`}>
              #
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`relative border-b border-r border-border px-3 py-3 ${LIST_TEXT} font-semibold text-foreground select-none whitespace-nowrap group`}
                style={{ width: colWidths[col.key], minWidth: colWidths[col.key], textAlign: col.align ?? "center" }}
              >
                <span
                  className={`cursor-pointer hover:text-primary inline-flex items-center gap-0.5 w-full ${
                    col.align === "left"
                      ? "justify-start"
                      : col.align === "right"
                        ? "justify-end"
                        : "justify-center"
                  }`}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="truncate">{col.label}</span>
                  <SortIcon k={col.key} />
                </span>
                {/* Resize handle */}
                <span
                  onMouseDown={(e) => onMouseDown(col.key, e)}
                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-primary/30 transition-opacity"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className={`text-center py-16 ${LIST_TEXT} text-muted-foreground`}>
                조건에 맞는 물건이 없습니다
              </td>
            </tr>
          ) : sorted.map((row, idx) => (
            <tr
              key={row.id}
              onClick={() => onRowClick(row)}
              className="hover:bg-secondary/30 transition-colors cursor-pointer"
            >
              <td className={`sticky left-0 z-10 bg-card text-center border-b border-r border-border px-2 py-3 ${LIST_TEXT} text-muted-foreground font-mono`}>
                {idx + 1}
              </td>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`border-b border-r border-border px-3 py-3 whitespace-nowrap overflow-hidden ${
                    col.align === "left"
                      ? "text-left"
                      : col.align === "right"
                        ? "text-right"
                        : "text-center"
                  }`}
                  style={{ maxWidth: colWidths[col.key] }}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
