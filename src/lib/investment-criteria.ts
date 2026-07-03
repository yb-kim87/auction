import type { AuctionItem, UserProfile } from "@/types/auction";
import { parseMoneyToWon, formatWonShort } from "@/lib/investment-money";
import type { LoanPolicy } from "@/lib/api";

/** 정책 API 로드 전 사용하는 기본값 (관리자페이지 초기값과 동일) */
export const DEFAULT_LOAN_POLICIES: LoanPolicy[] = [
  { id: "first_time", label: "생애최초 (무주택 + 생애최초)", loanRatio: 0.9, sortOrder: 0 },
  { id: "no_house", label: "무주택 일반", loanRatio: 0.8, sortOrder: 1 },
  { id: "one_house", label: "1주택", loanRatio: 0.7, sortOrder: 2 },
  { id: "multi_house", label: "2주택 이상", loanRatio: 0.7, sortOrder: 3 },
];

/** 회원정보(주택수·생애최초 여부)로 적용할 대출 정책을 선택 */
export function selectLoanPolicy(
  criteria: { housingCount: number; firstTimeBuyer: boolean },
  policies: LoanPolicy[],
): LoanPolicy {
  const byId = (id: string) => policies.find((p) => p.id === id);
  let policy: LoanPolicy | undefined;
  if (criteria.housingCount <= 0) {
    policy = criteria.firstTimeBuyer ? byId("first_time") : byId("no_house");
  } else if (criteria.housingCount === 1) {
    policy = byId("one_house");
  } else {
    policy = byId("multi_house");
  }
  return policy ?? DEFAULT_LOAN_POLICIES[1];
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

/** 최저가 기준 필요 자기자금 */
export function requiredEquityForMinPrice(minPrice: number, loanRatio: number): number {
  if (!minPrice || minPrice <= 0) return 0;
  return Math.ceil(minPrice * (1 - loanRatio));
}

/** 투자가능자금으로 감당 가능한 최대 최저가 */
export function maxAffordableMinPrice(investableWon: number, loanRatio: number): number {
  if (investableWon <= 0) return 0;
  const equityRatio = 1 - loanRatio;
  if (equityRatio <= 0) return Infinity;
  return Math.floor(investableWon / equityRatio);
}

export function matchesInvestmentRecommend(
  item: AuctionItem,
  investableWon: number,
  loanRatio: number,
): boolean {
  if (!item.minPrice || item.minPrice <= 0) return false;
  return requiredEquityForMinPrice(item.minPrice, loanRatio) <= investableWon;
}

export function buildRecommendSummary(
  investableWon: number,
  matchCount: number,
  policy: LoanPolicy,
): string {
  const maxPrice = maxAffordableMinPrice(investableWon, policy.loanRatio);
  return `${policy.label} 대출 ${Math.round(policy.loanRatio * 100)}% 적용 · 자기자금 ${formatWonShort(investableWon)} 최저가 ${formatWonShort(maxPrice)}이하 투자 가능 · 추천 ${matchCount}건`;
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
