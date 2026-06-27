"use client";

import { useEffect } from "react";
import { X, ExternalLink, MapPin, Calendar, Building2 } from "lucide-react";
import type { AuctionItem, UpdateAuctionPayload } from "@/types/auction";
import { AUCTION_FIELD_GROUPS } from "@/lib/auction-form";

const LIST_TEXT = "text-[15px] leading-snug";
const LABEL_TEXT = "text-[14px] leading-snug";
const SECTION_TEXT = "text-[16px] leading-snug";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const fmtEok = (n: number) => {
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return fmt(n);
};

const diff = (a: number, b: number) => {
  const d = a - b;
  const sign = d >= 0 ? "+" : "";
  return { val: `${sign}${fmtEok(d)}`, positive: d >= 0 };
};

function formatFieldValue(
  key: keyof UpdateAuctionPayload,
  item: AuctionItem,
): string {
  const value = item[key as keyof AuctionItem];
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    if (
      key === "views" ||
      key === "totalUnits" ||
      key === "builtYear" ||
      key === "tradingCount"
    ) {
      return fmt(value);
    }
    return fmtEok(value);
  }
  return String(value);
}

function PriceCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "orange" | "green" | "primary";
}) {
  const accentClass =
    accent === "orange"
      ? "text-orange-600"
      : accent === "green"
        ? "text-emerald-600"
        : "text-foreground";

  return (
    <div className="bg-secondary/40 border border-border rounded-sm px-4 py-3">
      <p className={`${LABEL_TEXT} text-muted-foreground mb-1`}>{label}</p>
      <p className={`${SECTION_TEXT} font-bold font-mono ${accentClass}`}>{value}</p>
    </div>
  );
}

function DiffBadge({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-card border border-border rounded-sm">
      <span className={`${LABEL_TEXT} text-muted-foreground`}>{label}</span>
      <span className={`${LIST_TEXT} font-mono font-semibold ${positive ? "text-emerald-600" : "text-red-500"}`}>
        {value}
      </span>
    </div>
  );
}

export function AuctionDetailModal({
  item,
  onClose,
}: {
  item: AuctionItem | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [item, onClose]);

  if (!item) return null;

  const d1 = item.salePrice != null ? diff(item.naverPrice, item.salePrice) : null;
  const d2 = diff(item.naverPrice, item.minPrice);
  const d3 = diff(item.naverPrice, item.appraisedValue);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

      <div
        className="relative w-full max-w-4xl my-4 bg-card border border-border rounded-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-5 py-4 rounded-t-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`${LABEL_TEXT} bg-white/15 px-2 py-0.5 rounded-sm`}>
                  {item.propType}
                </span>
                {item.memo && (
                  <span className={`${LABEL_TEXT} bg-amber-500/30 text-amber-100 px-2 py-0.5 rounded-sm`}>
                    {item.memo}
                  </span>
                )}
              </div>
              <p className={`font-mono font-bold ${SECTION_TEXT}`}>{item.auctionNo || "경매번호 없음"}</p>
              <p className={`mt-2 ${LIST_TEXT} text-white/90 leading-relaxed flex items-start gap-2`}>
                <MapPin size={16} className="shrink-0 mt-0.5 opacity-80" />
                <span>{item.address || "-"}</span>
              </p>
              <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 ${LABEL_TEXT} text-white/70`}>
                <span className="inline-flex items-center gap-1">
                  <Building2 size={14} />
                  {item.city} {item.district}
                </span>
                <span>{item.area} · {item.usage}</span>
                <span>{item.builtYear ? `${item.builtYear}년` : "-"}</span>
                <span className="inline-flex items-center gap-1">
                  <Calendar size={14} />
                  입찰 {item.bidDate || "-"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} bg-white/10 border border-white/25 rounded-sm hover:bg-white/20 transition-colors`}
                >
                  <ExternalLink size={14} />
                  경매지정보
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-sm hover:bg-white/15 transition-colors"
                aria-label="닫기"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 space-y-6 max-h-[calc(100vh-12rem)] overflow-y-auto">
          {/* Price summary */}
          <section>
            <h3 className={`${SECTION_TEXT} font-semibold text-foreground mb-3`}>가격 요약</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <PriceCard label="감정가" value={item.appraisedValue ? fmtEok(item.appraisedValue) : "-"} />
              <PriceCard label="최저가" value={item.minPrice ? fmtEok(item.minPrice) : "-"} accent="orange" />
              <PriceCard
                label="매각가"
                value={item.salePrice ? fmtEok(item.salePrice) : "-"}
                accent="green"
              />
              <PriceCard label="네이버 호가" value={item.naverPrice ? fmtEok(item.naverPrice) : "-"} accent="primary" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <DiffBadge label="호가 - 매각가" value={d1?.val ?? "-"} positive={d1?.positive ?? true} />
              <DiffBadge label="호가 - 최저가" value={d2.val} positive={d2.positive} />
              <DiffBadge label="호가 - 감정가" value={d3.val} positive={d3.positive} />
            </div>
          </section>

          {/* Grouped fields */}
          {AUCTION_FIELD_GROUPS.map((group) => {
            const skipKeys = new Set(["auctionNo", "address", "link", "appraisedValue", "minPrice", "salePrice", "naverPrice"]);
            const fields = group.fields.filter((f) => !skipKeys.has(f.key));
            if (fields.length === 0) return null;

            return (
              <section key={group.title}>
                <h3 className={`${SECTION_TEXT} font-semibold text-foreground mb-3 pb-2 border-b border-border`}>
                  {group.title}
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {fields.map((field) => {
                    const value = formatFieldValue(field.key, item);
                    const isFull = field.full;

                    return (
                      <div
                        key={field.key}
                        className={isFull ? "sm:col-span-2" : ""}
                      >
                        <dt className={`${LABEL_TEXT} text-muted-foreground mb-0.5`}>{field.label}</dt>
                        <dd className={`${LIST_TEXT} text-foreground break-words`}>
                          {field.key === "specialNote" && value !== "-" ? (
                            <span className="text-red-600 font-medium">{value}</span>
                          ) : field.key === "buildingRegistry" ? (
                            <span className={value !== "이상없음" ? "text-red-500 font-semibold" : "text-emerald-600"}>
                              {value}
                            </span>
                          ) : (
                            value
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-border bg-secondary/20 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`px-5 py-2 ${LIST_TEXT} font-medium border border-border rounded-sm hover:bg-secondary transition-colors`}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
