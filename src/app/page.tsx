"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Heart, Calendar, SlidersHorizontal, Search, Wallet, X, LayoutGrid, List, ChevronDown } from "lucide-react";
import type { AuctionItem, UserProfile } from "@/types/auction";
import { dedupeStrategyTagsByLabel } from "@/types/auction";
import { clearAuthCookie, getLoginRedirect } from "@/lib/auth";
import {
  fetchRecommendations,
  fetchMyProfile,
  fetchFavorites,
  fetchStrategyLabelOptions,
  addFavorite,
  removeFavorite,
  logoutUser,
  logUserAction,
  logUserActionsBatch,
  updateMyProfile,
  type FavoriteItem,
} from "@/lib/api";
import { AppHeader, HEADER_BTN, HEADER_NAV_TRAILING, HEADER_TAB_ACTIVE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";
import { AuctionDetailModal } from "@/components/AuctionDetailModal";
import { CaseStateBadge } from "@/components/CaseStateBadge";
import { InvestmentInfoSection } from "@/components/InvestmentInfoSection";
import { SelectField, MoneyInputField, InvestmentGoalField, CheckboxField } from "@/components/InvestmentFormFields";
import {
  EXISTING_LOAN_OPTIONS,
  HOUSING_COUNT_OPTIONS,
  INVESTABLE_FUNDS_OPTIONS,
  TARGET_RETURN_OPTIONS,
  CREDIT_SCORE_OPTIONS,
  ANNUAL_NET_INCOME_OPTIONS,
} from "@/data/investment-options";
import { formatWonShort, parseMoneyToWon } from "@/lib/investment-money";
import { housingLoanLabel } from "@/lib/loan-policy-label";
import { estimateDefaultProfit } from "@/lib/profit-calculator";
import { RecommendCard, type LoanInfo } from "@/components/RecommendCard";
import { getFailureRateRatio, getFailureRoundCount } from "@/lib/failure-rate";
import { CITIES } from "@/data/korea-regions";
import { PROPERTY_TYPE_OPTIONS } from "@/data/property-type-options";
import {
  parseBidDate,
  progressLabelToStatus,
  isBidDateEnded,
  PROGRESS_STATUS_LABELS,
  PROGRESS_STATUS_OPTIONS,
} from "@/lib/progress-status-filter";

const fmtEok = (n: number) => {
  if (!n) return "-";
  const abs = Math.abs(n);
  if (abs >= 100000000) return `${(abs / 100000000).toFixed(2)}억`;
  if (abs >= 10000) return `${Math.round(abs / 10000).toLocaleString("ko-KR")}만`;
  return abs.toLocaleString("ko-KR");
};

const HIDDEN_SPECIAL_NOTE_PATTERNS = [/공시가/, /임차권\s*등기/];

function displaySpecialNote(specialNote: string | null | undefined): string {
  if (!specialNote || specialNote === "없음") return "";
  const visible = specialNote
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && !HIDDEN_SPECIAL_NOTE_PATTERNS.some((re) => re.test(part)));
  return visible.join("/");
}

function formatAreaLabel(area: string | null | undefined): string {
  const num = Number.parseFloat(String(area ?? "").match(/[\d.]+/)?.[0] ?? "");
  if (!Number.isFinite(num) || num <= 0) return "-";
  const pyeong = Math.round(num / 3.3);
  return `건물 전용${pyeong}평(${num}㎡)`;
}

