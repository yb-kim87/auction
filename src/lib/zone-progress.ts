/** 사업별 세부 절차가 다를 수 있으므로 완료율이 아닌 참고용 위치다. */
export const PROGRESS_STEPS = ["추진 준비", "대상지 선정", "구역 지정", "사업주체 구성", "사업시행인가", "관리처분인가", "이주·착공", "준공"];

export function stagePosition(value: string | null | undefined): number | null {
  const s = (value ?? "").replace(/\s+/g, "");
  if (!s) return null;
  if (/준공|청산|해산/.test(s)) return 7;
  if (/이주|철거|착공/.test(s)) return 6;
  if (/관리처분/.test(s)) return 5;
  if (/사업시행(?:계획)?인가|사업계획승인/.test(s)) return 4;
  if (/조합설립|사업시행자지정|추진위|추진위원회|조합창립|시공사선정/.test(s)) return 3;
  if (/공람|열람|입안|위원회심의|정비예정|기획완료|관리계획수립|대상지선정|후보지선정/.test(s)) return 1;
  if (/구역지정|지구지정|관리계획고시/.test(s)) return 2;
  if (/추진준비|연번부여|안전진단|사전타당성|조합원모집신고/.test(s)) return 0;
  return null;
}

/** 실제 단계명을 우선 표시하고, 의미가 다른 참고 분류만 괄호로 덧붙인다. */
export function stageDisplayLabel(value: string | null | undefined): string {
  const actual = value?.trim() || "미확인";
  const position = stagePosition(value);
  if (position == null) return actual;
  const group = PROGRESS_STEPS[position];
  return actual.replace(/\s+/g, "") === group.replace(/\s+/g, "") ? actual : `${actual} (${group})`;
}
