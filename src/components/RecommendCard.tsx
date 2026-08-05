"use client";

import { Calendar, Heart } from "lucide-react";
import type { AuctionItem } from "@/types/auction";
import { dedupeStrategyTagsByLabel } from "@/types/auction";
import { CaseStateBadge } from "@/components/CaseStateBadge";
import { formatWonShort } from "@/lib/investment-money";
import { housingLoanLabel } from "@/lib/loan-policy-label";
import { estimateDefaultProfit } from "@/lib/profit-calculator";
import { getFailureRateRatio, getFailureRoundCount } from "@/lib/failure-rate";
import { parseBidDate, isBidDateEnded } from "@/lib/progress-status-filter";

export type LoanInfo = {
  loanRatio: number;
  appraisalRatio: number;
  loanPolicyLabel: string;
  requiredEquity: number;
  regulatedArea: boolean;
  incomeLoanLimit: number | null;
  existingLoanWon: number;
  loanUnavailable?: boolean;
  /** 방빼기(방공제) — 물건 소재지 기준 최우선변제금액. 이미 requiredEquity
   * 계산에 반영돼 있으므로, 카드 내 "추정 수익" 재계산에도 동일하게
   * 반영해 두 수치가 어긋나지 않게 한다. */
  roomDeductionWon?: number;
  /** 방공제를 어느 기준 금액(감정가/낙찰가/둘다)에서 차감할지. */
  roomDeductionTarget?: "none" | "appraisal" | "bid" | "both";
};

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

/** 물건의 최종 대출금액(낙찰가 - 필요자기자금). */
function finalLoanAmount(item: AuctionItem, loanInfo: LoanInfo | undefined): number | null {
  if (!loanInfo) return null;
  return item.minPrice - loanInfo.requiredEquity;
}

/** 추천 물건 카드 — 추천 물건 페이지(src/app/page.tsx)에서 쓰던 카드를
 * "내 물건"(관심물건) 화면에서도 동일하게 쓸 수 있도록 공용 컴포넌트로
 * 분리했다(사용자 요청, 2026-08-05: "내물건에 관심 입찰계획 물건
 * 표시방법도 추천물건탭에 나오는 방식이랑 똑같이 나오게 하면 좋을꺼같아"). */
export function RecommendCard({
  item,
  loanInfo,
  firstTimeBuyer,
  housingCount,
  availableCapital,
  isFavorite,
  favoriteBusy,
  onToggleFavorite,
  onOpen,
}: {
  item: AuctionItem;
  loanInfo: LoanInfo | undefined;
  firstTimeBuyer: boolean;
  housingCount?: number | null;
  availableCapital: number | null;
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
        incomeLoanLimit: loanInfo.incomeLoanLimit,
        existingLoanWon: loanInfo.existingLoanWon,
        roomDeductionWon: loanInfo.roomDeductionWon,
        roomDeductionTarget: loanInfo.roomDeductionTarget,
        housingCount,
        regulatedArea: loanInfo.regulatedArea,
        usage: item.usage,
        unpaidFeeAmount: item.unpaidFeeAmount,
        unpaidFeeCheckedAt: item.unpaidFeeCheckedAt,
        rightsAssumptionAmount: 0,
      }).finalProfit
    : null;

  const isApartment = item.usage === "아파트";
  const bidTiming = bidDatePresentation(item.bidDate, item.caseState);
  const capitalUsageRatio = requiredEquity != null && availableCapital && availableCapital > 0
    ? (requiredEquity / availableCapital) * 100
    : null;
  const fitTone = capitalUsageRatio == null
    ? "조건 확인"
    : capitalUsageRatio <= 70
      ? "조건 여유"
      : capitalUsageRatio <= 90
        ? "조건 충족"
        : "조건 경계";

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
            <CaseStateBadge caseState={item.caseState} />
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
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={11} />
              <span className={`rounded-md border px-1.5 py-0.5 text-[0.62rem] font-bold ${bidTiming.className}`}>{bidTiming.label}</span>
              <span className={bidTiming.label === "입찰 종료" ? "text-red-600 font-medium" : ""}>{item.bidDate || "-"}</span>
            </span>
          </p>
        </div>

        <div className="px-4 mt-2 min-h-[1.5rem] flex flex-wrap gap-1.5">
          {dedupeStrategyTagsByLabel(item.strategyTagsList).map((tag) => (
            <span
              key={tag.code}
              title={tag.description}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.68rem] font-semibold"
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

        {requiredEquity != null && availableCapital != null && (
          <div className="mx-4 mt-2.5 rounded-xl border border-border bg-secondary/20 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[0.64rem] font-bold ${capitalUsageRatio != null && capitalUsageRatio > 90 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {fitTone}
                </span>
                <span className="text-[0.68rem] font-semibold text-foreground">내 투자정보 기준</span>
              </div>
              {capitalUsageRatio != null && <span className="text-[0.65rem] font-semibold text-muted-foreground">자금 사용 {Math.round(capitalUsageRatio)}%</span>}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/70">
              <div className={`h-full rounded-full ${capitalUsageRatio != null && capitalUsageRatio > 90 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, capitalUsageRatio ?? 0)}%` }} />
            </div>
          </div>
        )}

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
              {loanInfo?.loanUnavailable ? (
                <p className="text-[0.67rem] text-red-500 font-semibold mt-0.5">
                  {loanPolicyLabel} · 대출불가
                </p>
              ) : (
                loanPolicyLabel && loanAmount != null && loanAmount > 0 && (
                  <p className="text-[0.67rem] text-primary/50 mt-0.5">
                    {loanPolicyLabel} · 예상대출 {formatWonShort(loanAmount)}
                  </p>
                )
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
                <p className="text-[0.67rem] text-primary/50 mt-0.5">최저가 입찰기준</p>
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
