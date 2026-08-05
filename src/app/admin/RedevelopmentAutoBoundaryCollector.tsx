"use client";

import { useState } from "react";
import { updateRedevelopmentZone, type RedevelopmentZone } from "@/lib/api";
import { polygonAreaPx, traceRedBoundary, type PixelPoint } from "@/lib/boundary-trace";
import { solveFrom1PointWithScale } from "@/lib/affine-transform";

/** 저장된 구역들의 위치도 이미지를 한 번에 훑어 정밀 경계를 자동 적용한다.
 *
 * 관리자가 구역마다 도구를 열어 하나씩 처리하던 것을 배치로 돌린다 —
 * 모양은 이미지에서 추출하고, 축척은 고시 면적으로 역산하고, 위치는 기존
 * 근사 폴리곤의 중심(= 지오코딩된 대표 지번)을 그대로 쓴다(사용자 요청,
 * 2026-08-05: "너가 직접 경계를 해도 될꺼같은데?").
 *
 * 모양·크기는 신뢰할 만하지만 위치는 지오코딩 정확도에 달려 있어
 * boundaryType을 IMAGE_AUTO로 남긴다 — 지도에서 훑어보고 어긋난 것만
 * 트레이싱 도구로 고치면 된다. 관리자가 이미 수기 보정(MANUAL)한 구역은
 * 건드리지 않는다.
 */

const CONCURRENCY = 3;

type Result = { ok: number; skipped: number; failed: number; notes: string[] };

function centroid(points: { lat: number; lng: number }[]) {
  const n = points.length;
  return {
    lat: points.reduce((a, p) => a + p.lat, 0) / n,
    lng: points.reduce((a, p) => a + p.lng, 0) / n,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = src;
  });
}

export function RedevelopmentAutoBoundaryCollector({
  zones,
  onDone,
}: {
  zones: RedevelopmentZone[];
  onDone: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // 이미지가 있고, 면적을 알고, 아직 수기 보정하지 않은 구역만 대상.
  const targets = zones.filter(
    (z) =>
      z.referenceImageUrl &&
      z.areaSqMeters &&
      z.areaSqMeters > 0 &&
      z.polygon.length >= 3 &&
      z.boundaryType !== "MANUAL",
  );

  async function processZone(zone: RedevelopmentZone): Promise<"ok" | "failed"> {
    const img = await loadImage(
      `/api/redevelopment/zone-image?url=${encodeURIComponent(zone.referenceImageUrl as string)}`,
    );
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "failed";
    ctx.drawImage(img, 0, 0);
    const traced = traceRedBoundary(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (!traced) return "failed";

    // 축척: 고시 면적 ÷ 추출 폴리곤의 픽셀 면적
    const areaPx = polygonAreaPx(traced.polygon);
    if (areaPx <= 0) return "failed";
    const metersPerPixel = Math.sqrt((zone.areaSqMeters as number) / areaPx);

    // 위치: 기존 근사 폴리곤의 중심(지오코딩 결과)을 구역 중심으로 삼는다.
    const center = centroid(zone.polygon);
    const polyCentroid: PixelPoint = {
      x: traced.polygon.reduce((a, p) => a + p.x, 0) / traced.polygon.length,
      y: traced.polygon.reduce((a, p) => a + p.y, 0) / traced.polygon.length,
    };
    const toGeo = solveFrom1PointWithScale(polyCentroid, center, metersPerPixel);
    if (!toGeo) return "failed";

    await updateRedevelopmentZone(zone.id, {
      polygon: traced.polygon.map(toGeo),
      boundaryType: "IMAGE_AUTO",
    });
    return "ok";
  }

  async function handleRun() {
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: targets.length });
    const res: Result = { ok: 0, skipped: zones.length - targets.length, failed: 0, notes: [] };

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const chunk = targets.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (zone) => {
          try {
            const r = await processZone(zone);
            if (r === "ok") res.ok += 1;
            else {
              res.failed += 1;
              if (res.notes.length < 8) res.notes.push(`${zone.name}: 경계를 찾지 못함`);
            }
          } catch (err) {
            res.failed += 1;
            if (res.notes.length < 8) {
              res.notes.push(`${zone.name}: ${err instanceof Error ? err.message : "실패"}`);
            }
          }
        }),
      );
      setProgress({ done: Math.min(i + CONCURRENCY, targets.length), total: targets.length });
    }

    setResult(res);
    setRunning(false);
    setProgress(null);
    onDone();
  }

  return (
    <div className="rounded-sm border border-primary/40 bg-primary/5 p-4 space-y-2">
      <p className="text-sm font-semibold text-foreground">구역도 이미지로 경계 일괄 적용</p>
      <p className="text-xs text-muted-foreground">
        저장된 구역의 위치도 이미지에서 경계를 자동 추출하고, 고시 면적으로 축척을 맞춰 실제
        모양으로 바꿉니다. 위치는 지오코딩된 대표 지번을 중심으로 잡으므로 지도에서 확인이
        필요합니다. 수기 보정(MANUAL)한 구역은 건드리지 않습니다.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={running || targets.length === 0}
          className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {running ? "처리 중..." : `대상 ${targets.length}개 일괄 적용`}
        </button>
        {progress && (
          <span className="text-xs text-muted-foreground">
            {progress.done}/{progress.total}건 처리 중...
          </span>
        )}
        {targets.length === 0 && !running && (
          <span className="text-xs text-muted-foreground">
            대상이 없습니다 — 위치도 이미지와 면적이 모두 있는 구역만 처리할 수 있습니다.
          </span>
        )}
      </div>
      {result && (
        <div className="text-xs space-y-1">
          <p className="text-foreground">
            적용 {result.ok}건 · 실패 {result.failed}건 · 대상 아님 {result.skipped}건
          </p>
          {result.notes.length > 0 && (
            <ul className="text-muted-foreground list-disc pl-4">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <p className="text-amber-600">
            적용된 구역은 지도에서 위치가 맞는지 확인하고, 어긋나면 “정밀 보정(위치도)”로
            고쳐 주세요.
          </p>
        </div>
      )}
    </div>
  );
}
