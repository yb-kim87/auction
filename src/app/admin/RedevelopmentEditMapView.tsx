"use client";

import { useEffect, useRef, useState } from "react";
import type { RedevelopmentMapAuction, RedevelopmentPoint, RedevelopmentZone, ResearchMapPoints } from "@/lib/api";
import { zoneStyle, ZONE_TYPE_LEGEND } from "@/lib/zone-stage-style";
import {
  loadKakaoMaps,
  type KakaoMap,
  type KakaoMarker,
  type KakaoMouseEvent,
  type KakaoPolygon,
  type KakaoPolyline,
} from "@/lib/kakao-maps";

const DEFAULT_ZONE_COLOR = "#7c3aed";
/** 지도 라벨을 눌렀을 때 팝업에 보여 줄 한 건(경매·호가·실거래). */
type MapPopupFact = { label: string; value: string; strong?: boolean };
type MapPopupRow = { kind: "auction" | "ask" | "trade"; title: string; facts?: MapPopupFact[]; lines: string[]; href?: string; auctionId?: string };
const KIND_LABEL = { auction: "경매", ask: "호가", trade: "실거래" } as const;
const KIND_BG = { auction: "#1f2937", ask: "#16a34a", trade: "#eab308" } as const;

/** 호가·실거래 팝업의 핵심 4칸: 공시가 / 전세가(공시가×126%) / 호가(또는 실거래가) / 갭(가격−전세가). */
function priceFacts(kind: "ask" | "trade", priceManwon: number, officialManwon: number | null | undefined, basis?: string): MapPopupFact[] {
  const priceLabel = kind === "ask" ? "호가" : "실거래가";
  if (officialManwon == null) {
    return [
      { label: "공시가", value: "정보 없음" },
      { label: "전세가(126%)", value: "-" },
      { label: priceLabel, value: formatManwon(priceManwon), strong: true },
      { label: `${priceLabel}대비 갭`, value: "-" },
    ];
  }
  const jeonse = Math.round(officialManwon * 1.26);
  const gap = priceManwon - jeonse;
  const basisNote = basis === "ho" ? "" : " (추정)";
  return [
    { label: `공시가${basisNote}`, value: formatManwon(officialManwon) },
    { label: "전세가(126%)", value: formatManwon(jeonse) },
    { label: priceLabel, value: formatManwon(priceManwon), strong: true },
    { label: `${priceLabel}대비 갭`, value: `${gap < 0 ? "-" : ""}${formatManwon(Math.abs(gap))}`, strong: true },
  ];
}

/** 만원 → "3.3억" / "9,500만" */
function formatManwon(manwon: number): string {
  if (manwon >= 10000) return `${(Math.round(manwon / 100) / 100).toString().replace(/\.0+$/, "")}억`;
  return `${manwon.toLocaleString("ko-KR")}만`;
}

/** 재개발 구역도 카카오맵 컴포넌트 — 기존 구역을 다각형으로 표시하고,
 * 경매물건을 구역 포함 여부에 따라 다른 색 마커로 찍는다. `drawing`이
 * true면 지도 클릭으로 새 다각형의 꼭짓점을 순서대로 추가하는 그리기
 * 모드로 전환된다(사용자 요청, 2026-08-04: "관리자가 카카오맵 위에서
 * 재개발 구역의 경계를 다각형으로 직접 그릴 수 있어야 함"). */
