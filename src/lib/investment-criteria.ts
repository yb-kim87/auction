import type { AuctionItem, UserProfile } from "@/types/auction";
import { parseMoneyToWon, parseIncomeToWon, formatWonShort } from "@/lib/investment-money";
import type { LoanPolicy } from "@/lib/api";

/** 정책 API 로드 전 사용하는 기본값 (관리자페이지 초기값과 동일) */
export const DEFAULT_LOAN_POLICIES: LoanPolicy[] = [
  {
    id: "regulated_first_time",
    label: "규제지역 · 생애최초",
    loanRatio: 10,
    appraisalRatio: 0.4,
    regulatedArea: true,
    loanUnavailable: false,
    businessLoanOnly: false,
    sortOrder: 0,
  },
  {
    id: "regulated_no_house",
    label: "규제지역 · 무주택 일반",
    loanRatio: 10,
    appraisalRatio: 0.4,
    regulatedArea: true,
    loanUnavailable: false,
    businessLoanOnly: false,
    sortOrder: 1,
  },
  {
    id: "regulated_owner",
    label: "규제지역 · 1주택 이상",
    loanRatio: 0,
    appraisalRatio: 0,
    regulatedArea: true,
    loanUnavailable: true,
    businessLoanOnly: false,
    sortOrder: 2,
  },
  {
    id: "unregulated_first_time",
    label: "비규제지역 · 생애최초",
    loanRatio: 0.9,
    appraisalRatio: 0.9,
    regulatedArea: false,
    loanUnavailable: false,
    businessLoanOnly: false,
    sortOrder: 3,
  },
  {
    id: "unregulated_no_house",
    label: "비규제지역 · 무주택 일반",
    loanRatio: 0.8,
    appraisalRatio: 0.7,
    regulatedArea: false,
    loanUnavailable: false,
    businessLoanOnly: false,
    sortOrder: 4,
  },
  {
    id: "unregulated_owner",
    label: "비규제지역 · 1주택 이상(사업자대출)",
    loanRatio: 0.7,
    appraisalRatio: 0.7,
    regulatedArea: false,
    loanUnavailable: false,
    businessLoanOnly: true,
    sortOrder: 5,
  },
];

/** 물건의 city/district 중 하나라도 등록된 규제지역명을 포함하면 규제지역으로 판정 */
export function isRegulatedArea(city: string, district: string, regionNames: string[]): boolean {
  if (regionNames.length === 0) return false;
  return regionNames.some(
    (name) => (city && city.includes(name)) || (district && district.includes(name)),
  );
}

/** 회원정보(주택수·생애최초 여부)와 물건의 규제지역 여부로 적용할 대출 정책을 선택 */
export function selectLoanPolicy(
  criteria: { housingCount: number; firstTimeBuyer: boolean },
  regulatedArea: boolean,
  policies: LoanPolicy[],
): LoanPolicy {
  const byId = (id: string) => policies.find((p) => p.id === id);
  let policy: LoanPolicy | undefined;
  if (regulatedArea) {
    if (criteria.housingCount > 0) {
      policy = byId("regulated_owner");
    } else {
      policy = criteria.firstTimeBuyer ? byId("regulated_first_time") : byId("regulated_no_house");
    }
  } else if (criteria.housingCount <= 0) {
    policy = criteria.firstTimeBuyer ? byId("unregulated_first_time") : byId("unregulated_no_house");
  } else {
    policy = byId("unregulated_owner");
  }
  return policy ?? byId("unregulated_no_house") ?? DEFAULT_LOAN_POLICIES[4];
}

export interface InvestmentCriteria {
  investableFunds: string;
  existingLoanAmount: string;
  housingCount: number;
  investmentGoal: string;
  firstTimeBuyer: boolean;
  annualNetIncome?: string;
  creditScore?: string;
}

export type InvestmentCriteriaInput = Omit<InvestmentCriteria, "housingCount"> & {
  housingCount: number | string;
};

export function criteriaFromProfile(profile: UserProfile): InvestmentCriteria {
  return {
    investableFunds: profile.investableFunds?.trim() ?? "",
    existingLoanAmount: profile.existingLoanAmount?.trim() ?? "",
    housingCount: profile.housingCount ?? 0,
    investmentGoal: profile.investmentGoal?.trim() ?? "",
    firstTimeBuyer: profile.firstTimeBuyer ?? false,
    annualNetIncome: profile.annualNetIncome?.trim() ?? "",
    creditScore: profile.creditScore?.trim() ?? "",
  };
}

export function normalizeCriteriaInput(input: InvestmentCriteriaInput): InvestmentCriteria {
  const parsed =
    typeof input.housingCount === "number"
      ? input.housingCount
      : Number.parseInt(String(input.housingCount), 10);
  return {
    investableFunds: input.investableFunds.replace(/\s+/g, " ").trim(),
    existingLoanAmount: input.existingLoanAmount.replace(/\s+/g, " ").trim(),
    housingCount: Number.isNaN(parsed) ? 0 : Math.max(0, parsed),
    investmentGoal: input.investmentGoal.replace(/\s+/g, " ").trim(),
    firstTimeBuyer: input.firstTimeBuyer,
  };
}

