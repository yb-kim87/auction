import zoneMeta from "@/data/jaegebal-zone-meta.json";
import type { RedevelopmentZone } from "@/lib/api";

/** 재개발닷컴 구역 스타일 — 2026-10-25 사용자가 확인 화면을 통과시켜 준 뒤 사이트 JS(색상표·그리기 코드)를 한 번 저장해 읽은 값이다.
 *  - 색: 사업유형(detail_type)별. 사업 진행 단계로 색을 바꾸지 않는다.
 *  - 진행 단계 그룹: planning(추진준비·연번부여·안전진단)은 점선+옅은 채움, completed(준공)는 옅은 선+채움 없음.
 *  - 선 두께 2, 선 투명도 0.8, 채움 투명도 0.1(선택 시 두께 3·선 1·채움 0.15).
 * 구역별 사업유형·단계 그룹은 저장해 둔 목록(src/data/jaegebal-zone-meta.json, 구역 id → [유형, 단계그룹])에서 찾는다. */
const TYPE_COLOR: Record<string, string> = {
  jaegebal: "#007bff",
  jaegebal_area: "#007bff",
  moatown: "#28a745",
  public: "#007bff",
  fast: "#dc3545",
  subwaytown: "#fd7e14",
  dosimpublic: "#20c997",
  dosimprivate: "#17a2b8",
  dosimprivate_live: "#17a2b8",
  dosimprivate_growth: "#17a2b8",
  small: "#1e7e34",
  small_town: "#28a745",
  garo: "#1e7e34",
  dandok_jaegeunchook: "#007bff",
  shared_jaegeunchook: "#764ba2",
  long_jeonsae: "#e83e8c",
  jjt: "#f39c12",
  virtual: "#6c757d",
  market: "#8d6e63",
  public_area: "#20c997",
};

const META = zoneMeta as unknown as Record<string, [string, "p" | "g" | "c", string]>;

export type ZoneStyle = { color: string; dashed: boolean; completed: boolean; typeKey: string };

export function zoneStyle(zone: Pick<RedevelopmentZone, "sourceKey" | "stage">): ZoneStyle {
  const id = /(\d+)$/.exec(zone.sourceKey ?? "")?.[1];
  const [typeKey, group] = (id && META[id]) || ["jaegebal", "g", ""];
  return {
    color: TYPE_COLOR[typeKey] ?? TYPE_COLOR.jaegebal,
    dashed: group === "p",
    completed: group === "c",
    typeKey,
  };
}

/** 구역의 법정동(예: 대림동, 문래동2가 → 문래동) — 재개발닷컴 원본 주소에서 뽑아 저장해 둔 값. 없으면 "". 좌표 역지오코딩보다 정확하고 빠르다. */
export function zoneLegalDong(zone: Pick<RedevelopmentZone, "sourceKey">): string {
  const id = /(\d+)$/.exec(zone.sourceKey ?? "")?.[1];
  return (id && META[id]?.[2]) || "";
}

export const ZONE_TYPE_LEGEND: Array<{ label: string; color: string }> = [
  { label: "재개발·공공재개발", color: TYPE_COLOR.jaegebal },
  { label: "신속통합기획", color: TYPE_COLOR.fast },
  { label: "모아타운", color: TYPE_COLOR.moatown },
  { label: "가로주택·소규모", color: TYPE_COLOR.garo },
  { label: "역세권활성화", color: TYPE_COLOR.subwaytown },
  { label: "도심공공", color: TYPE_COLOR.dosimpublic },
  { label: "재건축(아파트)", color: TYPE_COLOR.shared_jaegeunchook },
  { label: "지역주택조합", color: TYPE_COLOR.jjt },
];

// ── 사업종류·진행단계 필터(재개발닷컴 필터 분류 그대로) ─────────────────────────────────

export type FilterGroup = { value: string; label: string; children: Array<{ value: string; label: string; color?: string; keywords?: string[] }> };

export const TYPE_FILTER_TREE: FilterGroup[] = [
  {
    value: "private",
    label: "민간주도",
    children: [
      { value: "jaegebal", label: "재개발", color: TYPE_COLOR.jaegebal },
      { value: "fast", label: "신통기획", color: TYPE_COLOR.fast },
      { value: "dosimprivate", label: "민간도심복합", color: TYPE_COLOR.dosimprivate },
      { value: "dandok_jaegeunchook", label: "재건축(단독주택)", color: TYPE_COLOR.dandok_jaegeunchook },
      { value: "shared_jaegeunchook", label: "재건축(아파트)", color: TYPE_COLOR.shared_jaegeunchook },
      { value: "jjt", label: "지역주택조합", color: TYPE_COLOR.jjt },
    ],
  },
  {
    value: "public_led",
    label: "공공주도",
    children: [
      { value: "public", label: "공공재개발", color: TYPE_COLOR.public },
      { value: "dosimpublic", label: "도심공공복합", color: TYPE_COLOR.dosimpublic },
      { value: "subwaytown", label: "역세권활성화", color: TYPE_COLOR.subwaytown },
      { value: "long_jeonsae", label: "장기전세(역세권시프트)", color: TYPE_COLOR.long_jeonsae },
    ],
  },
  {
    value: "small",
    label: "소규모",
    children: [
      { value: "moatown", label: "모아타운", color: TYPE_COLOR.moatown },
      { value: "garo", label: "가로주택", color: TYPE_COLOR.garo },
      { value: "small", label: "소규모", color: TYPE_COLOR.small },
    ],
  },
  {
    value: "etc",
    label: "기타",
    children: [
      { value: "virtual", label: "가상구역", color: TYPE_COLOR.virtual },
      { value: "market", label: "시장정비", color: TYPE_COLOR.market },
      { value: "public_area", label: "공공주택지구", color: TYPE_COLOR.public_area },
    ],
  },
];

