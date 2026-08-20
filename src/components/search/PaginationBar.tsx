"use client";

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { LIST_TEXT } from "@/lib/search-format";

export const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

export function PaginationBar({
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pageNumbers = useMemo(() => {
    const windowSize = 5;
    const start = Math.max(1, currentPage - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    const adjustedStart = Math.max(1, end - windowSize + 1);
    const pages: number[] = [];
    for (let p = adjustedStart; p <= end; p++) pages.push(p);
    return pages;
  }, [currentPage, totalPages]);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-2">
      <div className={`flex items-center gap-2 ${LIST_TEXT} text-muted-foreground`}>
        <span>페이지당</span>
        <div className="w-24">
          <div className="relative">
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className={`w-full appearance-none bg-card border border-border rounded-sm px-3 py-1.5 pr-7 ${LIST_TEXT} text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors hover:border-primary/50 cursor-pointer`}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}개</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
          </div>
        </div>
      </div>

      {totalPages > 1 && (
        <div className={`flex items-center gap-1 ${LIST_TEXT}`}>
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="px-2 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:border-border transition-colors"
          >
            처음
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-2 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:border-border transition-colors"
          >
            이전
          </button>
          {pageNumbers.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`min-w-[2.25rem] px-2 py-1.5 rounded-sm border font-mono transition-colors ${
                p === currentPage
                  ? "bg-primary text-primary-foreground border-primary font-semibold"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-2 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:border-border transition-colors"
          >
            다음
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="px-2 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:border-border transition-colors"
          >
            마지막
          </button>
        </div>
      )}

      <span className={`${LIST_TEXT} text-muted-foreground`}>
        {totalPages}페이지 중 {currentPage}페이지
      </span>
    </div>
  );
}
