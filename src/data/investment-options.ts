import { formatMoneyOptionLabel } from "@/lib/investment-money";

export type InvestmentSelectOption = {
  value: string;
  label: string;
};

const TEN_M = 10_000_000;
const FIFTY_M = 50_000_000;
const ONE_HUNDRED_M = 100_000_000;

function buildWonSteps(ranges: { from: number; to: number; step: number }[]): number[] {
  const values = new Set<number>();
  for (const { from, to, step } of ranges) {
    for (let won = from; won <= to; won += step) {
      values.add(won);
    }
  }
  return Array.from(values).sort((a, b) => a - b);
}

function toMoneyOptions(wons: number[]): InvestmentSelectOption[] {
  return wons.map((won) => {
    const label = formatMoneyOptionLabel(won);
    return { value: label, label };
  });
}

function withOverflowOption(
  options: InvestmentSelectOption[],
  overflowLabel: string,
): InvestmentSelectOption[] {
  return [...options, { value: overflowLabel, label: overflowLabel }];
}

/** 1천만(1억 미만) → 1천만(2억까지) → 5천만(5억까지) → 1억(20억까지) */
const INVESTABLE_WON_STEPS = buildWonSteps([
  { from: TEN_M, to: ONE_HUNDRED_M - TEN_M, step: TEN_M },
  { from: ONE_HUNDRED_M, to: 200_000_000, step: TEN_M },
  { from: 200_000_000, to: 500_000_000, step: FIFTY_M },
  { from: 500_000_000, to: 2_000_000_000, step: ONE_HUNDRED_M },
]);

export const INVESTABLE_FUNDS_OPTIONS: InvestmentSelectOption[] = withOverflowOption(
  toMoneyOptions(INVESTABLE_WON_STEPS),
  "20억 이상",
);

/** 1천만~1억(1천만) → 1억~3억(5천만) → 3억~10억(1억) */
const EXISTING_LOAN_WON_STEPS = buildWonSteps([
  { from: TEN_M, to: ONE_HUNDRED_M - TEN_M, step: TEN_M },
  { from: ONE_HUNDRED_M, to: 300_000_000, step: FIFTY_M },
  { from: 300_000_000, to: 1_000_000_000, step: ONE_HUNDRED_M },
]);

export const EXISTING_LOAN_OPTIONS: InvestmentSelectOption[] = [
  { value: "0", label: "없음 (0)" },
  ...toMoneyOptions(EXISTING_LOAN_WON_STEPS),
  { value: "10억 이상", label: "10억 이상" },
];

export const HOUSING_COUNT_OPTIONS: InvestmentSelectOption[] = [
  { value: "0", label: "0주택 (무주택)" },
  { value: "1", label: "1주택" },
  { value: "2", label: "2주택" },
  { value: "3", label: "3주택 이상" },
];

/** 목표 금액: 500만~5천만(500만) → 6천만~2억(1천만) → 2.5억~5억(5천만) → 6억~10억(1억) */
const TARGET_AMOUNT_WON_STEPS = buildWonSteps([
  { from: 5_000_000, to: 50_000_000, step: 5_000_000 },
  { from: 60_000_000, to: 200_000_000, step: TEN_M },
  { from: 250_000_000, to: 500_000_000, step: FIFTY_M },
  { from: 600_000_000, to: 1_000_000_000, step: ONE_HUNDRED_M },
]);

export const TARGET_RETURN_OPTIONS: InvestmentSelectOption[] = withOverflowOption(
  toMoneyOptions(TARGET_AMOUNT_WON_STEPS),
  "1억 이상",
);
