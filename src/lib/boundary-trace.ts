/** 구역도 이미지에서 빨간 경계선을 자동으로 찾아 폴리곤 꼭짓점으로 만든다.
 *
 * 지자체 위치도는 지적도 위에 구역 경계만 빨간 선으로 그려져 있어서, 색으로
 * 분리하면 라벨·지번 숫자가 겹쳐 있어도 경계만 깔끔하게 뽑힌다. 파이썬
 * OpenCV로 먼저 검증한 파이프라인(HSV 마스킹 → 모폴로지 클로징 → 윤곽
 * 추적 → 꼭짓점 단순화)을 그대로 옮긴 것으로, 실측에서 은평구 역촌1구역
 * 위치도가 16개 꼭짓점으로 정확히 추출됐다(2026-08-05).
 *
 * 관리자가 손으로 경계를 16번 클릭하던 것을 없애고 기준점 2번만 찍게 하는
 * 하이브리드 방식의 앞단이다.
 */

export type PixelPoint = { x: number; y: number };

export type TraceOptions = {
  /** 채도 하한 — 회색조 지적도 선과 빨간 경계선을 가르는 기준. */
  minSaturation?: number;
  /** 명도 하한 — 너무 어두운 픽셀(글자 테두리 등) 제외. */
  minValue?: number;
  /** 끊긴 경계선을 이어 붙일 반경(px). */
  closeRadius?: number;
  /** 꼭짓점 단순화 허용오차(둘레 대비 비율). */
  simplifyRatio?: number;
};

const DEFAULTS: Required<TraceOptions> = {
  minSaturation: 0.35,
  minValue: 0.27,
  closeRadius: 3,
  simplifyRatio: 0.005,
};

/** RGB → 색상(0~360). 빨강 판정에만 쓰므로 hue/sat/val만 계산한다. */
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

function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!src[y * w + x]) continue;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) out[yy * w + xx] = 1;
    }
  }
  return out;
}

function erode(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let keep = 1;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let yy = y0; yy <= y1 && keep; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          if (!src[yy * w + xx]) { keep = 0; break; }
        }
      }
      out[y * w + x] = keep;
    }
  }
  return out;
}

/** 가장 큰 연결 성분만 남긴다(작은 빨간 글자·범례 등 노이즈 제거). */
function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array | null {
  const label = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  let best: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s] !== -1) continue;
    const cur: number[] = [];
    stack.push(s);
    label[s] = s;
    while (stack.length) {
      const i = stack.pop() as number;
      cur.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (mask[ni] && label[ni] === -1) { label[ni] = s; stack.push(ni); }
        }
      }
    }
    if (cur.length > best.length) best = cur;
  }
  if (!best.length) return null;
  const out = new Uint8Array(w * h);
  for (const i of best) out[i] = 1;
  return out;
}

// 8방향 이웃(시계방향, 동쪽부터).
const DIRS: Array<[number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/** Moore 이웃 추적 — 도형 바깥 경계를 시계방향으로 한 바퀴 돈다. */
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
  let dir = 6; // 진입 방향(서쪽에서 들어온 것으로 간주)
  const maxSteps = w * h * 4;

  for (let step = 0; step < maxSteps; step++) {
    let found = false;
    // 직전 진입 방향의 반대편부터 시계방향으로 이웃을 살핀다.
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8;
      const nx = cx + DIRS[d][0];
      const ny = cy + DIRS[d][1];
      if (at(nx, ny)) {
        cx = nx;
        cy = ny;
        dir = d;
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

/** Douglas-Peucker 단순화 — 픽셀 단위 계단 노이즈를 없애고 실제 꺾임만 남긴다. */
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

/** 폴리곤 면적(px²) — 신발끈 공식. 배율 검증에 쓴다. */
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
  redPixels: number;
};

/** 이미지에서 빨간 경계선을 찾아 단순화된 폴리곤으로 반환한다. */
export function traceRedBoundary(
  imageData: ImageData,
  options: TraceOptions = {},
): TraceResult | null {
  const o = { ...DEFAULTS, ...options };
  const { width: w, height: h, data } = imageData;

  const mask = redMask(data, w, h, o);
  const redPixels = mask.reduce((s, v) => s + v, 0);
  if (redPixels < 50) return null;

  // 클로징(팽창 후 침식): 라벨에 가려 끊긴 경계선을 이어 닫힌 도형으로 만든다.
  const closed = erode(dilate(mask, w, h, o.closeRadius), w, h, o.closeRadius);
  const comp = largestComponent(closed, w, h);
  if (!comp) return null;

  const contour = traceContour(comp, w, h);
  if (contour.length < 8) return null;

  let perimeter = 0;
  for (let i = 1; i < contour.length; i++) {
    perimeter += Math.hypot(contour[i].x - contour[i - 1].x, contour[i].y - contour[i - 1].y);
  }
  const polygon = simplify(contour, Math.max(1, perimeter * o.simplifyRatio));
  if (polygon.length < 3) return null;

  return { polygon, areaPx: polygonAreaPx(polygon), redPixels };
}
