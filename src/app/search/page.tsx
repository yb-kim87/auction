'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, RotateCcw, ChevronDown, ExternalLink, StickyNote, ChevronUp, ChevronsUpDown, LogOut, Heart } from "lucide-react";
import type { AuctionItem } from "@/types/auction";
import { CITIES, getDistricts, getWards, matchDistrict, normalizeCity } from "@/data/korea-regions";
import { getPriceFilterLabel, PRICE_FILTER_OPTIONS } from "@/data/price-filter-options";
import { getFailureRateFilterLabelFromCities, getFailureRateFilterOptionsFromCities } from "@/data/failure-rate-filter-options";
import type { FailureRateFilterOption } from "@/data/failure-rate-filter-options";
import { getAuctionCaseYears } from "@/data/auction-case-years";
import { matchesPropertyType, PROPERTY_TYPE_OPTIONS } from "@/data/property-type-options";
import { formatAuctionNoFilterLabel, matchesAuctionNoFilter } from "@/lib/auction-no-filter";
import { getFailureRateRatio, matchesFailureRateFilter } from "@/lib/failure-rate";
import { hasNaverPrice } from "@/lib/naver-price";
import {
  matchesProgressStatus,
  isBidDateEnded,
  PROGRESS_STATUS_LABELS,
  PROGRESS_STATUS_OPTIONS,
  progressLabelToStatus,
} from "@/lib/progress-status-filter";
import { clearAuthCookie, getLoginRedirect } from "@/lib/auth";
import { fetchAuctions, fetchFavoriteIds, addFavorite, removeFavorite, fetchMyProfile, logoutUser, fetchLoanPolicies, logUserAction, logUserActionsBatch, type LoanPolicy } from "@/lib/api";
import {
  matchesInvestmentRecommend,
  requiredEquityForItem,
  selectLoanPolicy,
  DEFAULT_LOAN_POLICIES,
  type InvestmentCriteria,
} from "@/lib/investment-criteria";
import { InvestmentRecommendPanel } from "@/components/InvestmentRecommendPanel";
import type { UserProfile } from "@/types/auction";
import { AuctionDetailModal } from "@/components/AuctionDetailModal";
import { formatTenantStatusSummary } from "@/lib/tenant-status";
import { AuctionChangeHistoryModal } from "@/components/AuctionChangeHistoryModal";
import { UpdatedBadge } from "@/components/UpdatedBadge";
import { AppHeader, HEADER_BTN, HEADER_NAV_TRAILING, HEADER_TAB_ACTIVE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";

// ─── Column Definitions ───────────────────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  defaultWidth: number;
  align?: "left" | "right" | "center";
  sticky?: boolean;
  render: (row: AuctionItem) => React.ReactNode;
}

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
const fmtFailureRate = (minPrice: number, appraisedValue: number) => {
  const ratio = getFailureRateRatio(minPrice, appraisedValue);
  if (ratio == null) return null;
  return `${ratio}%`;
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
  return { val: fmtDiffAmount(d), positive: d >= 0 };
};

function renderPriceDiff(
  stored: number | null | undefined,
  naver: number,
  other: number | null,
  requireOther = true,
) {
  if (!hasNaverPrice(naver)) {
    return <span className="text-muted-foreground/40">-</span>;
  }
  if (requireOther && (other == null || other === 0)) {
    return <span className="text-muted-foreground/40">-</span>;
  }
  const amount = stored ?? (other != null ? naver - other : null);
  if (amount == null) return <span className="text-muted-foreground/40">-</span>;
  const display = { val: fmtDiffAmount(amount), positive: amount >= 0 };
  return (
    <span className={`font-mono font-semibold ${display.positive ? "text-emerald-600" : "text-red-500"}`}>
      {display.val}
    </span>
  );
}

function renderNaverPrice(
  naverPrice: number,
  naverPriceFloor?: number | null,
  naverPriceFloorLabel?: string | null,
) {
  if (!hasNaverPrice(naverPrice)) {
    return <span className="text-muted-foreground/40">-</span>;
  }
  const floorLabel = naverPriceFloorLabel ?? (naverPriceFloor != null ? `${naverPriceFloor}층` : null);
  return (
    <span className="font-mono">
      {fmtEok(naverPrice)}
      {floorLabel && (
        <span className="text-muted-foreground text-[13px] ml-1">({floorLabel})</span>
      )}
    </span>
  );
}

function renderPriceDetail(priceDetail: string, naverPrice: number) {
  if (!hasNaverPrice(naverPrice)) {
    return <span className="text-muted-foreground/40">-</span>;
  }
  return (
    <span className="text-muted-foreground">
      {priceDetail.trim() || "-"}
    </span>
  );
}

