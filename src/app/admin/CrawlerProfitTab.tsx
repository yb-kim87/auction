"use client";

import { useMemo, useState } from "react";

function parseNum(value: string): number {
  const cleaned = value.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatWon(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

export function CrawlerProfitTab() {
  const [auctionPrice, setAuctionPrice] = useState("0");
  const [salePrice, setSalePrice] = useState("0");
  const [vat, setVat] = useState("0");
  const [appraisalPrice, setAppraisalPrice] = useState("0");
  const [appraisalLoanRatio, setAppraisalLoanRatio] = useState("80");
  const [bidLoanRatio, setBidLoanRatio] = useState("80");
  const [interestRate, setInterestRate] = useState("5.2");
  const [monthsHeld, setMonthsHeld] = useState("3");
  const [interiorCost, setInteriorCost] = useState("1000000");
  const [evictionCost, setEvictionCost] = useState("1000000");
  const [unpaidFee, setUnpaidFee] = useState("0");
  const [brokerFeeRate, setBrokerFeeRate] = useState("0.4");
  const [courtFeeRate, setCourtFeeRate] = useState("1.8");
  const [prepaymentPenaltyRate, setPrepaymentPenaltyRate] = useState("1");

  const result = useMemo(() => {
    const bid = parseNum(auctionPrice);
    const appraisal = parseNum(appraisalPrice);
    const appraisalLoan = appraisal * (parseNum(appraisalLoanRatio) / 100);
    const bidLoan = bid * (parseNum(bidLoanRatio) / 100);
    const finalLoan =
      appraisalLoan > 0 && bidLoan > 0
        ? Math.min(appraisalLoan, bidLoan)
        : Math.max(appraisalLoan, bidLoan);

    const courtFee = appraisal * (parseNum(courtFeeRate) / 100);
    const loanInterest =
      finalLoan *
      (parseNum(interestRate) / 100) *
      (parseNum(monthsHeld) / 12);

    const acquisitionSum =
      bid +
      parseNum(vat) +
      parseNum(interiorCost) +
      parseNum(evictionCost) +
      parseNum(unpaidFee) +
      courtFee +
      loanInterest;

    const brokerFee = parseNum(salePrice) * (parseNum(brokerFeeRate) / 100);
    const prepaymentPenalty =
      finalLoan * (parseNum(prepaymentPenaltyRate) / 100);

    const taxableBase = parseNum(salePrice) - acquisitionSum - brokerFee;
    const taxRate = 0;
    const progressiveDeduction = 0;
    const transferTax = Math.max(
      0,
      taxableBase * taxRate - progressiveDeduction,
    );

    const actualInvestment = acquisitionSum - finalLoan;
    const finalProfit =
      parseNum(salePrice) - acquisitionSum - brokerFee - prepaymentPenalty - transferTax;
    const profitRate =
      actualInvestment > 0 ? (finalProfit / actualInvestment) * 100 : 0;

    return {
      appraisalLoan,
      bidLoan,
      finalLoan,
      courtFee,
      loanInterest,
      acquisitionSum,
      brokerFee,
      prepaymentPenalty,
      taxableBase,
      transferTax,
      actualInvestment,
      finalProfit,
      profitRate,
    };
  }, [
    auctionPrice,
    salePrice,
    vat,
    appraisalPrice,
    appraisalLoanRatio,
    bidLoanRatio,
    interestRate,
    monthsHeld,
    interiorCost,
    evictionCost,
    unpaidFee,
    brokerFeeRate,
    courtFeeRate,
    prepaymentPenaltyRate,
  ]);

  const fieldClass =
    "w-full px-2 py-1.5 text-sm border border-border rounded-sm bg-card";

  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-base font-bold">수익계산</h3>
        <p className="text-sm text-muted-foreground mt-1">
          기존 데스크톱 프로그램과 동일한 대출·비용 계산 로직입니다.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">낙찰가</span>
          <input value={auctionPrice} onChange={(e) => setAuctionPrice(e.target.value)} className={fieldClass} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">매도가</span>
          <input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className={fieldClass} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">감정가</span>
          <input value={appraisalPrice} onChange={(e) => setAppraisalPrice(e.target.value)} className={fieldClass} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">부가세</span>
          <input value={vat} onChange={(e) => setVat(e.target.value)} className={fieldClass} />
        </label>

        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">감정 대출비율(%)</span>
          <input value={appraisalLoanRatio} onChange={(e) => setAppraisalLoanRatio(e.target.value)} className={fieldClass} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">낙찰 대출비율(%)</span>
          <input value={bidLoanRatio} onChange={(e) => setBidLoanRatio(e.target.value)} className={fieldClass} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">이율(%)</span>
          <input value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className={fieldClass} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">보유월</span>
          <input value={monthsHeld} onChange={(e) => setMonthsHeld(e.target.value)} className={fieldClass} />
        </label>

        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">인테리어</span>
          <input value={interiorCost} onChange={(e) => setInteriorCost(e.target.value)} className={fieldClass} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">명도비</span>
          <input value={evictionCost} onChange={(e) => setEvictionCost(e.target.value)} className={fieldClass} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">미납관리비</span>
          <input value={unpaidFee} onChange={(e) => setUnpaidFee(e.target.value)} className={fieldClass} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">중개수수료(%)</span>
          <input value={brokerFeeRate} onChange={(e) => setBrokerFeeRate(e.target.value)} className={fieldClass} />
        </label>

        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">취득+등기(%)</span>
          <input value={courtFeeRate} onChange={(e) => setCourtFeeRate(e.target.value)} className={fieldClass} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">중도상환(%)</span>
          <input value={prepaymentPenaltyRate} onChange={(e) => setPrepaymentPenaltyRate(e.target.value)} className={fieldClass} />
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border border-border rounded-sm p-4 bg-secondary/20">
        <div>
          <p className="text-xs text-muted-foreground">감정 기준 대출</p>
          <p className="font-mono">{formatWon(result.appraisalLoan)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">낙찰 기준 대출</p>
          <p className="font-mono">{formatWon(result.bidLoan)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">최종대출</p>
          <p className="font-mono font-semibold">{formatWon(result.finalLoan)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">대출이자</p>
          <p className="font-mono">{formatWon(result.loanInterest)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">취득+등기</p>
          <p className="font-mono">{formatWon(result.courtFee)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">취득금액합</p>
          <p className="font-mono">{formatWon(result.acquisitionSum)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">실투자금</p>
          <p className="font-mono">{formatWon(result.actualInvestment)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">과세표준</p>
          <p className="font-mono">{formatWon(result.taxableBase)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">수익률</p>
          <p className="font-mono text-primary font-semibold">
            {result.profitRate.toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">최종수익</p>
          <p className="font-mono text-emerald-600 font-semibold">
            {formatWon(result.finalProfit)}
          </p>
        </div>
      </div>
    </div>
  );
}