export function RedevelopmentEditMapView({
  zones,
  auctions,
  selectedZoneId,
  zoneFocusNonce = 0,
  onZoneClick,
  drawing,
  editingZone,
  onFinishDraw,
  draftPointCount,
  onDraftPointCountChange,
  focusGu,
  focusDong,
  fillHeight = false,
  toolbar = null,
  onAuctionClick,
  selectedAuctionId = null,
  researchPoints = null,
  showNear = false,
  focusAuction = null,
  onShowNearChange,
  toleranceM = 30,
}: {
  /** 목록에서 주소를 눌렀을 때 지도를 옮길 물건(nonce가 바뀔 때마다 이동·강조). */
  focusAuction?: { id: string; lat: number; lng: number; nonce: number } | null;
  /** 구역 경계 밖이지만 근처인 경매물건을 보일지(회색 라벨) — 버튼으로 숨길 수 있다. */
  showNear?: boolean;
  onShowNearChange?: (v: boolean) => void;
  /** 조사로 저장된 호가·실거래(지도 가격 라벨). */
  researchPoints?: ResearchMapPoints | null;
  /** 경계 오차범위(m) — 이 안의 호가·실거래만 찍는다. */
  toleranceM?: number;
  /** 경매물건 점을 눌렀을 때 — 상세·조사 패널을 열기 위해 상위에서 처리한다. */
  onAuctionClick?: (auctionId: string) => void;
  selectedAuctionId?: string | null;
  zones: RedevelopmentZone[];
  auctions: RedevelopmentMapAuction[];
  selectedZoneId: string | null;
  zoneFocusNonce?: number;
  onZoneClick: (zoneId: string) => void;
  drawing: boolean;
  /** 그리기 모드가 "기존 구역 다시 그리기"일 때, 참고용으로 옛 경계를
   * 점선으로 같이 보여준다. */
  editingZone: RedevelopmentZone | null;
  onFinishDraw: (points: RedevelopmentPoint[]) => void;
  draftPointCount: number;
  onDraftPointCountChange: (count: number) => void;
  /** 목록 필터에서 고른 구/동 — 바뀌면 지도를 그 행정구역으로 이동한다(없으면 서울 전체). */
  focusGu?: string;
  focusDong?: string;
  /** true면 600px 고정 대신 부모 높이를 꽉 채운다(재개발닷컴식 좌측 정보/우측 큰 지도 레이아웃). */
  fillHeight?: boolean;
  /** 지도 위쪽에 올리는 도구(사업종류·진행단계 필터 등). */
  toolbar?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const draftPointsRef = useRef<RedevelopmentPoint[]>([]);
  const draftPolylineRef = useRef<KakaoPolyline | null>(null);
  const draftMarkersRef = useRef<KakaoMarker[]>([]);
  const referencePolygonRef = useRef<KakaoPolygon | null>(null);
  const boundaryShapesRef = useRef<{ gu: { setMap: (m: KakaoMap | null) => void }[]; dong: { setMap: (m: KakaoMap | null) => void }[] }>({ gu: [], dong: [] });
  const [showGu, setShowGu] = useState(true);
  const [showDong, setShowDong] = useState(false);
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
          center: new kakao.maps.LatLng(37.5665, 126.978),
          level: 8,
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

  // 컨테이너 크기가 바뀌면(창 크기 변경 등) 카카오맵이 타일을 다시 계산하게 한다.
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(() => {
      (mapRef.current as unknown as { relayout?: () => void } | null)?.relayout?.();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready]);

  // 서울특별시 행정구역(구/동) 경계 — 켜고 끌 수 있다. 클릭을 가로채지 않도록
  // 채움 없는 폴리라인(외곽선)으로만 그린다. 데이터: public/geo/seoul-*.json
  useEffect(() => {
    if (!ready || !mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    const shapes = boundaryShapesRef.current;
    let cancelled = false;

    type Ring = number[][];
    type GeoFeature = { properties: { name: string }; geometry: { type: string; coordinates: Ring[] | Ring[][] } };
    async function draw(kind: "gu" | "dong", on: boolean, style: { weight: number; color: string; opacity: number }) {
      shapes[kind].forEach((l) => l.setMap(null));
      shapes[kind] = [];
      if (!on) return;
      const res = await fetch(`/geo/seoul-${kind}.json`);
      const data = (await res.json()) as { features: GeoFeature[] };
      if (cancelled) return;
      for (const f of data.features) {
        const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates as Ring[]] : (f.geometry.coordinates as Ring[][]);
        for (const poly of polys) {
          for (const ring of poly) {
            const line = new kakao.maps.Polyline({
              path: ring.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng)),
              strokeWeight: style.weight,
              strokeColor: style.color,
              strokeOpacity: style.opacity,
            });
            line.setMap(map);
            shapes[kind].push(line);
          }
        }
        if (kind === "gu") {
          // MultiPolygon이면 가장 큰(점이 많은) 덩어리에 라벨을 둔다.
          const ring = polys.map((poly) => poly[0] ?? []).sort((a, b) => b.length - a.length)[0] ?? [];
          if (ring.length > 0) {
            const lat = ring.reduce((a, c) => a + c[1], 0) / ring.length;
            const lng = ring.reduce((a, c) => a + c[0], 0) / ring.length;
            const label = new kakao.maps.CustomOverlay({
              position: new kakao.maps.LatLng(lat, lng),
              content: `<div style="font:700 12px sans-serif;color:#1d4ed8;text-shadow:0 0 3px #fff,0 0 3px #fff;pointer-events:none">${f.properties.name}</div>`,
              zIndex: 1,
            });
            label.setMap(map);
            shapes[kind].push(label);
          }
        }
      }
    }
    void draw("gu", showGu, { weight: 3, color: "#1d4ed8", opacity: 0.85 });
    void draw("dong", showDong, { weight: 1, color: "#64748b", opacity: 0.7 });
    return () => {
      cancelled = true;
    };
  }, [ready, showGu, showDong]);

  // 구/동 필터를 고르면 지도를 그 행정구역으로 옮긴다(사용자 요청: "금천구로 가면
  // 지도도 금천구로"). 필터를 풀면 서울 전체 보기로 돌아간다.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!focusGu && !focusDong) {
      map.setCenter(new kakao.maps.LatLng(37.5665, 126.978));
      return;
    }
    let cancelled = false;
    type Ring = number[][];
    type GeoFeature = { properties: { name: string; gu?: string }; geometry: { type: string; coordinates: Ring[] | Ring[][] } };
    const kind = focusDong ? "dong" : "gu";
    fetch(`/geo/seoul-${kind}.json`)
      .then((r) => r.json() as Promise<{ features: GeoFeature[] }>)
      .then((data) => {
        if (cancelled) return;
        const feats = data.features.filter((f) =>
          kind === "dong" ? f.properties.name.replace(/\d+(?=동$)/, "") === (focusDong ?? "").replace(/\d+가$/, "") && (!focusGu || f.properties.gu === focusGu) : f.properties.name === focusGu,
        );
        if (feats.length === 0) return;
        const bounds = new kakao.maps.LatLngBounds();
        for (const f of feats) {
          const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates as Ring[]] : (f.geometry.coordinates as Ring[][]);
          for (const poly of polys) for (const [lng, lat] of poly[0]) bounds.extend(new kakao.maps.LatLng(lat, lng));
        }
        map.setBounds(bounds);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ready, focusGu, focusDong]);

  // 구역 다각형 + 라벨 레이어 — 재개발닷컴처럼 "화면에 보이는 구역만" 그린다.
  // (2026-10-24: 구역 2천여 개를 전부 SVG/HTML로 만들고, 선택·렌더링마다 통째로
  // 다시 만들던 것이 부하의 원인이었다.)
  //  - 좌표·중심점은 구역이 바뀔 때 한 번만 계산해 둔다(index).
  //  - 지도가 멈출 때(idle)마다 화면(+여유) 안에 걸린 구역만 diff로 추가/제거한다.
  //  - 한 번에 그리는 다각형은 MAX_POLYGONS개(화면 중심에 가까운 순), 라벨은 가까이
  //    확대했을 때(level <= LABEL_MAX_LEVEL) MAX_LABELS개까지만 만든다.
  //  - 선택이 바뀌면 이전/새 구역의 스타일만 바꾼다(전체 재생성 없음).
  const onZoneClickRef = useRef(onZoneClick);
  onZoneClickRef.current = onZoneClick;
  const onAuctionClickRef = useRef(onAuctionClick);
  onAuctionClickRef.current = onAuctionClick;
  const selectedZoneIdRef = useRef(selectedZoneId);
  selectedZoneIdRef.current = selectedZoneId;
  const zoneLayerRef = useRef<{ restyle: (prevId: string | null) => void } | null>(null);
  const prevSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    const MAX_POLYGONS = 500;
    const MAX_LABELS = 60;
    const LABEL_MAX_LEVEL = 5;
    const VIEW_PAD = 0.25;
    type Bounds = { getSouthWest: () => { getLat: () => number; getLng: () => number }; getNorthEast: () => { getLat: () => number; getLng: () => number } };
    type PolygonWithOptions = KakaoPolygon & { setOptions: (o: Record<string, unknown>) => void };

    const index = zones
      .filter((z) => z.polygon.length > 0)
      .map((zone) => {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity, sumLat = 0, sumLng = 0;
        for (const p of zone.polygon) {
          if (p.lat < minLat) minLat = p.lat;
          if (p.lat > maxLat) maxLat = p.lat;
          if (p.lng < minLng) minLng = p.lng;
          if (p.lng > maxLng) maxLng = p.lng;
          sumLat += p.lat;
          sumLng += p.lng;
        }
        return { zone, minLat, maxLat, minLng, maxLng, cLat: sumLat / zone.polygon.length, cLng: sumLng / zone.polygon.length };
      });
    const itemById = new Map(index.map((i) => [i.zone.id, i]));

    const polygons = new Map<string, PolygonWithOptions>();
    const labels = new Map<string, { setMap: (m: KakaoMap | null) => void }>();

    // 재개발닷컴과 같은 값: 선 두께 2(선택 3)·선 투명도 .8(선택 1)·채움 .1(선택 .15), 추진중 단계는 점선+채움 75%, 준공은 선 .4·채움 없음.
    const polygonStyle = (zone: RedevelopmentZone, selected: boolean) => {
      const { color, dashed, completed } = zoneStyle(zone);
      const fill = completed ? 0 : (selected ? 0.15 : 0.1) * (dashed ? 0.75 : 1);
      return {
        strokeWeight: (selected ? 3 : 2) + (zone.isInterest ? 1 : 0),
        strokeStyle: dashed ? "dash" : "solid",
        strokeColor: color,
        strokeOpacity: completed ? 0.4 : selected ? 1 : 0.8,
        fillColor: color,
        fillOpacity: fill,
      };
    };

    function addPolygon(item: (typeof index)[number]) {
      const { zone } = item;
      const polygon = new kakao.maps.Polygon({
        path: zone.polygon.map((p) => new kakao.maps.LatLng(p.lat, p.lng)),
        ...polygonStyle(zone, zone.id === selectedZoneIdRef.current),
      }) as PolygonWithOptions;
      polygon.setMap(map);
      kakao.maps.event.addListener(polygon, "click", () => onZoneClickRef.current(zone.id));
      polygons.set(zone.id, polygon);
    }

    function addLabel(item: (typeof index)[number]) {
      const { zone } = item;
      const color = zoneStyle(zone).color;
      const selected = zone.id === selectedZoneIdRef.current;
      const box = document.createElement("div");
      const interest = !!zone.isInterest;
      box.style.cssText = `cursor:pointer;border:${interest ? "2px solid #f59e0b" : `1px solid ${color}`};border-radius:3px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);overflow:hidden;text-align:center;font:600 11px/1.3 sans-serif;white-space:nowrap;${selected ? "outline:2px solid #111;" : ""}`;
      const title = document.createElement("div");
      title.style.cssText = `background:${color};color:#fff;padding:1px 6px`;
      title.textContent = interest ? `★ ${zone.name}` : zone.name;
      const stage = document.createElement("div");
      stage.style.cssText = "color:#111;padding:1px 6px";
      stage.textContent = zone.stage || "확인필요";
      box.append(title, stage);
      box.addEventListener("click", () => onZoneClickRef.current(zone.id));
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(item.cLat, item.cLng),
        content: box,
        yAnchor: 0.5,
        xAnchor: 0.5,
        zIndex: selected ? 10 : 5,
      });
      overlay.setMap(map);
      labels.set(zone.id, overlay);
    }

    function sync() {
      const b = (map as unknown as { getBounds: () => Bounds }).getBounds();
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      const padLat = (ne.getLat() - sw.getLat()) * VIEW_PAD;
      const padLng = (ne.getLng() - sw.getLng()) * VIEW_PAD;
      const minLat = sw.getLat() - padLat, maxLat = ne.getLat() + padLat;
      const minLng = sw.getLng() - padLng, maxLng = ne.getLng() + padLng;
      const center = map.getCenter();
      const cLat = center.getLat(), cLng = center.getLng();

      const inView = index
        .filter((i) => i.maxLat >= minLat && i.minLat <= maxLat && i.maxLng >= minLng && i.minLng <= maxLng)
        .map((i) => ({ i, d: (i.cLat - cLat) ** 2 + (i.cLng - cLng) ** 2 }))
        .sort((a, b2) => a.d - b2.d)
        .map((x) => x.i);

      const wantPolys = new Set(inView.slice(0, MAX_POLYGONS).map((i) => i.zone.id));
      const selId = selectedZoneIdRef.current;
      if (selId && itemById.has(selId)) wantPolys.add(selId);
      // 관심 구역은 화면 안에 있으면 개수 제한과 상관없이 항상 그린다.
      for (const i of inView) if (i.zone.isInterest) wantPolys.add(i.zone.id);
      polygons.forEach((p, id) => {
        if (!wantPolys.has(id)) {
          p.setMap(null);
          polygons.delete(id);
        }
      });
      wantPolys.forEach((id) => {
        if (!polygons.has(id)) addPolygon(itemById.get(id)!);
      });

      const wantLabels = new Set<string>();
      if (map.getLevel() <= LABEL_MAX_LEVEL) {
        inView.slice(0, MAX_LABELS).forEach((i) => wantLabels.add(i.zone.id));
        if (selId && itemById.has(selId)) wantLabels.add(selId);
        for (const i of inView) if (i.zone.isInterest) wantLabels.add(i.zone.id);
      }
      labels.forEach((o, id) => {
        if (!wantLabels.has(id)) {
          o.setMap(null);
          labels.delete(id);
        }
      });
      wantLabels.forEach((id) => {
        if (!labels.has(id)) addLabel(itemById.get(id)!);
      });
    }

    function restyle(prevId: string | null) {
      const selId = selectedZoneIdRef.current;
      for (const id of [prevId, selId]) {
        const item = id ? itemById.get(id) : undefined;
        const poly = id ? polygons.get(id) : undefined;
        if (item && poly) poly.setOptions(polygonStyle(item.zone, id === selId));
      }
      // 라벨은 선택 강조(테두리/zIndex)가 달라지므로 다시 만든다(최대 MAX_LABELS개).
      labels.forEach((o) => o.setMap(null));
      labels.clear();
      sync();
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onIdle = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(sync, 120);
    };
    kakao.maps.event.addListener(map, "idle", onIdle);
    zoneLayerRef.current = { restyle };
    sync();

    return () => {
      if (timer) clearTimeout(timer);
      kakao.maps.event.removeListener(map, "idle", onIdle);
      zoneLayerRef.current = null;
      polygons.forEach((p) => p.setMap(null));
      labels.forEach((o) => o.setMap(null));
    };
  }, [ready, zones]);

  // 선택이 바뀌면 이전/새 구역 스타일만 바꾼다.
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectedZoneId;
    zoneLayerRef.current?.restyle(prev);
  }, [selectedZoneId]);

  // 가격 라벨 레이어(재개발닷컴식) — 경매=감정가(파랑) / 매물=호가(초록) / 실거래(노랑).
  // 화면(+여유) 안의 라벨만 종류별 최대 MAX_PER_KIND개, 지도가 멈출 때(idle)마다 diff로 갱신한다.
  const [popup, setPopup] = useState<{ rows: MapPopupRow[] } | null>(null);
  const autoPopupNonceRef = useRef<number | null>(null);
  const [showAuctions, setShowAuctions] = useState(true);
  // 경매물건 범위: 전체 / 진행중(낙찰가 없음) / 낙찰(낙찰가 있음) — 사용자 요청, 2026-10-25.
  const [auctionScope, setAuctionScope] = useState<"all" | "active" | "sold">("all");
  const [showAsks, setShowAsks] = useState(true);
  const [showTrades, setShowTrades] = useState(true);
  useEffect(() => {
    if (!ready || !mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    const MAX_PER_KIND = 250;
    type Bounds = { getSouthWest: () => { getLat: () => number; getLng: () => number }; getNorthEast: () => { getLat: () => number; getLng: () => number } };
    type Item = { key: string; kind: "auction" | "ask" | "trade"; lat: number; lng: number; top: string; text: string; badge?: string; tone?: "near" | "out"; sold?: boolean; value: number; selected: boolean; ids?: string[]; row: MapPopupRow };
    const tol = toleranceM;
    const within = (d: number | null) => d == null || d <= tol;
    const items: Item[] = [];
    if (showAuctions) {
      for (const a of auctions) {
        // 낙찰 여부는 낙찰가(salePrice) 유무로 본다 — 매각결정기일·허가·지급기한·배당 단계가 모두 낙찰가를 가진다.
        const sold = (a.salePrice ?? 0) > 0;
        if (auctionScope === "active" && sold) continue;
        if (auctionScope === "sold" && !sold) continue;
        // 진행중은 현재 최저가, 낙찰은 낙찰가를 보여 주고 감정가 대비 %를 뱃지로 단다.
        const won = sold ? a.salePrice : a.minPrice || a.salePrice || a.appraisedValue;
        const pctBase = sold ? a.salePrice : a.minPrice;
        const pct = pctBase && a.appraisedValue ? Math.round((pctBase / a.appraisedValue) * 100) : null;
        const kindText = sold ? "낙찰" : "경매";
        items.push({
          key: `a:${a.id}`,
          kind: "auction",
          lat: a.latitude,
          lng: a.longitude,
          top: a.near ? `${kindText}·경계밖` : a.zoneIds.length === 0 ? `${kindText}·구역밖` : kindText,
          tone: a.near ? "near" : a.zoneIds.length === 0 ? "out" : undefined,
          sold,
          badge: pct != null ? `${pct}%` : undefined,
          text: won ? formatManwon(won / 10000) : "-",
          value: won ? won / 10000 : Infinity,
          selected: a.id === selectedAuctionId || a.id === focusAuction?.id,
          ids: [a.id],
          row: {
            kind: "auction",
            title: `${sold ? "낙찰가" : "경매 최저가"} ${won ? formatManwon(won / 10000) : "-"}${pct != null ? ` (감정가 대비 ${pct}%)` : ""}${a.near ? " · 구역 경계 밖 근처(구역일 가능성)" : a.zoneIds.length === 0 ? " · 구역 밖" : ""}`,
            lines: [`${a.auctionNo} · ${a.address}`, a.appraisedValue ? `감정가 ${formatManwon(a.appraisedValue / 10000)}` : ""].filter(Boolean),
            auctionId: a.id,
          },
        });
      }
    }
    if (showAsks) {
      for (const l of researchPoints?.listings ?? []) {
        if (!within(l.distanceM)) continue;
        items.push({ key: `l:${l.id}`, kind: "ask", lat: l.lat, lng: l.lng, top: "호가", text: formatManwon(l.priceManwon), value: l.priceManwon, selected: false,
          row: {
            kind: "ask",
            title: `호가 ${formatManwon(l.priceManwon)}${l.area ? ` · 전용 ${l.area}㎡` : ""}`,
            facts: priceFacts("ask", l.priceManwon, l.officialManwon, l.officialBasis),
            lines: [
              [l.articleName, l.floorInfo, l.roomCount != null ? `방 ${l.roomCount}` : "", l.direction].filter(Boolean).join(" · "),
              l.address || l.jibun || "",
              [l.realtor, l.realtorPhone].filter(Boolean).join(" "),
              [l.buildingYear ? `${l.buildingYear}년` : "", l.confirmedAt ? `확인 ${l.confirmedAt}` : ""].filter(Boolean).join(" · "),
            ].filter(Boolean),
            href: `https://fin.land.naver.com/articles/${l.articleNo}`,
          },
        });
      }
    }
    if (showTrades) {
      for (const tr of researchPoints?.trades ?? []) {
        if (!within(tr.distanceM)) continue;
        items.push({ key: `t:${tr.id}`, kind: "trade", lat: tr.lat, lng: tr.lng, top: "실거래", text: formatManwon(tr.priceManwon), value: tr.priceManwon, selected: false,
          row: {
            kind: "trade",
            title: `실거래 ${formatManwon(tr.priceManwon)} · 전용 ${tr.area}㎡`,
            facts: priceFacts("trade", tr.priceManwon, tr.officialManwon, tr.officialBasis),
            lines: [
              [tr.date, tr.floor ? `${tr.floor}층` : "", tr.dealingType].filter(Boolean).join(" · "),
              [tr.buildingName, tr.umdNm, tr.jibun].filter(Boolean).join(" "),
              [tr.buildYear ? `${tr.buildYear}년 준공` : "", tr.houseType, tr.landArea ? `대지권 ${tr.landArea}㎡` : ""].filter(Boolean).join(" · "),
            ].filter(Boolean),
            href: "https://rt.molit.go.kr/",
          },
        });
      }
    }
    // 같은 좌표(한 건물)의 같은 종류는 한 라벨로 묶는다(재개발닷컴도 같은 위치 매물을 묶는다). 대표는 선택된 것, 없으면 최저가.
    const groups = new Map<string, Item[]>();
    for (const it of items) {
      const k = `${it.kind}|${it.tone ?? ""}|${it.lat.toFixed(6)}|${it.lng.toFixed(6)}`;
      const g = groups.get(k);
      if (g) g.push(it);
      else groups.set(k, [it]);
    }
    const merged: Item[] = [];
    const moreByKey = new Map<string, Item[]>();
    groups.forEach((g) => {
      const best = g.slice().sort((x, y) => Number(y.selected) - Number(x.selected) || x.value - y.value)[0];
      const allIds = g.flatMap((x) => x.ids ?? []);
      const item: Item = { ...best, ids: allIds };
      moreByKey.set(best.key, g.filter((x) => x !== best));
      merged.push(item);
    });
    const COLORS = { auction: ["#1f2937", "#fff", 30], ask: ["#16a34a", "#fff", 20], trade: ["#eab308", "#fff", 10] } as const;
    // 라벨을 누르면: 단독 경매는 바로 상세, 그 외(호가·실거래, 같은 위치·겹침으로 가려진 건 포함)는 목록 팝업.
    const clickFor = (i: Item, others: Item[]) => () => {
      if (i.kind === "auction" && others.length === 0 && i.row.auctionId) onAuctionClickRef.current?.(i.row.auctionId);
      else setPopup({ rows: [i, ...others].map((x) => x.row) });
    };
    // 구역 근처(경계 밖)는 진한 회색, 구역 밖(전체 보기)은 옅은 회색으로 구분한다.
    const colorsOf = (i: Item): readonly [string, string, number] =>
      i.tone === "near" ? ["#6b7280", "#fff", 25] : i.tone === "out" ? ["#cbd5e1", "#334155", 5] : i.sold ? ["#b91c1c", "#fff", 30] : COLORS[i.kind];
    const shown: Array<{ setMap: (m: KakaoMap | null) => void }> = [];
    type Projection = { containerPointFromCoords: (c: unknown) => { x: number; y: number } };
    const PRIORITY = { auction: 0, ask: 1, trade: 2 } as const;

    // 라벨끼리 겹치면 우선순위(선택 경매 > 경매 > 매물 > 실거래)가 높은 것만 남기고, 가려진 것은 "+N"으로 세어
    // 라벨에 붙인다(마우스를 올리면 가려진 가격 목록). 지도를 확대하면 풀린다.
    function sync() {
      shown.forEach((o) => o.setMap(null));
      shown.length = 0;
      const bd = (map as unknown as { getBounds: () => Bounds }).getBounds();
      const sw = bd.getSouthWest();
      const ne = bd.getNorthEast();
      const padLat = (ne.getLat() - sw.getLat()) * 0.15;
      const padLng = (ne.getLng() - sw.getLng()) * 0.15;
      const c = map.getCenter();
      const proj = (map as unknown as { getProjection: () => Projection }).getProjection();
      // 확대 단계별 표시(재개발닷컴: 네이버 줌 16 이상 점, 17 이상 가격 라벨 ≈ 카카오 레벨 4 점·3 이하 라벨). 경매는 핵심 물건이라 한 단계 더 멀리서도 보인다.
      const level = map.getLevel();
      const LOD = { auction: { pill: 4, dot: 6 }, ask: { pill: 3, dot: 4 }, trade: { pill: 3, dot: 4 } } as const;
      const visible: Item[] = [];
      const dots: Item[] = [];
      for (const kind of ["auction", "ask", "trade"] as const) {
        if (level > LOD[kind].dot) continue;
        const target = level <= LOD[kind].pill ? visible : dots;
        merged
          .filter((i) => i.kind === kind && i.lat >= sw.getLat() - padLat && i.lat <= ne.getLat() + padLat && i.lng >= sw.getLng() - padLng && i.lng <= ne.getLng() + padLng)
          .map((i) => ({ i, d: (i.lat - c.getLat()) ** 2 + (i.lng - c.getLng()) ** 2 }))
          .sort((x, y) => x.d - y.d)
          .slice(0, MAX_PER_KIND)
          .forEach(({ i }) => target.push(i));
      }
      for (const i of dots) {
        const dot = document.createElement("div");
        dot.style.cssText = `width:${i.selected ? 18 : 10}px;height:${i.selected ? 18 : 10}px;border-radius:50%;background:${i.selected ? "#f97316" : colorsOf(i)[0]};border:${i.selected ? "3px solid #fff" : "2px solid #fff"};box-shadow:${i.selected ? "0 0 0 3px #f97316,0 0 14px 5px rgba(249,115,22,.8)" : "0 0 2px rgba(0,0,0,.5)"};cursor:pointer`;
        dot.addEventListener("click", clickFor(i, moreByKey.get(i.key) ?? []));
        const ov = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(i.lat, i.lng), content: dot, xAnchor: 0.5, yAnchor: 0.5, zIndex: colorsOf(i)[2] });
        ov.setMap(map);
        shown.push(ov);
      }
      visible.sort((x, y) => Number(y.selected) - Number(x.selected) || PRIORITY[x.kind] - PRIORITY[y.kind]);

      type Placed = { i: Item; x0: number; x1: number; y0: number; y1: number; hidden: Item[] };
      const placed: Placed[] = [];
      for (const i of visible) {
        const pt = proj.containerPointFromCoords(new kakao.maps.LatLng(i.lat, i.lng));
        const w = Math.max(46, i.text.length * 8 + 16);
        const h = 40;
        const r: Placed = { i, x0: pt.x - w / 2, x1: pt.x + w / 2, y0: pt.y - h, y1: pt.y, hidden: [] };
        const hit = placed.find((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
        if (hit) hit.hidden.push(i);
        else placed.push(r);
      }

      for (const { i, hidden } of placed) {
        const [bg, fg, z] = colorsOf(i);
        // 위: 흰 배경 종류(경매/실거래/호가), 아래: 종류 색 배경에 흰 글씨 금액, 경매는 우측 하단에 유찰률 뱃지.
        const box = document.createElement("div");
        box.style.cssText = `position:relative;cursor:pointer;${i.tone === "near" && !i.selected ? "outline:2px dashed #6b7280;outline-offset:2px;border-radius:5px;" : ""}text-align:center;font-family:sans-serif;white-space:nowrap;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4));${i.selected ? "outline:4px solid #f97316;outline-offset:4px;border-radius:5px;box-shadow:0 0 0 7px rgba(255,255,255,.95),0 0 16px 7px rgba(249,115,22,.8);" : ""}`;
        const top = document.createElement("div");
        top.style.cssText = "background:#fff;color:#111;border:1px solid #cbd5e1;border-bottom:0;border-radius:4px 4px 0 0;padding:1px 8px;font-size:11px;font-weight:700;line-height:1.3";
        top.textContent = hidden.length ? `${i.top} +${hidden.length}` : i.top;
        const moreItems = moreByKey.get(i.key) ?? [];
        const others = [...moreItems, ...hidden];
        const price = document.createElement("div");
        price.style.cssText = `background:${bg};color:${fg};border-radius:0 0 4px 4px;padding:2px 8px;font-size:12px;font-weight:700;line-height:1.3`;
        price.textContent = i.text;
        const tail = document.createElement("div");
        tail.style.cssText = `position:absolute;left:50%;bottom:-5px;margin-left:-5px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid ${bg}`;
        box.append(top, price, tail);
        if (i.badge) {
          const badge = document.createElement("div");
          badge.style.cssText = "position:absolute;left:calc(100% + 4px);bottom:2px;background:#fff;color:#ea580c;border:1.5px solid #ea580c;border-radius:10px;padding:0 6px;font-size:10px;font-weight:700;line-height:1.5;white-space:nowrap";
          badge.textContent = i.badge;
          box.append(badge);
        }
        if (moreItems.length) top.textContent = `${i.top} 외 ${moreItems.length}`;
        if (others.length) box.title = [`같은 위치·겹침 ${others.length}건 — 눌러서 목록 보기`, ...others.map((x) => `${x.top} ${x.text}`)].join("\n");
        box.addEventListener("click", clickFor(i, others));
        const overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(i.lat, i.lng),
          content: box,
          xAnchor: 0.5,
          yAnchor: 1,
          zIndex: i.selected ? 40 : z,
        });
        overlay.setMap(map);
        shown.push(overlay);
      }
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onIdle = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(sync, 120);
    };
    kakao.maps.event.addListener(map, "idle", onIdle);
    sync();
    // 사건번호 검색으로 지도에 온 물건은 사용자가 다시 누르지 않아도 위치 팝업을 연다.
    // 경매 레이어가 꺼져 있거나 진행/낙찰 필터에 가려진 경우에는 먼저 보이게 되돌린다.
    if (focusAuction && autoPopupNonceRef.current !== focusAuction.nonce) {
      if (!showAuctions || auctionScope !== "all") {
        setShowAuctions(true);
        setAuctionScope("all");
      } else {
        const focused = items.find((item) => item.kind === "auction" && item.row.auctionId === focusAuction.id);
        if (focused) {
          autoPopupNonceRef.current = focusAuction.nonce;
          setPopup({ rows: [focused.row] });
        }
      }
    }
    return () => {
      if (timer) clearTimeout(timer);
      kakao.maps.event.removeListener(map, "idle", onIdle);
      shown.forEach((o) => o.setMap(null));
    };
  }, [ready, auctions, researchPoints, toleranceM, showAuctions, auctionScope, showAsks, showTrades, selectedAuctionId, focusAuction?.id, focusAuction?.nonce]);

  // 목록에서 주소를 누르면 그 물건 위치로 지도를 옮기고(확대) 라벨을 강조한다.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.kakao || !focusAuction) return;
    const map = mapRef.current;
    (map as unknown as { setLevel: (l: number) => void }).setLevel(2);
    map.setCenter(new window.kakao.maps.LatLng(focusAuction.lat, focusAuction.lng));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusAuction?.nonce]);

  // zones는 필터로 자주 바뀌므로 effect 의존성에서 빼고 ref로만 읽는다 — 필터를 바꿔도 지도 위치·확대가 변하지 않게(선택한 구역이 바뀔 때만 이동).
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  // 목록에서 구역을 고르면 지도를 그 구역으로 이동시킨다 — 154개 중에서
  // 해당 구역을 손으로 찾아 헤매지 않도록(사용자 요청, 2026-08-06).
  useEffect(() => {
    if (!ready || !mapRef.current || !window.kakao || !selectedZoneId) return;
    const zone = zonesRef.current.find((z) => z.id === selectedZoneId);
    if (!zone || zone.polygon.length < 3) return;
    const kakao = window.kakao;
    const bounds = new kakao.maps.LatLngBounds();
    // 구역만 꽉 채우면 주변이 안 보여 위치 판단이 어려우니 여유를 둔다.
    const lats = zone.polygon.map((p) => p.lat);
    const lngs = zone.polygon.map((p) => p.lng);
    const padLat = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.6, 0.0012);
    const padLng = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 0.6, 0.0015);
    bounds.extend(new kakao.maps.LatLng(Math.min(...lats) - padLat, Math.min(...lngs) - padLng));
    bounds.extend(new kakao.maps.LatLng(Math.max(...lats) + padLat, Math.max(...lngs) + padLng));
    mapRef.current.setBounds(bounds);
  }, [ready, selectedZoneId, zoneFocusNonce]);

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
    <div className={fillHeight ? "relative h-full flex flex-col" : "space-y-2"}>
      <div className={fillHeight ? "relative flex-1 min-h-0" : "relative"}>
        <div
          ref={containerRef}
          className={fillHeight ? "w-full h-full" : "w-full rounded-sm border border-border"}
          style={fillHeight ? undefined : { height: 600 }}
        />
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-sm border border-border bg-card/95 px-3 py-1.5 text-xs shadow">
          <span className="font-semibold text-foreground">서울 행정구역</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={showGu} onChange={(e) => setShowGu(e.target.checked)} /> 구 경계
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={showDong} onChange={(e) => setShowDong(e.target.checked)} /> 동 경계
          </label>
        </div>
        {popup && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => setPopup(null)}>
            <div className="flex max-h-[80%] w-[min(560px,100%)] flex-col rounded-lg border border-border bg-card shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-sm font-bold text-foreground">이 위치 {popup.rows.length}건</span>
                <button type="button" onClick={() => setPopup(null)} className="text-xs text-muted-foreground hover:text-foreground">
                  닫기 ✕
                </button>
              </div>
              <ul className="divide-y divide-border overflow-y-auto">
                {popup.rows.map((r, idx) => (
                  <li key={idx} className="px-4 py-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: KIND_BG[r.kind] }}>
                        {KIND_LABEL[r.kind]}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{r.title}</span>
                    </div>
                    {r.facts && (
                      <div className="mt-2 grid grid-cols-4 gap-1.5">
                        {r.facts.map((f) => (
                          <div key={f.label} className={`rounded border px-2 py-1.5 text-center ${f.strong ? "border-blue-300 bg-blue-50" : "border-border bg-muted/40"}`}>
                            <div className="text-[10px] text-muted-foreground">{f.label}</div>
                            <div className={`mt-0.5 text-sm font-bold ${f.strong ? "text-blue-700" : "text-foreground"}`}>{f.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.lines.map((l, j) => (
                      <p key={j} className="mt-1 text-muted-foreground">
                        {l}
                      </p>
                    ))}
                    <div className="mt-1.5 flex gap-3">
                      {r.auctionId && (
                        <button
                          type="button"
                          className="font-semibold text-blue-600 hover:underline"
                          onClick={() => {
                            onAuctionClickRef.current?.(r.auctionId as string);
                            setPopup(null);
                          }}
                        >
                          경매 상세 열기
                        </button>
                      )}
                      {r.href && (
                        <a href={r.href} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline">
                          {r.kind === "ask" ? "네이버 매물 열기" : "국토부 실거래 열기"}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {/* 브라우저 축소 비율에서도 좌측 레이어 버튼과 닿지 않도록 넉넉한 간격을 둔다. */}
        {toolbar && <div className="absolute left-[190px] top-3 z-20">{toolbar}</div>}
        <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5">
          {(
            [
              ["실거래", showTrades, setShowTrades, "#facc15", "#111"],
              ["매물", showAsks, setShowAsks, "#16a34a", "#fff"],
              ["경공매", showAuctions, setShowAuctions, "#1f2937", "#fff"],
              ["근처", showNear, (v: boolean) => onShowNearChange?.(v), "#6b7280", "#fff"],
              ["구경계", showGu, setShowGu, "#1d4ed8", "#fff"],
            ] as const
          ).map(([label, on, set, bg, fg]) => (
            <button
              key={label}
              type="button"
              onClick={() => set(!on)}
              aria-pressed={on}
              className="rounded-md px-3 py-2 text-sm font-bold shadow border border-black/10"
              style={on ? { background: bg, color: fg } : { background: "#fff", color: "#6b7280" }}
            >
              {label}
            </button>
          ))}
          {showAuctions && (
            <div className="flex overflow-hidden rounded-md border border-black/10 shadow text-xs font-bold" role="group" aria-label="경매물건 범위">
              {(
                [
                  ["all", "전체"],
                  ["active", "진행"],
                  ["sold", "낙찰"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAuctionScope(value)}
                  aria-pressed={auctionScope === value}
                  className="flex-1 px-2 py-1.5"
                  style={auctionScope === value ? { background: value === "sold" ? "#b91c1c" : "#1f2937", color: "#fff" } : { background: "#fff", color: "#6b7280" }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
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
      <p
        className={
          fillHeight
            ? "absolute top-3 right-14 z-10 rounded-sm border border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow"
            : "text-xs text-muted-foreground"
        }
      >
        {ZONE_TYPE_LEGEND.map((s) => (
          <span key={s.label} className="mr-2" style={{ color: s.color }}>
            ■ {s.label}
          </span>
        ))}
        <span className="text-muted-foreground">(점선 = 추진중 단계)</span>
      </p>
    </div>
  );
}
