/** 카카오맵 JS SDK 공유 로더 + 타입 선언. `ResaleMatchMapView.tsx`(매도분석
 * 지도)와 `RedevelopmentMapView.tsx`(재개발 구역도)가 함께 쓴다 —
 * 로더를 두 번 만들면 스크립트 태그가 중복 삽입될 수 있어 모듈
 * 스코프의 `loadPromise` 캐시를 공유해야 한다(2026-08-04). */

export type KakaoLatLng = unknown;

export type KakaoMouseEvent = { latLng: { getLat: () => number; getLng: () => number } };

export type KakaoMap = {
  setBounds: (bounds: unknown) => void;
  setCenter: (latlng: unknown) => void;
  getCenter: () => { getLat: () => number; getLng: () => number };
};
export type KakaoMarker = {
  setMap: (map: KakaoMap | null) => void;
  setPosition: (latlng: unknown) => void;
  getPosition: () => { getLat: () => number; getLng: () => number };
};
export type KakaoInfoWindow = {
  open: (map: KakaoMap, marker?: KakaoMarker) => void;
  close: () => void;
  setPosition: (latlng: unknown) => void;
};
export type KakaoPolygon = {
  setMap: (map: KakaoMap | null) => void;
  setPath: (path: unknown[]) => void;
  getPath: () => unknown[];
};
export type KakaoPolyline = {
  setMap: (map: KakaoMap | null) => void;
  setPath: (path: unknown[]) => void;
};
export type KakaoCustomOverlay = {
  setMap: (map: KakaoMap | null) => void;
  setPosition: (latlng: unknown) => void;
};

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (cb: () => void) => void;
        LatLng: new (lat: number, lng: number) => KakaoLatLng;
        LatLngBounds: new () => { extend: (latlng: KakaoLatLng) => void };
        Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap;
        Marker: new (options: { position: KakaoLatLng; image?: unknown; draggable?: boolean }) => KakaoMarker;
        MarkerImage: new (src: string, size: unknown, options?: unknown) => unknown;
        Size: new (width: number, height: number) => unknown;
        Point: new (x: number, y: number) => unknown;
        InfoWindow: new (options: { content: string; removable?: boolean; position?: KakaoLatLng }) => KakaoInfoWindow;
        Polygon: new (options: {
          path: KakaoLatLng[];
          strokeWeight?: number;
          strokeColor?: string;
          strokeOpacity?: number;
          fillColor?: string;
          fillOpacity?: number;
        }) => KakaoPolygon;
        Polyline: new (options: {
          path: KakaoLatLng[];
          strokeWeight?: number;
          strokeColor?: string;
          strokeOpacity?: number;
          strokeStyle?: string;
        }) => KakaoPolyline;
        CustomOverlay: new (options: {
          position: KakaoLatLng;
          content: string;
          yAnchor?: number;
        }) => KakaoCustomOverlay;
        event: {
          addListener: (target: unknown, type: string, handler: (...args: unknown[]) => void) => void;
          removeListener: (target: unknown, type: string, handler: (...args: unknown[]) => void) => void;
        };
      };
    };
  }
}

const KAKAO_SDK_SRC = "https://dapi.kakao.com/v2/maps/sdk.js";
let loadPromise: Promise<void> | null = null;

export function loadKakaoMaps(appKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.kakao?.maps?.Map) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${KAKAO_SDK_SRC}?appkey=${appKey}&autoload=false&libraries=clusterer`;
    script.async = true;
    script.onload = () => {
      window.kakao!.maps.load(() => resolve());
    };
    script.onerror = () => reject(new Error("카카오맵 SDK 로드에 실패했습니다."));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function formatWon(value: number | string | null): string {
  if (value == null) return "-";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "-";
  if (num >= 100000000) return `${(num / 100000000).toFixed(2)}억`;
  if (num >= 10000) return `${(num / 10000).toFixed(0)}만`;
  return num.toLocaleString("ko-KR");
}
