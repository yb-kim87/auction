import {
  buildFailureRateFilterOptions,
  getFailureRateFilterLabel,
  getFailureRateFilterLabelFromCities,
  getFailureRateFilterOptions,
  getFailureRateFilterOptionsFromCities,
  type FailureRateFilterOption,
} from "@/lib/failure-rate";

export type { FailureRateFilterOption };
export {
  buildFailureRateFilterOptions,
  getFailureRateFilterLabel,
  getFailureRateFilterLabelFromCities,
  getFailureRateFilterOptions,
  getFailureRateFilterOptionsFromCities,
};

/** 시/도 미선택 시 드롭다운 기본 옵션 */
export const FAILURE_RATE_FILTER_OPTIONS = buildFailureRateFilterOptions();