export function validateCriteriaForRecommend(
  input: InvestmentCriteriaInput,
): { ok: true; criteria: InvestmentCriteria; investableWon: number } | { ok: false; message: string } {
  const criteria = normalizeCriteriaInput(input);
  const investableWon = parseMoneyToWon(criteria.investableFunds);

  if (!criteria.investableFunds) {
    return { ok: false, message: "투자가능자금을 입력해 주세요." };
  }
  if (investableWon == null || investableWon <= 0) {
    return {
      ok: false,
      message: "투자가능자금을 금액 형식으로 입력해 주세요. (예: 3억 5,000만원)",
    };
  }

  if (criteria.existingLoanAmount) {
    const loanWon = parseMoneyToWon(criteria.existingLoanAmount);
    if (loanWon == null) {
      return { ok: false, message: "기존대출금액 형식을 확인해 주세요. (없으면 0)" };
    }
  }

  if (criteria.housingCount < 0 || criteria.housingCount > 99) {
    return { ok: false, message: "주택수는 0~99 사이로 입력해 주세요." };
  }

  return { ok: true, criteria, investableWon };
}

/**
 * 감정가×감정가비율, 낙찰가(최저가)×낙찰가비율, 연소득×소득배수(소득 기준 상한) 중
 * 가장 낮은 금액이 대출한도다. 대출 불가 정책이면 한도 0. 소득 정보가 없으면
 * 소득 기준은 적용하지 않는다.
 */
export function maxLoanAmount(
  minPrice: number,
  appraisedValue: number,
  policy: LoanPolicy,
  annualIncomeWon?: number,
  incomeLoanMultiplier?: number,
): number {
  if (policy.loanUnavailable) return 0;
  if (!minPrice || minPrice <= 0) return 0;
  const byMinPrice = minPrice * policy.loanRatio;
  const byAppraisal = appraisedValue > 0 ? appraisedValue * policy.appraisalRatio : Infinity;
  // 0원(소득없음)도 유효한 입력이라 그대로 반영한다. 소득 정보 자체가 없을
  // 때(undefined/null)만 소득 기준을 적용하지 않는다.
  const byIncome =
    annualIncomeWon != null ? Math.max(0, annualIncomeWon) * (incomeLoanMultiplier ?? 7) : Infinity;
  return Math.max(0, Math.floor(Math.min(byMinPrice, byAppraisal, byIncome)));
}

/**
 * 물건(감정가·최저가)과 정책 기준 필요 자기자금. 대출한도에서 기존대출액만큼
 * 추가로 차감한다(기존 대출이 있으면 신규 대출 여력이 줄어듦).
 */
export function requiredEquityForItem(
  minPrice: number,
  appraisedValue: number,
  policy: LoanPolicy,
  annualIncomeWon?: number,
  existingLoanWon?: number,
  incomeLoanMultiplier?: number,
): number {
  if (!minPrice || minPrice <= 0) return 0;
  const loanLimit = maxLoanAmount(minPrice, appraisedValue, policy, annualIncomeWon, incomeLoanMultiplier);
  const availableLoan = Math.max(0, loanLimit - (existingLoanWon ?? 0));
  return Math.max(0, minPrice - availableLoan);
}

/** 신용점수 문자열("750~799점", "900점 이상", "350점 미만" 등)에서 하한값을 파싱 */
export function parseCreditScoreLowerBound(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const text = raw.trim();
  if (text.includes("미만")) {
    const match = text.match(/(\d+)/);
    return match ? Number(match[1]) - 1 : null;
  }
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

/** 신용점수 750점 미만이면 대출 확인이 필요하다고 경고. 정보 없으면 경고하지 않음 */
export function needsCreditScoreWarning(creditScore: string | undefined): boolean {
  const lower = parseCreditScoreLowerBound(creditScore);
  return lower != null && lower < 750;
}

export function matchesInvestmentRecommend(
  item: AuctionItem,
  investableWon: number,
  criteria: {
    housingCount: number;
    firstTimeBuyer: boolean;
    annualNetIncome?: string;
    existingLoanAmount?: string;
  },
  policies: LoanPolicy[],
  regionNames: string[],
  incomeLoanMultiplier?: number,
): boolean {
  if (!item.minPrice || item.minPrice <= 0) return false;
  const regulated = isRegulatedArea(item.city, item.district, regionNames);
  const policy = selectLoanPolicy(criteria, regulated, policies);
  if (policy.loanUnavailable) return false;
  const annualIncomeWon = parseIncomeToWon(criteria.annualNetIncome) ?? undefined;
  const existingLoanWon = parseMoneyToWon(criteria.existingLoanAmount ?? "") ?? 0;
  return (
    requiredEquityForItem(
      item.minPrice,
      item.appraisedValue,
      policy,
      annualIncomeWon,
      existingLoanWon,
      incomeLoanMultiplier,
    ) <= investableWon
  );
}

export function buildRecommendSummary(matchCount: number): string {
  return `물건별 규제지역 여부에 따라 대출 정책이 다르게 적용됩니다 · 추천 ${matchCount}건`;
}

export function criteriaFieldsChanged(a: InvestmentCriteria, b: InvestmentCriteria): boolean {
  return (
    a.investableFunds !== b.investableFunds ||
    a.existingLoanAmount !== b.existingLoanAmount ||
    a.housingCount !== b.housingCount ||
    a.investmentGoal !== b.investmentGoal ||
    a.firstTimeBuyer !== b.firstTimeBuyer ||
    (a.annualNetIncome ?? "") !== (b.annualNetIncome ?? "") ||
    (a.creditScore ?? "") !== (b.creditScore ?? "")
  );
}
