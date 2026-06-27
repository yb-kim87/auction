import { normalizeCity } from "@/data/korea-regions";

/** 감정가 대비 최저가 비율(표시·필터와 동일한 반올림) */
export function getFailureRateRatio(minPrice: number, appraisedValue: number): number | null {
  if (!minPrice || !appraisedValue || appraisedValue <= 0) return null;
  return Math.round((minPrice / appraisedValue) * 100);
}

export function matchesFailureRateFilter(
  minPrice: number,
  appraisedValue: number,
  selectedRate: string,
): boolean {
  if (!selectedRate) return true;
  const ratio = getFailureRateRatio(minPrice, appraisedValue);
  if (ratio === null) return false;
  return ratio === Number(selectedRate);
}

export type FailureRateRegion = "seoul" | "regional";

export type FailureRateFilterOption = {
  value: string;
  label: string;
};

const SEOUL_CITY = "서울특별시";

export function getFailureRateRegionFromCity(city: string): FailureRateRegion | null {
  if (!city) return null;
  return normalizeCity(city) === SEOUL_CITY ? "seoul" : "regional";
}

function buildRoundRates(base: number, maxRound: number): { round: number; rate: number }[] {
  const result: { round: number; rate: number }[] = [];
  let current = 100;
  for (let round = 0; round <= maxRound; round++) {
    result.push({ round, rate: Math.round(current) });
    current *= base;
  }
  return result;
}

function formatRoundLabel(seoulRound: number | null, gyeonggiRound: number | null): string {
  if (seoulRound === 0 || gyeonggiRound === 0) return "신건";
  const parts: string[] = [];
  if (seoulRound != null) parts.push(`서울 ${seoulRound}회`);
  if (gyeonggiRound != null) parts.push(`경기·지방 ${gyeonggiRound}회`);
  return parts.join(" · ");
}

function buildSeoulOptions(maxRound: number): FailureRateFilterOption[] {
  return buildRoundRates(0.8, maxRound)
    .map(({ round, rate }) => ({
      value: String(rate),
      label: round === 0 ? `${rate}% (신건)` : `${rate}% (서울 ${round}회)`,
    }))
    .sort((a, b) => Number(b.value) - Number(a.value));
}

function buildRegionalOptions(maxRound: number): FailureRateFilterOption[] {
  return buildRoundRates(0.7, maxRound)
    .map(({ round, rate }) => ({
      value: String(rate),
      label: round === 0 ? `${rate}% (신건)` : `${rate}% (경기·지방 ${round}회)`,
    }))
    .sort((a, b) => Number(b.value) - Number(a.value));
}

function buildCombinedOptions(maxRound: number): FailureRateFilterOption[] {
  const seoul = buildRoundRates(0.8, maxRound);
  const gyeonggi = buildRoundRates(0.7, maxRound);

  const byRate = new Map<number, { seoulRound: number | null; gyeonggiRound: number | null }>();

  for (const { round, rate } of seoul) {
    const entry = byRate.get(rate) ?? { seoulRound: null, gyeonggiRound: null };
    entry.seoulRound = round;
    byRate.set(rate, entry);
  }
  for (const { round, rate } of gyeonggi) {
    const entry = byRate.get(rate) ?? { seoulRound: null, gyeonggiRound: null };
    entry.gyeonggiRound = round;
    byRate.set(rate, entry);
  }

  return [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rate, rounds]) => ({
      value: String(rate),
      label: `${rate}% (${formatRoundLabel(rounds.seoulRound, rounds.gyeonggiRound)})`,
    }));
}

/** 주소 시/도 선택에 따라 서울(80%)·경기·지방(70%)·전체 옵션 반환 */
export function buildFailureRateFilterOptions(
  region: FailureRateRegion | null = null,
  maxRound = 8,
): FailureRateFilterOption[] {
  if (region === "seoul") return buildSeoulOptions(maxRound);
  if (region === "regional") return buildRegionalOptions(maxRound);
  return buildCombinedOptions(maxRound);
}

export function getFailureRateFilterOptions(city: string, maxRound = 8): FailureRateFilterOption[] {
  return buildFailureRateFilterOptions(getFailureRateRegionFromCity(city), maxRound);
}

export function getFailureRateFilterLabel(value: string, city = "") {
  return getFailureRateFilterOptions(city).find((option) => option.value === value)?.label ?? `${value}%`;
}
