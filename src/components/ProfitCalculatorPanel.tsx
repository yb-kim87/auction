"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuctionItem } from "@/types/auction";
import { formatWonShort } from "@/lib/investment-money";
import { calculateProfit, isOver85Sqm, type ProfitCalculatorInput } from "@/lib/profit-calculator";

function NumberField({
  label,
  value,
  onChange,
  suffix,
  helper,
  readOnly,
}: {
  label: string;
  value: number;
  onChange?: (next: number) => void;
  suffix?: string;
  helper?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {helper && <p className="text-[11px] text-muted-foreground mt-0.5">{helper}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {readOnly ? (
          <span
            className="w-32 text-sm text-right text-foreground/70"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {value.toLocaleString("ko-KR")}
          </span>
        ) : (
          <input
            type="number"
            value={value}
            onChange={(e) => onChange?.(Number(e.target.value) || 0)}
            className="w-32 px-2 py-1.5 text-sm text-right border border-border rounded-sm bg-card"
          />
        )}
        {suffix && <span className="text-xs text-muted-foreground w-6">{suffix}</span>}
      </div>
    </div>
  );
}

function ResultRow({
  label,
  value,
  emphasis,
  positive,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={`text-[13px] ${emphasis ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
      <span
        className={`text-sm ${emphasis ? "font-bold" : "font-medium"} ${
          positive === true ? "text-blue-600" : positive === false ? "text-red-500" : "text-foreground"
        }`}
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {value}
      </span>
    </div>
  );
}

export function ProfitCalculatorPanel({
  item,
  loanRatio,
  appraisalRatio,
}: {
  item: AuctionItem;
  loanRatio?: number | null;
  appraisalRatio?: number | null;
}) {
  const [bidPrice, setBidPrice] = useState(item.minPrice);
  const [salePrice, setSalePrice] = useState(item.appraisedValue);
  const [holdingMonths, setHoldingMonths] = useState(4);
  const [loanRatioByAppraisal, setLoanRatioByAppraisal] = useState(
    Math.round((appraisalRatio ?? 0.7) * 100),
  );
  const [loanRatioByBidPrice, setLoanRatioByBidPrice] = useState(
    Math.round(Math.min(loanRatio ?? 0.8, 1) * 100),
  );
  const [loanInterestRate, setLoanInterestRate] = useState(4.5);
  const [earlyRepaymentFeeRate, setEarlyRepaymentFeeRate] = useState(0);
  const [interiorCost, setInteriorCost] = useState(2_000_000);
  const [evictionCost, setEvictionCost] = useState(2_000_000);
  const [unpaidMaintenanceFee, setUnpaidMaintenanceFee] = useState(1_000_000);
  const [extraRealtyFee, setExtraRealtyFee] = useState(0);
  const over85 = isOver85Sqm(item.area);
  const [vatAmount, setVatAmount] = useState(over85 ? Math.round(item.appraisedValue * 0.1 * 0.5) : 0);
  const [vatEdited, setVatEdited] = useState(false);
  const [applyProgressiveDeduction, setApplyProgressiveDeduction] = useState(true);

  // 매도가가 바뀌면 부가세(매도가×10%×50%)도 자동으로 따라간다. 단, 사용자가 부가세를
  // 직접 수정한 뒤에는 더 이상 자동 갱신하지 않는다.
  useEffect(() => {
    if (!over85 || vatEdited) return;
    setVatAmount(Math.round(salePrice * 0.1 * 0.5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salePrice, over85]);

  const input: ProfitCalculatorInput = {
    minPrice: item.minPrice,
    appraisedValue: item.appraisedValue,
    bidPrice,
    salePrice,
    holdingMonths,
    loanRatioByAppraisal: loanRatioByAppraisal / 100,
    loanRatioByBidPrice: loanRatioByBidPrice / 100,
    loanInterestRate: loanInterestRate / 100,
    earlyRepaymentFeeRate: earlyRepaymentFeeRate / 100,
    interiorCost,
    evictionCost,
    unpaidMaintenanceFee,
    extraRealtyFee,
    isOver85sqm: over85,
    vatAmount,
    applyProgressiveDeduction,
  };

  const result = useMemo(() => calculateProfit(input), [
    item.minPrice,
    item.appraisedValue,
    bidPrice,
    salePrice,
    holdingMonths,
    loanRatioByAppraisal,
    loanRatioByBidPrice,
    loanInterestRate,
    earlyRepaymentFeeRate,
    interiorCost,
    evictionCost,
    unpaidMaintenanceFee,
    extraRealtyFee,
    vatAmount,
    applyProgressiveDeduction,
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-foreground">입찰가 산정 및 수익률 분석</h3>
        <p className="text-xs text-muted-foreground mt-1">
          낙찰가(입찰가)와 매도가를 조정하면 예상 수익률이 자동으로 계산됩니다. 대출한도는
          min(감정가×감정가비율, 낙찰가×낙찰가비율)로 계산되며, 아래 비율은 이 물건에 적용된
          대출정책 값으로 기본 설정되어 있습니다.
        </p>
      </div>

      <div
        className="rounded-xl p-4"
        style={{ background: "linear-gradient(135deg,#EEF4FF,#F0F5FF)", border: "1px solid rgba(42,82,152,0.15)" }}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <ResultRow label="대출금(LTV)" value={formatWonShort(result.loanAmount)} />
          <ResultRow label="실투자금(내자본금)" value={formatWonShort(result.equity)} />
          <ResultRow
            label="수익률"
            value={`${result.profitRate.toFixed(1)}%`}
            emphasis
            positive={result.profitRate >= 0}
          />
        </div>
        <div className="mt-2 pt-2 border-t border-primary/10">
          <ResultRow
            label="최종수익"
            value={formatWonShort(result.finalProfit)}
            emphasis
            positive={result.finalProfit >= 0}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border divide-y divide-border">
        <div className="px-3 py-2 bg-secondary/30">
          <p className="text-[12px] font-semibold text-foreground">기본 입력</p>
        </div>
        <div className="px-3">
          <NumberField
            label="낙찰가(입찰가)"
            value={bidPrice}
            onChange={setBidPrice}
            suffix="원"
            helper={`최저가 ${formatWonShort(item.minPrice)} · 감정가 ${formatWonShort(item.appraisedValue)}`}
          />
          <NumberField label="매도가" value={salePrice} onChange={setSalePrice} suffix="원" />
          <NumberField label="보유기간" value={holdingMonths} onChange={setHoldingMonths} suffix="개월" />
        </div>

        <div className="px-3 py-2 bg-secondary/30">
          <p className="text-[12px] font-semibold text-foreground">대출(LTV)</p>
        </div>
        <div className="px-3">
          <NumberField
            label="감정가 기준 비율"
            value={loanRatioByAppraisal}
            onChange={setLoanRatioByAppraisal}
            suffix="%"
          />
          <NumberField
            label="낙찰가 기준 비율"
            value={loanRatioByBidPrice}
            onChange={setLoanRatioByBidPrice}
            suffix="%"
          />
          <NumberField label="대출 연이자율" value={loanInterestRate} onChange={setLoanInterestRate} suffix="%" />
          <NumberField
            label="중도상환수수료율"
            value={earlyRepaymentFeeRate}
            onChange={setEarlyRepaymentFeeRate}
            suffix="%"
          />
        </div>

        <div className="px-3 py-2 bg-secondary/30">
          <p className="text-[12px] font-semibold text-foreground">취득/보유 비용</p>
        </div>
        <div className="px-3">
          <NumberField
            label="등기비용(취득세 등)"
            value={result.acquisitionTax}
            readOnly
            suffix="원"
            helper={`취득세율 ${(result.acquisitionTaxRate * 100).toFixed(2)}% 자동 계산`}
          />
          <NumberField label="인테리어(필요경비)" value={interiorCost} onChange={setInteriorCost} suffix="원" />
          <NumberField label="명도비" value={evictionCost} onChange={setEvictionCost} suffix="원" />
          <NumberField
            label="미납관리비"
            value={unpaidMaintenanceFee}
            onChange={setUnpaidMaintenanceFee}
            suffix="원"
          />
        </div>

        <div className="px-3 py-2 bg-secondary/30">
          <p className="text-[12px] font-semibold text-foreground">매도/세금</p>
        </div>
        <div className="px-3">
          <NumberField
            label="중개수수료(매도)"
            value={result.saleBrokerageFee}
            readOnly
            suffix="원"
            helper={`매도가 구간별 요율 ${(result.saleBrokerageRate * 100).toFixed(2)}% 자동 계산`}
          />
          <NumberField label="부동산 추가수수료" value={extraRealtyFee} onChange={setExtraRealtyFee} suffix="원" />
          {over85 && (
            <NumberField
              label="부가세"
              value={vatAmount}
              onChange={(next) => {
                setVatEdited(true);
                setVatAmount(next);
              }}
              suffix="원"
              helper="전용 85㎡ 초과 물건: 매도가의 10%×50%를 기본값으로 자동 계산(직접 수정 가능)"
            />
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border p-3 space-y-1">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[12px] font-semibold text-foreground">계산 상세</p>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={applyProgressiveDeduction}
              onChange={(e) => setApplyProgressiveDeduction(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            누진공제 적용
          </label>
        </div>
        <ResultRow label="취득금액합계" value={formatWonShort(result.totalAcquisitionCost)} />
        <ResultRow label="대출이자" value={formatWonShort(result.loanInterest)} />
        <ResultRow label="매매차익" value={formatWonShort(result.saleMargin)} />
        <ResultRow
          label={
            applyProgressiveDeduction
              ? `양도세율 ${(result.capitalGainsTaxRate * 100).toFixed(0)}% (누진공제 ${formatWonShort(result.capitalGainsTaxDeduction)})`
              : `양도세율 ${(result.capitalGainsTaxRate * 100).toFixed(0)}% (누진공제 미적용)`
          }
          value={`-${formatWonShort(result.capitalGainsTax)}`}
        />
      </div>
    </div>
  );
}
