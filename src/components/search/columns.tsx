import { ExternalLink, StickyNote } from "lucide-react";
import type { AuctionItem } from "@/types/auction";
import { hasNaverPrice } from "@/lib/naver-price";
import { isBidDateEnded } from "@/lib/progress-status-filter";
import { formatTenantStatusSummary } from "@/lib/tenant-status";
import { UpdatedBadge } from "@/components/UpdatedBadge";
import {
  requiredEquityForItem,
  selectLoanPolicy,
  isRegulatedArea,
  type InvestmentCriteria,
} from "@/lib/investment-criteria";
import { parseMoneyToWon, parseIncomeToWon } from "@/lib/investment-money";
import type { LoanPolicy } from "@/lib/api";
import { fmt, fmtEok, fmtFailureRate, fmtDiffAmount } from "@/lib/search-format";

export interface ColDef {
  key: string;
  label: string;
  defaultWidth: number;
  align?: "left" | "right" | "center";
  sticky?: boolean;
  render: (row: AuctionItem) => React.ReactNode;
}

export function renderPriceDiff(
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

export function renderNaverPrice(
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

export function renderPriceDetail(priceDetail: string, naverPrice: number) {
  if (!hasNaverPrice(naverPrice)) {
    return <span className="text-muted-foreground/40">-</span>;
  }
  return (
    <span className="text-muted-foreground">
      {priceDetail.trim() || "-"}
    </span>
  );
}

export const buildColumns = (
  isAdmin: boolean,
  recommendCriteria: InvestmentCriteria | null,
  loanPolicies: LoanPolicy[],
  regulatedRegionNames: string[],
  incomeLoanMultiplier: number | undefined,
): ColDef[] => [
  { key: "memo", label: "메모", defaultWidth: 80, sticky: true, render: (r) => r.memo ? <span className="text-amber-600"><StickyNote size={16} className="inline mr-1" />{r.memo}</span> : <span className="text-muted-foreground/40">-</span> },
  { key: "usage", label: "용도", defaultWidth: 96, render: (r) => <span className="whitespace-nowrap">{r.usage}</span> },
  { key: "specialNote", label: "특이사항", defaultWidth: 160, render: (r) => <span className="text-red-600">{r.specialNote}</span> },
  { key: "link", label: "링크", defaultWidth: 56, render: (r) => r.link ? <a href={r.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary hover:text-accent inline-flex justify-center"><ExternalLink size={16} /></a> : null },
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
    <span className={`font-mono ${isBidDateEnded(r.bidDate, r.caseState) ? "text-red-600 font-semibold" : ""}`}>{r.bidDate}</span>
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
            const regulated = isRegulatedArea(r.city, r.district, regulatedRegionNames);
            const policy = selectLoanPolicy(recommendCriteria, regulated, loanPolicies, r);
            if (policy.loanUnavailable) {
              return <span className="text-xs text-destructive font-semibold">대출 불가({policy.label})</span>;
            }
            const annualIncomeWon = parseIncomeToWon(recommendCriteria.annualNetIncome) ?? undefined;
            const existingLoanWon = parseMoneyToWon(recommendCriteria.existingLoanAmount ?? "") ?? 0;
            const equity = requiredEquityForItem(
              r.minPrice,
              r.appraisedValue,
              policy,
              annualIncomeWon,
              existingLoanWon,
              incomeLoanMultiplier,
            );
            return (
              <span className="text-xs leading-snug whitespace-nowrap">
                <span className="text-primary font-semibold">{policy.label}</span>
                <br />
                <span className="text-muted-foreground">필요 자기자금 약 {fmtEok(equity)}</span>
                {r.minPrice > equity && (
                  <>
                    <br />
                    <span className="text-muted-foreground">
                      예상 대출 약 {fmtEok(r.minPrice - equity)}
                    </span>
                  </>
                )}
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
