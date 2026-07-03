export interface InvestmentSignupInput {
  investableFunds: string;
  existingLoanAmount: string;
  housingCount: string;
  investmentGoal: string;
  targetReturn: string;
}

export type InvestmentValidationResult =
  | { ok: true; housingCount: number }
  | { ok: false; message: string };

const MIN_GOAL_LENGTH = 5;

function normalizeMoneyText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function isValidMoneyText(raw: string): boolean {
  const text = normalizeMoneyText(raw);
  if (text.length < 1) return false;
  if (/^\d+$/.test(text.replace(/,/g, ""))) return true;
  return /(\d|억|만|원|%)/.test(text);
}

export function validateInvestmentSignup(
  input: InvestmentSignupInput,
): InvestmentValidationResult {
  const investableFunds = normalizeMoneyText(input.investableFunds);
  const existingLoanAmount = normalizeMoneyText(input.existingLoanAmount);
  const investmentGoal = input.investmentGoal.replace(/\s+/g, " ").trim();
  const targetReturn = normalizeMoneyText(input.targetReturn);
  const parsedHousingCount = Number.parseInt(input.housingCount, 10);

  if (
    !investableFunds ||
    !existingLoanAmount ||
    !input.housingCount.trim() ||
    !investmentGoal ||
    !targetReturn
  ) {
    return { ok: false, message: "투자정보 항목을 모두 입력해 주세요." };
  }

  if (!isValidMoneyText(investableFunds)) {
    return {
      ok: false,
      message: "투자가능자금을 금액 형식으로 입력해 주세요. (예: 3억 5,000만원)",
    };
  }

  if (!isValidMoneyText(existingLoanAmount)) {
    return {
      ok: false,
      message: "기존대출금액을 금액 형식으로 입력해 주세요. (없으면 0)",
    };
  }

  if (Number.isNaN(parsedHousingCount) || parsedHousingCount < 0 || parsedHousingCount > 99) {
    return { ok: false, message: "주택수는 0~99 사이 숫자로 입력해 주세요." };
  }

  if (investmentGoal.length < MIN_GOAL_LENGTH) {
    return { ok: false, message: "투자목표를 5자 이상 입력해 주세요." };
  }

  if (targetReturn.length < 2) {
    return { ok: false, message: "목표 금액을 선택해 주세요." };
  }

  return { ok: true, housingCount: parsedHousingCount };
}
