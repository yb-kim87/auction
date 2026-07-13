import type { AuctionItem, UserProfile } from "@/types/auction";
import { parseMoneyToWon, formatWonShort } from "@/lib/investment-money";
import type { LoanPolicy } from "@/lib/api";

/** 정책 API 로드 전 사용하는 기본값 (관리자페이지 초기값과 동일) */
export const DEFAULT_LOAN_POLICIES: LoanPolicy[] = [
  {
    id: "regulated_no_house",
    label: "규제지역 · 무주택(생애최초 포함)",
    loanRatio: 10,
    appraisalRatio: 0.4,
    regulatedArea: true,
    loanUnavailable: false,
    businessLoanOnly: false,
    sortOrder: 0,
  },
  {
    id: "regulated_owner",
    label: "규제지역 · 1주택 이상",
    loanRatio: 0,
    appraisalRatio: 0,
    regulatedArea: true,
    loanUnavailable: true,
    businessLoanOnly: false,
    sortOrder: 1,
  },
  {
    id: "unregulated_first_time",
    label: "비규제지역 · 생애최초",
    loanRatio: 0.9,
    appraisalRatio: 0.9,
    regulatedArea: false,
    loanUnavailable: false,
    businessLoanOnly: false,
    sortOrder: 2,
  },
  {
    id: "unregulated_no_house",
    label: "비규제지역 · 무주택 일반",
    loanRatio: 0.8,
    appraisalRatio: 0.7,
    regulatedArea: false,
    loanUnavailable: false,
    businessLoanOnly: false,
    sortOrder: 3,
  },
  {
    id: "unregulated_owner",
    label: "비규제지역 · 1주택 이상(사업자대출)",
    loanRatio: 0.7,
    appraisalRatio: 0.7,
    regulatedArea: false,
    loanUnavailable: false,
    businessLoanOnly: true,
    sortOrder: 4,
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
    policy = criteria.housingCount <= 0 ? byId("regulated_no_house") : byId("regulated_owner");
  } else if (criteria.housingCount <= 0) {
    policy = criteria.firstTimeBuyer ? byId("unregulated_first_time") : byId("unregulated_no_house");
  } else {
    policy = byId("unregulated_owner");
  }
  return policy ?? DEFAULT_LOAN_POLICIES[3];
}

export interface InvestmentCriteria {
  investableFunds: string;
  existingLoanAmount: string;
  housingCount: number;
  investmentGoal: string;
  firstTimeBuyer: boolean;
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
 * 감정가×감정가비율과 낙찰가(최저가)×낙찰가비율 중 더 낮은 금액이 실제 대출한도다
 * (경매 대출의 일반적인 산정 방식). 대출 불가 정책이면 한도 0.
 */
export function maxLoanAmount(minPrice: number, appraisedValue: number, policy: LoanPolicy): number {
  if (policy.loanUnavailable) return 0;
  if (!minPrice || minPrice <= 0) return 0;
  const byMinPrice = minPrice * policy.loanRatio;
  const byAppraisal = appraisedValue > 0 ? appraisedValue * policy.appraisalRatio : Infinity;
  return Math.max(0, Math.floor(Math.min(byMinPrice, byAppraisal)));
}

/** 물건(감정가·최저가)과 정책 기준 필요 자기자금 */
export function requiredEquityForItem(
  minPrice: number,
  appraisedValue: number,
  policy: LoanPolicy,
): number {
  if (!minPrice || minPrice <= 0) return 0;
  return Math.max(0, minPrice - maxLoanAmount(minPrice, appraisedValue, policy));
}

export function matchesInvestmentRecommend(
  item: AuctionItem,
  investableWon: number,
  criteria: { housingCount: number; firstTimeBuyer: boolean },
  policies: LoanPolicy[],
  regionNames: string[],
): boolean {
  if (!item.minPrice || item.minPrice <= 0) return false;
  const regulated = isRegulatedArea(item.city, item.district, regionNames);
  const policy = selectLoanPolicy(criteria, regulated, policies);
  if (policy.loanUnavailable) return false;
  return requiredEquityForItem(item.minPrice, item.appraisedValue, policy) <= investableWon;
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
    a.firstTimeBuyer !== b.firstTimeBuyer
  );
}
