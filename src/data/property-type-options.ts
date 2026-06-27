/** 물건종류 검색 필터 옵션 */
export const PROPERTY_TYPE_OPTIONS = [
  "아파트",
  "다세대주택",
  "도시형생활주택",
  "연립주택",
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
  if (item.usage === selected) return true;
  if (selected === "아파트" && item.propType === "아파트") return true;
  return false;
}
