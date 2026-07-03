"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { X, ExternalLink, MapPin, Calendar, Building2, History, Save, Trash2, Heart, StickyNote, Brain } from "lucide-react";
import type { AuctionItem, UpdateAuctionPayload } from "@/types/auction";
import {
  AUCTION_FIELD_GROUPS,
  toFormState,
  toPayload,
} from "@/lib/auction-form";
import { AuctionFieldInput } from "@/components/AuctionFieldInput";
import { deleteAuction, updateAuction } from "@/lib/api";
import { UpdatedBadge } from "@/components/UpdatedBadge";
import { NaverComplexLink } from "@/components/NaverComplexLink";
import { hasNaverPrice } from "@/lib/naver-price";
import { AuctionAnalysisPanel } from "@/components/AuctionAnalysisPanel";
import { TenantStatusPanel } from "@/components/TenantStatusPanel";
import { displayTenantDetail } from "@/lib/tenant-status";

const LIST_TEXT = "text-[15px] leading-snug";
const LABEL_TEXT = "text-[14px] leading-snug";
const SECTION_TEXT = "text-[16px] leading-snug";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const fmtEok = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 100000000) {
    const body = `${(abs / 100000000).toFixed(2)}억`;
    return n < 0 ? `-${body}` : body;
  }
  if (abs >= 10000) {
    const body = `${(abs / 10000).toFixed(0)}만`;
    return n < 0 ? `-${body}` : body;
  }
  return fmt(n);
};

const fmtDiffAmount = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 100000000) {
    const body = `${(abs / 100000000).toFixed(1)}억`;
    return n < 0 ? `-${body}` : `+${body}`;
  }
  if (abs >= 10000) {
    const body = `${(abs / 10000).toFixed(0)}만`;
    return n < 0 ? `-${body}` : `+${body}`;
  }
  const sign = n >= 0 ? "+" : "";
  return `${sign}${fmt(n)}`;
};

const diff = (a: number, b: number) => {
  const d = a - b;
  return { val: fmtDiffAmount(d), positive: d >= 0, amount: d };
};

const DETAIL_HIDDEN_FIELDS = new Set<keyof UpdateAuctionPayload>([
  "memo",
  "views",
  "link",
  "auctionNo",
  "address",
  "usage",
  "area",
  "builtYear",
  "bidDate",
  "totalUnits",
  "appraisedValue",
  "minPrice",
  "naverPrice",
  "officialLandPrice",
  "salePrice",
  "tradingCount",
  "specialNote",
]);

function detailVisibleFields(group: (typeof AUCTION_FIELD_GROUPS)[number]) {
  return group.fields.filter((field) => !DETAIL_HIDDEN_FIELDS.has(field.key));
}

const EXPANDABLE_DETAIL_KEYS = new Set<keyof UpdateAuctionPayload>([
  "buildingRegistry",
  "education",
  "priceDetail",
  "tradingDetail",
]);

function isExpandableDetailField(key: keyof UpdateAuctionPayload) {
  return EXPANDABLE_DETAIL_KEYS.has(key);
}

function buildingRegistryClassName(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed !== "이상없음" ? "text-red-500 font-semibold" : "text-emerald-600";
}

type HeaderEditKey =
  | "auctionNo"
  | "address"
  | "area"
  | "builtYear"
  | "totalUnits"
  | "officialLandPrice"
  | "bidDate"
  | "specialNote";

type PriceEditKey =
  | "appraisedValue"
  | "minPrice"
  | "naverPrice"
  | "salePrice"
  | "tradingCount";

const priceEditableButtonClass =
  "text-left w-full min-w-0 rounded-sm -mx-0.5 px-0.5 hover:bg-black/5 transition-colors cursor-text";

function formatTotalUnitsLabel(value: string | number | null | undefined): string {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return "-";
  return `${n.toLocaleString("ko-KR")}세대`;
}

function formatOfficialLandPriceLabel(value: string | number | null | undefined): string {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return "공시가 -";
  return `공시가 ${fmtEok(n)}`;
}

function parseAreaNumber(area: string | null | undefined): string {
  const raw = String(area ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/[\d.]+/);
  return match?.[0] ?? raw;
}

function AreaLabel({ area }: { area: string | null | undefined }) {
  const num = parseAreaNumber(area);
  if (!num) return <>-</>;
  return (
    <>
      {num}m<sup className="text-[0.75em] align-super">2</sup>
    </>
  );
}

function HeaderSpecialNote({
  value,
  editable,
  active,
  onActivate,
  onDeactivate,
  onChange,
}: {
  value: string;
  editable: boolean;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onChange: (value: string) => void;
}) {
  const text = String(value ?? "").trim();
  if (!editable && !text) return null;

  if (active) {
    return (
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onDeactivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            onDeactivate();
          }
        }}
        placeholder="특이사항"
        className={`${headerFieldCompactClass} text-red-100 max-w-[14rem]`}
      />
    );
  }

  if (editable) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className={`${headerEditableButtonClass} ${LABEL_TEXT} font-medium truncate max-w-[14rem] ${
          text ? "text-red-200" : "text-white/50"
        }`}
        title={text ? text : "클릭하여 특이사항 입력"}
      >
        {text || "특이사항"}
      </button>
    );
  }

  return (
    <span
      className={`${LABEL_TEXT} font-medium text-red-200 truncate max-w-[14rem]`}
      title={text}
    >
      {text}
    </span>
  );
}

