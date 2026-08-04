"use client";

import { useEffect, useRef, useState } from "react";
import type { RedevelopmentPoint } from "@/lib/api";
import { loadKakaoMaps, type KakaoMap, type KakaoMarker, type KakaoMouseEvent, type KakaoPolygon } from "@/lib/kakao-maps";
import { solveAffineFrom3Points, type GeoPoint, type PixelPoint } from "@/lib/affine-transform";

type CalibrationPair = { img: PixelPoint; geo: GeoPoint };

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
}: {
  onComplete: (points: RedevelopmentPoint[]) => void;
  onCancel: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [calibrationPairs, setCalibrationPairs] = useState<CalibrationPair[]>([]);
  const [pendingImgPoint, setPendingImgPoint] = useState<PixelPoint | null>(null);
  const [tracePoints, setTracePoints] = useState<PixelPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const imgContainerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const calibMarkersRef = useRef<KakaoMarker[]>([]);
  const tracePolygonRef = useRef<KakaoPolygon | null>(null);
  const mapClickHandlerRef = useRef<((...args: unknown[]) => void) | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  const calibrationDone = calibrationPairs.length >= 3;
  const transformFn = calibrationDone
    ? solveAffineFrom3Points(
        calibrationPairs.slice(0, 3).map((c) => c.img),
        calibrationPairs.slice(0, 3).map((c) => c.geo),
      )
    : null;

  useEffect(() => {
    if (!appKey || !mapContainerRef.current) return;
    let cancelled = false;
    loadKakaoMaps(appKey).then(() => {
      if (cancelled || !mapContainerRef.current || !window.kakao) return;
      const kakao = window.kakao;
      mapRef.current = new kakao.maps.Map(mapContainerRef.current, {
        center: new kakao.maps.LatLng(37.5326, 126.9975),
        level: 6,
      });
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
    };
    reader.readAsDataURL(file);
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

  function handleResetCalibration() {
    setCalibrationPairs([]);
    setPendingImgPoint(null);
    setTracePoints([]);
    calibMarkersRef.current.forEach((m) => m.setMap(null));
    calibMarkersRef.current = [];
  }

  function handleComplete() {
    if (!transformFn || tracePoints.length < 3) return;
    onComplete(tracePoints.map(transformFn));
  }

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
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:underline">
          닫기
        </button>
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
          <div className="text-xs space-y-1">
            {!calibrationDone ? (
              <p className="text-foreground">
                <span className="font-semibold">1단계 — 좌표 보정 ({calibrationPairs.length}/3)</span>:
                왼쪽 이미지에서 알아볼 수 있는 건물(랜드마크)을 클릭 → 오른쪽 실제 지도에서 같은
                건물을 클릭. 이 과정을 서로 멀리 떨어진 지점으로 3번 반복하세요(가까운 지점끼리
                고르면 오차가 커집니다).
                {pendingImgPoint && (
                  <span className="ml-1 text-primary font-semibold">
                    → 이제 오른쪽 지도에서 같은 지점을 클릭하세요.
                  </span>
                )}
              </p>
            ) : (
              <p className="text-foreground">
                <span className="font-semibold">2단계 — 구역 경계 그리기</span>: 왼쪽 이미지에서 구역
                경계 꼭짓점을 순서대로 클릭하세요. 오른쪽 지도에 실시간으로 실제 위치가
                표시됩니다({tracePoints.length}개).
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
              <img src={imageUrl} alt="구역도" className="w-full h-full object-contain pointer-events-none" draggable={false} />
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

          <div className="flex items-center gap-2">
            {!calibrationDone ? (
              <button type="button" onClick={handleResetCalibration} className="text-xs text-muted-foreground hover:underline">
                보정 다시 시작
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleUndoTracePoint}
                  disabled={tracePoints.length === 0}
                  className="px-2 py-1 text-xs rounded-sm border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  마지막 점 취소
                </button>
                <button type="button" onClick={handleResetCalibration} className="text-xs text-muted-foreground hover:underline">
                  보정 다시 하기
                </button>
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={tracePoints.length < 3}
                  className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50 ml-auto"
                >
                  이 경계로 확정
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
