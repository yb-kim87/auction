"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RedevelopmentPoint } from "@/lib/api";
import { loadKakaoMaps, type KakaoMap, type KakaoMarker, type KakaoMouseEvent, type KakaoPolygon } from "@/lib/kakao-maps";
import {
  solveAffineFrom3Points,
  solveSimilarityFrom2Points,
  type GeoPoint,
  type PixelPoint,
} from "@/lib/affine-transform";
import { traceRedBoundary } from "@/lib/boundary-trace";

type CalibrationPair = { img: PixelPoint; geo: GeoPoint };

/** 위경도 폴리곤의 실제 면적(㎡). 자동 추출·보정이 제대로 됐는지
 * 고시 면적과 비교하는 교차검증에 쓴다. */
function geoPolygonAreaSqm(points: GeoPoint[]): number {
  if (points.length < 3) return 0;
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const mPerLat = 110_540;
  const mPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const xy = points.map((p) => ({ x: p.lng * mPerLng, y: p.lat * mPerLat }));
  let area = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
    area += xy[j].x * xy[i].y - xy[i].x * xy[j].y;
  }
  return Math.abs(area) / 2;
}

/** 재개발 구역도 "이미지"를 업로드해서, 이미지 위 랜드마크 3곳을 실제
 * 카카오맵과 매칭시켜 좌표 변환식을 계산한 뒤, 이미지 위에서 클릭한
 * 구역 경계 꼭짓점을 실제 위경도로 자동 환산하는 도구. 이미지를 지도
 * 위에 직접 겹치는 대신(카카오맵 기본 SDK로는 임의 회전/축척 오버레이가
 * 불안정) 이미지·지도를 나란히 두고 클릭으로 대응시키는 방식을 쓴다
 * (사용자 요청, 2026-08-04: "정확도를 높여서 그릴 수 있는 방법").
 *
 * 정확도를 위해 랜드마크 3곳은 이미지 안에서 서로 멀리 떨어져 있고
 * 일직선에 가깝지 않은 지점을 고르는 게 좋다(삼각형이 클수록 오차가
 * 줄어든다). */
