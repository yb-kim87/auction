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
};

let cache: Promise<Record<string, ZoneStats>> | null = null;

export function loadZoneStats(): Promise<Record<string, ZoneStats>> {
  if (!cache) cache = import("@/data/jaegebal-zone-stats.json").then((m) => (m.default ?? m) as unknown as Record<string, ZoneStats>);
  return cache;
}

export function zoneStatsOf(all: Record<string, ZoneStats> | null, zone: Pick<RedevelopmentZone, "sourceKey">): ZoneStats | null {
  const id = /(\d+)$/.exec(zone.sourceKey ?? "")?.[1];
  return (all && id && all[id]) || null;
}
