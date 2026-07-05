"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Heart, Calendar, SlidersHorizontal, Search, Wallet, X, LayoutGrid, List, ChevronDown } from "lucide-react";
import type { AuctionItem, UserProfile } from "@/types/auction";
import { clearAuthCookie, getLoginRedirect } from "@/lib/auth";
import {
  fetchRecommendations,
  fetchMyProfile,
  fetchFavoriteIds,
  addFavorite,
  removeFavorite,
  logoutUser,
  logUserAction,
  logUserActionsBatch,
  updateMyProfile,
} from "@/lib/api";
import { AppHeader, HEADER_BTN, HEADER_NAV_TRAILING, HEADER_TAB_ACTIVE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";
import { AuctionDetailModal } from "@/components/AuctionDetailModal";
import { InvestmentInfoSection } from "@/components/InvestmentInfoSection";
import { SelectField, TextAreaField, CheckboxField } from "@/components/InvestmentFormFields";
import {
  EXISTING_LOAN_OPTIONS,
  HOUSING_COUNT_OPTIONS,
  INVESTABLE_FUNDS_OPTIONS,
  TARGET_RETURN_OPTIONS,
} from "@/data/investment-options";
import { formatWonShort } from "@/lib/investment-money";
import { requiredEquityForMinPrice } from "@/lib/investment-criteria";
import { getFailureRateRatio, getFailureRoundCount } from "@/lib/failure-rate";
import { CITIES } from "@/data/korea-regions";
import { PROPERTY_TYPE_OPTIONS, matchesPropertyType } from "@/data/property-type-options";

const fmtEok = (n: number) => {
  if (!n) return "-";
  const abs = Math.abs(n);
  if (abs >= 100000000) return `${(abs / 100000000).toFixed(2)}억`;
  if (abs >= 10000) return `${Math.round(abs / 10000).toLocaleString("ko-KR")}만`;
  return abs.toLocaleString("ko-KR");
};

function formatAreaLabel(area: string | null | undefined): string {
  const num = Number.parseFloat(String(area ?? "").match(/[\d.]+/)?.[0] ?? "");
  return Number.isFinite(num) && num > 0 ? `${Math.round(num)}㎡` : "-";
}

type RecommendFilters = {
  city: string;
  propType: string;
  maxFailureRate: string;
  favoritesOnly: boolean;
};

const EMPTY_RECOMMEND_FILTERS: RecommendFilters = {
  city: "",
  propType: "",
  maxFailureRate: "",
  favoritesOnly: false,
};

function matchesRecommendFilters(
  item: AuctionItem,
  filters: RecommendFilters,
  favoriteIds: Set<string>,
): boolean {
  if (filters.city && item.city !== filters.city) return false;
  if (filters.propType && !matchesPropertyType(item, filters.propType)) return false;
  if (filters.maxFailureRate) {
    const rate = getFailureRateRatio(item.minPrice, item.appraisedValue);
    if (rate == null || rate > Number(filters.maxFailureRate)) return false;
  }
  if (filters.favoritesOnly && !favoriteIds.has(item.id)) return false;
  return true;
}

function RecommendFilterModal({
  filters,
  favoriteCount,
  onClose,
  onApply,
}: {
  filters: RecommendFilters;
  favoriteCount: number;
  onClose: () => void;
  onApply: (next: RecommendFilters) => void;
}) {
  const [city, setCity] = useState(filters.city);
  const [propType, setPropType] = useState(filters.propType);
  const [maxFailureRate, setMaxFailureRate] = useState(filters.maxFailureRate);
  const [favoritesOnly, setFavoritesOnly] = useState(filters.favoritesOnly);

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto bg-black/45" onClick={onClose}>
      <div
        className="relative w-full max-w-md sm:my-4 min-h-screen sm:min-h-0 bg-card border-0 sm:border border-border rounded-none sm:rounded-sm shadow-xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-foreground">상세 필터</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-sm hover:bg-secondary">
            <X size={18} />
          </button>
        </div>
        <p className="text-[13px] text-muted-foreground mb-5">
          조건을 선택하면 추천 물건 리스트가 바로 필터링됩니다.
        </p>

        <div className="space-y-4">
          <label className="block text-sm space-y-1.5">
            <span className="text-muted-foreground text-[13px]">지역</span>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full h-10 px-3 border border-border rounded-sm bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">전체</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm space-y-1.5">
            <span className="text-muted-foreground text-[13px]">물건종류</span>
            <select
              value={propType}
              onChange={(e) => setPropType(e.target.value)}
              className="w-full h-10 px-3 border border-border rounded-sm bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">전체</option>
              {PROPERTY_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm space-y-1.5">
            <span className="text-muted-foreground text-[13px]">유찰률(감정가 대비 최저가, 이하)</span>
            <select
              value={maxFailureRate}
              onChange={(e) => setMaxFailureRate(e.target.value)}
              className="w-full h-10 px-3 border border-border rounded-sm bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">전체</option>
              <option value="100">100% 이하 (신건 포함)</option>
              <option value="80">80% 이하</option>
              <option value="70">70% 이하</option>
              <option value="60">60% 이하</option>
              <option value="50">50% 이하</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(e) => setFavoritesOnly(e.target.checked)}
              className="accent-primary"
            />
            관심물건만 보기
            <span className="text-muted-foreground text-[13px]">({favoriteCount}건)</span>
          </label>
        </div>

        <div className="flex justify-between gap-2 mt-6">
          <button
            type="button"
            onClick={() => {
              setCity("");
              setPropType("");
              setMaxFailureRate("");
              setFavoritesOnly(false);
            }}
            className="px-4 py-2 text-sm font-medium border border-border rounded-sm hover:bg-secondary transition-colors"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={() => onApply({ city, propType, maxFailureRate, favoritesOnly })}
            className="px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent transition-colors"
          >
            필터 적용
          </button>
        </div>
      </div>
    </div>
  );
}

function InvestmentInfoModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: UserProfile;
  onClose: () => void;
  onSaved: (updated: UserProfile) => void;
}) {
  const [investableFunds, setInvestableFunds] = useState(profile.investableFunds ?? "");
  const [existingLoanAmount, setExistingLoanAmount] = useState(profile.existingLoanAmount ?? "");
  const [housingCount, setHousingCount] = useState(String(profile.housingCount ?? 0));
  const [targetReturn, setTargetReturn] = useState(profile.targetReturn ?? "");
  const [investmentGoal, setInvestmentGoal] = useState(profile.investmentGoal ?? "");
  const [firstTimeBuyer, setFirstTimeBuyer] = useState(profile.firstTimeBuyer ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const trimmedInvestableFunds = investableFunds.trim();
    const trimmedExistingLoanAmount = existingLoanAmount.trim();
    const trimmedTargetReturn = targetReturn.trim();
    const trimmedInvestmentGoal = investmentGoal.trim();
    const parsedHousingCount = Number.parseInt(housingCount, 10);

    if (!trimmedInvestableFunds || !trimmedExistingLoanAmount || !trimmedTargetReturn || !trimmedInvestmentGoal) {
      setError("투자정보 항목을 모두 입력해 주세요.");
      return;
    }
    if (Number.isNaN(parsedHousingCount) || parsedHousingCount < 0) {
      setError("주택수는 0 이상의 숫자로 입력해 주세요.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const updated = await updateMyProfile({
        investableFunds: trimmedInvestableFunds,
        existingLoanAmount: trimmedExistingLoanAmount,
        housingCount: parsedHousingCount,
        targetReturn: trimmedTargetReturn,
        investmentGoal: trimmedInvestmentGoal,
        firstTimeBuyer,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto bg-black/45" onClick={onClose}>
      <div
        className="relative w-full max-w-lg sm:my-4 min-h-screen sm:min-h-0 bg-card border-0 sm:border border-border rounded-none sm:rounded-sm shadow-xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-foreground">투자정보 수정</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-sm hover:bg-secondary">
            <X size={18} />
          </button>
        </div>
        <p className="text-[13px] text-muted-foreground mb-5">
          여기서 수정한 내용이 추천 물건 리스트에 바로 반영됩니다.
        </p>

        {error && (
          <p className="mb-4 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-sm px-3 py-2">
            {error}
          </p>
        )}

        <InvestmentInfoSection className="rounded-sm">
          <SelectField
            label="투자가능자금"
            placeholder="투자가능자금 선택"
            value={investableFunds}
            onChange={setInvestableFunds}
            options={INVESTABLE_FUNDS_OPTIONS}
          />
          <SelectField
            label="기존대출금액"
            placeholder="기존대출금액 선택"
            value={existingLoanAmount}
            onChange={setExistingLoanAmount}
            options={EXISTING_LOAN_OPTIONS}
          />
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <SelectField
                label="주택수"
                placeholder="보유 주택수 선택"
                value={housingCount}
                onChange={setHousingCount}
                options={HOUSING_COUNT_OPTIONS}
              />
            </div>
            <div className="h-11 flex items-center">
              <CheckboxField
                label="생애최초 주택구입"
                checked={firstTimeBuyer}
                onChange={setFirstTimeBuyer}
              />
            </div>
          </div>
          <SelectField
            label="목표 수익"
            placeholder="목표 금액 선택"
            value={targetReturn}
            onChange={setTargetReturn}
            options={TARGET_RETURN_OPTIONS}
          />
          <TextAreaField
            label="투자목표"
            placeholder="예: 갭투자, 임대수익, 실거주 등 목표를 입력해 주세요"
            value={investmentGoal}
            onChange={setInvestmentGoal}
          />
        </InvestmentInfoSection>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium border border-border rounded-sm hover:bg-secondary transition-colors disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장하고 추천 새로고침"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecommendCard({
  item,
  loanRatio,
  loanPolicyLabel,
  isFavorite,
  favoriteBusy,
  onToggleFavorite,
  onOpen,
}: {
  item: AuctionItem;
  loanRatio: number | null;
  loanPolicyLabel: string | null;
  isFavorite: boolean;
  favoriteBusy: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
}) {
  const requiredEquity = loanRatio != null ? requiredEquityForMinPrice(item.minPrice, loanRatio) : null;
  const failureRate = getFailureRateRatio(item.minPrice, item.appraisedValue);
  const failureCount = getFailureRoundCount(item.minPrice, item.appraisedValue, item.city);
  const isNew = failureRate === 100;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden hover:border-primary/40 transition-colors">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="px-4 pt-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground bg-secondary/60 rounded-sm px-1.5 py-0.5">
              {item.usage || "물건"}
            </span>
            {isNew ? (
              <span className="shrink-0 text-[11px] font-semibold text-primary bg-primary/10 rounded-sm px-1.5 py-0.5">
                신건
              </span>
            ) : failureRate != null ? (
              <span className="shrink-0 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-1.5 py-0.5">
                유찰 {failureCount}회 · {failureRate}%
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            disabled={favoriteBusy}
            aria-label={isFavorite ? "관심물건 해제" : "관심물건 추가"}
            className="shrink-0 p-1 rounded-full hover:bg-secondary/60 disabled:opacity-50"
          >
            <Heart size={16} className={isFavorite ? "fill-rose-500 text-rose-500" : "text-muted-foreground"} />
          </button>
        </div>

        <div className="px-4 mt-1 flex items-center justify-between gap-2">
          <p className="text-[12px] text-muted-foreground font-mono">{item.auctionNo}</p>
          {item.specialNote && item.specialNote !== "없음" && (
            <p className="shrink-0 text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-sm px-1.5 py-0.5 truncate max-w-[55%]">
              {item.specialNote}
            </p>
          )}
        </div>

        <div className="px-4 mt-2">
          <p className="font-semibold text-foreground text-[15px] truncate">{item.address}</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground flex items-center gap-3 flex-wrap">
            <span>{formatAreaLabel(item.area)}</span>
            <span className="inline-flex items-center gap-1">
              <Calendar size={11} />
              {item.bidDate || "-"}
            </span>
          </p>
        </div>

        {requiredEquity != null && (
          <div className="mx-4 mt-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">최소 투자금</p>
            <p className="mt-0.5 text-[19px] font-bold text-primary font-mono">
              {formatWonShort(requiredEquity)}
            </p>
            <p className="mt-1 text-[11.5px] text-muted-foreground leading-relaxed">
              최저입찰가 {fmtEok(item.minPrice)}
              {loanRatio != null && <> ~ 예상대출 {fmtEok(Math.round(item.minPrice * loanRatio))}</>}
              {loanPolicyLabel && <> ({loanPolicyLabel} {Math.round(loanRatio! * 100)}%)</>}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-px mt-3 bg-border">
          <div className="bg-card px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground">최저입찰가</p>
            <p className="mt-0.5 text-[15px] font-semibold font-mono text-foreground">{fmtEok(item.minPrice)}</p>
          </div>
          <div className="bg-card px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground">감정가</p>
            <p className="mt-0.5 text-[15px] font-semibold font-mono text-foreground">{fmtEok(item.appraisedValue)}</p>
          </div>
        </div>
      </button>
    </div>
  );
}

function RecommendListRow({
  item,
  loanRatio,
  loanPolicyLabel,
  isFavorite,
  favoriteBusy,
  onToggleFavorite,
  onOpen,
}: {
  item: AuctionItem;
  loanRatio: number | null;
  loanPolicyLabel: string | null;
  isFavorite: boolean;
  favoriteBusy: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
}) {
  const requiredEquity = loanRatio != null ? requiredEquityForMinPrice(item.minPrice, loanRatio) : null;
  const failureRate = getFailureRateRatio(item.minPrice, item.appraisedValue);
  const failureCount = getFailureRoundCount(item.minPrice, item.appraisedValue, item.city);
  const isNew = failureRate === 100;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left bg-card border border-border rounded-xl px-4 sm:px-5 py-3 flex items-center gap-4 hover:border-primary/40 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <span className="text-[11px] font-medium text-muted-foreground bg-secondary/60 rounded-sm px-1.5 py-0.5">
            {item.usage || "물건"}
          </span>
          {isNew ? (
            <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded-sm px-1.5 py-0.5">신건</span>
          ) : failureRate != null ? (
            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-1.5 py-0.5">
              유찰 {failureCount}회 · {failureRate}%
            </span>
          ) : null}
          {item.specialNote && item.specialNote !== "없음" && (
            <span className="text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-sm px-1.5 py-0.5">
              {item.specialNote}
            </span>
          )}
        </div>
        <p className="font-semibold text-[14px] text-foreground truncate">{item.address}</p>
        <p className="text-[12px] text-muted-foreground truncate flex items-center gap-2">
          <span className="font-mono">{item.auctionNo}</span>
          <span className="inline-flex items-center gap-1">
            <Calendar size={10} />
            {item.bidDate || "-"}
          </span>
          <span>{formatAreaLabel(item.area)}</span>
        </p>
      </div>

      {requiredEquity != null && (
        <div className="hidden sm:block shrink-0 w-40 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-right">
          <p className="text-[10.5px] text-muted-foreground">최소 투자금</p>
          <p className="font-bold text-primary text-[14px] font-mono">{formatWonShort(requiredEquity)}</p>
          {loanPolicyLabel && (
            <p className="text-[10px] text-muted-foreground truncate">
              {loanPolicyLabel} {Math.round(loanRatio! * 100)}%
            </p>
          )}
        </div>
      )}

      <div className="hidden md:block text-right shrink-0 w-24">
        <p className="text-[10.5px] text-muted-foreground">최저입찰가</p>
        <p className="font-semibold text-[14px] font-mono text-foreground">{fmtEok(item.minPrice)}</p>
      </div>

      <div className="hidden lg:block text-right shrink-0 w-24">
        <p className="text-[10.5px] text-muted-foreground">감정가</p>
        <p className="text-[14px] font-mono text-foreground/70">{fmtEok(item.appraisedValue)}</p>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        disabled={favoriteBusy}
        aria-label={isFavorite ? "관심물건 해제" : "관심물건 추가"}
        className="shrink-0 p-1.5 rounded-full hover:bg-secondary/60 disabled:opacity-50"
      >
        <Heart size={16} className={isFavorite ? "fill-rose-500 text-rose-500" : "text-muted-foreground"} />
      </button>
    </button>
  );
}

const SORT_OPTIONS = ["최신순", "실투자금낮은순", "낙찰가율순", "최저가낮은순", "감정가높은순"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

function sortRecommendItems(
  items: AuctionItem[],
  sortBy: SortOption,
  loanRatio: number | null,
): AuctionItem[] {
  const withEquity = (item: AuctionItem) =>
    loanRatio != null ? requiredEquityForMinPrice(item.minPrice, loanRatio) : item.minPrice;
  const bidRate = (item: AuctionItem) =>
    getFailureRateRatio(item.minPrice, item.appraisedValue) ?? 0;

  const sorted = [...items];
  switch (sortBy) {
    case "실투자금낮은순":
      return sorted.sort((a, b) => withEquity(a) - withEquity(b));
    case "낙찰가율순":
      return sorted.sort((a, b) => bidRate(a) - bidRate(b));
    case "최저가낮은순":
      return sorted.sort((a, b) => a.minPrice - b.minPrice);
    case "감정가높은순":
      return sorted.sort((a, b) => b.appraisedValue - a.appraisedValue);
    default:
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export default function HomePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [loanRatio, setLoanRatio] = useState<number | null>(null);
  const [loanPolicyLabel, setLoanPolicyLabel] = useState<string | null>(null);
  const [showInvestmentModal, setShowInvestmentModal] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<RecommendFilters>(EMPTY_RECOMMEND_FILTERS);
  const [sortBy, setSortBy] = useState<SortOption>("최신순");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const isAdmin = profile?.role === "admin";
  const isConsultant = profile?.role === "consultant";

  useEffect(() => {
    fetchMyProfile()
      .then(setProfile)
      .catch(() => {});
    fetchFavoriteIds()
      .then((ids) => setFavoriteIds(new Set(ids)))
      .catch(() => {});
  }, []);

  function loadRecommendations(budget?: string) {
    setLoading(true);
    setLoadError("");
    fetchRecommendations(budget)
      .then((res) => {
        setItems(res.items);
        setLoanRatio(res.loanRatio);
        setLoanPolicyLabel(res.loanPolicyLabel);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "추천 물건을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const timer = setTimeout(() => {
      logUserActionsBatch(
        items.map((item) => ({ itemId: item.id, actionType: "impression", metadata: { recommended: true } })),
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [items]);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // ignore
    }
    clearAuthCookie();
    router.replace("/login");
  };

  async function handleToggleFavorite(auctionId: string, next: boolean) {
    setFavoriteBusy(true);
    try {
      if (next) {
        await addFavorite(auctionId);
        setFavoriteIds((prev) => new Set([...Array.from(prev), auctionId]));
      } else {
        await removeFavorite(auctionId);
        setFavoriteIds((prev) => {
          const nextSet = new Set(prev);
          nextSet.delete(auctionId);
          return nextSet;
        });
      }
    } finally {
      setFavoriteBusy(false);
    }
  }

  const filteredItems = sortRecommendItems(
    items.filter((item) => {
      if (!matchesRecommendFilters(item, filters, favoriteIds)) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const matchesText =
          item.address?.toLowerCase().includes(q) || item.auctionNo?.toLowerCase().includes(q);
        if (!matchesText) return false;
      }
      return true;
    }),
    sortBy,
    loanRatio,
  );

  const activeFilterCount =
    (filters.city ? 1 : 0) +
    (filters.propType ? 1 : 0) +
    (filters.maxFailureRate ? 1 : 0) +
    (filters.favoritesOnly ? 1 : 0);

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <AppHeader
        maxWidth="1400"
        nav={
          <>
            <span className={HEADER_TAB_ACTIVE}>추천 물건</span>
            <Link href="/search" className={HEADER_BTN}>
              전체 검색
            </Link>
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
              <AccountNavLink />
              <button type="button" onClick={handleLogout} className={HEADER_BTN}>
                <LogOut size={16} />
                로그아웃
              </button>
            </div>
          </>
        }
      />

      <main className="max-w-[1400px] mx-auto px-4 py-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="주소, 사건번호로 검색..."
              className="w-full h-9 pl-10 pr-4 rounded-lg bg-secondary/40 border border-transparent text-sm focus:outline-none focus:border-primary/30 focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilterModal(true)}
            className="h-9 px-4 flex items-center gap-2 rounded-lg border border-border text-sm font-normal text-foreground/70 hover:bg-secondary/60 transition-colors shrink-0"
          >
            <SlidersHorizontal size={14} />
            상세 필터
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowInvestmentModal(true)}
            className="h-9 px-4 flex items-center gap-2 rounded-lg border border-border text-sm font-normal text-foreground/70 hover:bg-secondary/60 transition-colors shrink-0"
          >
            <Wallet size={14} />
            투자정보
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            총 <span className="font-semibold text-foreground">{filteredItems.length}</span>건
          </span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="h-7 pl-3 pr-7 rounded-lg bg-secondary text-xs text-foreground/70 focus:outline-none appearance-none cursor-pointer border-0"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="카드형 보기"
                className={`w-7 h-7 flex items-center justify-center transition-colors ${
                  viewMode === "grid" ? "bg-primary text-white" : "hover:bg-secondary text-muted-foreground"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="리스트형 보기"
                className={`w-7 h-7 flex items-center justify-center transition-colors ${
                  viewMode === "list" ? "bg-primary text-white" : "hover:bg-secondary text-muted-foreground"
                }`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">추천 물건을 불러오는 중...</div>
        ) : loadError ? (
          <div className="text-center py-16 text-destructive text-sm">{loadError}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm space-y-2">
            <p>아직 추천할 물건이 없습니다.</p>
            <p className="text-[13px]">
              <Link href="/account" className="text-primary hover:underline">
                회원정보
              </Link>
              에서 투자가능자금을 입력하면 추천이 시작됩니다.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">검색 결과가 없습니다.</div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredItems.map((item) => (
              <RecommendCard
                key={item.id}
                item={item}
                loanRatio={loanRatio}
                loanPolicyLabel={loanPolicyLabel}
                isFavorite={favoriteIds.has(item.id)}
                favoriteBusy={favoriteBusy}
                onToggleFavorite={() => handleToggleFavorite(item.id, !favoriteIds.has(item.id))}
                onOpen={() => {
                  logUserAction({ itemId: item.id, actionType: "click", metadata: { recommended: true } });
                  setSelectedItem(item);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredItems.map((item) => (
              <RecommendListRow
                key={item.id}
                item={item}
                loanRatio={loanRatio}
                loanPolicyLabel={loanPolicyLabel}
                isFavorite={favoriteIds.has(item.id)}
                favoriteBusy={favoriteBusy}
                onToggleFavorite={() => handleToggleFavorite(item.id, !favoriteIds.has(item.id))}
                onOpen={() => {
                  logUserAction({ itemId: item.id, actionType: "click", metadata: { recommended: true } });
                  setSelectedItem(item);
                }}
              />
            ))}
          </div>
        )}
      </main>

      <AuctionDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        editable={false}
        isFavorite={selectedItem ? favoriteIds.has(selectedItem.id) : false}
        favoriteBusy={favoriteBusy}
        onToggleFavorite={
          selectedItem ? (next) => handleToggleFavorite(selectedItem.id, next) : undefined
        }
        onAiAnalysisClick={(row) =>
          logUserAction({ itemId: row.id, actionType: "ai_analysis_click", metadata: { recommended: true } })
        }
      />

      {showInvestmentModal && profile && (
        <InvestmentInfoModal
          profile={profile}
          onClose={() => setShowInvestmentModal(false)}
          onSaved={(updated) => {
            setProfile(updated);
            setShowInvestmentModal(false);
            loadRecommendations();
          }}
        />
      )}

      {showFilterModal && (
        <RecommendFilterModal
          filters={filters}
          favoriteCount={favoriteIds.size}
          onClose={() => setShowFilterModal(false)}
          onApply={(next) => {
            setFilters(next);
            setShowFilterModal(false);
          }}
        />
      )}
    </div>
  );
}
