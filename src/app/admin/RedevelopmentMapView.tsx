"use client";

import { useEffect, useRef, useState } from "react";
import type { RedevelopmentMapAuction, RedevelopmentPoint, RedevelopmentZone } from "@/lib/api";
import {
  loadKakaoMaps,
  type KakaoMap,
  type KakaoMarker,
  type KakaoMouseEvent,
  type KakaoPolygon,
  type KakaoPolyline,
} from "@/lib/kakao-maps";

const DEFAULT_ZONE_COLOR = "#7c3aed";
const IN_ZONE_MARKER_COLOR = "#dc2626";
const OUT_ZONE_MARKER_COLOR = "#94a3b8";

function buildDotMarkerImage(kakao: NonNullable<Window["kakao"]>, color: string, size: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  const dataUri = `data:image/svg+xml;base64,${btoa(svg)}`;
  return new kakao.maps.MarkerImage(dataUri, new kakao.maps.Size(size, size), {
    offset: new kakao.maps.Point(size / 2, size / 2),
  });
}

/** 재개발 구역도 카카오맵 컴포넌트 — 기존 구역을 다각형으로 표시하고,
 * 경매물건을 구역 포함 여부에 따라 다른 색 마커로 찍는다. `drawing`이
 * true면 지도 클릭으로 새 다각형의 꼭짓점을 순서대로 추가하는 그리기
 * 모드로 전환된다(사용자 요청, 2026-08-04: "관리자가 카카오맵 위에서
 * 재개발 구역의 경계를 다각형으로 직접 그릴 수 있어야 함"). */
