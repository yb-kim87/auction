import type { RedevelopmentZone } from "@/lib/api";

/** 재개발닷컴 구역 목록 데이터에서 뽑아 저장해 둔 구역 지표(추가 접속 없이 쓴다). 금액은 만원 단위.
 * 파일이 커서(약 0.5MB) 구역 팝업을 열 때 한 번만 늦게 불러온다. */
export type ZoneStats = {
  /** 세대수 */ s?: number;
  /** 소유자 수 */ o?: number;
  /** 노후도 % [현재, 5년 후, 10년 후] (30년 기준) */ od?: Array<number | null>;
  /** 용도지역 비율 [[이름, %], …] */ zr?: Array<[string, number]>;
  /** 평균 전세가율 % */ jr?: number;
  /** 평균 대지평당가(만원/평) */ lp?: number;
  /** 호가 건수 */ ac?: number;
  /** 최저 호가(만원) */ am?: number;
  /** 최저 호가 기준 초기투자금(만원) */ ai?: number;
  /** 다세대 등 혼합 평균가(만원) */ mp?: number;
  /** 단독 평균가(만원) */ dp?: number;
  /** 시공사 */ c?: string | string[];
  /** 총 세대(계획) */ th?: number;
  /** 일반분양 세대 */ gs?: number;
  /** 최근 진행 완료일 */ d?: string;
  /** 토지 비율 % [혼합, 단독, 근린] */ lr?: Array<number | null>;
  /** 역세권 비율 % [350m, 500m] */ st?: Array<number | null>;
  /** 세부 단계 */ ds?: string;
  /** 권리산정기준일(상세 페이지에서 확인) */ rb?: string | null;
  /** 일부 구역 권리산정기준일 */ rz?: Array<{ d: string; n?: string | null }>;
  /** 권리산정기준일 확인 시각(ISO) */ rf?: string;
  /** 진행 현황 — 단계별 완료 여부·완료일(재개발닷컴 상세 페이지) */ pg?: Array<{ n: string; done: boolean; d: string | null }>;
  /** 현재 단계 경과일(cur)·같은 유형 구역 중앙값(med) */ ps?: { cur: number | null; med: number | null } | null;
  /** 세부내용(재개발닷컴 상세 페이지, 값이 있는 항목만) */ dt?: ZoneDetails;
  /** 최근 고시·공고(d 날짜, t 제목, s 재개발닷컴 주소 조각, k 종류) */ gn?: Array<{ d: string | null; t: string; s: string | null; k: string | null }>;
};

/** 재개발닷컴 상세 페이지의 세부내용(짧은 키). 값이 있는 항목만 들어 있다. */
export type ZoneDetails = {
  /** 투기과열지구 */ oh?: boolean;
  /** 조정대상지역 */ rt?: boolean;
  /** 토지거래허가구역(st 상태, s 시작, e 종료) */ lt?: { st?: string; s?: string; e?: string };
  /** 전매·지위양도 구분 코드 */ tr?: string;
  /** 추진위·조합 사무실 이름 */ on?: string;
  /** 사무실 주소 */ oa?: string;
  /** 사무실 전화 */ op?: string;
  /** 시공사 */ cs?: string[];
  /** 신축 아파트명 */ an?: string;
  /** 총세대 */ hh?: number;
  /** 분양세대 */ hs?: number;
  /** 조합원분양 */ hm?: number;
  /** 일반분양 */ hg?: number;
  /** 임대 */ hr?: number;
  /** 구역면적(㎡) */ ar?: number;
  /** 토지등소유자 */ ow?: number;
  /** 용적률(%) */ fa?: number;
  /** 건폐율(%) */ bc?: number;
  /** 최고층 */ mx?: number;
  /** 평당 공사비(만원) */ cc?: number;
};

let cache: Promise<Record<string, ZoneStats>> | null = null;

export function loadZoneStats(): Promise<Record<string, ZoneStats>> {
  if (!cache) cache = import("@/data/jaegebal-zone-stats.json").then((m) => (m.default ?? m) as unknown as Record<string, ZoneStats>);
  return cache;
}

/** 저장해 둔 정적 지표 위에 구역 업데이트로 DB에 갱신된 지표(`zone.stats`)를 덮어 쓴다(DB에 없는 항목은 정적 값 유지). */
export function zoneStatsOf(all: Record<string, ZoneStats> | null, zone: Pick<RedevelopmentZone, "sourceKey" | "stats">): ZoneStats | null {
  const id = /(\d+)$/.exec(zone.sourceKey ?? "")?.[1];
  const base = (all && id && all[id]) || null;
  if (!zone.stats || Object.keys(zone.stats).length === 0) return base;
  return { ...(base ?? {}), ...(zone.stats as ZoneStats) };
}
