/** 구역도 이미지에서 빨간 경계선을 자동으로 찾아 폴리곤 꼭짓점으로 만든다.
 *
 * 지자체 위치도는 지적도 위에 구역 경계만 빨간 선으로 그려져 있어서, 색으로
 * 분리하면 라벨·지번 숫자가 겹쳐 있어도 경계만 뽑을 수 있다.
 *
 * 핵심은 "선을 따라가는" 대신 **선으로 둘러싸인 내부 영역을 찾는** 것이다.
 * 경계가 점선인 도면이 많은데(실측: 은평구 불광1구역은 빨간 픽셀 1,791개가
 * 152개 점으로 흩어져 있었다), 선 추적 방식은 점 사이가 끊겨 일부만 잡히고
 * 엉뚱한 대각선 도로를 구역으로 오인했다(사용자 리포트, 2026-08-05:
 * "경계 자동 추출을했는데 제대로 못잡는데").
 *
 * 그래서 팽창(dilate)으로 점 사이를 메워 폐곡선을 만든 뒤, 테두리에서
 * 흘러들어오지 못하는 배경 = 내부 영역을 찾고, 팽창한 만큼 되돌린다.
 * 팽창 반경은 작은 값부터 올려가며 "그럴듯한 크기의 내부"가 처음 나오는
 * 값을 쓴다 — 크게 잡을수록 옆 도로·다른 구역과 붙어버리기 때문이다.
 */

export type PixelPoint = { x: number; y: number };

export type TraceOptions = {
  /** 채도 하한 — 회색조 지적도 선과 빨간 경계선을 가르는 기준. */
  minSaturation?: number;
  /** 명도 하한 — 너무 어두운 픽셀(글자 테두리 등) 제외. */
  minValue?: number;
  /** 꼭짓점 단순화 허용오차(둘레 대비 비율). */
  simplifyRatio?: number;
  /** 내부 영역으로 인정할 최소/최대 비율(이미지 넓이 대비). */
  minAreaRatio?: number;
  maxAreaRatio?: number;
};

const DEFAULTS: Required<TraceOptions> = {
  minSaturation: 0.35,
  minValue: 0.27,
  simplifyRatio: 0.005,
  minAreaRatio: 0.03,
  maxAreaRatio: 0.7,
};

const MIN_RADIUS = 2;
const MAX_RADIUS = 12;

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

/** 빨간 픽셀만 1인 마스크. 빨강은 색상환 양 끝(0도·360도 부근)에 걸쳐 있다. */
function redMask(data: Uint8ClampedArray, w: number, h: number, o: Required<TraceOptions>): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (data[p + 3] < 128) continue;
    const [hue, sat, val] = rgbToHsv(data[p], data[p + 1], data[p + 2]);
    if (sat >= o.minSaturation && val >= o.minValue && (hue <= 15 || hue >= 342)) mask[i] = 1;
  }
  return mask;
}

/** 정사각 구조요소로 팽창 — 분리 계산(수평→수직)이라 반경이 커도 빠르다. */
function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let xx = x0; xx <= x1; xx++) if (src[row + xx]) { v = 1; break; }
      tmp[row + x] = v;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let yy = y0; yy <= y1; yy++) if (tmp[yy * w + x]) { v = 1; break; }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** 테두리에서 도달할 수 없는 배경 = 폐곡선 내부. */
function enclosedInterior(wall: Uint8Array, w: number, h: number): Uint8Array | null {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (i: number) => {
    if (!wall[i] && !seen[i]) { seen[i] = 1; stack[top++] = i; }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }

  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }

  const interior = new Uint8Array(w * h);
  let count = 0;
  for (let i = 0; i < interior.length; i++) {
    if (!wall[i] && !seen[i]) { interior[i] = 1; count++; }
  }
  return count > 0 ? interior : null;
}

/** 가장 큰 연결 성분만 남긴다(도면에 구역이 여러 개면 제일 큰 것). */
function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array | null {
  const label = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    const cur: number[] = [];
    let top = 0;
    stack[top++] = s;
    label[s] = 1;
    while (top > 0) {
      const i = stack[--top];
      cur.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0 && mask[i - 1] && !label[i - 1]) { label[i - 1] = 1; stack[top++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !label[i + 1]) { label[i + 1] = 1; stack[top++] = i + 1; }
      if (y > 0 && mask[i - w] && !label[i - w]) { label[i - w] = 1; stack[top++] = i - w; }
      if (y < h - 1 && mask[i + w] && !label[i + w]) { label[i + w] = 1; stack[top++] = i + w; }
    }
    if (cur.length > best.length) best = cur;
  }
  if (!best.length) return null;
  const out = new Uint8Array(w * h);
  for (const i of best) out[i] = 1;
  return out;
}

