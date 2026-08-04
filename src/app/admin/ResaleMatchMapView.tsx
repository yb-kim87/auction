"use client";

import { useEffect, useRef, useState } from "react";
import type { ResaleMatchMapItem } from "@/lib/api";
import { formatWon, loadKakaoMaps, type KakaoInfoWindow, type KakaoMap, type KakaoMarker } from "@/lib/kakao-maps";

const TIER_COLOR: Record<ResaleMatchMapItem["confidenceTier"], string> = {
  VERY_HIGH: "#059669",
  HIGH: "#0284c7",
  MEDIUM: "#d97706",
  LOW: "#6b7280",
};

/** 매도분석 결과를 카카오맵 위에 마커로 표시한다. 좌표가 있는 항목만
 * 그려지고(백엔드가 지오코딩 실패 건은 latitude/longitude를 null로 둠),
 * 등급(confidenceTier)별로 마커 색을 다르게 한다. 사용자 요청,
 * 2026-08-04: "매도분석된 리스트를 지도위에 표시". */
export function ResaleMatchMapView({ items }: { items: ResaleMatchMapItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);
  const infoWindowRef = useRef<KakaoInfoWindow | null>(null);
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
        infoWindowRef.current = new kakao.maps.InfoWindow({ content: "", removable: true });
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

  useEffect(() => {
    if (!ready || !mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    infoWindowRef.current?.close();

    const withCoords = items.filter(
      (item) => item.latitude != null && item.longitude != null,
    );
    if (withCoords.length === 0) return;

    const markerImageCache = new Map<string, unknown>();
    const bounds = new kakao.maps.LatLngBounds();

    withCoords.forEach((item) => {
      const position = new kakao.maps.LatLng(item.latitude as number, item.longitude as number);
      bounds.extend(position);

      const color = TIER_COLOR[item.confidenceTier];
      let image = markerImageCache.get(color);
      if (!image) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="9" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
        const dataUri = `data:image/svg+xml;base64,${btoa(svg)}`;
        image = new kakao.maps.MarkerImage(dataUri, new kakao.maps.Size(24, 24), {
          offset: new kakao.maps.Point(12, 12),
        });
        markerImageCache.set(color, image);
      }

      const marker = new kakao.maps.Marker({ position, image });
      marker.setMap(map);
      markersRef.current.push(marker);

      const address = `${item.city} ${item.district} ${item.umdNm} ${item.jibun}`;
      const deal = item.dealAmount == null ? null : Number(item.dealAmount);
      const sale = item.salePrice == null ? null : Number(item.salePrice);
      const profit = deal != null && sale != null ? deal - sale : null;
      const content = `
        <div style="padding:10px 12px;min-width:220px;font-size:12px;line-height:1.6;">
          <div style="font-weight:700;margin-bottom:4px;">${item.auctionNo}</div>
          <div style="color:#555;margin-bottom:4px;">${address}</div>
          <div>낙찰가: ${formatWon(item.salePrice)}</div>
          <div>실거래가: ${formatWon(item.dealAmount)}</div>
          ${profit != null ? `<div>매도차익: ${formatWon(profit)}</div>` : ""}
          <div>점수/등급: ${item.scoreTotal}점 · ${item.confidenceTier}</div>
        </div>
      `;

      kakao.maps.event.addListener(marker, "click", () => {
        if (!infoWindowRef.current) return;
        infoWindowRef.current.close();
        infoWindowRef.current = new kakao.maps.InfoWindow({ content, removable: true });
        infoWindowRef.current.open(map, marker);
      });
    });

    map.setBounds(bounds);
  }, [ready, items]);

  if (error) {
    return (
      <div className="rounded-sm border border-border bg-card p-6 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  const withCoordsCount = items.filter((i) => i.latitude != null && i.longitude != null).length;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        좌표 확보된 {withCoordsCount}건 / 전체 {items.length}건 표시 중. 등급별 색상 —
        <span style={{ color: TIER_COLOR.VERY_HIGH }}> ● VERY_HIGH</span>
        <span style={{ color: TIER_COLOR.HIGH }}> ● HIGH</span>
        <span style={{ color: TIER_COLOR.MEDIUM }}> ● MEDIUM</span>
      </p>
      <div ref={containerRef} className="w-full rounded-sm border border-border" style={{ height: 600 }} />
    </div>
  );
}
