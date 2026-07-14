/**
 * 입찰가 산정 및 수익률 분석 계산기.
 * 사용자가 제공한 수익률계산시트(E:\OneDrive\auctiondev\수익률계산시트.xlsx)의 계산식을 그대로 옮긴 것.
 * 대출한도(LTV) 계산만 기존 대출정책 계산식(investment-criteria.ts)을 그대로 재사용한다.
 */

/** 낙찰가(취득세 과세표준) 구간별 취득세율(지방교육세 등 포함, 시트의 C8 수식) */
export function acquisitionTaxRate(minPriceWon: number): number {
  let base: number;
  if (minPriceWon <= 600_000_000) base = 0.01;
  else if (minPriceWon <= 650_000_000) base = 0.0133;
  else if (minPriceWon <= 700_000_000) base = 0.0167;
  else if (minPriceWon <= 750_000_000) base = 0.02;
  else if (minPriceWon <= 800_000_000) base = 0.0233;
  else if (minPriceWon <= 850_000_000) base = 0.0267;
  else base = 0.03;
  return base * 1.1 + 0.007;
}

/** 매도가 구간별 매도 중개수수료율(시트의 C12 수식) */
export function saleBrokerageRate(salePriceWon: number): number {
  if (salePriceWon < 50_000_000) return 0.006;
  if (salePriceWon < 200_000_000) return 0.005;
  if (salePriceWon < 900_000_000) return 0.004;
  if (salePriceWon < 1_200_000_000) return 0.005;
  if (salePriceWon < 1_500_000_000) return 0.006;
  return 0.007;
}

/** 양도소득세 과세표준 구간별 세율/누진공제액(사용자가 제공한 국세청 기준 표) */
const CAPITAL_GAINS_TAX_BRACKETS: Array<{ upTo: number; rate: number; deduction: number }> = [
  { upTo: 14_000_000, rate: 0.06, deduction: 0 },
  { upTo: 50_000_000, rate: 0.15, deduction: 1_260_000 },
  { upTo: 88_000_000, rate: 0.24, deduction: 5_220_000 },
  { upTo: 150_000_000, rate: 0.35, deduction: 14_900_000 },
  { upTo: 300_000_000, rate: 0.38, deduction: 19_400_000 },
  { upTo: 500_000_000, rate: 0.4, deduction: 25_400_000 },
  { upTo: 1_000_000_000, rate: 0.42, deduction: 35_400_000 },
  { upTo: Infinity, rate: 0.45, deduction: 65_400_000 },
];

export function capitalGainsTaxBracket(taxBaseWon: number): { rate: number; deduction: number } {
  const bracket =
    CAPITAL_GAINS_TAX_BRACKETS.find((b) => taxBaseWon <= b.upTo) ??
    CAPITAL_GAINS_TAX_BRACKETS[CAPITAL_GAINS_TAX_BRACKETS.length - 1];
  return { rate: bracket.rate, deduction: bracket.deduction };
}

/** 과세표준에 대한 누진세액(세율×과세표준-누진공제). 0 이하는 0. */
export function progressiveTaxAmount(taxBaseWon: number, applyDeduction: boolean): number {
  if (taxBaseWon <= 0) return 0;
  const { rate, deduction } = capitalGainsTaxBracket(taxBaseWon);
  return Math.max(0, taxBaseWon * rate - (applyDeduction ? deduction : 0));
}

