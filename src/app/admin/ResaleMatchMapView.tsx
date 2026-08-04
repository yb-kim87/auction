"use client";

import { useEffect, useRef, useState } from "react";
import type { ResaleMatchMapItem } from "@/lib/api";
import { formatWon, loadKakaoMaps, profitToColor, type KakaoInfoWindow, type KakaoMap, type KakaoMarker } from "@/lib/kakao-maps";

function computeProfit(item: ResaleMatchMapItem): number | null {
  const deal = item.dealAmount == null ? null : Number(item.dealAmount);
  const sale = item.salePrice == null ? null : Number(item.salePrice);
  return deal != null && sale != null && Number.isFinite(deal) && Number.isFinite(sale) ? deal - sale : null;
}

/** 매도분석 결과를 카카오맵 위에 마커로 표시한다. 좌표가 있는 항목만
 * 그려지고(백엔드가 지오코딩 실패 건은 latitude/longitude를 null로 둠),
 * 매도차익(실거래가-낙찰가) 금액을 색으로 표시한다 — 이익이 클수록
 * 진한 초록, 손해가 클수록 진한 빨강(사용자 요청, 2026-08-04: "매도차익
 * 금액으로 색상 기준점을 바꿔줘", 처음엔 confidenceTier 등급별 색이었으나
 * 변경). */
export function ResaleMatchMapView({
  items,
  onReject,
  onDelete,
}: {
  items: ResaleMatchMapItem[];
  /** 지도 팝업에서 바로 반려(목록/지도에서 숨김)할 수 있게 한다 —
   * 사용자 요청, 2026-08-04: "매도 분석에 리스트 원하지않는거 지도에
   * 노출안되게 할 수 잇나?? 선택하는게 없네". */
  onReject: (matchId: string) => void;
  /** 반려 대신 데이터 자체를 지우고 싶을 때("아니면 데이터를 지울 수
   * 있거나"). */
  onDelete: (matchId: string) => void;
}) {
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

      const profit = computeProfit(item);
      // 마커 이미지를 색상별로 캐싱하되, 연속값이라 색이 무한히 다양해질
      // 수 있으므로 500만원 단위로 반올림해 캐시 히트율을 확보한다.
      const bucket = profit == null ? "null" : Math.round(profit / 5_000_000) * 5_000_000;
      const color = profitToColor(profit);
      let image = markerImageCache.get(String(bucket));
      if (!image) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="9" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
        const dataUri = `data:image/svg+xml;base64,${btoa(svg)}`;
        image = new kakao.maps.MarkerImage(dataUri, new kakao.maps.Size(24, 24), {
          offset: new kakao.maps.Point(12, 12),
        });
        markerImageCache.set(String(bucket), image);
      }

      const marker = new kakao.maps.Marker({ position, image });
      marker.setMap(map);
      markersRef.current.push(marker);

      const address = `${item.city} ${item.district} ${item.umdNm} ${item.jibun}`;
      const profitColor = profitToColor(profit);
      const rejectBtnId = `resale-map-reject-${item.matchId}`;
      const deleteBtnId = `resale-map-delete-${item.matchId}`;
      const content = `
        <div style="padding:10px 12px;min-width:220px;font-size:12px;line-height:1.6;">
          <div style="font-weight:700;margin-bottom:4px;">${item.auctionNo}</div>
          <div style="color:#555;margin-bottom:4px;">${address}</div>
          <div>낙찰가: ${formatWon(item.salePrice)}</div>
          <div>실거래가: ${formatWon(item.dealAmount)}</div>
          ${profit != null ? `<div style="color:${profitColor};font-weight:700;">매도차익: ${formatWon(profit)}</div>` : ""}
          <div>점수/등급: ${item.scoreTotal}점 · ${item.confidenceTier}</div>
          <div style="margin-top:6px;padding-top:6px;border-top:1px solid #eee;display:flex;gap:10px;">
            <button id="${rejectBtnId}" style="font-size:11px;color:#d97706;background:none;border:none;cursor:pointer;padding:0;">지도에서 제외(반려)</button>
            <button id="${deleteBtnId}" style="font-size:11px;color:#dc2626;background:none;border:none;cursor:pointer;padding:0;">삭제</button>
          </div>
        </div>
      `;

      kakao.maps.event.addListener(marker, "click", () => {
        if (!infoWindowRef.current) return;
        infoWindowRef.current.close();
        infoWindowRef.current = new kakao.maps.InfoWindow({ content, removable: true });
        infoWindowRef.current.open(map, marker);
        // InfoWindow 콘텐츠는 open() 시점에야 실제 DOM에 삽입되므로,
        // 버튼 클릭 핸들러는 다음 tick에 바인딩해야 한다.
        setTimeout(() => {
          document.getElementById(rejectBtnId)?.addEventListener("click", () => onReject(item.matchId));
          document.getElementById(deleteBtnId)?.addEventListener("click", () => onDelete(item.matchId));
        }, 0);
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
        좌표 확보된 {withCoordsCount}건 / 전체 {items.length}건 표시 중. 매도차익(실거래가-낙찰가)
        기준 색상 —
        <span style={{ color: profitToColor(100_000_000) }}> ● 이익 큼(+1억↑)</span>
        <span style={{ color: profitToColor(20_000_000) }}> ● 이익</span>
        <span style={{ color: profitToColor(0) }}> ● 0 근처</span>
        <span style={{ color: profitToColor(-20_000_000) }}> ● 손해</span>
        <span style={{ color: profitToColor(-50_000_000) }}> ● 손해 큼(-5천만↓)</span>
      </p>
      <div ref={containerRef} className="w-full rounded-sm border border-border" style={{ height: 600 }} />
    </div>
  );
}