export function RedevelopmentMapView({
  zones,
  auctions,
  selectedZoneId,
  onZoneClick,
  drawing,
  editingZone,
  onFinishDraw,
  draftPointCount,
  onDraftPointCountChange,
}: {
  zones: RedevelopmentZone[];
  auctions: RedevelopmentMapAuction[];
  selectedZoneId: string | null;
  onZoneClick: (zoneId: string) => void;
  drawing: boolean;
  /** 그리기 모드가 "기존 구역 다시 그리기"일 때, 참고용으로 옛 경계를
   * 점선으로 같이 보여준다. */
  editingZone: RedevelopmentZone | null;
  onFinishDraw: (points: RedevelopmentPoint[]) => void;
  draftPointCount: number;
  onDraftPointCountChange: (count: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const zonePolygonsRef = useRef<KakaoPolygon[]>([]);
  const markersRef = useRef<KakaoMarker[]>([]);
  const draftPointsRef = useRef<RedevelopmentPoint[]>([]);
  const draftPolylineRef = useRef<KakaoPolyline | null>(null);
  const draftMarkersRef = useRef<KakaoMarker[]>([]);
  const referencePolygonRef = useRef<KakaoPolygon | null>(null);
  const clickListenerRef = useRef<((...args: unknown[]) => void) | null>(null);
  const onFinishDrawRef = useRef(onFinishDraw);
  onFinishDrawRef.current = onFinishDraw;
  const onDraftPointCountChangeRef = useRef(onDraftPointCountChange);
  onDraftPointCountChangeRef.current = onDraftPointCountChange;

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;

  useEffect(() => {
    if (!appKey) {
      setError("카카오맵 API 키(NEXT_PUBLIC_KAKAO_MAP_APP_KEY)가 설정되어 있지 않습니다.");
      return;
    }
    if (!containerRef.current) return;
    let cancelled = false;
    loadKakaoMaps(appKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.kakao) return;
        const kakao = window.kakao;
        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(36.5, 127.8),
          level: 13,
        });
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "카카오맵 로드 실패");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey]);

  // 구역 다각형 렌더링
  useEffect(() => {
    if (!ready || !mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    zonePolygonsRef.current.forEach((p) => p.setMap(null));
    zonePolygonsRef.current = [];

    zones.forEach((zone) => {
      const color = zone.color || DEFAULT_ZONE_COLOR;
      const selected = zone.id === selectedZoneId;
      const path = zone.polygon.map((p) => new kakao.maps.LatLng(p.lat, p.lng));
      const polygon = new kakao.maps.Polygon({
        path,
        strokeWeight: selected ? 3 : 2,
        strokeColor: color,
        strokeOpacity: 0.9,
        fillColor: color,
        fillOpacity: selected ? 0.35 : 0.18,
      });
      polygon.setMap(map);
      kakao.maps.event.addListener(polygon, "click", () => onZoneClick(zone.id));
      zonePolygonsRef.current.push(polygon);
    });
  }, [ready, zones, selectedZoneId, onZoneClick]);

  // 경매물건 마커 렌더링(구역 포함 여부에 따라 색 구분)
  useEffect(() => {
    if (!ready || !mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const inZoneImage = buildDotMarkerImage(kakao, IN_ZONE_MARKER_COLOR, 20);
    const outZoneImage = buildDotMarkerImage(kakao, OUT_ZONE_MARKER_COLOR, 14);

    auctions.forEach((a) => {
      const inZone = a.zoneIds.length > 0;
      if (selectedZoneId && !a.zoneIds.includes(selectedZoneId)) return;
      const position = new kakao.maps.LatLng(a.latitude, a.longitude);
      const marker = new kakao.maps.Marker({
        position,
        image: inZone ? inZoneImage : outZoneImage,
      });
      marker.setMap(map);
      markersRef.current.push(marker);
    });
  }, [ready, auctions, selectedZoneId]);

  // 그리기 모드 — 지도 클릭으로 꼭짓점 추가
  useEffect(() => {
    if (!ready || !mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    function clearDraft() {
      draftPointsRef.current = [];
      draftMarkersRef.current.forEach((m) => m.setMap(null));
      draftMarkersRef.current = [];
      draftPolylineRef.current?.setMap(null);
      draftPolylineRef.current = null;
      referencePolygonRef.current?.setMap(null);
      referencePolygonRef.current = null;
    }

    if (!drawing) {
      clearDraft();
      if (clickListenerRef.current) {
        kakao.maps.event.removeListener(map, "click", clickListenerRef.current);
        clickListenerRef.current = null;
      }
      return;
    }

    clearDraft();

    if (editingZone) {
      const path = editingZone.polygon.map((p) => new kakao.maps.LatLng(p.lat, p.lng));
      referencePolygonRef.current = new kakao.maps.Polygon({
        path,
        strokeWeight: 2,
        strokeColor: "#9ca3af",
        strokeOpacity: 0.8,
        fillColor: "#9ca3af",
        fillOpacity: 0.05,
      });
      referencePolygonRef.current.setMap(map);
    }

    function redrawDraft() {
      if (!window.kakao) return;
      const kakao2 = window.kakao;
      draftMarkersRef.current.forEach((m) => m.setMap(null));
      draftMarkersRef.current = draftPointsRef.current.map((p) => {
        const marker = new kakao2.maps.Marker({ position: new kakao2.maps.LatLng(p.lat, p.lng) });
        marker.setMap(map);
        return marker;
      });
      draftPolylineRef.current?.setMap(null);
      draftPolylineRef.current = null;
      if (draftPointsRef.current.length >= 2) {
        const path = draftPointsRef.current.map((p) => new kakao2.maps.LatLng(p.lat, p.lng));
        // 닫힌 도형처럼 보이도록 첫 점을 마지막에 다시 추가
        path.push(new kakao2.maps.LatLng(draftPointsRef.current[0].lat, draftPointsRef.current[0].lng));
        draftPolylineRef.current = new kakao2.maps.Polyline({
          path,
          strokeWeight: 2,
          strokeColor: DEFAULT_ZONE_COLOR,
          strokeOpacity: 0.9,
          strokeStyle: "solid",
        });
        draftPolylineRef.current.setMap(map);
      }
      onDraftPointCountChangeRef.current(draftPointsRef.current.length);
    }

    const handler = (...args: unknown[]) => {
      const mouseEvent = args[0] as KakaoMouseEvent;
      const lat = mouseEvent.latLng.getLat();
      const lng = mouseEvent.latLng.getLng();
      draftPointsRef.current = [...draftPointsRef.current, { lat, lng }];
      redrawDraft();
    };
    clickListenerRef.current = handler;
    kakao.maps.event.addListener(map, "click", handler);

    return () => {
      if (clickListenerRef.current) {
        kakao.maps.event.removeListener(map, "click", clickListenerRef.current);
        clickListenerRef.current = null;
      }
    };
  }, [ready, drawing, editingZone]);

  function handleUndoLastPoint() {
    draftPointsRef.current = draftPointsRef.current.slice(0, -1);
    draftMarkersRef.current[draftMarkersRef.current.length - 1]?.setMap(null);
    draftMarkersRef.current = draftMarkersRef.current.slice(0, -1);
    onDraftPointCountChangeRef.current(draftPointsRef.current.length);
  }

  function handleFinish() {
    if (draftPointsRef.current.length < 3) return;
    onFinishDrawRef.current(draftPointsRef.current);
  }

  if (error) {
    return (
      <div className="rounded-sm border border-border bg-card p-6 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div ref={containerRef} className="w-full rounded-sm border border-border" style={{ height: 600 }} />
        {drawing && (
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 rounded-sm border border-border bg-card/95 px-3 py-2 text-xs shadow">
            <span className="font-semibold text-foreground">
              구역 그리기 중 — 지도를 클릭해 꼭짓점을 순서대로 추가하세요 ({draftPointCount}개)
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleUndoLastPoint}
                disabled={draftPointCount === 0}
                className="px-2 py-1 rounded-sm border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                마지막 점 취소
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={draftPointCount < 3}
                className="px-2 py-1 rounded-sm bg-primary text-primary-foreground font-semibold disabled:opacity-40"
              >
                완료
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        <span style={{ color: IN_ZONE_MARKER_COLOR }}>● 구역 포함 물건</span>
        <span className="ml-3" style={{ color: OUT_ZONE_MARKER_COLOR }}>● 구역 밖 물건</span>
        <span className="ml-3" style={{ color: DEFAULT_ZONE_COLOR }}>▨ 재개발 구역</span>
      </p>
    </div>
  );
}
