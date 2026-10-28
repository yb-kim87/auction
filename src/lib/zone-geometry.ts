import type { RedevelopmentPoint } from "@/lib/api";

/** 구역 경계 판정용 기하 유틸 — 지오코딩 오차(수십 m)를 감안해 "경계 근처"도 구역 안으로 본다. */

/** 경계 오차범위 기본값(m). 주소 지오코딩은 보통 10~30m 어긋난다. */
export const DEFAULT_BOUNDARY_TOLERANCE_M = 30;

/** 좌표를 저장·표시할 최대 경계 거리(m) — 조사(호가·실거래)가 쓰는 최대 오차범위와 같다. 이 안이면 "구역 근처"로 본다. */
export const NEAR_BOUNDARY_MAX_M = 100;

const M_PER_DEG_LAT = 111_320;

export function pointInRing(lat: number, lng: number, ring: RedevelopmentPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const { lat: yi, lng: xi } = ring[i];
    const { lat: yj, lng: xj } = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 점에서 다각형 변까지의 최단거리(m). 점 주변을 평면(미터)으로 근사한다. */
export function distanceToRingMeters(lat: number, lng: number, ring: RedevelopmentPoint[]): number {
  const kx = Math.cos((lat * Math.PI) / 180) * M_PER_DEG_LAT;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j].lng - lng) * kx;
    const ay = (ring[j].lat - lat) * M_PER_DEG_LAT;
    const bx = (ring[i].lng - lng) * kx;
    const by = (ring[i].lat - lat) * M_PER_DEG_LAT;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
}

export type ZoneBox = {
  id: string;
  ring: RedevelopmentPoint[];
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export function buildZoneBoxes(zones: Array<{ id: string; polygon: RedevelopmentPoint[] }>): ZoneBox[] {
  return zones
    .filter((z) => z.polygon.length >= 3)
    .map((z) => {
      const lats = z.polygon.map((p) => p.lat);
      const lngs = z.polygon.map((p) => p.lng);
      return { id: z.id, ring: z.polygon, minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
    });
}

/** 점이 속한(또는 경계에서 toleranceM 이내인) 구역 id들. */
export function findZoneIds(lat: number, lng: number, boxes: ZoneBox[], toleranceM: number): string[] {
  const padLat = toleranceM / M_PER_DEG_LAT;
  const padLng = toleranceM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const ids: string[] = [];
  for (const b of boxes) {
    if (lat < b.minLat - padLat || lat > b.maxLat + padLat || lng < b.minLng - padLng || lng > b.maxLng + padLng) continue;
    if (pointInRing(lat, lng, b.ring) || (toleranceM > 0 && distanceToRingMeters(lat, lng, b.ring) <= toleranceM)) ids.push(b.id);
  }
  return ids;
}
