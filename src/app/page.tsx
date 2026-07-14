"use client";

import { useEffect, useRef, useState } from "react";
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
import { SelectField, InvestmentGoalField, CheckboxField } from "@/components/InvestmentFormFields";
import {
  EXISTING_LOAN_OPTIONS,
  HOUSING_COUNT_OPTIONS,
  INVESTABLE_FUNDS_OPTIONS,
  TARGET_RETURN_OPTIONS,
  CREDIT_SCORE_OPTIONS,
  ANNUAL_NET_INCOME_OPTIONS,
} from "@/data/investment-options";
import { formatWonShort } from "@/lib/investment-money";
import { housingLoanLabel } from "@/lib/loan-policy-label";
import { estimateDefaultProfit } from "@/lib/profit-calculator";

type LoanInfo = {
  loanRatio: number;
  appraisalRatio: number;
  loanPolicyLabel: string;
  requiredEquity: number;
  regulatedArea: boolean;
  incomeLoanLimit: number | null;
  existingLoanWon: number;
};
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


/** 물건의 최종 대출금액(낙찰가 - 필요자기자금). 감정가·낙찰가·소득 기준 중
 *  가장 낮은 값이 이미 반영된 결과다. */
function finalLoanAmount(item: AuctionItem, loanInfo: LoanInfo | undefined): number | null {
  if (!loanInfo) return null;
  return item.minPrice - loanInfo.requiredEquity;
}

type RecommendFilters = {
  city: string;
  propType: string;
  maxFailureRate: string;
  favoritesOnly: boolean;
  progressStatus: string;
};

const EMPTY_RECOMMEND_FILTERS: RecommendFilters = {
  city: "",
  propType: "",
  maxFailureRate: "",
  favoritesOnly: false,
  progressStatus: PROGRESS_STATUS_LABELS.active,
};

// favoritesOnly는 토글 즉시 반영을 위해 서버로 보내지 않고 클라이언트에서만
// 필터링한다(나머지는 서버에서 걸러 정확히 PAGE_SIZE만큼 채워서 온다).
function toApiFilters(
  filters: RecommendFilters,
  searchText: string,
): {
  city?: string;
  propType?: string;
  maxFailureRate?: string;
  progressStatus?: "all" | "active" | "ended";
  search?: string;
} {
  return {
    city: filters.city || undefined,
    propType: filters.propType || undefined,
    maxFailureRate: filters.maxFailureRate || undefined,
    progressStatus: progressLabelToStatus(filters.progressStatus),
    search: searchText.trim() || undefined,
  };
}

