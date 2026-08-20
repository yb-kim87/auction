import { getFailureRateRatio } from "@/lib/failure-rate";

export const fmt = (n: number) => n.toLocaleString("ko-KR");

export const fmtEok = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 100000000) {
    const body = `${(abs / 100000000).toFixed(2)}억`;
    return n < 0 ? `-${body}` : body;
  }
  if (abs >= 10000) {
    const body = `${(abs / 10000).toFixed(0)}만`;
    return n < 0 ? `-${body}` : body;
  }
  return fmt(n);
};

export const fmtFailureRate = (minPrice: number, appraisedValue: number) => {
  const ratio = getFailureRateRatio(minPrice, appraisedValue);
  if (ratio == null) return null;
  return `${ratio}%`;
};

export const fmtDiffAmount = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 100000000) {
    const body = `${(abs / 100000000).toFixed(1)}억`;
    return n < 0 ? `-${body}` : `+${body}`;
  }
  if (abs >= 10000) {
    const body = `${(abs / 10000).toFixed(0)}만`;
    return n < 0 ? `-${body}` : `+${body}`;
  }
  const sign = n >= 0 ? "+" : "";
  return `${sign}${fmt(n)}`;
};

export const diff = (a: number, b: number) => {
  const d = a - b;
  return { val: fmtDiffAmount(d), positive: d >= 0 };
};

// ─── 공통 텍스트/레이아웃 클래스(검색 필터·테이블에서 함께 사용) ──────────────
export const LIST_TEXT = "text-[15px] leading-snug";
export const LABEL_TEXT = "text-[14px] leading-snug";
export const SECTION_TEXT = "text-[16px] leading-snug";
export const FILTER_ROW = "grid grid-cols-1 sm:grid-cols-[5.5rem_1fr] gap-x-6 gap-y-1.5";
export const FILTER_LABEL = `${LIST_TEXT} font-semibold text-muted-foreground whitespace-nowrap`;
export const FILTER_SELECT_CITY = "w-full sm:w-[9rem]";
export const FILTER_SELECT_DISTRICT = "w-full sm:w-[9rem]";
export const FILTER_SELECT_WARD = "w-full sm:w-[8.5rem]";
export const FILTER_SELECT_PROP = "w-full sm:w-[10.5rem]";
export const FILTER_SELECT_PRICE = "w-[7.25rem] sm:w-[7.25rem]";
export const FILTER_SELECT_FAILURE = "w-full sm:w-[13.5rem]";
export const FILTER_SELECT_YEAR = "w-[6.5rem]";
export const FILTER_SELECT_PROGRESS = "w-full sm:w-[7rem]";
