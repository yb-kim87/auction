/** 여러 좌표점으로부터 다각형을 만드는 유틸 — 재개발 구역 자동 수집
 * (upisRebuild 등)이 지오코딩한 점들로부터 구역 경계를 근사할 때 쓴다
 * (설계: docs/redevelopment-zone-data-pipeline-design.md §2.2). */

export type LatLng = { lat: number; lng: number };

/** Graham scan — 점 3개 이상일 때 볼록 껍질(convex hull)을 계산한다.
 * lng를 x, lat을 y로 취급해 평면 기하로 계산(작은 지역 규모라 지구
 * 곡률 보정 없이도 충분히 정확). */
export function convexHull(points: LatLng[]): LatLng[] {
  const pts = dedupe(points);
  if (pts.length < 3) return pts;

  const start = pts.reduce((min, p) => (p.lat < min.lat || (p.lat === min.lat && p.lng < min.lng) ? p : min));
  const sorted = pts
    .filter((p) => p !== start)
    .sort((a, b) => {
      const angleA = Math.atan2(a.lat - start.lat, a.lng - start.lng);
      const angleB = Math.atan2(b.lat - start.lat, b.lng - start.lng);
      return angleA - angleB;
    });

  const cross = (o: LatLng, a: LatLng, b: LatLng) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);

  const hull: LatLng[] = [start];
  for (const p of sorted) {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
      hull.pop();
    }
    hull.push(p);
  }
  return hull;
}

function dedupe(points: LatLng[]): LatLng[] {
  const seen = new Set<string>();
  const result: LatLng[] = [];
  for (const p of points) {
    const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }
  return result;
}

/** 점 하나(또는 2개)뿐이라 다각형을 못 만들 때, 중심점을 기준으로 한
 * 작은 원(다각형 근사)을 만들어 대신 쓴다 — 이렇게 하면 폴리곤
 * 렌더링/포함판별 로직을 점 전용으로 따로 분기하지 않고 그대로 재사용
 * 가능하다(boundaryType=POINT_ONLY로 구분해 관리자 화면에 "근사 표시"
 * 배지만 다르게 띄움). */
export function circlePolygon(center: LatLng, radiusMeters = 120, segments = 16): LatLng[] {
  const points: LatLng[] = [];
  // 위도 1도 ≈ 111,320m, 경도 1도 ≈ 111,320m * cos(위도) — 소규모 반경
  // 근사이므로 지구 곡률 보정 없이 이 정도로 충분하다.
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    points.push({ lat: center.lat + dLat * Math.sin(angle), lng: center.lng + dLng * Math.cos(angle) });
  }
  return points;
}

/** 점 목록으로부터 가능한 최선의 다각형을 만든다 — 3개 이상이면 convex
 * hull, 그보다 적으면 중심점 기준 원으로 대체. 반환값은 항상 polygon +
 * 이게 어떻게 만들어졌는지(boundaryType 후보)를 같이 준다. */
export function buildApproxPolygon(points: LatLng[]): { polygon: LatLng[]; boundaryType: "CONVEX_HULL_APPROX" | "POINT_ONLY" } {
  const unique = dedupe(points);
  if (unique.length >= 3) {
    const hull = convexHull(unique);
    if (hull.length >= 3) return { polygon: hull, boundaryType: "CONVEX_HULL_APPROX" };
  }
  const center = {
    lat: unique.reduce((s, p) => s + p.lat, 0) / unique.length,
    lng: unique.reduce((s, p) => s + p.lng, 0) / unique.length,
  };
  return { polygon: circlePolygon(center), boundaryType: "POINT_ONLY" };
}