function bidDatePresentation(bidDate: string | null | undefined, caseState: string | null | undefined) {
  const state = String(caseState ?? "").replace(/\s+/g, "");
  if (/기일변경|변경/.test(state)) {
    return { label: "기일 변경", className: "bg-slate-100 text-slate-600 border-slate-200" };
  }
  const parsed = parseBidDate(bidDate ?? "");
  if (!parsed) return { label: "일정 확인", className: "bg-slate-100 text-slate-500 border-slate-200" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  const days = Math.round((parsed.getTime() - today.getTime()) / 86_400_000);
  if (days < 0 || isBidDateEnded(bidDate ?? "", caseState ?? undefined)) {
    return { label: "입찰 종료", className: "bg-red-50 text-red-600 border-red-100" };
  }
  if (days === 0) return { label: "오늘 입찰", className: "bg-orange-100 text-orange-700 border-orange-200" };
  if (days <= 7) return { label: `D-${days}`, className: "bg-orange-50 text-orange-700 border-orange-200" };
  return { label: `D-${days}`, className: "bg-blue-50 text-blue-700 border-blue-100" };
}


/** 물건의 최종 대출금액(낙찰가 - 필요자기자금). 감정가·낙찰가·소득 기준 중
 *  가장 낮은 값이 이미 반영된 결과다. */
function finalLoanAmount(item: AuctionItem, loanInfo: LoanInfo | undefined): number | null {
  if (!loanInfo) return null;
  return item.minPrice - loanInfo.requiredEquity;
}

type RecommendFilters = {
  /** 다중 선택 가능(사용자 요청, 2026-07-23). */
  city: string[];
  propType: string[];
  maxFailureRate: string;
  favoritesOnly: boolean;
  progressStatus: string;
  strategyLabel: string[];
  minArea: string;
  maxArea: string;
};

const EMPTY_RECOMMEND_FILTERS: RecommendFilters = {
  city: [],
  propType: [],
  maxFailureRate: "",
  favoritesOnly: false,
  progressStatus: PROGRESS_STATUS_LABELS.active,
  strategyLabel: [],
  minArea: "",
  maxArea: "",
};

// favoritesOnly도 서버에 그대로 보낸다(백엔드는 이미 지원) — 예전엔
// "토글 즉시 반영을 위해" 클라이언트에서만 걸렀는데, 그러면 관심물건이
// 현재 로드된 페이지(예: 30건)에 없을 때 실제로는 다른 페이지에 있는
// 관심물건인데도 "검색 결과 없음"으로 잘못 보였다(실측: 검색어로
// 좁혀서 그 물건을 서버가 직접 찾아 반환할 때만 보이고, 검색어를
// 지우면 사라짐 — 클라이언트 필터링이 "로드된 목록 중에서만" 걸렀기
// 때문, 2026-07-24).
function toApiFilters(
  filters: RecommendFilters,
  searchText: string,
): {
  city?: string[];
  propType?: string[];
  maxFailureRate?: string;
  favoritesOnly?: boolean;
  progressStatus?: "all" | "active" | "ended";
  search?: string;
  strategyLabel?: string[];
  minArea?: number;
  maxArea?: number;
} {
  // 관심물건 보기는 상세 필터·검색과 독립된 목록 모드다. 켜져 있을 때는
  // 이전에 선택한 조건을 API로 보내지 않아 관심 등록한 전체 물건을 보여준다.
  if (filters.favoritesOnly) {
    return { favoritesOnly: true };
  }

  return {
    city: filters.city.length > 0 ? filters.city : undefined,
    propType: filters.propType.length > 0 ? filters.propType : undefined,
    maxFailureRate: filters.maxFailureRate || undefined,
    favoritesOnly: filters.favoritesOnly || undefined,
    progressStatus: progressLabelToStatus(filters.progressStatus),
    search: searchText.trim() || undefined,
    strategyLabel: filters.strategyLabel.length > 0 ? filters.strategyLabel : undefined,
    minArea: filters.minArea ? Number(filters.minArea) || undefined : undefined,
    maxArea: filters.maxArea ? Number(filters.maxArea) || undefined : undefined,
  };
}

/** 체크박스 목록으로 여러 값을 고를 수 있는 드롭다운. 선택된 항목이
 * 있으면 실제 선택한 값들을 콤마로 나열해서, 없으면 placeholder
 * ("전체")로 표시한다(사용자 요청: 지역/물건종류/투자 전략 중복 선택,
 * "N개 선택" 대신 실제 값 표시, 2026-07-23). */
function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function toggle(value: string) {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={selected.length > 0 ? selected.join(", ") : undefined}
        className="w-full h-10 px-3 border border-border rounded-sm bg-card text-foreground text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <span className={`truncate ${selected.length === 0 ? "text-muted-foreground" : ""}`}>
          {selected.length === 0 ? "전체" : selected.join(", ")}
        </span>
        <ChevronDown size={16} className="text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto border border-border rounded-sm bg-card shadow-lg py-1">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="accent-primary"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function RecommendFilterModal({
  filters,
  strategyLabelOptions,
  onClose,
  onApply,
}: {
  filters: RecommendFilters;
  strategyLabelOptions: string[];
  onClose: () => void;
  onApply: (next: RecommendFilters) => void;
}) {
  const [city, setCity] = useState(filters.city);
  const [propType, setPropType] = useState(filters.propType);
  const [maxFailureRate, setMaxFailureRate] = useState(filters.maxFailureRate);
  const [progressStatus, setProgressStatus] = useState(filters.progressStatus);
  const [strategyLabel, setStrategyLabel] = useState(filters.strategyLabel);
  const [minArea, setMinArea] = useState(filters.minArea);
  const [maxArea, setMaxArea] = useState(filters.maxArea);

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
          <div className="space-y-1.5">
            <span className="text-muted-foreground text-[13px]">지역</span>
            <MultiSelectDropdown label="지역" options={CITIES} selected={city} onChange={setCity} />
          </div>

          <div className="space-y-1.5">
            <span className="text-muted-foreground text-[13px]">물건종류</span>
            <MultiSelectDropdown
              label="물건종류"
              options={[...PROPERTY_TYPE_OPTIONS]}
              selected={propType}
              onChange={setPropType}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-muted-foreground text-[13px]">전용면적(㎡)</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={minArea}
                onChange={(e) => setMinArea(e.target.value)}
                placeholder="최소"
                className="w-full h-10 px-3 border border-border rounded-sm bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-muted-foreground text-sm shrink-0">~</span>
              <input
                type="number"
                inputMode="decimal"
                value={maxArea}
                onChange={(e) => setMaxArea(e.target.value)}
                placeholder="최대"
                className="w-full h-10 px-3 border border-border rounded-sm bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

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

          <label className="block text-sm space-y-1.5">
            <span className="text-muted-foreground text-[13px]">진행상태</span>
            <select
              value={progressStatus}
              onChange={(e) => setProgressStatus(e.target.value)}
              className="w-full h-10 px-3 border border-border rounded-sm bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {PROGRESS_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          {strategyLabelOptions.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-muted-foreground text-[13px]">투자 전략</span>
              <MultiSelectDropdown
                label="투자 전략"
                options={strategyLabelOptions}
                selected={strategyLabel}
                onChange={setStrategyLabel}
              />
            </div>
          )}

        </div>

        <div className="flex justify-between gap-2 mt-6">
          <button
            type="button"
            onClick={() => {
              setCity([]);
              setPropType([]);
              setMaxFailureRate("");
              setProgressStatus(PROGRESS_STATUS_LABELS.active);
              setStrategyLabel([]);
              setMinArea("");
              setMaxArea("");
            }}
            className="px-4 py-2 text-sm font-medium border border-border rounded-sm hover:bg-secondary transition-colors"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={() =>
              onApply({
                city,
                propType,
                maxFailureRate,
                favoritesOnly: filters.favoritesOnly,
                progressStatus,
                strategyLabel,
                minArea,
                maxArea,
              })
            }
            className="px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent transition-colors"
          >
            필터 적용
          </button>
        </div>
      </div>
    </div>
  );
}

function WelcomeGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/45" onClick={onClose}>
      <div
        className="relative w-full max-w-sm bg-card border border-border rounded-sm shadow-xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-foreground mb-3">
          회원님의 투자정보를 바탕으로 추천된 물건입니다.
        </h2>
        <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">
          '투자정보'에서 자금, 지역, 투자목적을 변경하면 추천 결과도 함께 변경됩니다.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent transition-colors"
        >
          확인
        </button>
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
  const [creditScore, setCreditScore] = useState(profile.creditScore ?? "");
  const [annualNetIncome, setAnnualNetIncome] = useState(profile.annualNetIncome ?? "");
  const [targetReturn, setTargetReturn] = useState(profile.targetReturn ?? "");
  const [investmentGoal, setInvestmentGoal] = useState(profile.investmentGoal ?? "");
  const [firstTimeBuyer, setFirstTimeBuyer] = useState(profile.firstTimeBuyer ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // 목표 수익은 선택 항목이라 제외 — 비워두지 못하게 막을 필수 필드만 담는다.
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());

  async function handleSave() {
    const trimmedInvestableFunds = investableFunds.trim();
    const trimmedExistingLoanAmount = existingLoanAmount.trim();
    const trimmedCreditScore = creditScore.trim();
    const trimmedAnnualNetIncome = annualNetIncome.trim();
    const trimmedTargetReturn = targetReturn.trim();
    const trimmedInvestmentGoal = investmentGoal.trim();
    const parsedHousingCount = Number.parseInt(housingCount, 10);

    const missing = new Set<string>();
    if (!trimmedInvestableFunds) missing.add("investableFunds");
    if (!trimmedExistingLoanAmount) missing.add("existingLoanAmount");
    if (!trimmedCreditScore) missing.add("creditScore");
    if (!trimmedAnnualNetIncome) missing.add("annualNetIncome");
    if (!trimmedInvestmentGoal) missing.add("investmentGoal");
    if (Number.isNaN(parsedHousingCount) || parsedHousingCount < 0) {
      missing.add("housingCount");
    }

    if (missing.size > 0) {
      setInvalidFields(missing);
      setError(
        missing.has("housingCount") && missing.size === 1
          ? "주택수는 0 이상의 숫자로 입력해 주세요."
          : "빨간색으로 표시된 항목을 입력해 주세요.",
      );
      return;
    }

    setInvalidFields(new Set());
    setSaving(true);
    setError("");
    try {
      const updated = await updateMyProfile({
        investableFunds: trimmedInvestableFunds,
        existingLoanAmount: trimmedExistingLoanAmount,
        housingCount: parsedHousingCount,
        creditScore: trimmedCreditScore,
        annualNetIncome: trimmedAnnualNetIncome,
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
          <MoneyInputField
            label="투자가능자금"
            placeholder="투자가능자금 선택"
            value={investableFunds}
            onChange={(v) => {
              setInvestableFunds(v);
              setInvalidFields((prev) => {
                const next = new Set(prev);
                next.delete("investableFunds");
                return next;
              });
            }}
            options={INVESTABLE_FUNDS_OPTIONS}
            invalid={invalidFields.has("investableFunds")}
          />
          <MoneyInputField
            label="연순소득"
            placeholder="연순소득 선택"
            value={annualNetIncome}
            onChange={(v) => {
              setAnnualNetIncome(v);
              setInvalidFields((prev) => {
                const next = new Set(prev);
                next.delete("annualNetIncome");
                return next;
              });
            }}
            options={ANNUAL_NET_INCOME_OPTIONS}
            hint="* 매출이 아닌 순소득정보입니다."
            invalid={invalidFields.has("annualNetIncome")}
          />
          <MoneyInputField
            label="기존대출금액"
            placeholder="기존대출금액 선택"
            value={existingLoanAmount}
            onChange={(v) => {
              setExistingLoanAmount(v);
              setInvalidFields((prev) => {
                const next = new Set(prev);
                next.delete("existingLoanAmount");
                return next;
              });
            }}
            options={EXISTING_LOAN_OPTIONS}
            invalid={invalidFields.has("existingLoanAmount")}
          />
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <SelectField
                label="주택수"
                placeholder="보유 주택수 선택"
                value={housingCount}
                onChange={(v) => {
                  setHousingCount(v);
                  if (v !== "0") setFirstTimeBuyer(false);
                  setInvalidFields((prev) => {
                    const next = new Set(prev);
                    next.delete("housingCount");
                    return next;
                  });
                }}
                options={HOUSING_COUNT_OPTIONS}
                invalid={invalidFields.has("housingCount")}
              />
            </div>
            <div className={`h-11 flex items-center ${housingCount !== "0" ? "opacity-40 pointer-events-none" : ""}`}>
              <CheckboxField
                label="생애최초 주택구입"
                checked={firstTimeBuyer}
                onChange={setFirstTimeBuyer}
              />
            </div>
          </div>
          <SelectField
            label="신용점수"
            placeholder="신용점수 선택"
            value={creditScore}
            onChange={(v) => {
              setCreditScore(v);
              setInvalidFields((prev) => {
                const next = new Set(prev);
                next.delete("creditScore");
                return next;
              });
            }}
            options={CREDIT_SCORE_OPTIONS}
            hint="* 나이스/KCB 신용점수는 토스/카카오를 통해 확인가능합니다."
            invalid={invalidFields.has("creditScore")}
          />
          <SelectField
            label="목표 수익 (선택)"
            placeholder="목표 수익 선택 — 선택 안 하면 필터 없이 추천"
            value={targetReturn}
            onChange={setTargetReturn}
            options={TARGET_RETURN_OPTIONS}
          />
          <InvestmentGoalField
            value={investmentGoal}
            onChange={(v) => {
              setInvestmentGoal(v);
              setInvalidFields((prev) => {
                const next = new Set(prev);
                next.delete("investmentGoal");
                return next;
              });
            }}
            invalid={invalidFields.has("investmentGoal")}
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

function RecommendListRow({
  item,
  loanInfo,
  firstTimeBuyer,
  availableCapital,
  isFavorite,
  favoriteBusy,
  onToggleFavorite,
  onOpen,
}: {
  item: AuctionItem;
  loanInfo: LoanInfo | undefined;
  firstTimeBuyer: boolean;
  availableCapital: number | null;
  isFavorite: boolean;
  favoriteBusy: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
}) {
  const requiredEquity = loanInfo?.requiredEquity ?? null;
  const bidTiming = bidDatePresentation(item.bidDate, item.caseState);
  const loanAmount = finalLoanAmount(item, loanInfo);
  const loanPolicyLabel = loanInfo
    ? housingLoanLabel(loanInfo.loanPolicyLabel, firstTimeBuyer)
    : null;
  const failureRate = getFailureRateRatio(item.minPrice, item.appraisedValue);
  const failureCount = getFailureRoundCount(item.minPrice, item.appraisedValue, item.city);
  const isNew = failureRate === 100;
  const capitalUsageRatio = requiredEquity != null && availableCapital != null && availableCapital > 0
    ? (requiredEquity / availableCapital) * 100
    : null;
  const capitalBuffer = requiredEquity != null && availableCapital != null
    ? availableCapital - requiredEquity
    : null;
  const fitLabel = capitalUsageRatio == null
    ? "조건 확인"
    : capitalUsageRatio <= 70
      ? "조건 여유"
      : capitalUsageRatio <= 90
        ? "조건 충족"
        : "조건 경계";
  const recommendationReasons = [
    capitalBuffer != null
      ? capitalBuffer >= 0
        ? `투자가능자금 내 · ${formatWonShort(capitalBuffer)} 여유`
        : `필요자금 ${formatWonShort(Math.abs(capitalBuffer))} 초과`
      : null,
    loanInfo
      ? loanInfo.loanUnavailable
        ? "대출 조건 확인 필요"
        : `${loanInfo.regulatedArea ? "규제지역" : "비규제지역"} 대출 기준 반영`
      : null,
  ].filter((reason): reason is string => Boolean(reason));

  const isApartment = item.usage === "아파트";

  return (
    <div className="bg-card border border-border rounded-2xl p-4 md:px-5 md:py-4 hover:border-primary/25 hover:shadow-md hover:shadow-[rgba(30,58,95,0.08)] hover:-translate-y-px transition-all duration-150 group">
      <div className="flex items-start gap-3 md:gap-4">
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="flex items-start gap-3 md:gap-4">
        <div className="w-24 h-20 md:w-28 md:h-24 rounded-xl overflow-hidden flex-shrink-0 bg-secondary">
          <img
            src={
              isApartment ? "/thumb-apartment.jpg" : "/thumb-villa.jpg"
            }
            alt={item.usage || "물건"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[0.7rem] font-medium text-muted-foreground mb-1.5">{item.auctionNo}</p>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="shrink-0 px-1.5 py-px rounded text-[0.62rem] font-semibold border bg-[#EEF4FF] text-[#2A5298] border-transparent">
              {item.usage || "물건"}
            </span>
            <CaseStateBadge caseState={item.caseState} />
            {isNew ? (
              <span className="shrink-0 px-1.5 py-px rounded text-[0.62rem] font-medium border bg-blue-50 text-blue-700 border-blue-100">
                신건
              </span>
            ) : failureRate != null ? (
              <span className="shrink-0 px-1.5 py-px rounded text-[0.62rem] font-medium border bg-amber-50 text-amber-700 border-amber-100">
                유찰 {failureCount}회<span className="hidden sm:inline"> · {failureRate}%</span>
              </span>
            ) : null}
            {displaySpecialNote(item.specialNote) && (
              <span className="min-w-0 px-1.5 py-px rounded text-[0.62rem] font-medium border bg-red-50 text-red-600 border-red-100 truncate">
                {displaySpecialNote(item.specialNote)}
              </span>
            )}
          </div>
          <p className="font-semibold text-sm md:text-[0.95rem] text-foreground truncate">{item.address}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.72rem] text-muted-foreground">
            <span className="truncate">{formatAreaLabel(item.area)}</span>
            <span>·</span>
            <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[0.6rem] font-bold ${bidTiming.className}`}>{bidTiming.label}</span>
            <span className={`shrink-0 ${bidTiming.label === "입찰 종료" ? "text-red-600 font-medium" : ""}`}>{item.bidDate || "-"}</span>
          </div>
          {item.strategyTagsList && item.strategyTagsList.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {dedupeStrategyTagsByLabel(item.strategyTagsList).map((tag) => (
                <span
                  key={tag.code}
                  title={tag.description}
                  className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full text-[0.62rem] font-semibold"
                  style={{
                    background: "linear-gradient(135deg,#F5F0FF,#FBF6FF)",
                    border: "1px solid rgba(147,51,234,0.18)",
                    color: "#7E22CE",
                  }}
                >
                  <span aria-hidden>💎</span>
                  {tag.label}
                </span>
              ))}
            </div>
          )}
          {recommendationReasons.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem]">
              <span className={`rounded-full px-2 py-0.5 font-bold ${capitalUsageRatio != null && capitalUsageRatio > 90 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                {fitLabel}
              </span>
              <span className="font-semibold text-primary">추천 이유</span>
              <span className="text-muted-foreground">{recommendationReasons.join(" · ")}</span>
            </div>
          )}
        </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 md:hidden">
          <ListPriceMetric label="최소 투자금" value={requiredEquity != null ? formatWonShort(requiredEquity) : "-"} primary />
          <ListPriceMetric label="예상대출" value={loanAmount != null && loanAmount > 0 ? formatWonShort(loanAmount) : "-"} />
          <ListPriceMetric label="최저입찰가" value={fmtEok(item.minPrice)} />
          <ListPriceMetric label="감정가" value={fmtEok(item.appraisedValue)} muted />
        </div>
      </button>

        <div className="hidden md:grid flex-shrink-0 grid-cols-[9rem_8rem_7rem_7rem] items-center gap-3 self-stretch">
          {requiredEquity != null && (
            <div
              className="px-3 py-2.5 text-right"
              style={{
                background: "linear-gradient(135deg,#EEF4FF,#F0F5FF)",
                border: "1px solid rgba(42,82,152,0.12)",
                borderRadius: "0.75rem",
              }}
            >
              <div className="flex items-center justify-end gap-1 mb-0.5">
                {loanInfo && (
                  <span
                    className={`px-1 py-0.5 rounded text-[0.55rem] font-semibold ${
                      loanInfo.regulatedArea
                        ? "bg-red-50 text-red-600"
                        : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    {loanInfo.regulatedArea ? "규제지역" : "비규제지역"}
                  </span>
                )}
                <p className="text-[0.62rem] font-semibold text-muted-foreground uppercase tracking-wide">최소 투자금</p>
              </div>
              <p className="font-bold text-primary text-sm" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
                {formatWonShort(requiredEquity)}
              </p>
            </div>
          )}

          {loanInfo?.loanUnavailable ? (
            <div className="text-right flex-shrink-0 hidden lg:block">
              <p className="text-[0.62rem] text-red-500 font-semibold whitespace-nowrap">
                {loanPolicyLabel} · 대출불가
              </p>
            </div>
          ) : (
            loanPolicyLabel && loanAmount != null && loanAmount > 0 && (
              <div className="text-right flex-shrink-0 hidden lg:block">
                <p className="text-[0.62rem] text-muted-foreground mb-0.5 whitespace-nowrap">{loanPolicyLabel} 예상대출</p>
                <p className="font-semibold text-sm text-foreground/80" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
                  {formatWonShort(loanAmount)}
                </p>
              </div>
            )
          )}

          <div className="text-right">
            <p className="text-[0.62rem] text-muted-foreground mb-0.5 whitespace-nowrap">최저입찰가</p>
            <p className="font-semibold text-sm text-foreground/80" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
              {fmtEok(item.minPrice)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[0.62rem] text-muted-foreground mb-0.5 whitespace-nowrap">감정가</p>
            <p className="text-sm text-foreground/50" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
              {fmtEok(item.appraisedValue)}
            </p>
          </div>
        </div>

      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          disabled={favoriteBusy}
          aria-label={isFavorite ? "관심물건 해제" : "관심물건 추가"}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <Heart size={16} className={isFavorite ? "fill-rose-500 text-rose-500" : "text-muted-foreground"} />
        </button>
        <button type="button" onClick={onOpen} className="hidden lg:block whitespace-nowrap text-[0.68rem] font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
          상세보기 →
        </button>
      </div>
      </div>
    </div>
  );
}

function ListPriceMetric({ label, value, primary = false, muted = false }: { label: string; value: string; primary?: boolean; muted?: boolean }) {
  return (
    <div className="rounded-lg bg-secondary/35 px-3 py-2">
      <p className="text-[0.62rem] text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-bold ${primary ? "text-primary" : muted ? "text-foreground/55" : "text-foreground/80"}`} style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
        {value}
      </p>
    </div>
  );
}

const PAGE_SIZE = 30;

const SORT_OPTIONS = ["최신순", "실투자금낮은순", "입찰기일순", "최저가낮은순", "감정가높은순"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

function sortRecommendItems(
  items: AuctionItem[],
  sortBy: SortOption,
  loanInfoByItemId: Record<string, LoanInfo>,
): AuctionItem[] {
  const withEquity = (item: AuctionItem) => loanInfoByItemId[item.id]?.requiredEquity ?? item.minPrice;
  const bidTime = (item: AuctionItem) => {
    const parsed = parseBidDate(item.bidDate ?? "");
    return parsed ? parsed.getTime() : Infinity;
  };

  const sorted = [...items];
  switch (sortBy) {
    case "실투자금낮은순":
      return sorted.sort((a, b) => withEquity(a) - withEquity(b));
    case "입찰기일순":
      return sorted.sort((a, b) => bidTime(a) - bidTime(b));
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentBudget, setCurrentBudget] = useState<string | undefined>(undefined);
  const [creditScoreWarning, setCreditScoreWarning] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const [favoriteCategoryFilter, setFavoriteCategoryFilter] = useState<string | null>(null);
  const [loanInfoByItemId, setLoanInfoByItemId] = useState<Record<string, LoanInfo>>({});
  const [showInvestmentModal, setShowInvestmentModal] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<RecommendFilters>(EMPTY_RECOMMEND_FILTERS);
  const [sortBy, setSortBy] = useState<SortOption>("입찰기일순");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(false);
  const [strategyLabelOptions, setStrategyLabelOptions] = useState<string[]>([]);

  const isAdmin = profile?.role === "admin";
  const isConsultant = profile?.role === "consultant";

  useEffect(() => {
    fetchMyProfile()
      .then((data) => {
        setProfile(data);
        const guideKey = `welcomeGuideSeen:${data.id}`;
        if (typeof window !== "undefined" && !window.localStorage.getItem(guideKey)) {
          setShowWelcomeGuide(true);
        }
      })
      .catch(() => {});
    fetchFavorites()
      .then(setFavorites)
      .catch(() => {});
    fetchStrategyLabelOptions()
      .then((items) => setStrategyLabelOptions(items.map((item) => item.label)))
      .catch(() => {});
  }, []);

  function dismissWelcomeGuide() {
    setShowWelcomeGuide(false);
    if (profile && typeof window !== "undefined") {
      window.localStorage.setItem(`welcomeGuideSeen:${profile.id}`, "1");
    }
  }

  function loadRecommendations(budget?: string) {
    setLoading(true);
    setLoadError("");
    setCurrentBudget(budget);
    fetchRecommendations(
      budget,
      { limit: PAGE_SIZE, offset: 0 },
      toApiFilters(filters, debouncedSearchText),
    )
      .then((res) => {
        setItems(res.items);
        setLoanInfoByItemId((prev) => ({ ...prev, ...res.loanInfoByItemId }));
        setHasMore(res.hasMore);
        setCreditScoreWarning(res.creditScoreWarning);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "추천 물건을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }

  function loadMoreRecommendations() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchRecommendations(
      currentBudget,
      { limit: PAGE_SIZE, offset: items.length },
      toApiFilters(filters, debouncedSearchText),
    )
      .then((res) => {
        setItems((prev) => [...prev, ...res.items]);
        setLoanInfoByItemId((prev) => ({ ...prev, ...res.loanInfoByItemId }));
        setHasMore(res.hasMore);
      })
      .catch(() => {
        // 추가 로드 실패는 조용히 무시(다음 스크롤에서 재시도 가능하도록 hasMore 유지)
      })
      .finally(() => setLoadingMore(false));
  }

  // 검색어 입력은 타이핑마다 서버에 요청하지 않도록 디바운스한다.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchText(searchText), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  // 최초 진입 시, 그리고 필터/검색어가 바뀔 때마다 서버에 새 조건으로 첫
  // 페이지부터 다시 요청한다(currentBudget은 의도적으로 deps에서 제외 —
  // 예산 변경은 handleApplyRecommend 등에서 loadRecommendations를 직접 호출).
  useEffect(() => {
    loadRecommendations(currentBudget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, debouncedSearchText]);

  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(loadMoreRecommendations);
  loadMoreRef.current = loadMoreRecommendations;

  useEffect(() => {
    if (!sentinelEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [sentinelEl]);

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

  async function handleToggleFavorite(auctionId: string, next: boolean, category?: string | null, memo?: string | null) {
    setFavoriteBusyId(auctionId);
    try {
      if (next) {
        await addFavorite(auctionId, category, memo);
        setFavorites((prev) => [
          ...prev.filter((f) => f.auctionId !== auctionId),
          { auctionId, category: category?.trim() || null, memo: memo?.trim() || null },
        ]);
      } else {
        await removeFavorite(auctionId);
        setFavorites((prev) => prev.filter((f) => f.auctionId !== auctionId));
      }
    } finally {
      setFavoriteBusyId(null);
    }
  }

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.auctionId)), [favorites]);
  const favoriteById = useMemo(() => {
    const map = new Map<string, FavoriteItem>();
    for (const f of favorites) map.set(f.auctionId, f);
    return map;
  }, [favorites]);
  // 관심등록 시 카테고리를 지정하지 않은 물건은 favorites/page.tsx와 동일하게
  // "미분류"로 묶어 필터 칩에 노출한다(사용자 요청, 2026-08-04: "관심물건을
  // 누를때 카테고리별로도 물건을 볼 수 있게 해줘").
  const FAVORITE_UNCATEGORIZED = "미분류";
  const favoriteCategories = useMemo(() => {
    const set = new Set<string>();
    for (const f of favorites) if (f.category) set.add(f.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [favorites]);

  const filteredItems = sortRecommendItems(items, sortBy, loanInfoByItemId).filter((item) => {
    if (!filters.favoritesOnly || !favoriteCategoryFilter) return true;
    const category = favoriteById.get(item.id)?.category?.trim() || FAVORITE_UNCATEGORIZED;
    return category === favoriteCategoryFilter;
  });
  const availableCapital = parseMoneyToWon(currentBudget ?? profile?.investableFunds ?? "");

  const activeFilterCount =
    (filters.city.length > 0 ? 1 : 0) +
    (filters.propType.length > 0 ? 1 : 0) +
    (filters.maxFailureRate ? 1 : 0) +
    (filters.progressStatus !== PROGRESS_STATUS_LABELS.active ? 1 : 0) +
    (filters.strategyLabel.length > 0 ? 1 : 0) +
    (filters.minArea || filters.maxArea ? 1 : 0);

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <div className="sm:sticky sm:top-0 z-50">
        <AppHeader
          maxWidth="1400"
          nav={
            <>
              <span className={HEADER_TAB_ACTIVE}>추천 물건</span>
              {isAdmin && (
                <Link href="/search" className={HEADER_BTN}>
                  전체 검색
                </Link>
              )}
              {isConsultant && (
                <Link href="/consultant" className={HEADER_BTN}>
                  컨설턴트
                </Link>
              )}
              <Link href="/courses" className={HEADER_BTN}>
                강의실
              </Link>
              <Link href="/favorites" className={HEADER_BTN}>
                내 물건
              </Link>
              <div className={HEADER_NAV_TRAILING}>
                {isAdmin && (
                  <Link href="/admin" className={HEADER_BTN}>
                    관리자
                  </Link>
                )}
                <AccountNavLink name={profile?.name} />
                <button type="button" onClick={handleLogout} className={HEADER_BTN} aria-label="로그아웃">
                  <LogOut size={16} />
                  <span className="hidden sm:inline">로그아웃</span>
                </button>
              </div>
            </>
          }
        />
      </div>

      <div className="sticky top-0 sm:top-14 z-40">
        <div className="bg-white" style={{ borderTop: "1px solid rgba(30,58,95,0.08)", borderBottom: "1px solid rgba(30,58,95,0.08)" }}>
          <div className="max-w-[1400px] mx-auto px-4 py-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3 sm:flex-wrap">
            <div className="flex items-center gap-2 sm:contents">
              <div className="relative flex-1 min-w-0 sm:flex-none sm:w-[280px] sm:shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="주소, 사건번호로 검색..."
                  className="w-full h-9 pl-10 pr-4 border border-transparent text-sm focus:outline-none focus:border-primary/30 focus:ring-2 focus:ring-primary/10 transition-all"
                  style={{ background: "#F4F6F9", borderRadius: "0.5rem" }}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowFilterModal(true)}
                className="h-9 px-3 sm:px-4 flex items-center gap-1.5 sm:gap-2 border border-border text-sm font-normal text-foreground/70 hover:bg-secondary/60 transition-colors shrink-0"
                style={{ borderRadius: "0.5rem" }}
              >
                <SlidersHorizontal size={14} />
                <span>상세 필터</span>
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowInvestmentModal(true)}
                className="h-9 px-3 sm:px-4 flex items-center gap-1.5 sm:gap-2 border border-border text-sm font-normal text-foreground/70 hover:bg-secondary/60 transition-colors shrink-0"
                style={{ borderRadius: "0.5rem" }}
              >
                <Wallet size={14} />
                <span>투자정보</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFavoriteCategoryFilter(null);
                  setFilters((current) => ({
                    ...current,
                    favoritesOnly: !current.favoritesOnly,
                  }));
                }}
                aria-pressed={filters.favoritesOnly}
                className={`h-9 px-3 sm:px-4 flex items-center gap-1.5 sm:gap-2 border text-sm font-medium transition-colors shrink-0 ${
                  filters.favoritesOnly
                    ? "border-rose-300 bg-rose-50 text-rose-700"
                    : "border-border text-foreground/70 hover:bg-secondary/60"
                }`}
                style={{ borderRadius: "0.5rem" }}
              >
                <Heart size={14} fill={filters.favoritesOnly ? "currentColor" : "none"} />
                <span className="hidden sm:inline">관심물건</span>
                <span className="sm:hidden">관심</span>
                <span className="text-[11px]">({favoriteIds.size})</span>
              </button>
            </div>

            {filters.favoritesOnly && favoriteCategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 w-full">
                <button
                  type="button"
                  onClick={() => setFavoriteCategoryFilter(null)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    favoriteCategoryFilter === null
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-secondary/60"
                  }`}
                >
                  전체
                </button>
                {favoriteCategories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFavoriteCategoryFilter(c)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      favoriteCategoryFilter === c
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:bg-secondary/60"
                    }`}
                  >
                    {c}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setFavoriteCategoryFilter(FAVORITE_UNCATEGORIZED)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    favoriteCategoryFilter === FAVORITE_UNCATEGORIZED
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-secondary/60"
                  }`}
                >
                  미분류
                </button>
              </div>
            )}

            <div className="hidden sm:block flex-1" />

            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">
                총 <span className="font-semibold text-foreground">{filteredItems.length}</span>건
              </span>
              <div className="relative shrink-0">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="h-7 pl-3 pr-7 bg-secondary text-xs text-foreground/70 focus:outline-none appearance-none cursor-pointer border-0"
                  style={{ borderRadius: "0.5rem" }}
                >
                  {SORT_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              </div>
              <div className="flex items-center border border-border overflow-hidden shrink-0" style={{ borderRadius: "0.5rem" }}>
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
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
        {creditScoreWarning && (
          <div className="text-sm px-4 py-3 rounded-sm border border-amber-200 bg-amber-50 text-amber-800">
            신용점수가 750점 미만으로 등록되어 있습니다. 아래 추천 물건은 대출 비율 기준으로
            계산된 것이며, 실제 대출 승인은 신용점수에 따라 제한되거나 불가능할 수 있습니다.
          </div>
        )}
        <div className="flex sm:hidden items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground shrink-0">
            총 <span className="font-semibold text-foreground">{filteredItems.length}</span>건
          </span>
          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="h-7 pl-3 pr-7 bg-secondary text-xs text-foreground/70 focus:outline-none appearance-none cursor-pointer border-0"
                style={{ borderRadius: "0.5rem" }}
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>
            <div className="flex items-center border border-border overflow-hidden shrink-0" style={{ borderRadius: "0.5rem" }}>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
            {filteredItems.map((item) => (
              <RecommendCard
                key={item.id}
                item={item}
                loanInfo={loanInfoByItemId[item.id]}
                firstTimeBuyer={profile?.firstTimeBuyer ?? false}
                housingCount={profile?.housingCount}
                availableCapital={availableCapital}
                isFavorite={favoriteIds.has(item.id)}
                favoriteBusy={favoriteBusyId === item.id}
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
                loanInfo={loanInfoByItemId[item.id]}
                firstTimeBuyer={profile?.firstTimeBuyer ?? false}
                availableCapital={availableCapital}
                isFavorite={favoriteIds.has(item.id)}
                favoriteBusy={favoriteBusyId === item.id}
                onToggleFavorite={() => handleToggleFavorite(item.id, !favoriteIds.has(item.id))}
                onOpen={() => {
                  logUserAction({ itemId: item.id, actionType: "click", metadata: { recommended: true } });
                  setSelectedItem(item);
                }}
              />
            ))}
          </div>
        )}

        {!loading && filteredItems.length > 0 && (
          <div ref={setSentinelEl} className="py-8 text-center">
            {loadingMore ? (
              <p className="text-sm text-muted-foreground">더 불러오는 중...</p>
            ) : !hasMore ? (
              <p className="text-sm text-muted-foreground">모든 추천 물건을 불러왔습니다.</p>
            ) : null}
          </div>
        )}
      </main>

      <AuctionDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        editable={false}
        isAdmin={isAdmin}
        isFavorite={selectedItem ? favoriteIds.has(selectedItem.id) : false}
        favoriteBusy={selectedItem ? favoriteBusyId === selectedItem.id : false}
        favoriteMemo={selectedItem ? favoriteById.get(selectedItem.id)?.memo ?? null : null}
        favoriteCategory={selectedItem ? favoriteById.get(selectedItem.id)?.category ?? null : null}
        onToggleFavorite={
          selectedItem
            ? (next, category, memo) => handleToggleFavorite(selectedItem.id, next, category, memo)
            : undefined
        }
        onAiAnalysisClick={(row) =>
          logUserAction({ itemId: row.id, actionType: "ai_analysis_click", metadata: { recommended: true } })
        }
        loanRatio={selectedItem ? loanInfoByItemId[selectedItem.id]?.loanRatio ?? null : null}
        loanPolicyLabel={
          selectedItem ? loanInfoByItemId[selectedItem.id]?.loanPolicyLabel ?? null : null
        }
        requiredEquity={
          selectedItem ? loanInfoByItemId[selectedItem.id]?.requiredEquity ?? null : null
        }
        appraisalRatio={
          selectedItem ? loanInfoByItemId[selectedItem.id]?.appraisalRatio ?? null : null
        }
        regulatedArea={
          selectedItem ? loanInfoByItemId[selectedItem.id]?.regulatedArea ?? null : null
        }
        housingCount={profile?.housingCount}
        incomeLoanLimit={
          selectedItem ? loanInfoByItemId[selectedItem.id]?.incomeLoanLimit ?? null : null
        }
        existingLoanWon={
          selectedItem
            ? (loanInfoByItemId[selectedItem.id]?.existingLoanWon ?? 0) +
              (loanInfoByItemId[selectedItem.id]?.roomDeductionWon ?? 0)
            : null
        }
        firstTimeBuyer={profile?.firstTimeBuyer ?? false}
        annualNetIncome={profile?.annualNetIncome ?? null}
        creditScore={profile?.creditScore ?? null}
        aiAnalysisLimit={profile?.aiAnalysisLimit}
        aiAnalysisUsed={profile?.aiAnalysisUsed}
        onAiAnalysisUsed={() =>
          setProfile((prev) =>
            prev ? { ...prev, aiAnalysisUsed: (prev.aiAnalysisUsed ?? 0) + 1 } : prev,
          )
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
          strategyLabelOptions={strategyLabelOptions}
          onClose={() => setShowFilterModal(false)}
          onApply={(next) => {
            setFilters(next);
            setShowFilterModal(false);
          }}
        />
      )}

      {showWelcomeGuide && <WelcomeGuideModal onClose={dismissWelcomeGuide} />}
    </div>
  );
}