const DIRS: Array<[number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/** Moore 이웃 추적 — 채워진 영역의 바깥 경계를 한 바퀴 돈다. */
function traceContour(mask: Uint8Array, w: number, h: number): PixelPoint[] {
  let start = -1;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { start = i; break; }
  if (start < 0) return [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
  const sx = start % w;
  const sy = (start / w) | 0;
  const contour: PixelPoint[] = [{ x: sx, y: sy }];
  let cx = sx;
  let cy = sy;
  let dir = 6;
  const maxSteps = w * h * 4;
  for (let step = 0; step < maxSteps; step++) {
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8;
      const nx = cx + DIRS[d][0];
      const ny = cy + DIRS[d][1];
      if (at(nx, ny)) {
        cx = nx; cy = ny; dir = d;
        contour.push({ x: cx, y: cy });
        found = true;
        break;
      }
    }
    if (!found) break;
    if (cx === sx && cy === sy) break;
  }
  return contour;
}

function perpDistance(p: PixelPoint, a: PixelPoint, b: PixelPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function simplify(points: PixelPoint[], tolerance: number): PixelPoint[] {
  if (points.length < 3) return points;
  let maxD = 0;
  let idx = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDistance(points[i], first, last);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tolerance) return [first, last];
  const left = simplify(points.slice(0, idx + 1), tolerance);
  const right = simplify(points.slice(idx), tolerance);
  return [...left.slice(0, -1), ...right];
}

/** 폴리곤 면적(px²) — 신발끈 공식. */
export function polygonAreaPx(points: PixelPoint[]): number {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    a += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return Math.abs(a) / 2;
}

export type TraceResult = {
  polygon: PixelPoint[];
  areaPx: number;
  /** 이미지 넓이 대비 구역 비율 — 너무 작거나 크면 오검출 의심. */
  areaRatio: number;
  /** 실제로 채택된 팽창 반경(진단용). */
  usedRadius: number;
  redPixels: number;
};

export function traceRedBoundary(
  imageData: ImageData,
  options: TraceOptions = {},
): TraceResult | null {
  const o = { ...DEFAULTS, ...options };
  const { width: w, height: h, data } = imageData;
  const total = w * h;

  const mask = redMask(data, w, h, o);
  let redPixels = 0;
  for (let i = 0; i < mask.length; i++) redPixels += mask[i];
  if (redPixels < 50) return null;

  for (let r = MIN_RADIUS; r <= MAX_RADIUS; r++) {
    // 1) 점선 사이를 메워 폐곡선으로 만든다(침식은 하지 않는다 — 닫기
    //    연산은 큰 반경에서 오히려 다리를 끊어버려 점선에 잘 듣지 않았다).
    const wall = dilate(mask, w, h, r);
    // 2) 테두리에서 못 닿는 배경 = 둘러싸인 내부
    const inside = enclosedInterior(wall, w, h);
    if (!inside) continue;
    // 3) 선이 두꺼워진 만큼 내부를 되돌려 원래 경계에 맞춘다
    const grown = dilate(inside, w, h, r);
    const comp = largestComponent(grown, w, h);
    if (!comp) continue;

    const contour = traceContour(comp, w, h);
    if (contour.length < 8) continue;
    let perimeter = 0;
    for (let i = 1; i < contour.length; i++) {
      perimeter += Math.hypot(contour[i].x - contour[i - 1].x, contour[i].y - contour[i - 1].y);
    }
    const polygon = simplify(contour, Math.max(1, perimeter * o.simplifyRatio));
    if (polygon.length < 3) continue;

    const areaPx = polygonAreaPx(polygon);
    const areaRatio = areaPx / total;
    // 너무 작으면 라벨 같은 걸 잡은 것이고, 너무 크면 옆 도로·다른 구역과
    // 붙어 화면 전체를 삼킨 것이다. 반경을 키워가며 첫 타당한 값을 쓴다.
    if (areaRatio < o.minAreaRatio || areaRatio > o.maxAreaRatio) continue;

    return { polygon, areaPx, areaRatio, usedRadius: r, redPixels };
  }
  return null;
}