export const STAGE_FILTER_TREE: FilterGroup[] = [
  {
    value: "planning",
    label: "추진중",
    children: [
      { value: "추진준비", label: "추진준비", keywords: ["사전타당성", "조합원모집신고"] },
      { value: "연번부여", label: "연번부여" },
      { value: "안전진단", label: "안전진단" },
    ],
  },
  {
    value: "progress",
    label: "진행중",
    children: [
      { value: "대상지선정", label: "대상지선정", keywords: ["관리계획수립", "기획완료", "정비예정"] },
      { value: "구역지정", label: "구역지정", keywords: ["관리계획고시", "지구지정", "입안제안", "열람공고", "위원회심의"] },
      { value: "추진위승인", label: "추진위승인", keywords: ["추진위원회", "추진위구성"] },
      { value: "조합설립인가", label: "조합설립인가", keywords: ["사업시행자지정", "시공사선정", "건축심의", "통합심의", "교육심의", "조합창립총회"] },
      { value: "사업시행인가", label: "사업시행인가", keywords: ["사업계획승인"] },
      { value: "관리처분인가", label: "관리처분인가", keywords: ["이주", "철거"] },
      { value: "착공", label: "착공" },
    ],
  },
  { value: "completed", label: "완료", children: [{ value: "준공", label: "준공", keywords: ["청산", "해산"] }] },
];

const TYPE_ALIAS: Record<string, string> = {
  jaegebal_area: "jaegebal",
  small_town: "small",
  dosimprivate_live: "dosimprivate",
  dosimprivate_growth: "dosimprivate",
  etc: "virtual",
};

/** 필터용 사업종류 키(별칭을 필터 분류로 합친다). */
export function zoneFilterType(zone: Pick<RedevelopmentZone, "sourceKey" | "stage">): string {
  const k = zoneStyle(zone).typeKey;
  return TYPE_ALIAS[k] ?? k;
}

/** 목록 표시용 사업종류 — 저장된 메타가 없으면 기본 재개발로 추측하지 않는다. */
export function zoneBusinessTypeLabel(zone: Pick<RedevelopmentZone, "sourceKey" | "sourceDatasetId">): string {
  if (zone.sourceDatasetId !== "jaegebal") return "사업종류 미확인";
  const id = /(\d+)$/.exec(zone.sourceKey ?? "")?.[1];
  const typeKey = id ? META[id]?.[0] : undefined;
  if (!typeKey) return "사업종류 미확인";
  const normalized = TYPE_ALIAS[typeKey] ?? typeKey;
  return TYPE_FILTER_TREE.flatMap((group) => group.children).find((child) => child.value === normalized)?.label ?? "사업종류 미확인";
}

/** 구역 진행단계 → 필터 하위 단계 값. 재개발닷컴과 같은 키워드 매칭, 없으면 null(단계 그룹으로만 매칭). */
export function zoneFilterStage(stage: string | null | undefined): string | null {
  const s = (stage ?? "").trim();
  if (!s) return null;
  for (const g of STAGE_FILTER_TREE) {
    for (const c of g.children) {
      if (s.includes(c.value) || (c.keywords ?? []).some((k) => s.includes(k))) return c.value;
    }
  }
  return null;
}

/** 선택된 사업종류·진행단계(비어 있으면 전체)에 구역이 해당하는지. */
export function zonePassesFilters(zone: Pick<RedevelopmentZone, "sourceKey" | "stage">, types: string[], stages: string[]): boolean {
  if (types.length > 0 && !types.includes(zoneFilterType(zone))) return false;
  if (stages.length > 0) {
    const child = zoneFilterStage(zone.stage);
    if (child) return stages.includes(child);
    // 단계 이름이 분류에 없으면 저장된 단계 그룹(추진중/진행중/완료)에 속한 하위 단계가 하나라도 선택됐을 때 통과.
    const id = /(\d+)$/.exec(zone.sourceKey ?? "")?.[1];
    const groupKey = ({ p: "planning", g: "progress", c: "completed" } as const)[(id && META[id]?.[1]) || "g"];
    const grp = STAGE_FILTER_TREE.find((g) => g.value === groupKey);
    return !!grp && grp.children.some((c) => stages.includes(c.value));
  }
  return true;
}