function TenantInfoField({
  value,
  editable,
  onChange,
}: {
  value: string;
  editable: boolean;
  onChange?: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = String(value ?? "").trim();
  const display = text || "-";
  const isLong = text.length > 28 || text.includes("\n");

  const collapse = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setExpanded(false);
  };

  const expand = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setExpanded(true);
  };

  if (expanded) {
    return (
      <div
        className="min-w-0 rounded-sm border border-border/60 bg-secondary/15 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end mb-1.5">
          <button
            type="button"
            onClick={collapse}
            className={`${LABEL_TEXT} font-medium text-primary hover:underline`}
          >
            접기
          </button>
        </div>
        {editable ? (
          <textarea
            rows={4}
            autoFocus
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${LIST_TEXT} bg-input-background border border-border rounded-sm px-3 py-2 text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/20`}
          />
        ) : (
          <p className={`${LIST_TEXT} text-foreground whitespace-pre-wrap break-words m-0`}>
            {display}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 min-w-0 ${editable ? "cursor-pointer hover:bg-secondary/40 rounded-sm px-1 -mx-1" : ""}`}
      onClick={
        editable || isLong
          ? (e) => {
              e.stopPropagation();
              setExpanded(true);
            }
          : undefined
      }
      role={editable || isLong ? "button" : undefined}
      tabIndex={editable || isLong ? 0 : undefined}
      onKeyDown={
        editable || isLong
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setExpanded(true);
              }
            }
          : undefined
      }
    >
      <p
        className={`${LIST_TEXT} truncate flex-1 min-w-0 m-0 ${
          text ? "text-foreground" : "text-muted-foreground"
        }`}
        title={text || undefined}
      >
        {display}
      </p>
      {(editable || isLong) && (
        <button
          type="button"
          onClick={expand}
          className={`${LABEL_TEXT} shrink-0 font-medium text-primary hover:underline`}
        >
          더보기
        </button>
      )}
    </div>
  );
}