// city/propType/maxFailureRate/progressStatus/search와 목표수익(추정 수익) 필터는
// 이제 서버에서 필터링된 결과로 오므로, 여기서는 즉시 반영이 필요한 favoritesOnly만
// 클라이언트에서 걸러낸다.
function matchesRecommendFilters(
  item: AuctionItem,
  filters: RecommendFilters,
  favoriteIds: Set<string>,
): boolean {
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
  const [progressStatus, setProgressStatus] = useState(filters.progressStatus);

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
              setProgressStatus(PROGRESS_STATUS_LABELS.active);
            }}
            className="px-4 py-2 text-sm font-medium border border-border rounded-sm hover:bg-secondary transition-colors"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={() => onApply({ city, propType, maxFailureRate, favoritesOnly, progressStatus })}
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

  async function handleSave() {
    const trimmedInvestableFunds = investableFunds.trim();
    const trimmedExistingLoanAmount = existingLoanAmount.trim();
    const trimmedCreditScore = creditScore.trim();
    const trimmedAnnualNetIncome = annualNetIncome.trim();
    const trimmedTargetReturn = targetReturn.trim();
    const trimmedInvestmentGoal = investmentGoal.trim();
    const parsedHousingCount = Number.parseInt(housingCount, 10);

    if (
      !trimmedInvestableFunds ||
      !trimmedExistingLoanAmount ||
      !trimmedCreditScore ||
      !trimmedAnnualNetIncome ||
      !trimmedTargetReturn ||
      !trimmedInvestmentGoal
    ) {
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
          <SelectField
            label="투자가능자금"
            placeholder="투자가능자금 선택"
            value={investableFunds}
            onChange={setInvestableFunds}
            options={INVESTABLE_FUNDS_OPTIONS}
          />
          <SelectField
            label="연순소득"
            placeholder="연순소득 선택"
            value={annualNetIncome}
            onChange={setAnnualNetIncome}
            options={ANNUAL_NET_INCOME_OPTIONS}
            hint="* 매출이 아닌 순소득정보입니다."
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
                onChange={(v) => {
                  setHousingCount(v);
                  if (v !== "0") setFirstTimeBuyer(false);
                }}
                options={HOUSING_COUNT_OPTIONS}
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
            onChange={setCreditScore}
            options={CREDIT_SCORE_OPTIONS}
            hint="* 나이스/KCB 신용점수는 토스/카카오를 통해 확인가능합니다."
          />
          <SelectField
            label="목표 수익"
            placeholder="목표 수익 선택"
            value={targetReturn}
            onChange={setTargetReturn}
            options={TARGET_RETURN_OPTIONS}
          />
          <InvestmentGoalField value={investmentGoal} onChange={setInvestmentGoal} />
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
  loanInfo,
  firstTimeBuyer,
  isFavorite,
  favoriteBusy,
  onToggleFavorite,
  onOpen,
}: {
  item: AuctionItem;
  loanInfo: LoanInfo | undefined;
  firstTimeBuyer: boolean;
  isFavorite: boolean;
  favoriteBusy: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
}) {
  const requiredEquity = loanInfo?.requiredEquity ?? null;
  const loanAmount = finalLoanAmount(item, loanInfo);
  const loanPolicyLabel = loanInfo
    ? housingLoanLabel(loanInfo.loanPolicyLabel, firstTimeBuyer)
    : null;
  const failureRate = getFailureRateRatio(item.minPrice, item.appraisedValue);
  const failureCount = getFailureRoundCount(item.minPrice, item.appraisedValue, item.city);
  const isNew = failureRate === 100;
  const estimatedProfit = loanInfo
    ? estimateDefaultProfit({
        minPrice: item.minPrice,
        appraisedValue: item.appraisedValue,
        area: item.area,
        loanRatioByAppraisal: loanInfo.appraisalRatio,
        loanRatioByBidPrice: loanInfo.loanRatio,
      }).finalProfit
    : null;

  const isApartment = item.usage === "아파트";

  return (
    <div
      className="bg-card border border-border overflow-hidden group hover:shadow-lg hover:shadow-[rgba(30,58,95,0.09)] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
      style={{ borderRadius: "1rem" }}
    >
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="relative h-32 overflow-hidden bg-secondary">
          <img
            src={
              isApartment ? "/thumb-apartment.jpg" : "/thumb-villa.jpg"
            }
            alt={item.usage || "물건"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent" />

          <div className="absolute top-2.5 left-2.5 right-11 flex items-center gap-1.5 min-w-0">
            <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[0.65rem] font-semibold border border-transparent bg-white/90 text-[#2A5298] backdrop-blur-sm">
              {item.usage || "물건"}
            </span>
            {displaySpecialNote(item.specialNote) && (
              <span className="min-w-0 px-1.5 py-0.5 rounded-md text-[0.65rem] font-medium border bg-red-50/95 text-red-600 border-red-100 truncate backdrop-blur-sm">
                {displaySpecialNote(item.specialNote)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            disabled={favoriteBusy}
            aria-label={isFavorite ? "관심물건 해제" : "관심물건 추가"}
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition-colors shadow-sm disabled:opacity-50"
          >
            <Heart size={14} className={isFavorite ? "fill-rose-500 text-rose-500" : "text-gray-400"} />
          </button>

        </div>

        <div className="px-4 pt-3">
          <p className="text-[0.85rem] text-muted-foreground">{item.auctionNo}</p>
        </div>

        <div className="px-4 mt-2">
          <p className="font-semibold text-foreground text-[0.88rem] truncate">{item.address}</p>
          <p className="mt-1 text-[0.7rem] text-muted-foreground flex items-center gap-3 flex-wrap">
            <span>{formatAreaLabel(item.area)}</span>
            <span className={`inline-flex items-center gap-1 ${isBidDateEnded(item.bidDate ?? "") ? "text-red-600 font-medium" : ""}`}>
              <Calendar size={11} />
              {item.bidDate || "-"}
            </span>
          </p>
        </div>

        {requiredEquity != null && (
          <div
            className="mx-4 mt-3 px-3.5 py-3 flex items-stretch gap-3"
            style={{
              background: "linear-gradient(135deg, #EEF4FF 0%, #F0F5FF 100%)",
              border: "1px solid rgba(42,82,152,0.15)",
              borderRadius: "0.75rem",
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[0.7rem] font-semibold text-primary/70 tracking-wide uppercase">최소 투자금</p>
                {loanInfo && (
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[0.6rem] font-semibold ${
                      loanInfo.regulatedArea
                        ? "bg-red-50 text-red-600"
                        : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    {loanInfo.regulatedArea ? "규제지역" : "비규제지역"}
                  </span>
                )}
              </div>
              <p
                className="text-[1.2rem] font-bold text-primary tracking-tight mt-0.5"
                style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}
              >
                {formatWonShort(requiredEquity)}
              </p>
              {loanPolicyLabel && loanAmount != null && loanAmount > 0 && (
                <p className="text-[0.67rem] text-primary/50 mt-0.5">
                  {loanPolicyLabel} · 예상대출 {formatWonShort(loanAmount)}
                </p>
              )}
            </div>
            {estimatedProfit != null && (
              <div className="flex-1 min-w-0 pl-3 border-l border-primary/10">
                <p className="text-[0.7rem] font-semibold text-primary/70 tracking-wide uppercase">추정 수익</p>
                <p
                  className={`text-[1.2rem] font-bold tracking-tight mt-0.5 ${
                    estimatedProfit >= 0 ? "text-blue-600" : "text-red-500"
                  }`}
                  style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}
                >
                  {formatWonShort(estimatedProfit)}
                </p>
                <p className="text-[0.67rem] text-primary/50 mt-0.5">수익계산기 기본값 기준</p>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 px-4 mt-3 pb-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.67rem] text-muted-foreground flex items-center gap-1.5">
              최저입찰가
              {isNew ? (
                <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[0.62rem] font-medium border bg-blue-50 text-blue-700 border-blue-100">
                  신건
                </span>
              ) : failureRate != null ? (
                <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[0.62rem] font-medium border bg-amber-50 text-amber-700 border-amber-100">
                  유찰 {failureCount}회 · {failureRate}%
                </span>
              ) : null}
            </span>
            <span
              className="text-[0.83rem] font-semibold text-foreground"
              style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}
            >
              {fmtEok(item.minPrice)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.67rem] text-muted-foreground">감정가</span>
            <span
              className="text-[0.83rem] font-semibold text-foreground/75"
              style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}
            >
              {fmtEok(item.appraisedValue)}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

function RecommendListRow({
  item,
  loanInfo,
  firstTimeBuyer,
  isFavorite,
  favoriteBusy,
  onToggleFavorite,
  onOpen,
}: {
  item: AuctionItem;
  loanInfo: LoanInfo | undefined;
  firstTimeBuyer: boolean;
  isFavorite: boolean;
  favoriteBusy: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
}) {
  const requiredEquity = loanInfo?.requiredEquity ?? null;
  const loanAmount = finalLoanAmount(item, loanInfo);
  const loanPolicyLabel = loanInfo
    ? housingLoanLabel(loanInfo.loanPolicyLabel, firstTimeBuyer)
    : null;
  const failureRate = getFailureRateRatio(item.minPrice, item.appraisedValue);
  const failureCount = getFailureRoundCount(item.minPrice, item.appraisedValue, item.city);
  const isNew = failureRate === 100;

  const isApartment = item.usage === "아파트";

  return (
    <div className="bg-card border border-border rounded-xl px-5 py-3.5 flex items-center gap-4 hover:shadow-md hover:shadow-[rgba(30,58,95,0.06)] hover:-translate-y-px transition-all duration-150 cursor-pointer group">
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className="text-[0.7rem] text-muted-foreground mb-1.5">{item.auctionNo}</p>

        <div className="flex items-center gap-4">
        <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-secondary">
          <img
            src={
              isApartment ? "/thumb-apartment.jpg" : "/thumb-villa.jpg"
            }
            alt={item.usage || "물건"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="shrink-0 px-1.5 py-px rounded text-[0.62rem] font-semibold border bg-[#EEF4FF] text-[#2A5298] border-transparent">
              {item.usage || "물건"}
            </span>
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
          <p className="font-semibold text-sm text-foreground truncate">{item.address}</p>
          <p className="text-[0.72rem] text-muted-foreground truncate">
            {formatAreaLabel(item.area)} ·{" "}
            <span className={isBidDateEnded(item.bidDate ?? "") ? "text-red-600 font-medium" : ""}>
              {item.bidDate || "-"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-5">
          {requiredEquity != null && (
            <div
              className="flex-shrink-0 w-36 hidden sm:block px-3 py-2 text-right"
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

          {loanPolicyLabel && loanAmount != null && loanAmount > 0 && (
            <div className="text-right flex-shrink-0 hidden lg:block">
              <p className="text-[0.62rem] text-muted-foreground mb-0.5 whitespace-nowrap">{loanPolicyLabel} 예상대출</p>
              <p className="font-semibold text-sm text-foreground/80" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
                {formatWonShort(loanAmount)}
              </p>
            </div>
          )}

          <div className="text-right flex-shrink-0 hidden md:block">
            <p className="text-[0.62rem] text-muted-foreground mb-0.5 whitespace-nowrap">최저입찰가</p>
            <p className="font-semibold text-sm text-foreground/80" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
              {fmtEok(item.minPrice)}
            </p>
          </div>

          <div className="text-right flex-shrink-0 hidden xl:block">
            <p className="text-[0.62rem] text-muted-foreground mb-0.5 whitespace-nowrap">감정가</p>
            <p className="text-sm text-foreground/50" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
              {fmtEok(item.appraisedValue)}
            </p>
          </div>
        </div>
        </div>
      </button>

      <div className="flex items-center gap-1.5 flex-shrink-0">
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
      </div>
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
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const [loanInfoByItemId, setLoanInfoByItemId] = useState<Record<string, LoanInfo>>({});
  const [showInvestmentModal, setShowInvestmentModal] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<RecommendFilters>(EMPTY_RECOMMEND_FILTERS);
  const [sortBy, setSortBy] = useState<SortOption>("입찰기일순");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(false);

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
    fetchFavoriteIds()
      .then((ids) => setFavoriteIds(new Set(ids)))
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

  async function handleToggleFavorite(auctionId: string, next: boolean) {
    setFavoriteBusyId(auctionId);
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
      setFavoriteBusyId(null);
    }
  }

  const filteredItems = sortRecommendItems(
    items.filter((item) => matchesRecommendFilters(item, filters, favoriteIds)),
    sortBy,
    loanInfoByItemId,
  );

  const activeFilterCount =
    (filters.city ? 1 : 0) +
    (filters.propType ? 1 : 0) +
    (filters.maxFailureRate ? 1 : 0) +
    (filters.favoritesOnly ? 1 : 0) +
    (filters.progressStatus !== PROGRESS_STATUS_LABELS.active ? 1 : 0);

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
            </div>

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
        onToggleFavorite={
          selectedItem ? (next) => handleToggleFavorite(selectedItem.id, next) : undefined
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
        incomeLoanLimit={
          selectedItem ? loanInfoByItemId[selectedItem.id]?.incomeLoanLimit ?? null : null
        }
        existingLoanWon={
          selectedItem ? loanInfoByItemId[selectedItem.id]?.existingLoanWon ?? null : null
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
          favoriteCount={favoriteIds.size}
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
