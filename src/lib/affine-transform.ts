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