export function RedevelopmentImageTraceTool({
  onComplete,
  onCancel,
  initialImageUrl,
  initialCenter,
  areaSqMeters = null,
}: {
  onComplete: (points: RedevelopmentPoint[]) => void;
  onCancel: () => void;
  /** 이미 확보한 위치도 이미지 URL(예: 은평구청 스크레이핑 결과) — 있으면
   * 업로드 단계 없이 바로 이 이미지로 보정을 시작한다(사용자 요청,
   * 2026-08-04: "은평구청 데이터를 기반으로 정밀 경계를 통한 구역도
   * 적용해보는거 어때"). */
  initialImageUrl?: string | null;
  /** 오른쪽 지도의 초기 중심 — 구역이 이미 가진 근사 좌표(원 근사의
   * 중심 등)를 넘겨주면 관리자가 서울 전역에서 해당 구역을 직접 찾아
   * 헤맬 필요 없이 바로 근처에서 랜드마크를 클릭할 수 있다(사용자 피드백,
   * 2026-08-04: 기본 중심이 용산구라 은평구 구역을 찾기 불편했음). */
  initialCenter?: GeoPoint | null;
  /** 구역 실제 면적(㎡) — 자동 추출한 경계가 제대로 잡혔는지 교차검증에
   * 쓴다(변환 후 계산 면적과 비교). */
  areaSqMeters?: number | null;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl ?? null);
  const [calibrationPairs, setCalibrationPairs] = useState<CalibrationPair[]>([]);
  const [pendingImgPoint, setPendingImgPoint] = useState<PixelPoint | null>(null);
  const [tracePoints, setTracePoints] = useState<PixelPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoTracing, setAutoTracing] = useState(false);
  const [autoTraceNote, setAutoTraceNote] = useState<string | null>(null);

  const imgContainerRef = useRef<HTMLDivElement>(null);
  const imgElRef = useRef<HTMLImageElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const calibMarkersRef = useRef<KakaoMarker[]>([]);
  const tracePolygonRef = useRef<KakaoPolygon | null>(null);
  const mapClickHandlerRef = useRef<((...args: unknown[]) => void) | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;

  // 외부(지자체) 이미지는 그대로 canvas에 그리면 오염돼 픽셀을 읽을 수 없어
  // 같은 오리진 프록시를 거친다. 업로드한 파일(data:)은 그대로 쓴다.
  const displayImageUrl = useMemo(() => {
    if (!imageUrl) return null;
    if (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:")) return imageUrl;
    return `/api/redevelopment/zone-image?url=${encodeURIComponent(imageUrl)}`;
  }, [imageUrl]);

  // 기준점 2개면 유사변환(축척·회전·이동)으로 충분하고, 3개 이상을 찍으면
  // 어파인으로 승격해 도면이 약간 찌그러진 경우까지 잡는다.
  const calibrationDone = calibrationPairs.length >= 2;
  const transformFn = useMemo(() => {
    if (calibrationPairs.length >= 3) {
      return solveAffineFrom3Points(
        calibrationPairs.slice(0, 3).map((c) => c.img),
        calibrationPairs.slice(0, 3).map((c) => c.geo),
      );
    }
    if (calibrationPairs.length === 2) {
      return solveSimilarityFrom2Points(
        calibrationPairs.map((c) => c.img),
        calibrationPairs.map((c) => c.geo),
      );
    }
    return null;
  }, [calibrationPairs]);

  useEffect(() => {
    if (!appKey || !mapContainerRef.current) return;
    let cancelled = false;
    loadKakaoMaps(appKey).then(() => {
      if (cancelled || !mapContainerRef.current || !window.kakao) return;
      const kakao = window.kakao;
      mapRef.current = new kakao.maps.Map(mapContainerRef.current, {
        center: new kakao.maps.LatLng(initialCenter?.lat ?? 37.5326, initialCenter?.lng ?? 126.9975),
        level: initialCenter ? 4 : 6,
      });
      if (initialCenter) {
        const refMarker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(initialCenter.lat, initialCenter.lng),
        });
        refMarker.setMap(mapRef.current);
      }
      setMapReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey]);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result as string);
      setCalibrationPairs([]);
      setPendingImgPoint(null);
      setTracePoints([]);
      calibMarkersRef.current.forEach((m) => m.setMap(null));
      calibMarkersRef.current = [];
      tracePolygonRef.current?.setMap(null);
      tracePolygonRef.current = null;
      setAutoTraceNote(null);
    };
    reader.readAsDataURL(file);
  }

  /** 이미지에서 빨간 경계선을 찾아 꼭짓점을 자동으로 채운다.
   *
   * 추출은 원본 픽셀 기준으로 하고, 화면에는 object-contain으로 축소돼
   * 표시되므로 컨테이너 표시 좌표로 환산해서 저장한다(클릭으로 찍는
   * 기준점과 같은 좌표계여야 변환식이 맞는다). */
  function handleAutoTrace() {
    const imgEl = imgElRef.current;
    const container = imgContainerRef.current;
    if (!imgEl || !container) return;
    setAutoTracing(true);
    setError(null);
    setAutoTraceNote(null);
    try {
      const nw = imgEl.naturalWidth;
      const nh = imgEl.naturalHeight;
      if (!nw || !nh) throw new Error("이미지가 아직 로드되지 않았습니다.");

      const canvas = document.createElement("canvas");
      canvas.width = nw;
      canvas.height = nh;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("캔버스를 만들지 못했습니다.");
      ctx.drawImage(imgEl, 0, 0, nw, nh);

      let pixels: ImageData;
      try {
        pixels = ctx.getImageData(0, 0, nw, nh);
      } catch {
        throw new Error("이미지 픽셀을 읽을 수 없습니다(외부 이미지 보안 제한).");
      }

      const result = traceRedBoundary(pixels);
      if (!result) {
        throw new Error("빨간 경계선을 찾지 못했습니다. 아래에서 직접 클릭해 그려 주세요.");
      }

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const s = Math.min(cw / nw, ch / nh);
      const ox = (cw - nw * s) / 2;
      const oy = (ch - nh * s) / 2;
      setTracePoints(result.polygon.map((p) => ({ x: p.x * s + ox, y: p.y * s + oy })));
      setAutoTraceNote(`경계 자동 추출 완료 — 꼭짓점 ${result.polygon.length}개`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "자동 추출에 실패했습니다.");
    } finally {
      setAutoTracing(false);
    }
  }

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!calibrationDone) {
      if (pendingImgPoint) {
        setError("먼저 오른쪽 지도에서 이 지점의 실제 위치를 클릭해주세요.");
        return;
      }
      setPendingImgPoint({ x, y });
      setError(null);
      return;
    }

    if (!transformFn) return;
    setTracePoints((prev) => [...prev, { x, y }]);
  }

  // 지도 클릭 처리 — 보정 모드일 때만 좌표를 잡는다.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    if (mapClickHandlerRef.current) {
      kakao.maps.event.removeListener(map, "click", mapClickHandlerRef.current);
      mapClickHandlerRef.current = null;
    }

    const handler = (...args: unknown[]) => {
      if (calibrationDone || !pendingImgPoint) return;
      const mouseEvent = args[0] as KakaoMouseEvent;
      const geo = { lat: mouseEvent.latLng.getLat(), lng: mouseEvent.latLng.getLng() };
      setCalibrationPairs((prev) => [...prev, { img: pendingImgPoint, geo }]);
      setPendingImgPoint(null);
      setError(null);

      const marker = new kakao.maps.Marker({ position: mouseEvent.latLng });
      marker.setMap(map);
      calibMarkersRef.current.push(marker);
    };
    mapClickHandlerRef.current = handler;
    kakao.maps.event.addListener(map, "click", handler);

    return () => {
      if (mapClickHandlerRef.current) {
        kakao.maps.event.removeListener(map, "click", mapClickHandlerRef.current);
        mapClickHandlerRef.current = null;
      }
    };
  }, [mapReady, pendingImgPoint, calibrationDone]);

  // 추적(구역 그리기) 미리보기 — 지도 위에 실시간 폴리곤으로 표시
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao || !transformFn) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    tracePolygonRef.current?.setMap(null);
    tracePolygonRef.current = null;
    if (tracePoints.length < 2) return;

    const path = tracePoints.map((p) => {
      const geo = transformFn(p);
      return new kakao.maps.LatLng(geo.lat, geo.lng);
    });
    tracePolygonRef.current = new kakao.maps.Polygon({
      path,
      strokeWeight: 2,
      strokeColor: "#7c3aed",
      strokeOpacity: 0.9,
      fillColor: "#7c3aed",
      fillOpacity: 0.25,
    });
    tracePolygonRef.current.setMap(map);
    map.setBounds((() => {
      const bounds = new kakao.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      return bounds;
    })());
  }, [mapReady, tracePoints, transformFn]);

  function handleUndoTracePoint() {
    setTracePoints((prev) => prev.slice(0, -1));
  }

  /** 기준점만 다시 찍는다 — 자동 추출해둔 경계는 그대로 두어야
   * 추출을 다시 돌리지 않아도 된다. */
  function handleResetCalibration() {
    setCalibrationPairs([]);
    setPendingImgPoint(null);
    setError(null);
    calibMarkersRef.current.forEach((m) => m.setMap(null));
    calibMarkersRef.current = [];
  }

  function handleClearBoundary() {
    setTracePoints([]);
    setAutoTraceNote(null);
    tracePolygonRef.current?.setMap(null);
    tracePolygonRef.current = null;
  }

  function handleComplete() {
    if (!transformFn || tracePoints.length < 3) return;
    onComplete(tracePoints.map(transformFn));
  }

  // 보정까지 끝난 폴리곤의 실제 면적을 고시 면적과 비교해 보여준다.
  // 크게 어긋나면 기준점을 잘못 찍었거나 경계 추출이 틀린 것이다.
  const areaCheck = useMemo(() => {
    if (!transformFn || tracePoints.length < 3 || !areaSqMeters || areaSqMeters <= 0) return null;
    const computed = geoPolygonAreaSqm(tracePoints.map(transformFn));
    return { computed, ratio: computed / areaSqMeters };
  }, [transformFn, tracePoints, areaSqMeters]);

  if (!appKey) {
    return (
      <div className="rounded-sm border border-border bg-card p-6 text-sm text-muted-foreground">
        카카오맵 API 키가 설정되어 있지 않습니다.
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-primary/40 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">이미지로 구역 그리기(좌표 보정 트레이싱)</p>
        <div className="flex items-center gap-3">
          {imageUrl && (
            <label className="text-xs text-muted-foreground hover:underline cursor-pointer">
              다른 이미지 업로드
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          )}
          <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:underline">
            닫기
          </button>
        </div>
      </div>

      {!imageUrl ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            구역도 이미지를 업로드하세요(스크린샷/사진 모두 가능).
          </p>
          <input type="file" accept="image/*" onChange={handleImageUpload} className="text-xs" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-card px-3 py-2">
            <button
              type="button"
              onClick={handleAutoTrace}
              disabled={autoTracing}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
            >
              {autoTracing ? "경계 추출 중..." : "① 경계 자동 추출"}
            </button>
            <span className="text-xs text-muted-foreground">
              이미지의 빨간 경계선을 찾아 꼭짓점을 자동으로 채웁니다.
            </span>
            {autoTraceNote && (
              <span className="ml-auto text-xs font-medium text-emerald-600">{autoTraceNote}</span>
            )}
          </div>

          <div className="text-xs space-y-1">
            {!calibrationDone ? (
              <p className="text-foreground">
                <span className="font-semibold">② 기준점 보정 ({calibrationPairs.length}/2)</span>:
                왼쪽 이미지에서 알아볼 수 있는 지점(건물 모서리 등)을 클릭 → 오른쪽 실제 지도에서
                같은 지점을 클릭. 서로 멀리 떨어진 두 곳으로 2번만 하면 축척·회전·위치가 한 번에
                결정됩니다.
                {pendingImgPoint && (
                  <span className="ml-1 text-primary font-semibold">
                    → 이제 오른쪽 지도에서 같은 지점을 클릭하세요.
                  </span>
                )}
              </p>
            ) : (
              <p className="text-foreground">
                <span className="font-semibold">③ 확인 후 확정</span>: 오른쪽 지도에 실제 위치가
                표시됩니다(꼭짓점 {tracePoints.length}개). 어긋나면 이미지에서 경계를 직접 클릭해
                추가하거나 보정을 다시 하세요. 기준점을 한 번 더 찍으면 더 정밀하게 보정됩니다.
              </p>
            )}
            {areaCheck && (
              <p
                className={
                  areaCheck.ratio > 0.75 && areaCheck.ratio < 1.3
                    ? "text-emerald-600"
                    : "text-amber-600"
                }
              >
                면적 검증: 계산 {Math.round(areaCheck.computed).toLocaleString()}㎡ / 고시{" "}
                {Math.round(areaSqMeters ?? 0).toLocaleString()}㎡ (
                {Math.round(areaCheck.ratio * 100)}%)
                {(areaCheck.ratio <= 0.75 || areaCheck.ratio >= 1.3) &&
                  " — 차이가 큽니다. 기준점을 다시 확인하세요."}
              </p>
            )}
            {error && <p className="text-destructive">{error}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              ref={imgContainerRef}
              onClick={handleImageClick}
              className="relative border border-border rounded-sm overflow-hidden cursor-crosshair select-none"
              style={{ height: 480 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgElRef}
                src={displayImageUrl ?? undefined}
                alt="구역도"
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
              />
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {calibrationPairs.map((c, i) => (
                  <g key={`calib-${i}`}>
                    <circle cx={c.img.x} cy={c.img.y} r={6} fill="#059669" stroke="#fff" strokeWidth={2} />
                    <text x={c.img.x + 8} y={c.img.y - 8} fontSize={11} fill="#059669" fontWeight={700}>
                      {i + 1}
                    </text>
                  </g>
                ))}
                {pendingImgPoint && (
                  <circle cx={pendingImgPoint.x} cy={pendingImgPoint.y} r={6} fill="#d97706" stroke="#fff" strokeWidth={2} />
                )}
                {tracePoints.length > 0 && (
                  <polyline
                    points={[...tracePoints, tracePoints[0]].map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="rgba(124,58,237,0.2)"
                    stroke="#7c3aed"
                    strokeWidth={2}
                  />
                )}
                {tracePoints.map((p, i) => (
                  <circle key={`trace-${i}`} cx={p.x} cy={p.y} r={4} fill="#7c3aed" stroke="#fff" strokeWidth={1.5} />
                ))}
              </svg>
            </div>

            <div ref={mapContainerRef} className="border border-border rounded-sm" style={{ height: 480 }} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleUndoTracePoint}
              disabled={tracePoints.length === 0}
              className="px-2 py-1 text-xs rounded-sm border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              마지막 점 취소
            </button>
            <button
              type="button"
              onClick={handleClearBoundary}
              disabled={tracePoints.length === 0}
              className="px-2 py-1 text-xs rounded-sm border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              경계 지우기
            </button>
            <button type="button" onClick={handleResetCalibration} className="text-xs text-muted-foreground hover:underline">
              기준점 다시 찍기
            </button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={!calibrationDone || tracePoints.length < 3}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50 ml-auto"
            >
              이 경계로 확정
            </button>
          </div>
        </>
      )}
    </div>
  );
}
