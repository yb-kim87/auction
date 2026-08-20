import { StickyNote } from "lucide-react";
import type { AuctionItem } from "@/types/auction";
import { isBidDateEnded } from "@/lib/progress-status-filter";
import { UpdatedBadge } from "@/components/UpdatedBadge";
import {
  requiredEquityForItem,
  selectLoanPolicy,
  isRegulatedArea,
  type InvestmentCriteria,
} from "@/lib/investment-criteria";
import { parseMoneyToWon, parseIncomeToWon } from "@/lib/investment-money";
import type { LoanPolicy } from "@/lib/api";
import { fmtEok, fmtFailureRate } from "@/lib/search-format";

export function AuctionMobileCard({
  item,
  onClick,
  recommendCriteria,
  loanPolicies,
  regulatedRegionNames,
  incomeLoanMultiplier,
}: {
  item: AuctionItem;
  onClick: () => void;
  recommendCriteria: InvestmentCriteria | null;
  loanPolicies: LoanPolicy[];
  regulatedRegionNames: string[];
  incomeLoanMultiplier: number | undefined;
}) {
  const rate = fmtFailureRate(item.minPrice, item.appraisedValue);
  const recommendPolicy =
    recommendCriteria && item.minPrice
      ? selectLoanPolicy(
          recommendCriteria,
          isRegulatedArea(item.city, item.district, regulatedRegionNames),
          loanPolicies,
          item,
        )
      : null;
  const annualIncomeWon = recommendCriteria
    ? parseIncomeToWon(recommendCriteria.annualNetIncome) ?? undefined
    : undefined;
  const existingLoanWon = recommendCriteria
    ? parseMoneyToWon(recommendCriteria.existingLoanAmount ?? "") ?? 0
    : 0;
  const equity =
    recommendPolicy && item.minPrice
      ? requiredEquityForItem(
          item.minPrice,
          item.appraisedValue,
          recommendPolicy,
          annualIncomeWon,
          existingLoanWon,
          incomeLoanMultiplier,
        )
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
            isBidDateEnded(item.bidDate, item.caseState) ? "text-red-600 font-semibold" : "text-muted-foreground"
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
          {item.minPrice > equity && ` · 예상 대출 약 ${fmtEok(item.minPrice - equity)}`}
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
