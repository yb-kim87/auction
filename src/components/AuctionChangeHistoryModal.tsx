"use client";

import { useEffect, useState } from "react";
import { X, History, Loader2 } from "lucide-react";
import type { AuctionItem } from "@/types/auction";
import { CHANGE_SOURCE_LABELS, type AuctionChangeLogEntry } from "@/types/auction";
import { fetchAuctionChangeHistory } from "@/lib/api";

const LIST_TEXT = "text-[14px] leading-snug";
const LABEL_TEXT = "text-[13px] leading-snug";

export function AuctionChangeHistoryModal({
  item,
  open,
  onClose,
}: {
  item: AuctionItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<AuctionChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !item) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    fetchAuctionChangeHistory(item.id)
      .then((data) => {
        if (!cancelled) setLogs(data);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || "변경 이력을 불러오지 못했습니다.");
          setLogs([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, item]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />

      <div
        className="relative w-full max-w-3xl my-4 bg-card border border-border rounded-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-5 py-4 border-b border-border bg-card rounded-t-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <History size={18} className="text-primary shrink-0" />
              <h3 className="text-base font-bold text-foreground">변경 이력</h3>
            </div>
            <p className={`${LABEL_TEXT} text-muted-foreground font-mono truncate`}>
              {item.auctionNo || item.address}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-sm hover:bg-secondary transition-colors shrink-0"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className={`flex items-center justify-center gap-2 py-16 ${LIST_TEXT} text-muted-foreground`}>
              <Loader2 size={18} className="animate-spin" />
              변경 이력을 불러오는 중...
            </div>
          ) : error ? (
            <p className={`py-12 text-center ${LIST_TEXT} text-destructive`}>{error}</p>
          ) : logs.length === 0 ? (
            <p className={`py-12 text-center ${LIST_TEXT} text-muted-foreground`}>
              저장된 변경 이력이 없습니다.
            </p>
          ) : (
            <div className="space-y-5">
              {logs.map((log) => {
                const visibleChanges = log.changes.filter(
                  (change) =>
                    change.oldValue.trim() !== change.newValue.trim() &&
                    change.oldValue !== change.newValue,
                );
                if (visibleChanges.length === 0) return null;

                return (
                <div key={log.id} className="border border-border rounded-sm overflow-hidden">
                  <div className="px-4 py-3 bg-secondary/40 border-b border-border flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className={`${LIST_TEXT} font-semibold text-foreground`}>
                      {new Date(log.changedAt).toLocaleString("ko-KR")}
                    </span>
                    <span className={`${LABEL_TEXT} text-muted-foreground`}>
                      {CHANGE_SOURCE_LABELS[log.source] ?? log.source}
                    </span>
                    {log.changedBy && (
                      <span className={`${LABEL_TEXT} text-muted-foreground`}>
                        · {log.changedBy}
                      </span>
                    )}
                    <span className={`ml-auto ${LABEL_TEXT} text-primary font-medium`}>
                      {visibleChanges.length}항목 변경
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-secondary/30">
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left font-semibold w-[7rem]">항목</th>
                          <th className="px-3 py-2 text-left font-semibold">변경 전</th>
                          <th className="px-3 py-2 text-left font-semibold">변경 후</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleChanges.map((change) => (
                          <tr key={`${log.id}-${change.field}`} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                              {change.label}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground break-all">
                              {change.oldValue}
                            </td>
                            <td className="px-3 py-2 text-foreground break-all font-medium">
                              {change.newValue}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
