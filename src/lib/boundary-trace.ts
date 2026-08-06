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
 *
 * 2026-08-06 개정 — 은평구 위치도 17장을 전부 돌려보니 9장만 성공했다.
 * 실패 원인이 셋이었고, 각각을 다음처럼 고쳤다.
 *
 * 1. **구역이 빨갛게 칠해진 도면**(갈현1·신사170-12 등): 내부까지 빨간
 *    픽셀이라 "벽에 둘러싸인 빈 공간"이 아예 없었다. 그래서 내부를 찾는
 *    대신 **테두리에서 닿는 바깥을 찾아 그 여집합**을 구역으로 본다.
 *    여집합에는 벽·내부·내부에 얹힌 글자가 모두 포함되므로, 칠해진
 *    도면과 선으로만 그린 도면을 같은 방식으로 처리할 수 있다.
 * 2. **구역 안에 빨간 라벨이 있는 도면**(응암동 755 등): 글자가 내부를
 *    조각내 largestComponent가 일부만 집었다. 여집합 방식은 글자도 구역에
 *    포함하므로 자연히 해결된다.
 * 3. **구역이 아주 작은 도면**(서부연립 1,362㎡): 정확히 찾아놓고도 최소
 *    면적 3% 기준에 걸려 버려졌다. 하한을 0.15%로 낮췄다.
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
  // 실측(2026-08-06): 은평구 서부연립(1,362㎡)은 도면의 0.23%밖에 안 된다.
  // 글자 속 빈 구멍은 0.05% 미만이라 0.15%면 둘을 가를 수 있다.
  minAreaRatio: 0.0015,
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

/** 침식 — 팽창으로 두꺼워진 만큼 되돌린다. 이미지 밖은 배경으로 본다. */
function erode(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 1;
      if (x - r < 0 || x + r > w - 1) v = 0;
      else {
        for (let xx = x - r; xx <= x + r; xx++) if (!src[row + xx]) { v = 0; break; }
      }
      tmp[row + x] = v;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      if (y - r < 0 || y + r > h - 1) v = 0;
      else {
        for (let yy = y - r; yy <= y + r; yy++) if (!tmp[yy * w + x]) { v = 0; break; }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** 벽에 막혀 테두리에서 닿지 않는 영역(= 벽 + 그 안쪽 전부)을 1로 채운다.
 *
 * 예전에는 "벽을 뺀 내부"만 봤는데, 구역이 통째로 빨갛게 칠해진 도면에서는
 * 내부가 존재하지 않고(전부 벽), 구역 안에 빨간 라벨이 있으면 내부가
 * 조각나 일부만 잡혔다. 여집합을 쓰면 두 경우 모두 구역 하나로 잡힌다. */
function fillFromOutside(wall: Uint8Array, w: number, h: number): Uint8Array {
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
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < filled.length; i++) if (!seen[i]) filled[i] = 1;
  return filled;
}

/** 큰 것부터 최대 maxCount개의 연결 성분을 각각의 마스크로 돌려준다.
 * 도면에 구역이 여러 개거나 테두리 액자가 통째로 잡히는 경우가 있어,
 * "가장 큰 하나"만 보면 정작 구역을 놓친다. */
function topComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  maxCount: number,
  minPixels: number,
): Uint8Array[] {
  const label = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const found: number[][] = [];
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
    if (cur.length >= minPixels) found.push(cur);
  }
  found.sort((a, b) => b.length - a.length);
  return found.slice(0, maxCount).map((pixels) => {
    const out = new Uint8Array(w * h);
    for (const i of pixels) out[i] = 1;
    return out;
  });
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
  /** 경계 상자(진단·후보 비교용). */
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

function bboxOf(points: PixelPoint[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

/** 팽창 반경을 바꿔가며 나온 후보를 모두 돌려준다(선택 로직·진단 공용). */
export function traceRedBoundaryCandidates(
  imageData: ImageData,
  options: TraceOptions = {},
): TraceResult[] {
  const o = { ...DEFAULTS, ...options };
  const { width: w, height: h, data } = imageData;
  const total = w * h;

  const mask = redMask(data, w, h, o);
  let redPixels = 0;
  for (let i = 0; i < mask.length; i++) redPixels += mask[i];
  if (redPixels < 50) return [];

  const minPixels = Math.max(24, Math.floor(total * o.minAreaRatio * 0.5));
  const out: TraceResult[] = [];
  for (let r = MIN_RADIUS; r <= MAX_RADIUS; r++) {
    // 1) 점선 사이를 메워 폐곡선으로 만든다(침식은 하지 않는다 — 닫기
    //    연산은 큰 반경에서 오히려 다리를 끊어버려 점선에 잘 듣지 않았다).
    const wall = dilate(mask, w, h, r);
    // 2) 테두리에서 못 닿는 영역 = 벽과 그 안쪽 전부
    const filled = fillFromOutside(wall, w, h);
    // 3) 선이 두꺼워진 만큼 되돌려 원래 경계에 맞춘다
    const shrunk = erode(filled, w, h, r);

    for (const comp of topComponents(shrunk, w, h, 4, minPixels)) {
      const contour = traceContour(comp, w, h);
      if (contour.length < 8) continue;
      let perimeter = 0;
      for (let i = 1; i < contour.length; i++) {
        perimeter += Math.hypot(contour[i].x - contour[i - 1].x, contour[i].y - contour[i - 1].y);
      }
      const polygon = simplify(contour, Math.max(1, perimeter * o.simplifyRatio));
      if (polygon.length < 3) continue;

      const areaPx = polygonAreaPx(polygon);
      out.push({
        polygon,
        areaPx,
        areaRatio: areaPx / total,
        usedRadius: r,
        redPixels,
        bbox: bboxOf(polygon),
      });
    }
  }
  return out;
}

export function traceRedBoundary(
  imageData: ImageData,
  options: TraceOptions = {},
): TraceResult | null {
  const o = { ...DEFAULTS, ...options };
  const candidates = traceRedBoundaryCandidates(imageData, options);

  const usable = candidates.filter(
    (c) => c.areaRatio >= o.minAreaRatio && c.areaRatio <= o.maxAreaRatio,
  );
  if (!usable.length) return null;

  // 어느 후보를 쓸지는 두 가지를 함께 봐야 한다.
  //
  // - "제일 작은 반경"만 보면, 경계가 점선인 도면은 아직 닫히지 않은 상태라
  //   구역 대신 라벨 글자 구멍 같은 작은 오검출을 집는다(실측: 응암1 cts1124).
  // - "제일 넓은 것"만 보면, 반경이 커질수록 팽창분만큼 영역이 부풀기 때문에
  //   늘 최대 반경이 뽑혀 실제보다 크게 잡힌다(실측: 불광8 cts1120 2.5%→4.5%).
  //
  // 그래서 먼저 최대 넓이로 "찾으려는 대상이 어느 정도 크기인지"를 정하고,
  // 그 크기에 근접(60% 이상)하는 후보 중 **가장 작은 반경**을 고른다.
  // 대상을 제대로 집으면서 팽창 왜곡은 최소로 남는다.
  const maxArea = Math.max(...usable.map((c) => c.areaPx));
  const target = maxArea * 0.6;
  let best: TraceResult | null = null;
  for (const c of usable) {
    if (c.areaPx < target) continue;
    if (!best || c.usedRadius < best.usedRadius || (c.usedRadius === best.usedRadius && c.areaPx > best.areaPx)) {
      best = c;
    }
  }
  return best ?? usable[0];
}