export interface ProfitCalculatorInput {
  minPrice: number; // 최저가
  appraisedValue: number; // 감정가
  bidPrice: number; // 낙찰가(입찰가)
  salePrice: number; // 매도가
  holdingMonths: number; // 보유기간(개월)
  loanRatioByAppraisal: number; // 감정가 기준 LTV 비율(예: 0.7)
  loanRatioByBidPrice: number; // 낙찰가 기준 LTV 비율(예: 0.8)
  incomeLoanLimit: number | null; // 소득 기준 대출한도(연소득×배수). null이면 소득 기준 미적용
  existingLoanWon: number; // 기존대출금액(대출한도에서 차감), 기본 0
  loanInterestRate: number; // 대출 연이자율(예: 0.045)
  earlyRepaymentFeeRate: number; // 중도상환수수료율(기본 0)
  interiorCost: number; // 인테리어(필요경비), 기본 300만원
  evictionCost: number; // 명도비, 기본 0
  unpaidMaintenanceFee: number; // 미납관리비, 기본 0
  extraRealtyFee: number; // 부동산 추가수수료, 기본 0
  isOver85sqm: boolean; // 85㎡ 초과 여부(부가세 적용 대상)
  vatAmount: number; // 부가세(85㎡ 초과 물건에 한해 직접 입력, 기본 0)
  applyProgressiveDeduction: boolean; // 양도세 계산 시 구간별 누진공제 적용 여부(기본 true)
  existingIncome: number; // 기존소득(연간), 기본 0. 매매차익과 합산해 세율 구간을 판정한다
}

export interface ProfitCalculatorResult {
  bidRatio: number; // 입찰가율(낙찰가/최저가)
  loanByAppraisal: number; // 감정가 기준 대출한도
  loanByBidPrice: number; // 낙찰가 기준 대출한도
  loanLimit: number; // 대출한도(감정가·낙찰가·소득 기준 중 최저, 기존대출 차감 전)
  loanAmount: number; // 최종 대출금 = max(0, 대출한도 - 기존대출)
  equity: number; // 실투자금(내자본금) = 취득금액합계 - 대출금
  acquisitionTaxRate: number;
  acquisitionTax: number; // 등기비용(취득세 등)
  loanInterest: number; // 대출이자(보유기간 반영)
  earlyRepaymentFee: number;
  saleBrokerageRate: number;
  saleBrokerageFee: number; // 중개수수료(매도)
  totalAcquisitionCost: number; // 취득금액합계
  saleMargin: number; // 매매차익 = 매도가 - 취득금액합계
  capitalGainsTaxRate: number;
  capitalGainsTaxDeduction: number;
  capitalGainsTax: number; // 소득세(양도세)
  finalProfit: number; // 최종수익
  profitRate: number; // 수익률(%) = 최종수익 / 실투자금 * 100
}

export function calculateProfit(input: ProfitCalculatorInput): ProfitCalculatorResult {
  const {
    minPrice,
    appraisedValue,
    bidPrice,
    salePrice,
    holdingMonths,
    loanRatioByAppraisal,
    loanRatioByBidPrice,
    incomeLoanLimit,
    existingLoanWon,
    loanInterestRate,
    earlyRepaymentFeeRate,
    interiorCost,
    evictionCost,
    unpaidMaintenanceFee,
    extraRealtyFee,
    vatAmount,
    applyProgressiveDeduction,
    existingIncome,
  } = input;

  const bidRatio = minPrice > 0 ? bidPrice / minPrice : 0;

  const loanByAppraisal = Math.floor(appraisedValue * loanRatioByAppraisal);
  const loanByBidPrice = Math.floor(bidPrice * loanRatioByBidPrice);
  const loanLimit = Math.max(
    0,
    Math.min(loanByAppraisal, loanByBidPrice, incomeLoanLimit ?? Infinity),
  );
  const loanAmount = Math.max(0, loanLimit - Math.max(0, existingLoanWon));

  const taxRate = acquisitionTaxRate(bidPrice);
  const acquisitionTax = Math.round(bidPrice * taxRate);

  const loanInterest = Math.round((loanAmount * loanInterestRate) / 12 * holdingMonths);
  const earlyRepaymentFee = Math.round(loanAmount * earlyRepaymentFeeRate);

  const brokerageRate = saleBrokerageRate(salePrice);
  const saleBrokerageFee = Math.round(salePrice * brokerageRate);

  const totalAcquisitionCost =
    bidPrice +
    acquisitionTax +
    interiorCost +
    evictionCost +
    unpaidMaintenanceFee +
    saleBrokerageFee +
    loanInterest +
    earlyRepaymentFee;

  const equity = Math.max(0, totalAcquisitionCost - loanAmount);

  const saleMargin = salePrice - totalAcquisitionCost;
  const positiveMargin = Math.max(0, saleMargin);
  const positiveExistingIncome = Math.max(0, existingIncome);
  const combinedTaxBase = positiveExistingIncome + positiveMargin;

  // 한계세율 방식: 기존소득+매매차익 합산 과세표준의 세액에서, 기존소득만의 세액을
  // 뺀 나머지를 매매차익에 대한 증분세액으로 본다(종합소득세 실제 계산 방식과 동일).
  const { rate: capitalGainsTaxRate, deduction: bracketDeduction } =
    capitalGainsTaxBracket(combinedTaxBase);
  const capitalGainsTaxDeduction = applyProgressiveDeduction ? bracketDeduction : 0;
  const combinedTax = applyProgressiveDeduction
    ? progressiveTaxAmount(combinedTaxBase, true)
    : combinedTaxBase * capitalGainsTaxRate;
  const existingIncomeTax = applyProgressiveDeduction
    ? progressiveTaxAmount(positiveExistingIncome, true)
    : positiveExistingIncome * capitalGainsTaxBracket(positiveExistingIncome).rate;
  const capitalGainsTax = saleMargin > 0 ? Math.max(0, Math.round(combinedTax - existingIncomeTax)) : 0;

  const finalProfit = saleMargin - capitalGainsTax - extraRealtyFee - vatAmount;
  const profitRate = equity > 0 ? (finalProfit / equity) * 100 : 0;

  return {
    bidRatio,
    loanByAppraisal,
    loanByBidPrice,
    loanLimit,
    loanAmount,
    equity,
    acquisitionTaxRate: taxRate,
    acquisitionTax,
    loanInterest,
    earlyRepaymentFee,
    saleBrokerageRate: brokerageRate,
    saleBrokerageFee,
    totalAcquisitionCost,
    saleMargin,
    capitalGainsTaxRate,
    capitalGainsTaxDeduction,
    capitalGainsTax,
    finalProfit,
    profitRate,
  };
}

