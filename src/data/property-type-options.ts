/** 빌라 필터에 포함되는 용도 */
export const VILLA_USAGE_TYPES = [
  "다세대주택",
  "도시형생활주택",
  "연립주택",
] as const;

const VILLA_USAGE_SET = new Set<string>(VILLA_USAGE_TYPES);

/** 물건종류 검색 필터 옵션 */
export const PROPERTY_TYPE_OPTIONS = [
  "아파트",
  "빌라",
  "오피스텔(주거)",
  "단독주택",
  "다가구주택",
  "기숙사",
  "상가주택",
  "상업 및 산업용",
  "근린생활시설",
  "오피스텔(상업)",
  "근린상가",
] as const;

export type PropertyTypeOption = (typeof PROPERTY_TYPE_OPTIONS)[number];

export function matchesPropertyType(
  item: { usage: string; propType: string },
  selected: string,
) {
  if (!selected) return true;

  if (selected === "아파트") {
    // usage가 실제 용도(연립·다세대 등). propType은 주소 키워드 추론이라 오분류 가능.
    return item.usage === "아파트";
  }

  if (selected === "빌라") {
    return VILLA_USAGE_SET.has(item.usage) || item.propType === "빌라";
  }

  return item.usage === selected;
}