const LIST_TEXT = "text-[15px] leading-snug";
const LABEL_TEXT = "text-[14px] leading-snug";
const SECTION_TEXT = "text-[16px] leading-snug";
const FILTER_ROW = "grid grid-cols-1 sm:grid-cols-[5.5rem_1fr] gap-x-6 gap-y-1.5";
const FILTER_LABEL = `${LIST_TEXT} font-semibold text-muted-foreground whitespace-nowrap`;
const FILTER_SELECT_CITY = "w-full sm:w-[9rem]";
const FILTER_SELECT_DISTRICT = "w-full sm:w-[9rem]";
const FILTER_SELECT_WARD = "w-full sm:w-[8.5rem]";
const FILTER_SELECT_PROP = "w-full sm:w-[10.5rem]";
const FILTER_SELECT_PRICE = "w-[7.25rem] sm:w-[7.25rem]";
const FILTER_SELECT_FAILURE = "w-full sm:w-[13.5rem]";
const FILTER_SELECT_YEAR = "w-[6.5rem]";
const FILTER_SELECT_PROGRESS = "w-full sm:w-[7rem]";
const AUCTION_CASE_YEARS = getAuctionCaseYears();

const buildColumns = (
  isAdmin: boolean,
  recommendCriteria: InvestmentCriteria | null,
  loanPolicies: LoanPolicy[],
): ColDef[] => [
  { key: "memo", label: "메모", defaultWidth: 80, sticky: true, render: (r) => r.memo ? <span className="text-amber-600"><StickyNote size={16} className="inline mr-1" />{r.memo}</span> : <span className="text-muted-foreground/40">-</span> },
  { key: "usage", label: "용도", defaultWidth: 96, render: (r) => <span className="whitespace-nowrap">{r.usage}</span> },
  { key: "specialNote", label: "특이사항", defaultWidth: 160, render: (r) => <span className="text-red-600">{r.specialNote}</span> },
  { key: "link", label: "링크", defaultWidth: 56, render: (r) => <a href={r.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary hover:text-accent inline-flex justify-center"><ExternalLink size={16} /></a> },
  { key: "views", label: "조회수", defaultWidth: 68, render: (r) => <span className="font-mono">{fmt(r.views)}</span> },
  { key: "auctionNo", label: "경매번호", defaultWidth: 168, align: "left", render: (r) => (
    <span className="font-mono text-primary font-semibold inline-flex items-center gap-1.5">
      {r.auctionNo}
      {isAdmin && r.isUpdated && <UpdatedBadge />}
    </span>
  ) },
  { key: "address", label: "물건주소", defaultWidth: 280, render: (r) => <span>{r.address}</span> },
  { key: "totalUnits", label: "총 세대수", defaultWidth: 80, render: (r) => <span className="font-mono">{fmt(r.totalUnits)}</span> },
  { key: "area", label: "평형", defaultWidth: 64, render: (r) => <span className="font-medium">{r.area}</span> },
  { key: "builtYear", label: "연식", defaultWidth: 64, render: (r) => <span className="font-mono">{r.builtYear}년</span> },
  { key: "bidDate", label: "입찰기일", defaultWidth: 96, render: (r) => (
    <span className={`font-mono ${isBidDateEnded(r.bidDate) ? "text-red-600 font-semibold" : ""}`}>{r.bidDate}</span>
  ) },
  { key: "appraisedValue", label: "감정가", defaultWidth: 96, render: (r) => <span className="font-mono">{fmtEok(r.appraisedValue)}</span> },
  { key: "minPrice", label: "최저가", defaultWidth: 96, render: (r) => (
    r.minPrice
      ? <span className="font-mono whitespace-nowrap">{fmtEok(r.minPrice)}</span>
      : <span className="text-muted-foreground/40">-</span>
  ) },
  { key: "failureRate", label: "유찰률", defaultWidth: 72, render: (r) => {
    const rate = fmtFailureRate(r.minPrice, r.appraisedValue);
    return rate
      ? <span className="font-mono whitespace-nowrap">{rate}</span>
      : <span className="text-muted-foreground/40">-</span>;
  } },
  ...(recommendCriteria
    ? [
        {
          key: "recommendLoan",
          label: "적용 대출기준",
          defaultWidth: 168,
          render: (r: AuctionItem) => {
            if (!r.minPrice || r.minPrice <= 0) return <span className="text-muted-foreground/40">-</span>;
            const policy = selectLoanPolicy(recommendCriteria, r.regulatedArea, loanPolicies);
            if (policy.loanUnavailable) {
              return <span className="text-xs text-destructive font-semibold">대출 불가({policy.label})</span>;
            }
            const equity = requiredEquityForItem(r.minPrice, r.appraisedValue, policy);
            return (
              <span className="text-xs leading-snug whitespace-nowrap">
                <span className="text-primary font-semibold">{policy.label}</span>
                <br />
                <span className="text-muted-foreground">필요 자기자금 약 {fmtEok(equity)}</span>
              </span>
            );
          },
        } satisfies ColDef,
      ]
    : []),
  { key: "naverPrice", label: "네이버 호가", defaultWidth: 120, render: (r) => renderNaverPrice(r.naverPrice, r.naverPriceFloor, r.naverPriceFloorLabel) },
  { key: "diff3", label: "호가-감정가", defaultWidth: 100, render: (r) => renderPriceDiff(r.diffNaverAppraised, r.naverPrice, r.appraisedValue, false) },
  { key: "diff2", label: "호가-최저가", defaultWidth: 100, render: (r) => renderPriceDiff(r.diffNaverMin, r.naverPrice, r.minPrice, false) },
  { key: "tradingCount", label: "실거래건수", defaultWidth: 140, render: (r) => <span className="font-mono text-xs">{r.tradingCount || "-"}</span> },
  { key: "salePrice", label: "낙찰가", defaultWidth: 96, render: (r) => r.salePrice ? <span className="font-mono text-emerald-600 font-semibold">{fmtEok(r.salePrice)}</span> : <span className="text-muted-foreground/40">-</span> },
  { key: "diff1", label: "호가-낙찰가", defaultWidth: 100, render: (r) => renderPriceDiff(r.diffNaverSale, r.naverPrice, r.salePrice) },
  { key: "bidInfo", label: "낙찰정보", defaultWidth: 96, render: (r) => <span>{r.bidInfo}</span> },
  { key: "owner", label: "소유자", defaultWidth: 72, render: (r) => <span>{r.owner}</span> },
  { key: "appraiser", label: "감정원", defaultWidth: 120, render: (r) => <span>{r.appraiser}</span> },
  { key: "officialLandPrice", label: "공시가", defaultWidth: 96, render: (r) => <span className="font-mono">{fmtEok(r.officialLandPrice)}</span> },
  { key: "tenantInfo", label: "임차정보", defaultWidth: 160, render: (r) => <span>{r.tenantInfo}</span> },
  { key: "elevator", label: "승강기", defaultWidth: 96, render: (r) => <span>{r.elevator}</span> },
  { key: "parking", label: "주차장", defaultWidth: 120, render: (r) => <span>{r.parking}</span> },
  { key: "landShare", label: "토지지분", defaultWidth: 80, render: (r) => <span className="font-mono">{r.landShare}</span> },
  { key: "buildingRegistry", label: "건물등기", defaultWidth: 100, render: (r) => <span className={r.buildingRegistry !== "이상없음" ? "text-red-500 font-semibold" : "text-emerald-600"}>{r.buildingRegistry}</span> },
  { key: "education", label: "교육환경", defaultWidth: 140, render: (r) => <span>{r.education}</span> },
  { key: "tenantDetail", label: "임차인 현황", defaultWidth: 180, render: (r) => <span className="text-muted-foreground">{formatTenantStatusSummary(r.tenantDetail)}</span> },
  { key: "priceDetail", label: "호가 상세", defaultWidth: 160, render: (r) => renderPriceDetail(r.priceDetail, r.naverPrice) },
  { key: "tradingDetail", label: "실거래 상세", defaultWidth: 100, render: (r) => <span className="text-muted-foreground">{r.tradingDetail}</span> },
  ...(isAdmin
    ? [
        {
          key: "recordTime",
          label: "기록시간",
          defaultWidth: 136,
          render: (r: AuctionItem) => (
            <span className="font-mono text-muted-foreground">{r.recordTime}</span>
          ),
        } satisfies ColDef,
      ]
    : []),
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SelectEl({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className={`w-full appearance-none bg-card border border-border rounded-sm px-3 py-2.5 pr-8 ${LIST_TEXT} text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors ${disabled ? "opacity-40 cursor-not-allowed bg-muted" : "hover:border-primary/50 cursor-pointer"} ${!value ? "text-muted-foreground" : ""}`}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={16} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${disabled ? "opacity-30" : "opacity-50"}`} />
    </div>
  );
}

function FilterTextInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      placeholder={placeholder}
      maxLength={5}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
      className={`w-full bg-card border border-border rounded-sm px-3 py-2.5 ${LIST_TEXT} text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary hover:border-primary/50 transition-colors placeholder:text-muted-foreground placeholder:font-sans`}
    />
  );
}

function PriceSelectEl({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none bg-card border border-border rounded-sm px-3 py-2.5 pr-8 ${LIST_TEXT} text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors hover:border-primary/50 cursor-pointer ${!value ? "text-muted-foreground" : ""}`}
      >
        <option value="">{placeholder}</option>
        {PRICE_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
    </div>
  );
}

function FailureRateSelectEl({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: FailureRateFilterOption[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none bg-card border border-border rounded-sm px-3 py-2.5 pr-8 ${LIST_TEXT} text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors hover:border-primary/50 cursor-pointer ${!value ? "text-muted-foreground" : ""}`}
      >
        <option value="">전체</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
    </div>
  );
}

function PriceRangeSelect({
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: {
  minValue: string;
  maxValue: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 w-fit">
      <div className={`${FILTER_SELECT_PRICE} shrink-0`}>
        <PriceSelectEl value={minValue} onChange={onMinChange} placeholder="이상" />
      </div>
      <span className={`${LIST_TEXT} text-muted-foreground shrink-0 select-none`}>~</span>
      <div className={`${FILTER_SELECT_PRICE} shrink-0`}>
        <PriceSelectEl value={maxValue} onChange={onMaxChange} placeholder="이하" />
      </div>
    </div>
  );
}

function MultiCheckboxSelect({
  options,
  selected,
  onChange,
  placeholder,
  disabled,
  className = "",
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length}개 선택`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`w-full text-left bg-card border border-border rounded-sm px-3 py-2.5 pr-8 ${LIST_TEXT} whitespace-nowrap truncate focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors ${
          disabled
            ? "opacity-40 cursor-not-allowed bg-muted"
            : "hover:border-primary/50 cursor-pointer"
        } ${selected.length === 0 ? "text-muted-foreground" : "text-foreground"}`}
      >
        {summary}
      </button>
      <ChevronDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
      {open && !disabled && (
        <ul className="absolute z-[100] top-full left-0 mt-1 min-w-full max-h-60 overflow-y-auto rounded-sm border border-border bg-card shadow-md">
          {options.map((option) => (
            <li key={option}>
              <label className={`flex items-center gap-2 px-3 py-2.5 ${LIST_TEXT} hover:bg-secondary/50 cursor-pointer`}>
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => toggle(option)}
                  className="accent-primary"
                />
                <span>{option}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProgressStatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isEnded = value === PROGRESS_STATUS_LABELS.ended;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full text-left bg-card border border-border rounded-sm px-3 py-2.5 pr-8 ${LIST_TEXT} hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors ${isEnded ? "text-red-600 font-semibold" : "text-foreground"}`}
      >
        {value}
      </button>
      <ChevronDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
      {open && (
        <ul className="absolute z-[100] top-full left-0 mt-1 w-full overflow-hidden rounded-sm border border-border bg-card shadow-md">
          {PROGRESS_STATUS_OPTIONS.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2.5 text-left ${LIST_TEXT} hover:bg-secondary/50 transition-colors ${
                  option === PROGRESS_STATUS_LABELS.ended ? "text-red-600 font-semibold" : "text-foreground"
                } ${value === option ? "bg-secondary/30" : ""}`}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Resizable Table ──────────────────────────────────────────────────────────

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

function AuctionMobileCard({
  item,
  onClick,
  recommendCriteria,
  loanPolicies,
}: {
  item: AuctionItem;
  onClick: () => void;
  recommendCriteria: InvestmentCriteria | null;
  loanPolicies: LoanPolicy[];
}) {
  const rate = fmtFailureRate(item.minPrice, item.appraisedValue);
  const recommendPolicy =
    recommendCriteria && item.minPrice
      ? selectLoanPolicy(recommendCriteria, item.regulatedArea, loanPolicies)
      : null;
  const equity =
    recommendPolicy && !recommendPolicy.loanUnavailable && item.minPrice
      ? requiredEquityForItem(item.minPrice, item.appraisedValue, recommendPolicy)
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-card border border-border rounded-sm shadow-sm px-4 py-3.5 active:bg-secondary/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-mono text-primary font-semibold text-[15px] inline-flex items-center gap-1.5 min-w-0">
          <span className="truncate">{item.auctionNo || "-"}</span>
          {item.isUpdated && <UpdatedBadge />}
        </span>
        <span
          className={`shrink-0 font-mono text-[13px] ${
            isBidDateEnded(item.bidDate) ? "text-red-600 font-semibold" : "text-muted-foreground"
          }`}
        >
          {item.bidDate || "-"}
        </span>
      </div>
      <p className="text-[14px] text-foreground leading-snug mb-2 line-clamp-2">
        {item.address || "-"}
      </p>
      <div className="grid grid-cols-3 gap-2 text-[13px]">
        <div>
          <p className="text-muted-foreground/70 text-[11px]">감정가</p>
          <p className="font-mono font-semibold">{item.appraisedValue ? fmtEok(item.appraisedValue) : "-"}</p>
        </div>
        <div>
          <p className="text-muted-foreground/70 text-[11px]">최저가</p>
          <p className="font-mono font-semibold text-orange-600">{item.minPrice ? fmtEok(item.minPrice) : "-"}</p>
        </div>
        <div>
          <p className="text-muted-foreground/70 text-[11px]">유찰률</p>
          <p className="font-mono font-semibold">{rate ?? "-"}</p>
        </div>
      </div>
      {equity != null && recommendPolicy && (
        <p className="mt-2 text-[12px] text-primary bg-primary/5 border border-primary/15 rounded-sm px-2 py-1">
          {recommendPolicy.label} · 필요 자기자금 약 {fmtEok(equity)}
        </p>
      )}
      {recommendPolicy?.loanUnavailable && (
        <p className="mt-2 text-[12px] text-destructive bg-destructive/5 border border-destructive/15 rounded-sm px-2 py-1">
          대출 불가 ({recommendPolicy.label})
        </p>
      )}
      {item.memo && (
        <p className="mt-2 text-[12px] text-amber-600 inline-flex items-center gap-1">
          <StickyNote size={12} />
          {item.memo}
        </p>
      )}
    </button>
  );
}

function AuctionTable({
  data,
  isAdmin,
  onRowClick,
  recommendCriteria,
  loanPolicies,
}: {
  data: AuctionItem[];
  isAdmin: boolean;
  onRowClick: (item: AuctionItem) => void;
  recommendCriteria: InvestmentCriteria | null;
  loanPolicies: LoanPolicy[];
}) {
  const columns = useMemo(
    () => buildColumns(isAdmin, recommendCriteria, loanPolicies),
    [isAdmin, recommendCriteria, loanPolicies],
  );
  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(buildColumns(false, null, []).map((c) => [c.key, c.defaultWidth]))
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

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isConsultant, setIsConsultant] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [ward, setWard] = useState("");
  const [availableWards, setAvailableWards] = useState<string[]>([]);
  const [wardsLoading, setWardsLoading] = useState(false);
  const [propType, setPropType] = useState("");
  const [appraisedMinInput, setAppraisedMinInput] = useState("");
  const [appraisedMaxInput, setAppraisedMaxInput] = useState("");
  const [minPriceMinInput, setMinPriceMinInput] = useState("");
  const [minPriceMaxInput, setMinPriceMaxInput] = useState("");
  const [failureRateInput, setFailureRateInput] = useState("");
  const [auctionYear, setAuctionYear] = useState("");
  const [auctionCaseNo, setAuctionCaseNo] = useState("");
  const [progressStatus, setProgressStatus] = useState<string>(PROGRESS_STATUS_LABELS.active);
  const [filterOpen, setFilterOpen] = useState(true);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  const detailOpenedAtRef = useRef<number | null>(null);
  const impressionLoggedIdsRef = useRef<Set<string>>(new Set());
  const [historyItem, setHistoryItem] = useState<AuctionItem | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [recommendEnabled, setRecommendEnabled] = useState(false);
  const [appliedCriteria, setAppliedCriteria] = useState<InvestmentCriteria | null>(null);
  const [appliedInvestableWon, setAppliedInvestableWon] = useState<number | null>(null);
  const [loanPolicies, setLoanPolicies] = useState<LoanPolicy[]>(DEFAULT_LOAN_POLICIES);

  useEffect(() => {
    fetchLoanPolicies()
      .then(setLoanPolicies)
      .catch(() => {
        // 정책 API 실패 시 기본값 유지
      });
  }, []);

  const availableDistricts = useMemo(() => {
    if (cities.length === 0) return [];
    const merged = new Set<string>();
    for (const city of cities) {
      getDistricts(city).forEach((district) => merged.add(district));
    }
    return Array.from(merged).sort((a, b) => a.localeCompare(b, "ko"));
  }, [cities]);

  const failureRateOptions = useMemo(
    () => getFailureRateFilterOptionsFromCities(cities),
    [cities],
  );

  useEffect(() => {
    if (!failureRateInput) return;
    if (!failureRateOptions.some((option) => option.value === failureRateInput)) {
      setFailureRateInput("");
    }
  }, [cities, failureRateOptions, failureRateInput]);

  useEffect(() => {
    setDistricts((prev) =>
      prev.filter((district) =>
        cities.some((city) =>
          getDistricts(city).some((candidate) => matchDistrict(candidate, district)),
        ),
      ),
    );
  }, [cities]);

  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true);
    fetchMyProfile()
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setIsAdmin(data.role === "admin");
        setIsConsultant(data.role === "consultant");
        if (data.role !== "admin") {
          router.replace("/");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setProfile(null);
        setIsAdmin(false);
        setIsConsultant(false);
        router.replace("/");
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => { cancelled = true; };
  }, [router]);

  const reloadProfile = useCallback(async () => {
    const data = await fetchMyProfile();
    setProfile(data);
    setIsAdmin(data.role === "admin");
    setIsConsultant(data.role === "consultant");
    return data;
  }, []);

  const handleApplyRecommend = useCallback(
    (criteria: InvestmentCriteria, investableWon: number, _mode: "session" | "save") => {
      setAppliedCriteria(criteria);
      setAppliedInvestableWon(investableWon);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    fetchAuctions()
      .then((data) => {
        if (!cancelled) {
          setItems(data);
          setLoadError("");
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setLoadError(err.message || "물건 데이터를 불러오지 못했습니다.");
          setItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchFavoriteIds()
      .then((ids) => {
        if (!cancelled) setFavoriteIds(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setFavoriteIds(new Set());
      });

    return () => { cancelled = true; };
  }, []);

  async function handleToggleFavorite(auctionId: string, next: boolean) {
    setFavoriteBusy(true);
    try {
      if (next) {
        await addFavorite(auctionId);
        setFavoriteIds((prev) => new Set([...Array.from(prev), auctionId]));
        logUserAction({
          itemId: auctionId,
          actionType: "favorite",
          metadata: { recommended: recommendEnabled },
        });
      } else {
        await removeFavorite(auctionId);
        setFavoriteIds((prev) => {
          const nextSet = new Set(prev);
          nextSet.delete(auctionId);
          return nextSet;
        });
      }
    } catch (err) {
      throw err instanceof Error
        ? err
        : new Error("관심물건 처리에 실패했습니다.");
    } finally {
      setFavoriteBusy(false);
    }
  }

  useEffect(() => {
    if (cities.length !== 1 || districts.length !== 1) {
      setAvailableWards([]);
      setWard("");
      setWardsLoading(false);
      return;
    }

    let cancelled = false;
    setWardsLoading(true);
    setAvailableWards([]);

    getWards(cities[0], districts[0])
      .then((wards) => {
        if (!cancelled) setAvailableWards(wards);
      })
      .finally(() => {
        if (!cancelled) setWardsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cities, districts]);

  useEffect(() => {
    if (districts.length !== 1) {
      setWard("");
    }
  }, [districts]);

  const handleReset = () => {
    setCities([]);
    setDistricts([]);
    setWard("");
    setPropType("");
    setAppraisedMinInput(""); setAppraisedMaxInput("");
    setMinPriceMinInput(""); setMinPriceMaxInput("");
    setFailureRateInput("");
    setAuctionYear(""); setAuctionCaseNo("");
    setProgressStatus(PROGRESS_STATUS_LABELS.active);
    setFavoritesOnly(false);
    setRecommendEnabled(false);
    setAppliedCriteria(null);
    setAppliedInvestableWon(null);
  };

  // Apply filters
  
  const filtered = items.filter((item) => {
    if (favoritesOnly && !favoriteIds.has(item.id)) return false;
    if (
      cities.length > 0 &&
      !cities.some((city) => normalizeCity(item.city) === normalizeCity(city))
    ) {
      return false;
    }
    if (
      districts.length > 0 &&
      !districts.some((district) => matchDistrict(item.district, district))
    ) {
      return false;
    }
    if (ward && !item.address.includes(ward)) return false;
    if (propType && !matchesPropertyType(item, propType)) return false;
    if (appraisedMinInput && item.appraisedValue < Number(appraisedMinInput)) return false;
    if (appraisedMaxInput && item.appraisedValue > Number(appraisedMaxInput)) return false;
    if (minPriceMinInput && item.minPrice < Number(minPriceMinInput)) return false;
    if (minPriceMaxInput && item.minPrice > Number(minPriceMaxInput)) return false;
    if (!matchesFailureRateFilter(item.minPrice, item.appraisedValue, failureRateInput)) return false;
    if (!matchesAuctionNoFilter(item.auctionNo, auctionYear, auctionCaseNo)) return false;
    if (!matchesProgressStatus(item.bidDate, progressLabelToStatus(progressStatus))) return false;
    return true;
  });

  const recommendMatches = useMemo(() => {
    if (!recommendEnabled || appliedInvestableWon == null || !appliedCriteria) return filtered;
    return filtered.filter((item) =>
      matchesInvestmentRecommend(item, appliedInvestableWon, appliedCriteria, loanPolicies),
    );
  }, [filtered, recommendEnabled, appliedInvestableWon, appliedCriteria, loanPolicies]);

  const displayItems = recommendEnabled ? recommendMatches : filtered;

  useEffect(() => {
    const timer = setTimeout(() => {
      const unseen = displayItems.filter(
        (item) => !impressionLoggedIdsRef.current.has(item.id),
      );
      if (unseen.length === 0) return;
      unseen.forEach((item) => impressionLoggedIdsRef.current.add(item.id));
      logUserActionsBatch(
        unseen.map((item) => ({
          itemId: item.id,
          actionType: "impression",
          metadata: { recommended: recommendEnabled },
        })),
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [displayItems, recommendEnabled]);

  function handleRowSelect(row: AuctionItem) {
    detailOpenedAtRef.current = Date.now();
    logUserAction({
      itemId: row.id,
      actionType: "click",
      metadata: { recommended: recommendEnabled },
    });
    setSelectedItem(row);
  }

  const auctionNoFilterLabel = formatAuctionNoFilterLabel(auctionYear, auctionCaseNo);

  const activeFilters = [
    auctionNoFilterLabel && `경매번호 ${auctionNoFilterLabel}`,
    cities.length > 0 &&
      (cities.length === 1 ? cities[0] : `시/도 ${cities.length}개`),
    districts.length > 0 &&
      (districts.length === 1 ? districts[0] : `군/구 ${districts.length}개`),
    ward,
    propType,
    appraisedMinInput && `감정가 ${getPriceFilterLabel(appraisedMinInput)} 이상`,
    appraisedMaxInput && `감정가 ${getPriceFilterLabel(appraisedMaxInput)} 이하`,
    minPriceMinInput && `최저가 ${getPriceFilterLabel(minPriceMinInput)} 이상`,
    minPriceMaxInput && `최저가 ${getPriceFilterLabel(minPriceMaxInput)} 이하`,
    failureRateInput &&
      `유찰률 ${getFailureRateFilterLabelFromCities(failureRateInput, cities)}`,
    progressStatus !== PROGRESS_STATUS_LABELS.all && `진행상태 ${progressStatus}`,
    favoritesOnly && "관심물건",
    recommendEnabled && appliedCriteria && "투자 추천",
  ].filter(Boolean);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // ignore
    }
    clearAuthCookie();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <AppHeader
        maxWidth="1400"
        nav={
          <>
            <Link href="/" className={HEADER_BTN}>
              추천 물건
            </Link>
            <span className={HEADER_TAB_ACTIVE}>전체 검색</span>
            {isConsultant && (
              <Link href="/consultant" className={HEADER_BTN}>
                컨설턴트
              </Link>
            )}
            <div className={HEADER_NAV_TRAILING}>
              {isAdmin && (
                <Link href="/admin" className={HEADER_BTN}>
                  관리자
                </Link>
              )}
              <AccountNavLink name={profile?.name} />
              <button type="button" onClick={handleLogout} className={HEADER_BTN}>
                <LogOut size={16} />
                로그아웃
              </button>
            </div>
          </>
        }
      />

      <main className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Filter Panel */}
        <div className="bg-card border border-border rounded-sm shadow-sm">
          {/* Filter toggle header */}
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Search size={16} className="text-primary" />
              <span className={`${SECTION_TEXT} font-semibold text-foreground`}>검색 필터</span>
              {activeFilters.length > 0 && (
                <span className={`bg-primary text-primary-foreground ${LIST_TEXT} font-mono px-1.5 py-0.5 rounded-sm`}>
                  {activeFilters.length}
                </span>
              )}
            </div>
            <ChevronDown size={16} className={`text-muted-foreground transition-transform duration-200 ${filterOpen ? "rotate-180" : ""}`} />
          </button>

          {filterOpen && (
            <div className="border-t border-border">
              <div className="px-5 py-4 border-b border-border space-y-4">
                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>경매번호</span>
                  <div className="flex items-center gap-2 w-fit">
                    <div className={`${FILTER_SELECT_YEAR} shrink-0`}>
                      <SelectEl
                        value={auctionYear}
                        onChange={setAuctionYear}
                        options={AUCTION_CASE_YEARS}
                        placeholder="사건년도"
                      />
                    </div>
                    <span className={`${LIST_TEXT} text-muted-foreground shrink-0 select-none`}>타경</span>
                    <div className={`${FILTER_SELECT_YEAR} shrink-0`}>
                      <FilterTextInput value={auctionCaseNo} onChange={setAuctionCaseNo} />
                    </div>
                  </div>
                </div>

                <div className={`${FILTER_ROW} items-start sm:items-center`}>
                  <span className={FILTER_LABEL}>주소</span>
                  <div className="flex flex-wrap items-center gap-2 sm:w-fit">
                    <div className={`${FILTER_SELECT_CITY} sm:shrink-0`}>
                      <MultiCheckboxSelect
                        options={[...CITIES]}
                        selected={cities}
                        onChange={setCities}
                        placeholder="시/도 선택"
                      />
                    </div>
                    <div className={`${FILTER_SELECT_DISTRICT} sm:shrink-0`}>
                      <MultiCheckboxSelect
                        options={availableDistricts}
                        selected={districts}
                        onChange={setDistricts}
                        placeholder={cities.length > 0 ? "군/구 선택" : "시/도 먼저"}
                        disabled={cities.length === 0}
                      />
                    </div>
                    <div className={`${FILTER_SELECT_WARD} sm:shrink-0`}>
                      <SelectEl
                        value={ward}
                        onChange={setWard}
                        options={availableWards}
                        placeholder={
                          cities.length !== 1 || districts.length !== 1
                            ? "군/구 1개 선택"
                            : wardsLoading
                              ? "불러오는 중..."
                              : availableWards.length
                                ? "동/읍/면 선택"
                                : "해당 없음"
                        }
                        disabled={
                          cities.length !== 1 ||
                          districts.length !== 1 ||
                          wardsLoading ||
                          !availableWards.length
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>물건종류</span>
                  <div className={`${FILTER_SELECT_PROP} shrink-0`}>
                    <SelectEl
                      value={propType}
                      onChange={setPropType}
                      options={[...PROPERTY_TYPE_OPTIONS]}
                      placeholder="선택"
                    />
                  </div>
                </div>

                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>감정가</span>
                  <PriceRangeSelect
                    minValue={appraisedMinInput}
                    maxValue={appraisedMaxInput}
                    onMinChange={setAppraisedMinInput}
                    onMaxChange={setAppraisedMaxInput}
                  />
                </div>

                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>최저가</span>
                  <PriceRangeSelect
                    minValue={minPriceMinInput}
                    maxValue={minPriceMaxInput}
                    onMinChange={setMinPriceMinInput}
                    onMaxChange={setMinPriceMaxInput}
                  />
                </div>

                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>유찰률</span>
                  <div className={`${FILTER_SELECT_FAILURE} shrink-0`}>
                    <FailureRateSelectEl
                      value={failureRateInput}
                      onChange={setFailureRateInput}
                      options={failureRateOptions}
                    />
                  </div>
                </div>

                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>진행상태</span>
                  <div className={`${FILTER_SELECT_PROGRESS} shrink-0`}>
                    <ProgressStatusSelect value={progressStatus} onChange={setProgressStatus} />
                  </div>
                </div>

                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>관심물건</span>
                  <label className={`flex items-center gap-2 ${LIST_TEXT} cursor-pointer select-none`}>
                    <input
                      type="checkbox"
                      checked={favoritesOnly}
                      onChange={(e) => setFavoritesOnly(e.target.checked)}
                      className="accent-primary"
                    />
                    관심물건만 보기
                    <span className={`${LABEL_TEXT} text-muted-foreground`}>
                      ({favoriteIds.size}건)
                    </span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 py-3 bg-secondary/30 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {activeFilters.map((f, i) => (
                    <span key={i} className={`inline-flex items-center px-2 py-0.5 bg-primary/10 text-primary ${LIST_TEXT} font-medium rounded-sm border border-primary/20`}>
                      {f as string}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 shrink-0 sm:ml-4">
                  <button onClick={handleReset} className={`flex items-center gap-1.5 px-3 py-2 ${LIST_TEXT} font-medium text-muted-foreground border border-border rounded-sm hover:text-foreground hover:border-foreground/30 transition-colors`}>
                    <RotateCcw size={15} />초기화
                  </button>
                  <button className={`flex items-center gap-1.5 px-5 py-2 bg-primary text-primary-foreground ${LIST_TEXT} font-semibold rounded-sm hover:bg-accent transition-colors shadow-sm`}>
                    <Search size={15} />검색
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <InvestmentRecommendPanel
          profile={profile}
          profileLoading={profileLoading}
          loanPolicies={loanPolicies}
          recommendEnabled={recommendEnabled}
          onRecommendEnabledChange={setRecommendEnabled}
          appliedCriteria={appliedCriteria}
          appliedInvestableWon={appliedInvestableWon}
          matchCount={recommendMatches.length}
          filteredCount={filtered.length}
          onApply={handleApplyRecommend}
          onReloadProfile={reloadProfile}
        />

        {/* Result Summary */}
        <div className="flex items-center gap-2">
          <span className={`${SECTION_TEXT} font-semibold text-foreground`}>검색 결과</span>
          <span className={`font-mono ${LIST_TEXT} text-primary font-bold`}>{displayItems.length}</span>
          <span className={`${LIST_TEXT} text-muted-foreground`}>건</span>
          <span className={`${LABEL_TEXT} text-muted-foreground ml-1`}>/ 전체 {items.length}건</span>
        </div>

        {loadError && (
          <div className={`rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 ${LIST_TEXT} text-destructive`}>
            {loadError}
            <span className={`text-muted-foreground ml-2 ${LABEL_TEXT}`}>auction-api에서 npm run start:dev 가 실행 중인지 확인해 주세요.</span>
          </div>
        )}

        {loading ? (
          <div className={`rounded-sm border border-border bg-card px-6 py-16 text-center ${LIST_TEXT} text-muted-foreground`}>
            물건 데이터를 불러오는 중...
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <AuctionTable
                data={displayItems}
                isAdmin={isAdmin}
                onRowClick={handleRowSelect}
                recommendCriteria={recommendEnabled ? appliedCriteria : null}
                loanPolicies={loanPolicies}
              />
            </div>
            <div className="md:hidden space-y-2.5">
              {displayItems.length === 0 ? (
                <div className={`rounded-sm border border-border bg-card px-6 py-16 text-center ${LIST_TEXT} text-muted-foreground`}>
                  조건에 맞는 물건이 없습니다.
                </div>
              ) : (
                displayItems.map((item) => (
                  <AuctionMobileCard
                    key={item.id}
                    item={item}
                    onClick={() => handleRowSelect(item)}
                    recommendCriteria={recommendEnabled ? appliedCriteria : null}
                    loanPolicies={loanPolicies}
                  />
                ))
              )}
            </div>
          </>
        )}
      </main>

      <AuctionDetailModal
        item={selectedItem}
        onClose={() => {
          if (selectedItem && detailOpenedAtRef.current != null) {
            const durationSeconds = Math.round(
              (Date.now() - detailOpenedAtRef.current) / 1000,
            );
            logUserAction({
              itemId: selectedItem.id,
              actionType: "detail_view",
              durationSeconds,
              metadata: { recommended: recommendEnabled },
            });
          }
          detailOpenedAtRef.current = null;
          setSelectedItem(null);
        }}
        editable={isAdmin}
        isAdmin={isAdmin}
        aiAnalysisLimit={profile?.aiAnalysisLimit}
        aiAnalysisUsed={profile?.aiAnalysisUsed}
        onAiAnalysisUsed={() =>
          setProfile((prev) =>
            prev ? { ...prev, aiAnalysisUsed: (prev.aiAnalysisUsed ?? 0) + 1 } : prev,
          )
        }
        isFavorite={selectedItem ? favoriteIds.has(selectedItem.id) : false}
        favoriteBusy={favoriteBusy}
        onToggleFavorite={
          selectedItem
            ? (next) => handleToggleFavorite(selectedItem.id, next)
            : undefined
        }
        onAiAnalysisClick={(row) =>
          logUserAction({
            itemId: row.id,
            actionType: "ai_analysis_click",
            metadata: { recommended: recommendEnabled },
          })
        }
        onDislike={
          isAdmin
            ? undefined
            : (row) =>
                logUserAction({
                  itemId: row.id,
                  actionType: "dislike",
                  metadata: { recommended: recommendEnabled },
                })
        }
        onReviewed={
          isAdmin
            ? undefined
            : (row) =>
                logUserAction({
                  itemId: row.id,
                  actionType: "reviewed",
                  metadata: { recommended: recommendEnabled },
                })
        }
        onSaved={(saved) => {
          setItems((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
          setSelectedItem(saved);
        }}
        onDeleted={(id) => {
          setItems((prev) => prev.filter((row) => row.id !== id));
          setSelectedItem(null);
          if (historyItem?.id === id) setHistoryItem(null);
        }}
        onViewHistory={isAdmin ? setHistoryItem : undefined}
      />
      <AuctionChangeHistoryModal
        item={historyItem}
        open={Boolean(historyItem)}
        onClose={() => setHistoryItem(null)}
      />
    </div>
  );
}
