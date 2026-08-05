/** 이미지 픽셀 좌표 ↔ 실제 위경도 변환(어파인 변환, 6개 파라미터).
 * 이미지 위 랜드마크 3곳의 픽셀 좌표와 실제 좌표(지오코딩으로 확보)를
 * 짝지어 주면, 나머지 모든 픽셀 좌표를 실제 위경도로 환산하는 함수를
 * 만든다 — 재개발 구역도 이미지를 실제 지도에 정확히 맞춰 그리기 위한
 * "이미지 보정 트레이싱" 기능에 쓰인다(사용자 요청, 2026-08-04).
 *
 * lat = a*x + b*y + c
 * lng = d*x + e*y + f
 * 3쌍의 (x,y)↔(lat,lng)이 있으면 위 두 식의 계수(a,b,c / d,e,f)를
 * 정확히 풀 수 있다(3x3 선형연립방정식, 두 번 — lat용/lng용). */

export type PixelPoint = { x: number; y: number };
export type GeoPoint = { lat: number; lng: number };

function det3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

function invert3(m: number[][], det: number): number[][] {
  const inv = [
    [
      (m[1][1] * m[2][2] - m[1][2] * m[2][1]) / det,
      (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / det,
      (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / det,
    ],
    [
      (m[1][2] * m[2][0] - m[1][0] * m[2][2]) / det,
      (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / det,
      (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / det,
    ],
    [
      (m[1][0] * m[2][1] - m[1][1] * m[2][0]) / det,
      (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / det,
      (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / det,
    ],
  ];
  return inv;
}

function multiplyMatVec(m: number[][], v: number[]): number[] {
  return m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
}

/** imgPts/geoPts는 반드시 3개씩, 서로 짝(같은 인덱스가 같은 랜드마크).
 * 세 점이 일직선에 가까우면(행렬식이 0에 가까우면) null을 반환한다 —
 * 이 경우 다른 조합의 랜드마크(가급적 삼각형이 크고 안 찌그러지게)를
 * 다시 선택해야 한다. */
export function solveAffineFrom3Points(
  imgPts: PixelPoint[],
  geoPts: GeoPoint[],
): ((p: PixelPoint) => GeoPoint) | null {
  if (imgPts.length !== 3 || geoPts.length !== 3) return null;
  const m = imgPts.map((p) => [p.x, p.y, 1]);
  const det = det3(m);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-6) return null;
  const invM = invert3(m, det);
  const [a, b, c] = multiplyMatVec(invM, geoPts.map((p) => p.lat));
  const [d, e, f] = multiplyMatVec(invM, geoPts.map((p) => p.lng));
  return (p: PixelPoint) => ({ lat: a * p.x + b * p.y + c, lng: d * p.x + e * p.y + f });
}

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_EQUATOR = 111_320;

/** 2점 보정(유사변환 = 축척·회전·이동, 찌그러짐 없음).
 *
 * 어파인(3점)과 달리 전단(shear)·비등방 축척을 허용하지 않는 대신, 대응점이
 * 2개만 있으면 된다 — 미지수 4개(축척1·회전1·이동2)에 방정식 4개(점 2개 ×
 * x,y)라 정확히 풀린다. 구역도처럼 원본이 지적도(정사에 가깝고 찌그러지지
 * 않은 도면)인 경우 이 가정이 성립해서, 클릭 수를 3번에서 2번으로 줄이면서도
 * 오히려 안정적이다(3점 어파인은 클릭이 조금만 부정확해도 도형이 기울어진다).
 *
 * 위경도는 위도에 따라 경도 1도의 실거리가 달라져 그대로 쓰면 축척이
 * 왜곡되므로, 기준점 기준 로컬 미터좌표(동/북)로 바꿔 계산한 뒤 되돌린다.
 * 이미지 y축은 아래로 증가하므로 부호를 뒤집어 북쪽이 +가 되게 맞춘다. */
export function solveSimilarityFrom2Points(
  imgPts: PixelPoint[],
  geoPts: GeoPoint[],
): ((p: PixelPoint) => GeoPoint) | null {
  if (imgPts.length !== 2 || geoPts.length !== 2) return null;
  const [p1, p2] = imgPts;
  const [g1, g2] = geoPts;

  const mPerLng = M_PER_DEG_LNG_EQUATOR * Math.cos(((g1.lat + g2.lat) / 2) * (Math.PI / 180));
  if (!Number.isFinite(mPerLng) || mPerLng <= 0) return null;

  const du = p2.x - p1.x;
  const dv = -(p2.y - p1.y);
  const de = (g2.lng - g1.lng) * mPerLng;
  const dn = (g2.lat - g1.lat) * M_PER_DEG_LAT;

  const dImg = Math.hypot(du, dv);
  const dGeo = Math.hypot(de, dn);
  // 두 점이 너무 가까우면 축척·회전이 클릭 오차에 크게 흔들린다.
  if (dImg < 1e-6 || dGeo < 1e-6) return null;

  const scale = dGeo / dImg;
  const theta = Math.atan2(dn, de) - Math.atan2(dv, du);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  return (p: PixelPoint) => {
    const u = p.x - p1.x;
    const v = -(p.y - p1.y);
    const east = scale * (u * cos - v * sin);
    const north = scale * (u * sin + v * cos);
    return {
      lat: g1.lat + north / M_PER_DEG_LAT,
      lng: g1.lng + east / mPerLng,
    };
  };
}
