"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RedevelopmentPoint } from "@/lib/api";
import {
  loadKakaoMaps,
  type KakaoCustomOverlay,
  type KakaoMap,
  type KakaoMarker,
  type KakaoMouseEvent,
  type KakaoPolygon,
} from "@/lib/kakao-maps";
import {
  solveAffineFrom3Points,
  solveSimilarityFrom2Points,
  type GeoPoint,
  type PixelPoint,
} from "@/lib/affine-transform";
import {
  solveFrom1PointWithScale,
} from "@/lib/affine-transform";
import { polygonAreaPx, traceRedBoundary } from "@/lib/boundary-trace";

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

/** 위경도 점이 폴리곤 내부인지(ray casting). 지도에서 구역을 잡아끌 때
 * "구역 안쪽을 눌렀는지" 판정하는 데 쓴다. */
function pointInPolygon(pt: GeoPoint, poly: GeoPoint[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng;
    const yi = poly[i].lat;
    const xj = poly[j].lng;
    const yj = poly[j].lat;
    const intersects =
      yi > pt.lat !== yj > pt.lat && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
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
  existingPolygon = null,
  existingIsRefined = false,
  zoneName = null,
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
  /** 이 구역에 현재 저장돼 있는 경계 — 오른쪽 지도에 회색으로 함께 그려
   * 새로 잡은 경계와 비교할 수 있게 한다(사용자 요청, 2026-08-06:
   * "지도내 설정된 구역에 대한 이미지가 아예 안나와"). */
  existingPolygon?: RedevelopmentPoint[] | null;
  /** 저장된 경계가 이미 손본 결과(MANUAL/IMAGE_AUTO)인지. 그렇다면 이미지에서
   * 다시 추출하지 않고 그 경계를 그대로 불러와 이어서 고친다(사용자 요청,
   * 2026-08-06: "한번 구역수정이 되면 다시 수정을 누르면 수정된 구역이
   * 나와야 하는데 초기 이미지 구역으로 나온다"). 원 근사(CONVEX_HULL_APPROX
   * 등)는 고칠 만한 모양이 아니므로 기존대로 이미지 추출에서 시작한다. */
  existingIsRefined?: boolean;
  /** 지금 어느 구역을 고치는 중인지 제목에 표시한다. */
  zoneName?: string | null;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl ?? null);
  const [calibrationPairs, setCalibrationPairs] = useState<CalibrationPair[]>([]);
  const [pendingImgPoint, setPendingImgPoint] = useState<PixelPoint | null>(null);
  const [tracePoints, setTracePoints] = useState<PixelPoint[]>([]);
  /** 꼭짓점별 손보정 값 — 변환식이 만들어낸 위치에서 얼마나 옮겼는지를
   * 위경도 차이로 들고 있는다. 절대좌표가 아니라 "차이"로 저장해야 구역
   * 전체를 드래그하거나 기준점을 다시 잡아도 손본 모양이 따라온다
   * (사용자 요청, 2026-08-06: "모양이 잘 안맞을때 꼭짓점을 끌어서 수정"). */
  const [vertexOffsets, setVertexOffsets] = useState<Record<number, { dLat: number; dLng: number }>>(
    {},
  );
  /** 저장돼 있던 경계를 그대로 이어서 고치는 모드의 기준 모양. 이 값이
   * 있으면 이미지 추출 결과 대신 이 모양을 편집한다. 새로 자동 추출을
   * 돌리면 null로 바뀌어 이미지 기준으로 돌아간다. */
  const [savedBase, setSavedBase] = useState<GeoPoint[] | null>(
    existingIsRefined && existingPolygon && existingPolygon.length >= 3 ? existingPolygon : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [autoTracing, setAutoTracing] = useState(false);
  const [autoTraceNote, setAutoTraceNote] = useState<string | null>(null);
  const [cadastralOn, setCadastralOn] = useState(false);
  /** 이미지가 준비되면 경계 추출을 한 번 자동으로 돌린다(구역 수정 화면을
   * 열자마자 바로 결과가 보이도록). 사용자가 "경계 지우기"로 지운 뒤에는
   * 다시 자동 실행하지 않는다. */
  const autoRanRef = useRef(false);
  /** 화면 표시 좌표 기준 픽셀당 미터. 경계 자동 추출 + 고시 면적이 있으면
   * 축척이 결정돼, 기준점을 1개만 찍어도 변환식이 완성된다. */
  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null);
  /** 지도에서 클릭한 "구역 중심" 위치. 축척을 알고 있으면 이 한 점만으로
   * 구역을 지도에 얹을 수 있어, 양쪽에서 같은 지형지물을 찾아 짝지을
   * 필요가 없다(사용자 피드백, 2026-08-05: 랜드마크 대조가 어렵다). */
  const [centerGeo, setCenterGeo] = useState<GeoPoint | null>(() => {
    // 저장된 경계를 이어서 고치는 모드는 시작부터 그 경계의 중심을 잡아둔다
    // (드래그·방향키 이동이 곧바로 되게).
    if (!existingIsRefined || !existingPolygon || existingPolygon.length < 3) return null;
    const n = existingPolygon.length;
    return {
      lat: existingPolygon.reduce((a, g) => a + g.lat, 0) / n,
      lng: existingPolygon.reduce((a, g) => a + g.lng, 0) / n,
    };
  });
  /** 자동 추출로 알아낸 구역의 실제 크기(m) — 지도 배율을 이미지에 맞출 때 쓴다. */
  const zoneExtentRef = useRef<{ widthM: number; heightM: number } | null>(null);

  const imgContainerRef = useRef<HTMLDivElement>(null);
  const imgElRef = useRef<HTMLImageElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const calibMarkersRef = useRef<KakaoMarker[]>([]);
  const tracePolygonRef = useRef<KakaoPolygon | null>(null);
  const existingPolygonRef = useRef<KakaoPolygon | null>(null);
  /** 폴리곤 드래그 중일 때 "잡은 지점 → 구역 중심" 오프셋(도 단위).
   * null이면 드래그 중이 아니다. */
  const dragOffsetRef = useRef<{ lat: number; lng: number } | null>(null);
  /** 드래그 직후 카카오가 흘리는 click 이벤트로 구역이 한 번 더 튀지
   * 않게 막는 플래그. */
  const justDraggedRef = useRef(false);
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

  const polygonCentroid = useMemo<PixelPoint | null>(() => {
    if (tracePoints.length < 3) return null;
    const n = tracePoints.length;
    return {
      x: tracePoints.reduce((a, p) => a + p.x, 0) / n,
      y: tracePoints.reduce((a, p) => a + p.y, 0) / n,
    };
  }, [tracePoints]);

  /** 지도에 그려진 구역의 실제 위경도 꼭짓점 — 드래그 시작 시 "폴리곤
   * 안쪽을 눌렀는지" 판정하는 데 쓴다. */
  const geoPolygonRef = useRef<GeoPoint[]>([]);
  /** 꼭짓점 드래그 중인 인덱스(없으면 null)와 잡은 지점과의 간격. */
  const vertexDragRef = useRef<{ index: number; dLat: number; dLng: number } | null>(null);
  const vertexOverlaysRef = useRef<KakaoCustomOverlay[]>([]);
  /** 드래그 핸들러는 지도 준비 시점에 한 번만 붙으므로, 클로저가 낡지 않게
   * 최신 값을 ref로 따로 들고 본다. */
  const centerGeoRef = useRef<GeoPoint | null>(null);
  const canRepositionRef = useRef(false);
  const transformRef = useRef<((p: PixelPoint) => GeoPoint) | null>(null);
  const tracePointsRef = useRef<PixelPoint[]>([]);

  /** 지도 클릭만으로 위치를 잡는 모드인지(축척을 알고 경계도 있을 때). */
  const placeMode = Boolean(metersPerPixel && polygonCentroid && calibrationPairs.length === 0);
  /** 지도 위 구역을 드래그·방향키로 옮길 수 있는 상태인지 — 위치가
   * centerGeo 한 점으로 결정될 때만 가능하다(기준점을 찍어 맞춘 경우엔
   * 그 짝이 위치를 결정하므로 임의로 밀면 안 된다). */
  const canReposition = Boolean(savedBase || (placeMode && centerGeo));

  // 축척을 알면 1점(이동만) → 2점(회전까지 실측) → 3점(어파인)으로
  // 찍을수록 정밀해지는 구조. 축척을 모르면 최소 2점이 필요하다.
  const requiredPoints = metersPerPixel ? 1 : 2;
  const calibrationDone =
    Boolean(savedBase) || calibrationPairs.length >= requiredPoints || (placeMode && centerGeo != null);
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
    if (calibrationPairs.length === 1 && metersPerPixel) {
      return solveFrom1PointWithScale(
        calibrationPairs[0].img,
        calibrationPairs[0].geo,
        metersPerPixel,
      );
    }
    // 지형지물을 못 찾겠으면 지도에서 구역 중심만 찍어도 된다.
    if (centerGeo && polygonCentroid && metersPerPixel) {
      return solveFrom1PointWithScale(polygonCentroid, centerGeo, metersPerPixel);
    }
    return null;
  }, [calibrationPairs, metersPerPixel, centerGeo, polygonCentroid]);

  /** 지도에 실제로 그려질 구역 꼭짓점(위경도) — 변환식 결과에 꼭짓점별
   * 손보정을 더한 값. 미리보기·꼭짓점 핸들·최종 저장이 모두 이 값을 쓴다. */
  const geoPolygon = useMemo<GeoPoint[]>(() => {
    if (savedBase) {
      // 저장된 경계를 이어서 고치는 모드 — 구역 전체 이동은 중심 이동량으로,
      // 모양 수정은 꼭짓점별 차이로 얹는다(이미지 모드와 같은 규칙).
      const n = savedBase.length;
      const c0 = {
        lat: savedBase.reduce((a, g) => a + g.lat, 0) / n,
        lng: savedBase.reduce((a, g) => a + g.lng, 0) / n,
      };
      const dLat = (centerGeo?.lat ?? c0.lat) - c0.lat;
      const dLng = (centerGeo?.lng ?? c0.lng) - c0.lng;
      return savedBase.map((g, i) => {
        const off = vertexOffsets[i];
        return {
          lat: g.lat + dLat + (off?.dLat ?? 0),
          lng: g.lng + dLng + (off?.dLng ?? 0),
        };
      });
    }
    if (!transformFn) return [];
    return tracePoints.map((p, i) => {
      const base = transformFn(p);
      const off = vertexOffsets[i];
      return off ? { lat: base.lat + off.dLat, lng: base.lng + off.dLng } : base;
    });
  }, [savedBase, centerGeo, transformFn, tracePoints, vertexOffsets]);

  const hasVertexEdits = Object.keys(vertexOffsets).length > 0;

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

  // 현재 저장된 경계를 회색 점선으로 깔아둔다 — 새로 잡는 경계가 기존
  // 대비 어디로 얼마나 움직이는지 눈으로 바로 비교할 수 있다.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !window.kakao) return;
    existingPolygonRef.current?.setMap(null);
    existingPolygonRef.current = null;
    if (!existingPolygon || existingPolygon.length < 3) return;
    const kakao = window.kakao;
    const poly = new kakao.maps.Polygon({
      path: existingPolygon.map((p) => new kakao.maps.LatLng(p.lat, p.lng)),
      strokeWeight: 2,
      strokeColor: "#64748b",
      strokeOpacity: 0.9,
      strokeStyle: "dash",
      fillColor: "#64748b",
      fillOpacity: 0.12,
    });
    poly.setMap(map);
    existingPolygonRef.current = poly;
    return () => {
      poly.setMap(null);
    };
  }, [mapReady, existingPolygon]);

  // 카카오맵 USE_DISTRICT 오버레이. 이름은 "지적편집도"지만 실제로 그려지는
  // 건 필지 경계가 아니라 용도지역(주거/녹지 등) 색면이라, 필지 모양 대조에는
  // 도움이 안 되고 지도만 가린다(실측, 2026-08-05). 기본은 꺼두고 필요할 때만
  // 켜도록 남겨둔다.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !window.kakao) return;
    const id = window.kakao.maps.MapTypeId.USE_DISTRICT;
    if (cadastralOn) map.addOverlayMapTypeId(id);
    else map.removeOverlayMapTypeId(id);
  }, [cadastralOn, mapReady]);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result as string);
      setCalibrationPairs([]);
      setPendingImgPoint(null);
      setTracePoints([]);
      setVertexOffsets({});
      setSavedBase(null);
      calibMarkersRef.current.forEach((m) => m.setMap(null));
      calibMarkersRef.current = [];
      tracePolygonRef.current?.setMap(null);
      tracePolygonRef.current = null;
      setAutoTraceNote(null);
      setMetersPerPixel(null);
      setCenterGeo(null);
      autoRanRef.current = false;
    };
    reader.readAsDataURL(file);
  }

  /** 지도에 보이는 범위를 구역 크기의 약 2배로 맞춘다 — 왼쪽 구역도
   * 이미지와 축척이 비슷해져 같은 지점을 훨씬 찾기 쉬워진다. */
  function fitMapToZone(widthM: number, heightM: number) {
    const map = mapRef.current;
    if (!map || !initialCenter || !window.kakao) return;
    const kakao = window.kakao;
    const halfLatM = (Math.max(heightM, 80) * 1.1) / 2;
    const halfLngM = (Math.max(widthM, 80) * 1.1) / 2;
    const dLat = halfLatM / 110_540;
    const dLng = halfLngM / (111_320 * Math.cos((initialCenter.lat * Math.PI) / 180));
    const bounds = new kakao.maps.LatLngBounds();
    bounds.extend(new kakao.maps.LatLng(initialCenter.lat - dLat, initialCenter.lng - dLng));
    bounds.extend(new kakao.maps.LatLng(initialCenter.lat + dLat, initialCenter.lng + dLng));
    map.setBounds(bounds);
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
        throw new Error(
          "닫힌 빨간 경계선을 찾지 못했습니다(경계가 흐리거나 색이 옅은 도면일 수 있습니다). " +
            "아래 이미지에서 경계 꼭짓점을 직접 클릭해 그려 주세요.",
        );
      }

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const s = Math.min(cw / nw, ch / nh);
      const ox = (cw - nw * s) / 2;
      const oy = (ch - nh * s) / 2;
      const shown = result.polygon.map((p) => ({ x: p.x * s + ox, y: p.y * s + oy }));
      setTracePoints(shown);
      setVertexOffsets({});
      setSavedBase(null);

      // 축척은 반드시 "화면 표시 좌표" 기준으로 계산해야 한다 — 기준점
      // 클릭도 같은 좌표계로 들어오기 때문이다(원본 픽셀 기준으로 계산하면
      // object-contain 축소 비율만큼 어긋난다).
      if (areaSqMeters && areaSqMeters > 0) {
        const shownAreaPx = polygonAreaPx(shown);
        const mpp = shownAreaPx > 0 ? Math.sqrt(areaSqMeters / shownAreaPx) : null;
        setMetersPerPixel(mpp);
        // 축척을 알면 남은 미지수는 위치뿐이고, 지오코딩된 구역 대표
        // 지번 좌표가 그 후보다. 일단 그 위치에 얹어두면 관리자는 확인만
        // 하면 되고, 어긋나면 지도를 클릭해 옮기면 된다(사용자 질문,
        // 2026-08-05: "이정도면 너가 할 수 있겠는데??").
        if (mpp && initialCenter && calibrationPairs.length === 0) setCenterGeo(initialCenter);
      } else {
        setMetersPerPixel(null);
      }

      // 고시 면적을 알면 픽셀당 미터를 역산할 수 있어, 구역의 실제 크기를
      // 계산해 지도 배율을 이미지와 비슷하게 맞춰줄 수 있다(사용자 피드백,
      // 2026-08-05: "배율이 달라서 어렵네" — 좌우 축척이 크게 다르면 같은
      // 지점을 찾기가 어렵다).
      let sizeNote = "";
      if (areaSqMeters && areaSqMeters > 0 && result.areaPx > 0) {
        const mPerPx = Math.sqrt(areaSqMeters / result.areaPx);
        const xs = result.polygon.map((p) => p.x);
        const ys = result.polygon.map((p) => p.y);
        const widthM = (Math.max(...xs) - Math.min(...xs)) * mPerPx;
        const heightM = (Math.max(...ys) - Math.min(...ys)) * mPerPx;
        zoneExtentRef.current = { widthM, heightM };
        fitMapToZone(widthM, heightM);
        sizeNote = ` · 구역 약 ${Math.round(widthM)}m × ${Math.round(heightM)}m`;
      } else {
        // 고시 면적이 없으면 실제 크기를 알 수 없다. 재개발 구역은 보통
        // 100~400m 규모라 기본값으로라도 맞춰주는 편이 낫다.
        fitMapToZone(300, 300);
        sizeNote = " · 면적 정보가 없어 지도 배율은 기본값으로 맞춤";
      }
      const ratioPct = Math.round(result.areaRatio * 100);
      setAutoTraceNote(
        `경계 자동 추출 완료 — 꼭짓점 ${result.polygon.length}개 · 이미지의 ${ratioPct}%${sizeNote}`,
      );
      // 도면에 구역이 여러 개 그려져 있거나 경계가 옅으면 일부만 잡힐 수
      // 있다(실측: 응암7·8·9구역이 한 장에 있는 도면은 한 구역만 잡힘).
      // 사람이 보면 바로 아는 문제라, 의심스러우면 확인하라고 알린다.
      if (result.areaRatio < 0.08) {
        setError(
          "추출된 구역이 이미지에서 차지하는 비율이 작습니다. 경계를 제대로 잡았는지 확인하고, " +
            "틀렸다면 “경계 지우기” 후 직접 클릭해 그려 주세요.",
        );
      }
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
      if (justDraggedRef.current) return;
      const mouseEvent = args[0] as KakaoMouseEvent;
      const geo = { lat: mouseEvent.latLng.getLat(), lng: mouseEvent.latLng.getLng() };

      // 이미지에서 찍어둔 점이 없고 축척을 안다면, 클릭한 곳을 구역 중심으로
      // 삼아 폴리곤을 바로 얹는다. 다시 클릭하면 그 위치로 옮겨진다.
      if (!pendingImgPoint) {
        if (placeMode || centerGeo) {
          setCenterGeo(geo);
          setError(null);
        }
        return;
      }
      if (calibrationPairs.length >= requiredPoints) return;
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
  }, [mapReady, pendingImgPoint, calibrationPairs.length, requiredPoints, placeMode, centerGeo]);

  // 추적(구역 그리기) 미리보기 — 지도 위에 실시간 폴리곤으로 표시
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    tracePolygonRef.current?.setMap(null);
    tracePolygonRef.current = null;
    geoPolygonRef.current = geoPolygon;
    if (geoPolygon.length < 2) return;

    const path = geoPolygon.map((g) => new kakao.maps.LatLng(g.lat, g.lng));
    tracePolygonRef.current = new kakao.maps.Polygon({
      path,
      strokeWeight: 2,
      strokeColor: "#7c3aed",
      strokeOpacity: 0.9,
      fillColor: "#7c3aed",
      fillOpacity: 0.25,
    });
    tracePolygonRef.current.setMap(map);
    // 여기서 지도를 폴리곤에 맞추면 위치를 옮길 때마다 화면이 튀어 미세
    // 조정이 어렵다. 배율은 "지도 배율 맞추기"로 따로 맞춘다.
  }, [mapReady, geoPolygon, transformFn]);

  // 꼭짓점 손잡이 — 모양이 안 맞을 때 개별 꼭짓점을 끌어 고칠 수 있게
  // 지도 위에 작은 점으로 띄운다. 손본 꼭짓점은 주황색으로 구분한다.
  //
  // 만들기와 위치 갱신을 나눈 이유: 드래그 중에는 좌표가 매 프레임 바뀌는데,
  // 그때마다 오버레이 十여 개를 다시 만들면 DOM 교체가 잦아 끊겨 보인다.
  const vertexStyleKey = `${geoPolygon.length}|${Object.keys(vertexOffsets).sort().join(",")}`;
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    vertexOverlaysRef.current.forEach((ov) => ov.setMap(null));
    vertexOverlaysRef.current = [];
    if (!canReposition || geoPolygonRef.current.length < 3) return;

    geoPolygonRef.current.forEach((g, i) => {
      const edited = vertexOffsets[i] != null;
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(g.lat, g.lng),
        content:
          `<div style="width:13px;height:13px;border-radius:50%;` +
          `background:${edited ? "#f59e0b" : "#ffffff"};` +
          `border:3px solid #6d28d9;box-sizing:border-box;` +
          `box-shadow:0 1px 3px rgba(0,0,0,.45);cursor:grab;"></div>`,
        yAnchor: 0.5,
        xAnchor: 0.5,
        zIndex: 5,
      });
      overlay.setMap(map);
      vertexOverlaysRef.current.push(overlay);
    });

    return () => {
      vertexOverlaysRef.current.forEach((ov) => ov.setMap(null));
      vertexOverlaysRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, canReposition, vertexStyleKey]);

  useEffect(() => {
    if (!window.kakao) return;
    const kakao = window.kakao;
    vertexOverlaysRef.current.forEach((ov, i) => {
      const g = geoPolygon[i];
      if (g) ov.setPosition(new kakao.maps.LatLng(g.lat, g.lng));
    });
  }, [geoPolygon]);

  useEffect(() => {
    centerGeoRef.current = centerGeo;
  }, [centerGeo]);
  useEffect(() => {
    transformRef.current = transformFn;
    tracePointsRef.current = tracePoints;
  }, [transformFn, tracePoints]);
  useEffect(() => {
    canRepositionRef.current = canReposition;
    const container = mapContainerRef.current;
    if (container) container.style.cursor = canReposition ? "move" : "";
  }, [canReposition]);

  // 구역 드래그.
  //
  // 카카오 마우스 이벤트(폴리곤 mousedown / 지도 mousemove)에 기대면 지도
  // 자체 패닝과 같은 제스처를 두고 경쟁해 동작이 불안정하다(2026-08-06
  // 사용자 리포트: 드래그가 아예 안 됨). 그래서 카카오 이벤트는 쓰지 않고
  // 지도 컨테이너의 표준 DOM 이벤트만 쓴다 — 캡처 단계에서 mousedown을
  // 먼저 가로채 구역 안쪽이면 카카오까지 내려보내지 않으므로 패닝이
  // 시작되지 않고, 이후 이동/종료는 window의 mousemove/mouseup으로 받는다.
  // 커서 픽셀 → 위경도 변환만 카카오 projection을 쓴다.
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!mapReady || !mapRef.current || !window.kakao || !container) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    const toGeo = (e: MouseEvent): GeoPoint | null => {
      const rect = container.getBoundingClientRect();
      try {
        const coords = map
          .getProjection()
          .coordsFromContainerPoint(
            new kakao.maps.Point(e.clientX - rect.left, e.clientY - rect.top),
          );
        return { lat: coords.getLat(), lng: coords.getLng() };
      } catch {
        return null;
      }
    };

    /** 커서에서 화면상 HIT_PX 안에 있는 가장 가까운 꼭짓점. */
    const hitVertex = (e: MouseEvent): number | null => {
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const HIT_PX = 11;
      let best: number | null = null;
      let bestDist = HIT_PX;
      try {
        const proj = map.getProjection();
        geoPolygonRef.current.forEach((g, i) => {
          const pt = proj.containerPointFromCoords(new kakao.maps.LatLng(g.lat, g.lng));
          const d = Math.hypot(pt.x - px, pt.y - py);
          if (d <= bestDist) {
            bestDist = d;
            best = i;
          }
        });
      } catch {
        return null;
      }
      return best;
    };

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const center = centerGeoRef.current;
      if (!canRepositionRef.current || !center) return;
      const cursor = toGeo(e);
      if (!cursor) return;

      // 꼭짓점을 잡았으면 그 점만 옮긴다(구역 전체 이동보다 우선).
      const vi = hitVertex(e);
      if (vi != null) {
        const v = geoPolygonRef.current[vi];
        vertexDragRef.current = { index: vi, dLat: v.lat - cursor.lat, dLng: v.lng - cursor.lng };
        map.setDraggable(false);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (!pointInPolygon(cursor, geoPolygonRef.current)) return;
      dragOffsetRef.current = { lat: center.lat - cursor.lat, lng: center.lng - cursor.lng };
      map.setDraggable(false);
      e.preventDefault();
      e.stopPropagation();
    };

    const onMove = (e: MouseEvent) => {
      const vertex = vertexDragRef.current;
      if (vertex) {
        const cursor = toGeo(e);
        if (!cursor) return;
        e.preventDefault();
        const target = { lat: cursor.lat + vertex.dLat, lng: cursor.lng + vertex.dLng };
        // 손보정은 "변환식 결과 대비 차이"로 저장한다 — 구역 전체를 옮기거나
        // 기준점을 다시 잡아도 손본 모양이 그대로 따라오게 하기 위함.
        const base = transformRef.current?.(tracePointsRef.current[vertex.index]);
        if (!base) return;
        setVertexOffsets((prev) => ({
          ...prev,
          [vertex.index]: { dLat: target.lat - base.lat, dLng: target.lng - base.lng },
        }));
        return;
      }

      const offset = dragOffsetRef.current;
      if (!offset) return;
      const cursor = toGeo(e);
      if (!cursor) return;
      e.preventDefault();
      setCenterGeo({ lat: cursor.lat + offset.lat, lng: cursor.lng + offset.lng });
    };

    const onUp = () => {
      if (vertexDragRef.current) {
        vertexDragRef.current = null;
        map.setDraggable(true);
        justDraggedRef.current = true;
        window.setTimeout(() => {
          justDraggedRef.current = false;
        }, 250);
        return;
      }
      if (!dragOffsetRef.current) return;
      dragOffsetRef.current = null;
      map.setDraggable(true);
      // 드래그 직후 카카오가 흘리는 click으로 구역이 한 번 더 튀지 않게.
      justDraggedRef.current = true;
      window.setTimeout(() => {
        justDraggedRef.current = false;
      }, 250);
    };

    container.addEventListener("mousedown", onDown, true);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      container.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [mapReady]);

  // 방향키 미세 조정 — 드래그로는 몇 미터 단위를 맞추기 어렵다
  // (사용자 요청, 2026-08-06). Shift를 누르면 10배로 움직인다.
  useEffect(() => {
    if (!canReposition) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      const step =
        e.key === "ArrowUp" || e.key === "ArrowDown"
          ? { lat: e.key === "ArrowUp" ? 1 : -1, lng: 0 }
          : e.key === "ArrowLeft" || e.key === "ArrowRight"
            ? { lat: 0, lng: e.key === "ArrowRight" ? 1 : -1 }
            : null;
      if (!step) return;
      e.preventDefault();
      const meters = e.shiftKey ? 10 : 1;
      setCenterGeo((prev) => {
        if (!prev) return prev;
        const mPerLng = 111_320 * Math.cos((prev.lat * Math.PI) / 180);
        return {
          lat: prev.lat + (step.lat * meters) / 110_540,
          lng: prev.lng + (step.lng * meters) / mPerLng,
        };
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canReposition]);

  function handleUndoTracePoint() {
    setTracePoints((prev) => {
      setVertexOffsets((offs) => {
        const next = { ...offs };
        delete next[prev.length - 1];
        return next;
      });
      return prev.slice(0, -1);
    });
  }

  /** 기준점만 다시 찍는다 — 자동 추출해둔 경계는 그대로 두어야
   * 추출을 다시 돌리지 않아도 된다. */
  function handleResetCalibration() {
    setCalibrationPairs([]);
    setPendingImgPoint(null);
    setCenterGeo(null);
    setError(null);
    calibMarkersRef.current.forEach((m) => m.setMap(null));
    calibMarkersRef.current = [];
  }

  function handleClearBoundary() {
    setTracePoints([]);
    setVertexOffsets({});
    setSavedBase(null);
    setAutoTraceNote(null);
    setMetersPerPixel(null);
    setCenterGeo(null);
    tracePolygonRef.current?.setMap(null);
    tracePolygonRef.current = null;
  }

  function handleComplete() {
    if (geoPolygon.length < 3) return;
    onComplete(geoPolygon);
  }

  // 보정까지 끝난 폴리곤의 실제 면적을 고시 면적과 비교해 보여준다.
  // 크게 어긋나면 기준점을 잘못 찍었거나 경계 추출이 틀린 것이다.
  const areaCheck = useMemo(() => {
    if (!transformFn || tracePoints.length < 3 || !areaSqMeters || areaSqMeters <= 0) return null;
    // 1점 모드는 축척 자체를 고시 면적에서 역산했으므로 면적 비교가 순환
    // 논리다(항상 100%가 나온다). 검증값으로 쓸 수 없어 표시하지 않는다.
    if (calibrationPairs.length < 2) return null;
    const computed = geoPolygonAreaSqm(geoPolygon);
    return { computed, ratio: computed / areaSqMeters };
  }, [transformFn, tracePoints, geoPolygon, areaSqMeters, calibrationPairs.length]);

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
        <p className="text-sm font-semibold text-foreground">
          이미지로 구역 그리기(좌표 보정 트레이싱)
          {zoneName && <span className="ml-2 text-primary">— {zoneName}</span>}
        </p>
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
              {savedBase
                ? "이미 저장된 경계를 불러왔습니다. 이미지에서 처음부터 다시 잡으려면 누르세요."
                : "이미지의 빨간 경계선을 찾아 꼭짓점을 자동으로 채웁니다."}
            </span>
            {savedBase ? (
              <span className="ml-auto text-xs font-medium text-primary">
                저장된 경계 이어서 수정 중 — 꼭짓점 {savedBase.length}개
              </span>
            ) : (
              autoTraceNote && (
                <span className="ml-auto text-xs font-medium text-emerald-600">{autoTraceNote}</span>
              )
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-card px-3 py-2">
            <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={cadastralOn}
                onChange={(e) => setCadastralOn(e.target.checked)}
              />
              용도지역도 표시
            </label>
            <span className="text-xs text-muted-foreground">
              주거/녹지 등 용도지역을 색으로 표시합니다(필지 경계는 아닙니다).
            </span>
            <button
              type="button"
              onClick={() => {
                const ext = zoneExtentRef.current;
                if (ext) fitMapToZone(ext.widthM, ext.heightM);
                else if (initialCenter) fitMapToZone(300, 300);
              }}
              className="ml-auto px-2 py-1 text-xs rounded-sm border border-border text-muted-foreground hover:text-foreground"
            >
              지도 배율 맞추기
            </button>
          </div>

          <div className="text-xs space-y-1">
            {!calibrationDone ? (
              <p className="text-foreground">
                <span className="font-semibold">
                  ② 기준점 보정 ({calibrationPairs.length}/{requiredPoints})
                </span>
                : 왼쪽 이미지에서 알아볼 수 있는 지점(건물 모서리, 도로 교차점 등)을 클릭 →
                오른쪽 실제 지도에서 같은 지점을 클릭.
                {metersPerPixel
                  ? " 축척은 고시 면적으로 이미 계산됐고 지적도는 정북 기준이라, 한 곳만 찍으면 됩니다. 지형지물을 못 찾겠으면 오른쪽 지도에서 구역이 있을 자리를 그냥 클릭하세요 — 그 자리를 중심으로 구역이 얹힙니다."
                  : " 서로 멀리 떨어진 두 곳을 찍으면 축척·회전·위치가 한 번에 결정됩니다."}
                {pendingImgPoint && (
                  <span className="ml-1 text-primary font-semibold">
                    → 이제 오른쪽 지도에서 같은 지점을 클릭하세요.
                  </span>
                )}
              </p>
            ) : (
              <p className="text-foreground">
                <span className="font-semibold">③ 확인 후 확정</span>: 오른쪽 지도에 실제 위치가
                표시됩니다(꼭짓점 {geoPolygon.length}개).
                {centerGeo && calibrationPairs.length === 0
                  ? " 구역 안쪽을 끌면 전체가 옮겨지고, 흰 점(꼭짓점)을 끌면 그 점만 움직여 모양을 다듬을 수 있습니다(손본 점은 주황색). 방향키(↑↓←→)로 1m씩(Shift 누르면 10m씩) 미세 조정하세요."
                  : " 방향이 틀어져 보이면 기준점을 한 번 더 찍으세요 — 2점이 되면 회전까지 실측으로 잡히고, 3점이면 도면 찌그러짐까지 보정됩니다."}
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
                onLoad={() => {
                  // 이미 손본 경계를 불러온 경우엔 자동 추출로 덮어쓰지 않는다.
                  if (savedBase || autoRanRef.current) return;
                  autoRanRef.current = true;
                  handleAutoTrace();
                }}
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
              disabled={geoPolygon.length === 0}
              className="px-2 py-1 text-xs rounded-sm border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              경계 지우기
            </button>
            <button
              type="button"
              onClick={() => setVertexOffsets({})}
              disabled={!hasVertexEdits}
              className="px-2 py-1 text-xs rounded-sm border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              꼭짓점 원래대로
            </button>
            <button type="button" onClick={handleResetCalibration} className="text-xs text-muted-foreground hover:underline">
              기준점 다시 찍기
            </button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={!calibrationDone || geoPolygon.length < 3}
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