/** 물건의 area 문자열("40.41㎡" 등)에서 숫자를 추출해 85㎡ 초과 여부를 판정한다 */
export function isOver85Sqm(area: string | null | undefined): boolean {
  const num = Number.parseFloat(String(area ?? "").match(/[\d.]+/)?.[0] ?? "");
  return Number.isFinite(num) && num > 85;
}

/**
 * ProfitCalculatorPanel의 초기 입력값(낙찰가=최저가, 매도가=감정가, 보유4개월,
 * 인테리어200만·명도비200만·미납관리비100만, 부가세=매도가×10%×50% 등)을 그대로 재현해
 * "추정 수익"(카드에 노출되는 요약값)을 계산한다. 대출비율은 이 물건에 적용된 대출정책
 * 값을 그대로 사용한다.
 */
export function estimateDefaultProfit(params: {
  minPrice: number;
  appraisedValue: number;
  area: string | null | undefined;
  loanRatioByAppraisal: number;
  loanRatioByBidPrice: number;
  incomeLoanLimit?: number | null;
  existingLoanWon?: number;
}): ProfitCalculatorResult {
  const {
    minPrice,
    appraisedValue,
    area,
    loanRatioByAppraisal,
    loanRatioByBidPrice,
    incomeLoanLimit = null,
    existingLoanWon = 0,
  } = params;
  const over85 = isOver85Sqm(area);
  return calculateProfit({
    minPrice,
    appraisedValue,
    bidPrice: minPrice,
    salePrice: appraisedValue,
    holdingMonths: 4,
    loanRatioByAppraisal,
    loanRatioByBidPrice: Math.min(loanRatioByBidPrice, 1),
    incomeLoanLimit,
    existingLoanWon,
    loanInterestRate: 0.045,
    earlyRepaymentFeeRate: 0,
    interiorCost: 2_000_000,
    evictionCost: 2_000_000,
    unpaidMaintenanceFee: 1_000_000,
    extraRealtyFee: 0,
    isOver85sqm: over85,
    vatAmount: over85 ? Math.round(appraisedValue * 0.1 * 0.5) : 0,
    applyProgressiveDeduction: true,
    existingIncome: 0,
  });
}