function ExpandableDetailField({
  label,
  value,
  editable = false,
  onChange,
  valueClassName = "",
}: {
  label: string;
  value: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  valueClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const text = String(value ?? "").trim();
  const display = text || "-";
  const canExpand = Boolean(text) || editable;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const openPanel = (e: MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
  };

  const inlineFieldClass =
    "w-full bg-input-background border border-border rounded-sm px-3 py-2 text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <>
      <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
        {editable ? (
          <textarea
            rows={4}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className={`${inlineFieldClass} ${LIST_TEXT} leading-relaxed resize-y min-h-[6rem] max-h-40 overflow-y-auto`}
          />
        ) : (
          <div
            className={`${LIST_TEXT} leading-relaxed max-h-40 overflow-y-auto rounded-sm border border-border/60 bg-secondary/10 px-3 py-2 whitespace-pre-wrap break-words ${valueClassName} ${
              text ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {display}
          </div>
        )}
        {canExpand && (
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={openPanel}
              className={`${LABEL_TEXT} font-medium text-primary hover:underline`}
            >
              더 크게 보기
            </button>
          </div>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-8 bg-black/60"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            className="relative flex flex-col w-full max-w-3xl max-h-[min(85vh,720px)] bg-background border border-border rounded-lg shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-secondary/20">
              <h4 className={`${SECTION_TEXT} font-semibold text-foreground`}>{label}</h4>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-sm hover:bg-secondary transition-colors"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {editable ? (
                <textarea
                  autoFocus
                  rows={16}
                  value={value}
                  onChange={(e) => onChange?.(e.target.value)}
                  className={`w-full min-h-[280px] ${LIST_TEXT} leading-relaxed bg-input-background border border-border rounded-sm px-4 py-3 text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/20`}
                />
              ) : (
                <p
                  className={`${SECTION_TEXT} leading-relaxed text-foreground whitespace-pre-wrap break-words m-0 ${valueClassName}`}
                >
                  {display}
                </p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border bg-secondary/20 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`px-4 py-2 ${LIST_TEXT} font-medium border border-border rounded-sm hover:bg-secondary transition-colors`}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const headerFieldClass =
  "w-full bg-white/10 border border-white/25 rounded-sm px-3 py-1.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/30";

const headerFieldCompactClass =
  "bg-white/10 border border-white/25 rounded-sm px-2 py-0.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 min-w-[4rem]";

const headerEditableButtonClass =
  "text-left rounded-sm px-1 -mx-1 hover:bg-white/10 transition-colors cursor-text";

function HeaderInlineInput({
  active,
  onActivate,
  onDeactivate,
  value,
  onChange,
  display,
  placeholder,
  title,
  className = "",
  compact = false,
}: {
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  value: string;
  onChange: (value: string) => void;
  display: ReactNode;
  placeholder: string;
  title: string;
  className?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!active) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [active]);

  if (active) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onDeactivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            onDeactivate();
          }
        }}
        placeholder={placeholder}
        className={compact ? `${headerFieldCompactClass} ${className}` : `${headerFieldClass} ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      className={`${headerEditableButtonClass} ${className}`}
      title={title}
    >
      {display}
    </button>
  );
}

const BID_THRESHOLD = 20_000_000;

function newCaseAppraisedSuffix(amount: number): string {
  return amount >= BID_THRESHOLD ? "(신건입찰가능)" : "(신건입찰불가)";
}

function minPriceBidSuffix(amount: number): string {
  return amount >= BID_THRESHOLD ? "(입찰가능)" : "(입찰불가)";
}

function parsePreviewNumber(value: string | number | null | undefined): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function formatFieldValue(
  key: keyof UpdateAuctionPayload,
  item: AuctionItem,
): string {
  if (key === "naverPrice") {
    return hasNaverPrice(item.naverPrice) ? fmtEok(item.naverPrice) : "-";
  }
  if (key === "priceDetail") {
    if (!hasNaverPrice(item.naverPrice)) return "-";
    const detail = String(item.priceDetail ?? "").trim();
    return detail || "-";
  }

  const value = item[key as keyof AuctionItem];
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    if (
      key === "views" ||
      key === "totalUnits" ||
      key === "builtYear"
    ) {
      return fmt(value);
    }
    return fmtEok(value);
  }
  return String(value);
}

const PRICE_SUMMARY_ROW_HEIGHT = "h-[4.5rem]";

const PRICE_CARD_SHELL =
  `bg-secondary/40 border border-border rounded-sm px-4 py-3 w-full ${PRICE_SUMMARY_ROW_HEIGHT} flex flex-col justify-between overflow-hidden`;

function priceValueClass(
  value: string,
  accent?: "orange" | "green" | "primary",
): string {
  if (value === "-") return `${SECTION_TEXT} font-bold font-mono leading-snug text-muted-foreground/40`;
  const accentClass =
    accent === "orange"
      ? "text-orange-600"
      : accent === "green"
        ? "text-emerald-600"
        : accent === "primary"
          ? "text-primary"
          : "text-foreground";
  return `${SECTION_TEXT} font-bold font-mono leading-snug ${accentClass}`;
}

function PriceCard({
  label,
  value,
  accent,
  className = "",
  labelAction,
  valueAction,
  valueSlot,
}: {
  label: string;
  value: string;
  accent?: "orange" | "green" | "primary";
  className?: string;
  labelAction?: ReactNode;
  valueAction?: ReactNode;
  valueSlot?: ReactNode;
}) {
  const valueClass = priceValueClass(value, accent);

  return (
    <div className={`${PRICE_CARD_SHELL} ${className}`}>
      {labelAction ? (
        <div
          className={`${LABEL_TEXT} text-muted-foreground flex items-center justify-between gap-2 min-h-[22px]`}
        >
          <span className="truncate">{label}</span>
          <span className="shrink-0">{labelAction}</span>
        </div>
      ) : (
        <p className={`${LABEL_TEXT} text-muted-foreground min-h-[22px]`}>{label}</p>
      )}
      {valueSlot ?? (valueAction ? (
        <div className="flex items-center justify-between gap-2 min-w-0">
          <p className={`${valueClass} truncate`}>{value}</p>
          <span className="shrink-0">{valueAction}</span>
        </div>
      ) : (
        <p className={valueClass}>{value}</p>
      ))}
    </div>
  );
}

const SECONDARY_CARD_SHELL =
  `bg-card border border-border rounded-sm px-4 py-3 w-full ${PRICE_SUMMARY_ROW_HEIGHT} flex flex-col justify-between overflow-hidden`;

function DiffBadge({
  label,
  value,
  positive,
  suffix,
  suffixEligible,
  className = "",
}: {
  label: string;
  value: string;
  positive: boolean;
  suffix?: string;
  suffixEligible?: boolean;
  className?: string;
}) {
  return (
    <div className={`${SECONDARY_CARD_SHELL} ${className}`}>
      <p className={`${LABEL_TEXT} text-muted-foreground truncate`}>{label}</p>
      <div className="flex items-baseline min-w-0">
        <span
          className={`${LIST_TEXT} font-mono font-semibold truncate min-w-0 ${
            value === "-"
              ? "text-muted-foreground/40"
              : positive
                ? "text-emerald-600"
                : "text-red-500"
          }`}
        >
          {value}
        </span>
        {suffix ? (
          <span
            className={`shrink-0 text-[13px] font-medium ${
              suffixEligible ? "text-emerald-600" : "text-orange-600"
            }`}
          >
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const TRADING_COUNT_VALUE = "text-[13px] leading-tight font-mono font-semibold truncate";

function PriceInlineInput({
  active,
  onActivate,
  onDeactivate,
  value,
  onChange,
  display,
  title,
  accent,
  variant = "price",
}: {
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  value: string;
  onChange: (value: string) => void;
  display: string;
  title: string;
  accent?: "orange" | "green" | "primary";
  variant?: "price" | "trading";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const valueClass =
    variant === "trading"
      ? `${TRADING_COUNT_VALUE} ${display === "-" ? "text-muted-foreground/40" : "text-primary"}`
      : priceValueClass(display, accent);

  useEffect(() => {
    if (!active) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [active]);

  if (active) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode={variant === "price" ? "numeric" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onDeactivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            onDeactivate();
          }
        }}
        className={`w-full min-w-0 bg-input-background border border-border rounded-sm px-1.5 py-0.5 shadow-none focus:outline-none focus:ring-2 focus:ring-primary/20 ${valueClass}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      className={`${priceEditableButtonClass} ${valueClass} truncate block`}
      title={title}
    >
      {display}
    </button>
  );
}

function TradingCountBadge({
  label,
  value,
  valueSlot,
}: {
  label: string;
  value: string;
  valueSlot?: ReactNode;
}) {
  return (
    <div className={SECONDARY_CARD_SHELL}>
      <p className={`${LABEL_TEXT} text-muted-foreground truncate`}>{label}</p>
      {valueSlot ?? (
        <p
          className={`${TRADING_COUNT_VALUE} ${
            value === "-" ? "text-muted-foreground/40" : "text-primary"
          }`}
          title={value === "-" ? undefined : value}
        >
          {value}
        </p>
      )}
    </div>
  );
}

type DiffDisplay = {
  label: string;
  value: string;
  positive: boolean;
  suffix?: string;
  suffixEligible?: boolean;
};

function PriceColumn({
  priceLabel,
  priceValue,
  accent,
  diff,
  labelAction,
  valueAction,
  valueSlot,
  secondary,
}: {
  priceLabel: string;
  priceValue: string;
  accent?: "orange" | "green" | "primary";
  diff?: DiffDisplay | null;
  labelAction?: ReactNode;
  valueAction?: ReactNode;
  valueSlot?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0 w-full">
      <PriceCard
        label={priceLabel}
        value={priceValue}
        accent={accent}
        labelAction={labelAction}
        valueAction={valueAction}
        valueSlot={valueSlot}
      />
      {secondary}
      {diff ? (
        <DiffBadge
          label={diff.label}
          value={diff.value}
          positive={diff.positive}
          suffix={diff.suffix}
          suffixEligible={diff.suffixEligible}
        />
      ) : null}
    </div>
  );
}

export function AuctionDetailModal({
  item,
  onClose,
  onViewHistory,
  editable = false,
  onSaved,
  onDeleted,
  isFavorite = false,
  favoriteBusy = false,
  onToggleFavorite,
  onAiAnalysisClick,
  onDislike,
  onReviewed,
}: {
  item: AuctionItem | null;
  onClose: () => void;
  onViewHistory?: (item: AuctionItem) => void;
  editable?: boolean;
  onSaved?: (item: AuctionItem) => void;
  onDeleted?: (id: string) => void;
  isFavorite?: boolean;
  favoriteBusy?: boolean;
  onToggleFavorite?: (next: boolean) => Promise<void>;
  onAiAnalysisClick?: (item: AuctionItem) => void;
  onDislike?: (item: AuctionItem) => void;
  onReviewed?: (item: AuctionItem) => void;
}) {
  const [form, setForm] = useState<UpdateAuctionPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingHeader, setEditingHeader] = useState<HeaderEditKey | null>(null);
  const [editingPrice, setEditingPrice] = useState<PriceEditKey | null>(null);
  const [showMemo, setShowMemo] = useState(false);
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);
  const [editingViews, setEditingViews] = useState(false);
  const auctionNoInputRef = useRef<HTMLInputElement>(null);
  const addressInputRef = useRef<HTMLTextAreaElement>(null);

  const stopEditingHeader = () => setEditingHeader(null);
  const stopEditingPrice = () => setEditingPrice(null);

  const activateHeaderEdit = (key: HeaderEditKey) => {
    setEditingPrice(null);
    setEditingHeader(key);
  };

  const activatePriceEdit = (key: PriceEditKey) => {
    setEditingHeader(null);
    setEditingPrice(key);
  };

  useEffect(() => {
    if (!item) return;
    setForm(toFormState(item));
    setError("");
    setEditingHeader(null);
    setEditingPrice(null);
    setShowMemo(false);
    setShowAiAnalysis(false);
    setEditingViews(false);
  }, [item]);

  useEffect(() => {
    if (editingHeader === "auctionNo") {
      auctionNoInputRef.current?.focus();
      auctionNoInputRef.current?.select();
    }
    if (editingHeader === "address") {
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
    }
  }, [editingHeader]);

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

  const preview = useMemo(() => {
    if (!item || !form) return null;
    return { ...item, ...toPayload(form) };
  }, [item, form]);

  if (!item || !form || !preview) return null;

  const naverPrice = parsePreviewNumber(form.naverPrice);
  const minPrice = parsePreviewNumber(form.minPrice);
  const appraisedValue = parsePreviewNumber(form.appraisedValue);
  const salePriceRaw = form.salePrice;
  const salePrice =
    salePriceRaw == null || String(salePriceRaw).trim() === ""
      ? null
      : parsePreviewNumber(salePriceRaw);
  const naverId = String(form.naverId ?? item.naverId ?? "").trim();
  const hasNaver = hasNaverPrice(naverPrice);
  const naverPriceDisplay = hasNaver ? fmtEok(naverPrice) : "-";

  const d1 =
    hasNaver && salePrice != null ? diff(naverPrice, salePrice) : null;
  const d2 = hasNaver ? diff(naverPrice, minPrice) : null;
  const d3 = hasNaver ? diff(naverPrice, appraisedValue) : null;
  const missingDiff = {
    value: "-",
    positive: true,
    suffixEligible: false as const,
  };

  const setField = (key: keyof UpdateAuctionPayload, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const rawPriceFormValue = (key: PriceEditKey): string => {
    const v = form[key];
    if (v == null) return "";
    return String(v);
  };

  const renderPriceField = (
    key: PriceEditKey,
    display: string,
    options?: {
      accent?: "orange" | "green" | "primary";
      title?: string;
      variant?: "price" | "trading";
    },
  ) => (
    <PriceInlineInput
      active={editingPrice === key}
      onActivate={() => activatePriceEdit(key)}
      onDeactivate={stopEditingPrice}
      value={rawPriceFormValue(key)}
      onChange={(v) => setField(key, v)}
      display={display}
      title={options?.title ?? "클릭하여 수정"}
      accent={options?.accent}
      variant={options?.variant}
    />
  );

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await updateAuction(item.id, toPayload(form));
      setForm(toFormState(saved));
      onSaved?.(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const label = item.auctionNo || item.address || "이 물건";
    if (!window.confirm(`${label}을(를) 삭제할까요?`)) return;

    setDeleting(true);
    setError("");
    try {
      await deleteAuction(item.id);
      onDeleted?.(item.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!onToggleFavorite) return;
    setFavoriteSaving(true);
    setError("");
    try {
      await onToggleFavorite(!isFavorite);
    } catch (err) {
      setError(err instanceof Error ? err.message : "관심물건 처리에 실패했습니다.");
    } finally {
      setFavoriteSaving(false);
    }
  };

  const favoriteDisabled = favoriteBusy || favoriteSaving;

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
        <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-5 py-4 rounded-t-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`${LABEL_TEXT} bg-white/15 px-2 py-0.5 rounded-sm`}>
                  {preview.propType}
                </span>
                {editable && (
                  <span className={`${LABEL_TEXT} bg-white/20 px-2 py-0.5 rounded-sm`}>
                    수정 가능
                  </span>
                )}
              </div>
              {editable ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {editingHeader === "auctionNo" ? (
                      <input
                        ref={auctionNoInputRef}
                        type="text"
                        value={form.auctionNo}
                        onChange={(e) => setField("auctionNo", e.target.value)}
                        onBlur={() => setEditingHeader(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") {
                            e.preventDefault();
                            setEditingHeader(null);
                          }
                        }}
                        placeholder="경매번호"
                        className={`${headerFieldClass} font-mono font-bold ${SECTION_TEXT} max-w-md`}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => activateHeaderEdit("auctionNo")}
                        className={`${headerEditableButtonClass} font-mono font-bold ${SECTION_TEXT} inline-flex items-center gap-2 flex-wrap`}
                        title="클릭하여 경매번호 수정"
                      >
                        {form.auctionNo || "경매번호 없음"}
                      </button>
                    )}
                    {preview.isUpdated && <UpdatedBadge variant="onDark" />}
                    <HeaderSpecialNote
                      value={String(form.specialNote ?? "")}
                      editable
                      active={editingHeader === "specialNote"}
                      onActivate={() => activateHeaderEdit("specialNote")}
                      onDeactivate={stopEditingHeader}
                      onChange={(v) => setField("specialNote", v)}
                    />
                  </div>
                  {preview.isUpdated && preview.updatedAt && (
                    <p className={`mt-1 ${LABEL_TEXT} text-amber-100`}>
                      최근 갱신 {new Date(preview.updatedAt).toLocaleString("ko-KR")}
                      {preview.updatedBy ? ` · ${preview.updatedBy}` : ""}
                    </p>
                  )}
                  <div className="mt-2 flex items-start gap-2">
                    <MapPin size={16} className="shrink-0 mt-0.5 opacity-80" />
                    {editingHeader === "address" ? (
                      <textarea
                        ref={addressInputRef}
                        rows={2}
                        value={form.address}
                        onChange={(e) => setField("address", e.target.value)}
                        onBlur={() => setEditingHeader(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingHeader(null);
                          }
                        }}
                        placeholder="물건주소"
                        className={`${headerFieldClass} ${LIST_TEXT} leading-relaxed resize-y min-h-[2.75rem] flex-1`}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => activateHeaderEdit("address")}
                        className={`${headerEditableButtonClass} ${LIST_TEXT} text-white/90 leading-relaxed flex-1 min-w-0`}
                        title="클릭하여 물건주소 수정"
                      >
                        {form.address || "-"}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className={`font-mono font-bold ${SECTION_TEXT} inline-flex items-center gap-2 flex-wrap`}>
                    {preview.auctionNo || "경매번호 없음"}
                    {preview.isUpdated && <UpdatedBadge variant="onDark" />}
                    <HeaderSpecialNote
                      value={String(preview.specialNote ?? "")}
                      editable={false}
                      active={false}
                      onActivate={() => {}}
                      onDeactivate={() => {}}
                      onChange={() => {}}
                    />
                  </p>
                  <p className={`mt-2 ${LIST_TEXT} text-white/90 leading-relaxed flex items-start gap-2`}>
                    <MapPin size={16} className="shrink-0 mt-0.5 opacity-80" />
                    <span>{preview.address || "-"}</span>
                  </p>
                </>
              )}
              <div className={`mt-2 flex flex-col gap-y-1 ${LABEL_TEXT} text-white/70`}>
                <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                  <span className="inline-flex items-center gap-1">
                    <Building2 size={14} />
                    {preview.city} {preview.district}
                  </span>
                  {editable ? (
                    <>
                      <HeaderInlineInput
                        active={editingHeader === "area"}
                        onActivate={() => activateHeaderEdit("area")}
                        onDeactivate={stopEditingHeader}
                        value={parseAreaNumber(form.area)}
                        onChange={(v) => setField("area", v)}
                        display={<AreaLabel area={form.area} />}
                        placeholder="면적"
                        title="클릭하여 면적 수정"
                        compact
                      />
                      <HeaderInlineInput
                        active={editingHeader === "builtYear"}
                        onActivate={() => activateHeaderEdit("builtYear")}
                        onDeactivate={stopEditingHeader}
                        value={String(form.builtYear ?? "")}
                        onChange={(v) => setField("builtYear", v)}
                        display={form.builtYear ? `${form.builtYear}년` : "-"}
                        placeholder="연식"
                        title="클릭하여 연식 수정"
                        compact
                      />
                      <HeaderInlineInput
                        active={editingHeader === "totalUnits"}
                        onActivate={() => activateHeaderEdit("totalUnits")}
                        onDeactivate={stopEditingHeader}
                        value={String(form.totalUnits ?? "")}
                        onChange={(v) => setField("totalUnits", v)}
                        display={formatTotalUnitsLabel(form.totalUnits)}
                        placeholder="세대수"
                        title="클릭하여 총 세대수 수정"
                        compact
                      />
                      <HeaderInlineInput
                        active={editingHeader === "officialLandPrice"}
                        onActivate={() => activateHeaderEdit("officialLandPrice")}
                        onDeactivate={stopEditingHeader}
                        value={String(form.officialLandPrice ?? "")}
                        onChange={(v) => setField("officialLandPrice", v)}
                        display={formatOfficialLandPriceLabel(form.officialLandPrice)}
                        placeholder="공시가"
                        title="클릭하여 공시가 수정"
                        compact
                      />
                    </>
                  ) : (
                    <>
                      <span><AreaLabel area={preview.area} /></span>
                      <span>{preview.builtYear ? `${preview.builtYear}년` : "-"}</span>
                      <span>{formatTotalUnitsLabel(preview.totalUnits)}</span>
                      <span>{formatOfficialLandPriceLabel(preview.officialLandPrice)}</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                  {editable ? (
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={14} />
                      입찰{" "}
                      <HeaderInlineInput
                        active={editingHeader === "bidDate"}
                        onActivate={() => activateHeaderEdit("bidDate")}
                        onDeactivate={stopEditingHeader}
                        value={String(form.bidDate ?? "")}
                        onChange={(v) => setField("bidDate", v)}
                        display={form.bidDate || "-"}
                        placeholder="입찰기일"
                        title="클릭하여 입찰기일 수정"
                        compact
                      />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={14} />
                      입찰 {preview.bidDate || "-"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  disabled={favoriteDisabled}
                  className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} border rounded-sm transition-colors disabled:opacity-50 ${
                    isFavorite
                      ? "bg-rose-500/25 border-rose-200/40 text-white hover:bg-rose-500/35"
                      : "bg-white/10 border-white/25 hover:bg-white/20"
                  }`}
                >
                  <Heart
                    size={14}
                    className={isFavorite ? "fill-current text-rose-200" : ""}
                  />
                  {isFavorite ? "관심물건 해제" : "관심물건 추가"}
                </button>
              )}
              {onDislike && (
                <button
                  type="button"
                  onClick={() => onDislike(item)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} bg-white/10 border border-white/25 rounded-sm hover:bg-white/20 transition-colors`}
                >
                  관심없음
                </button>
              )}
              {onReviewed && (
                <button
                  type="button"
                  onClick={() => onReviewed(item)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} bg-white/10 border border-white/25 rounded-sm hover:bg-white/20 transition-colors`}
                >
                  검토완료
                </button>
              )}
              {onViewHistory && (
                <button
                  type="button"
                  onClick={() => onViewHistory(item)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} bg-white/10 border border-white/25 rounded-sm hover:bg-white/20 transition-colors`}
                >
                  <History size={14} />
                  변경 이력
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowAiAnalysis((v) => {
                    const next = !v;
                    if (next) onAiAnalysisClick?.(item);
                    return next;
                  });
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} border rounded-sm transition-colors ${
                  showAiAnalysis
                    ? "bg-white text-primary border-white"
                    : "bg-white/10 border-white/25 hover:bg-white/20"
                }`}
              >
                <Brain size={14} />
                경매코치 AI
              </button>
              {preview.link && (
                <a
                  href={preview.link}
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
          {showAiAnalysis && item && (
            <AuctionAnalysisPanel auctionId={item.id} />
          )}

          <section>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3">
              <h3 className={`${SECTION_TEXT} font-semibold text-foreground`}>물건 요약</h3>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowMemo((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 ${LABEL_TEXT} font-medium rounded-sm border transition-colors ${
                    showMemo
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : preview.memo
                        ? "border-amber-200/80 bg-amber-50/80 text-amber-700 hover:bg-amber-50"
                        : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  <StickyNote size={14} />
                  메모보기
                </button>
                <span className={`${LABEL_TEXT} text-muted-foreground inline-flex items-center gap-1`}>
                  조회수{" "}
                  {editable && editingViews ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      value={String(form.views ?? "")}
                      onChange={(e) => setField("views", e.target.value)}
                      onBlur={() => setEditingViews(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") {
                          e.preventDefault();
                          setEditingViews(false);
                        }
                      }}
                      className="w-16 px-1.5 py-0.5 text-foreground bg-input-background border border-border rounded-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                    />
                  ) : editable ? (
                    <button
                      type="button"
                      onClick={() => setEditingViews(true)}
                      className="font-mono text-foreground hover:bg-secondary/60 rounded-sm px-1 -mx-1 transition-colors"
                      title="클릭하여 조회수 수정"
                    >
                      {fmt(Number(form.views) || 0)}
                    </button>
                  ) : (
                    <span className="font-mono text-foreground">{fmt(preview.views)}</span>
                  )}
                </span>
              </div>
            </div>
            {showMemo && (
              <div className="mb-3 rounded-sm border border-amber-200/80 bg-amber-50/50 px-4 py-3">
                {editable ? (
                  <textarea
                    rows={3}
                    value={String(form.memo ?? "")}
                    onChange={(e) => setField("memo", e.target.value)}
                    placeholder="메모 입력"
                    className={`w-full ${LIST_TEXT} bg-input-background border border-border rounded-sm px-3 py-2 text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/20`}
                  />
                ) : (
                  <p className={`${LIST_TEXT} text-foreground whitespace-pre-wrap break-words`}>
                    {preview.memo?.trim() ? preview.memo : "메모 없음"}
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <PriceColumn
                priceLabel="감정가"
                priceValue={appraisedValue ? fmtEok(appraisedValue) : "-"}
                valueSlot={
                  editable
                    ? renderPriceField(
                        "appraisedValue",
                        appraisedValue ? fmtEok(appraisedValue) : "-",
                        { title: "클릭하여 감정가 수정" },
                      )
                    : undefined
                }
                diff={
                  d3
                    ? {
                        label: "호가 - 감정가",
                        value: d3.val,
                        positive: d3.positive,
                        suffix: newCaseAppraisedSuffix(d3.amount),
                        suffixEligible: d3.amount >= BID_THRESHOLD,
                      }
                    : {
                        label: "호가 - 감정가",
                        ...missingDiff,
                      }
                }
              />
              <PriceColumn
                priceLabel="최저가"
                priceValue={minPrice ? fmtEok(minPrice) : "-"}
                accent="orange"
                valueSlot={
                  editable
                    ? renderPriceField(
                        "minPrice",
                        minPrice ? fmtEok(minPrice) : "-",
                        { accent: "orange", title: "클릭하여 최저가 수정" },
                      )
                    : undefined
                }
                diff={
                  d2
                    ? {
                        label: "호가 - 최저가",
                        value: d2.val,
                        positive: d2.positive,
                        suffix: minPriceBidSuffix(d2.amount),
                        suffixEligible: d2.amount >= BID_THRESHOLD,
                      }
                    : {
                        label: "호가 - 최저가",
                        ...missingDiff,
                      }
                }
              />
              <PriceColumn
                priceLabel="네이버 호가"
                priceValue={naverPriceDisplay}
                accent="primary"
                labelAction={<NaverComplexLink naverId={naverId} inLabelRow />}
                valueSlot={
                  editable
                    ? renderPriceField("naverPrice", naverPriceDisplay, {
                        accent: "primary",
                        title: "클릭하여 네이버 호가 수정",
                      })
                    : undefined
                }
                secondary={
                  <TradingCountBadge
                    label="실거래 건수"
                    value={preview.tradingCount || "-"}
                    valueSlot={
                      editable
                        ? renderPriceField(
                            "tradingCount",
                            preview.tradingCount || "-",
                            { variant: "trading", title: "클릭하여 실거래 건수 수정" },
                          )
                        : undefined
                    }
                  />
                }
              />
              <PriceColumn
                priceLabel="낙찰가"
                priceValue={salePrice ? fmtEok(salePrice) : "-"}
                accent="green"
                valueSlot={
                  editable
                    ? renderPriceField(
                        "salePrice",
                        salePrice ? fmtEok(salePrice) : "-",
                        { accent: "green", title: "클릭하여 낙찰가 수정" },
                      )
                    : undefined
                }
                diff={
                  d1
                    ? { label: "호가 - 낙찰가", value: d1.val, positive: d1.positive }
                    : hasNaver
                      ? { label: "호가 - 낙찰가", value: "-", positive: true }
                      : { label: "호가 - 낙찰가", ...missingDiff }
                }
              />
            </div>
          </section>

          {editable ? (
            <>
              {AUCTION_FIELD_GROUPS.map((group) => {
                const fields = detailVisibleFields(group);
                if (fields.length === 0) return null;

                return (
                <section key={group.title}>
                  <h3 className={`${SECTION_TEXT} font-semibold text-foreground mb-3 pb-2 border-b border-border`}>
                    {group.title}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    {fields.map((field) => (
                      <div key={field.key} className={field.full ? "sm:col-span-2" : ""}>
                        <label className={`block ${LABEL_TEXT} text-muted-foreground mb-1.5 flex items-center gap-1.5`}>
                          <span>{field.label}</span>
                          {field.key === "priceDetail" && (
                            <NaverComplexLink naverId={naverId} compact />
                          )}
                        </label>
                        {field.key === "tenantInfo" ? (
                          <TenantInfoField
                            value={String(form.tenantInfo ?? "")}
                            editable
                            onChange={(v) => setField("tenantInfo", v)}
                          />
                        ) : field.key === "tenantDetail" ? (
                          <textarea
                            rows={10}
                            value={
                              displayTenantDetail(String(form.tenantDetail ?? "")) ||
                              String(form.tenantDetail ?? "")
                            }
                            onChange={(e) => setField("tenantDetail", e.target.value)}
                            className="w-full bg-input-background border border-border rounded-sm px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y min-h-[10rem]"
                          />
                        ) : isExpandableDetailField(field.key) ? (
                          <ExpandableDetailField
                            label={field.label}
                            value={String(form[field.key] ?? "")}
                            editable
                            onChange={(v) => setField(field.key, v)}
                            valueClassName={
                              field.key === "buildingRegistry"
                                ? buildingRegistryClassName(String(form.buildingRegistry ?? ""))
                                : ""
                            }
                          />
                        ) : (
                          <AuctionFieldInput
                            field={field}
                            value={form[field.key] as string | number | null}
                            onChange={(v) => setField(field.key, v)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
                );
              })}

              {error && (
                <p className={`${LIST_TEXT} text-destructive border border-destructive/30 bg-destructive/5 rounded-sm px-3 py-2`}>
                  {error}
                </p>
              )}
            </>
          ) : (
            AUCTION_FIELD_GROUPS.map((group) => {
              const fields = detailVisibleFields(group);
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
                        <div key={field.key} className={isFull ? "sm:col-span-2" : ""}>
                          <dt className={`${LABEL_TEXT} text-muted-foreground mb-0.5 flex items-center gap-1.5`}>
                            <span>{field.label}</span>
                            {field.key === "priceDetail" && (
                              <NaverComplexLink naverId={naverId} compact />
                            )}
                          </dt>
                          <dd className={`${LIST_TEXT} text-foreground break-words min-w-0`}>
                            {field.key === "tenantInfo" ? (
                              <TenantInfoField
                                value={String(item.tenantInfo ?? "")}
                                editable={false}
                              />
                            ) : field.key === "tenantDetail" ? (
                              <TenantStatusPanel value={String(item.tenantDetail ?? "")} />
                            ) : isExpandableDetailField(field.key) ? (
                              <ExpandableDetailField
                                label={field.label}
                                value={
                                  field.key === "priceDetail" &&
                                  !hasNaverPrice(item.naverPrice)
                                    ? "-"
                                    : String(item[field.key as keyof AuctionItem] ?? "")
                                }
                                valueClassName={
                                  field.key === "buildingRegistry"
                                    ? buildingRegistryClassName(String(item.buildingRegistry ?? ""))
                                    : ""
                                }
                              />
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
            })
          )}
        </div>

        <div className="px-5 py-3 border-t border-border bg-secondary/20 flex items-center justify-between gap-2">
          {editable ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={saving || deleting}
              className={`flex items-center gap-1.5 px-4 py-2 ${LIST_TEXT} font-medium text-destructive border border-destructive/30 rounded-sm hover:bg-destructive/5 transition-colors disabled:opacity-50`}
            >
              <Trash2 size={16} />
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {editable && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || deleting}
                className={`flex items-center gap-1.5 px-5 py-2 ${LIST_TEXT} font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent transition-colors disabled:opacity-50`}
              >
                <Save size={16} />
                {saving ? "저장 중..." : "저장"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={deleting}
              className={`px-5 py-2 ${LIST_TEXT} font-medium border border-border rounded-sm hover:bg-secondary transition-colors disabled:opacity-50`}
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
