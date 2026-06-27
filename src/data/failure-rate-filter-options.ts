import {
  buildFailureRateFilterOptions,
  getFailureRateFilterLabel,
  getFailureRateFilterOptions,
  type FailureRateFilterOption,
} from "@/lib/failure-rate";

export type { FailureRateFilterOption };
export { buildFailureRateFilterOptions, getFailureRateFilterLabel, getFailureRateFilterOptions };

/** 시/도 미선택 시 드롭다운 기본 옵션 */
export const FAILURE_RATE_FILTER_OPTIONS = buildFailureRateFilterOptions();
