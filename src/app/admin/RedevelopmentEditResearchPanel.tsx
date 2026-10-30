"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { RedevelopmentEditSelectedAuction } from "./RedevelopmentEditSelectedAuction";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAuctionResearch,
  fetchAuctionsByIds,
  fetchListingDetailNow,
  fetchAuctionsOfficialPriceBatch,
  fetchRedevelopmentZoneAuctions,
  fetchZoneResearch,
  startZoneResearch,
  startAuctionResearch,
  type AuctionOfficialPriceBatchItem,
  type OfficialPriceEstimate,
  type RedevelopmentMapAuction,
  type ResearchListing,
  type ResearchTrade,
} from "@/lib/api";

const PARAMS_KEY = "redev-research-params";
const PYEONG = 3.3058;

type Params = { ratePct: number; groupSame: boolean; similarOnly: boolean; areaTol: number; yearTol: number; roomFilter: string; tradeLimit: number; fast: boolean };
const DEFAULT_PARAMS: Params = { ratePct: 126, groupSame: true, similarOnly: false, areaTol: 10, yearTol: 5, roomFilter: "", tradeLimit: 20, fast: true };

function loadParams(): Params {
  try {
    const raw = localStorage.getItem(PARAMS_KEY);
    return raw ? { ...DEFAULT_PARAMS, ...(JSON.parse(raw) as Partial<Params>) } : DEFAULT_PARAMS;
  } catch {
    return DEFAULT_PARAMS;
  }
}

/** 구역 목록·순차 조사에서 쓰는 "빠른 조사" 설정 — 조사 패널에서 저장한 값을 읽는다(없으면 켬). */
export function readFastResearch(): boolean {
  return loadParams().fast !== false;
}

const man = (n: number | null | undefined) => (n == null ? "" : Math.round(n).toLocaleString("ko-KR"));
/** 최저~최고 표시(둘이 같으면 한 값). */
const rng = (a: number | null | undefined, b: number | null | undefined) =>
  a == null ? "" : b != null && Math.round(b) !== Math.round(a) ? `${man(a)}~${man(b)}` : man(a);
const minMax = (xs: Array<number | null | undefined>): [number | null, number | null] => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? [Math.min(...v), Math.max(...v)] : [null, null];
};

type SaleEstimate = {
  targetJeonse: number;
  selected: Array<{ kind: "trade" | "listing"; gap: number; score: number; strict: boolean; weight: number }>;
  expected: number | null;
  averageGap: number | null;
  strict: boolean;
};

/** 현재 호가의 "호가 - 추정 전세가" 평균을 기준 물건에 적용한다. */
function estimateSaleFromListings({
  listings,
  trades,
  rate,
  official,
  area,
  year,
  rooms,
}: {
  listings: ResearchListing[];
  trades: ResearchTrade[];
  rate: number;
  official: number | null;
  area: number | null;
  year: number | null;
  rooms: number | null;
}): SaleEstimate | null {
  if (official == null) return null;
  const targetJeonse = Math.round(official * rate);
  const daysSince = (value: string) => {
    const time = new Date(value.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")).getTime();
    return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 86_400_000) : 365;
  };
  const similarity = (candidateArea: number | null, candidateYear: number | null, candidateRooms: number | null) => {
    const areaDiffPct = area && candidateArea ? Math.abs(candidateArea - area) / area : 0;
    const yearDiff = year && candidateYear ? Math.abs(candidateYear - year) : 0;
    const roomMismatch = rooms && candidateRooms ? rooms !== candidateRooms : false;
    const score = 100 - areaDiffPct * 100 - Math.min(yearDiff, 20) * 1.5 - (roomMismatch ? 15 : 0);
    return { score, strict: areaDiffPct <= 0.2 && yearDiff <= 10 && (!rooms || !candidateRooms || !roomMismatch) };
  };
  // 최근 실거래 > 최근 호가 > 오래된 실거래 순서가 되도록 시간 감쇠를 적용한다.
  // 호가는 미체결 가격이라 갭을 85%만 반영해 보수적으로 산정한다.
  const listingCandidates = listings
    .filter((l) => !l.gone && l.priceManwon != null && l.officialPrice.manwon != null)
    .map((l) => {
      const age = daysSince(l.confirmedAt ?? "");
      const recency = Math.exp(-age / 365);
      const shape = similarity(l.exclusiveArea, l.buildingYear, l.roomCount);
      return { kind: "listing" as const, gap: Math.round((l.priceManwon! - Math.round(l.officialPrice.manwon! * rate)) * 0.85), weight: 0.75 + recency * 0.35, ...shape };
    });
  const tradeCandidates = trades
    .filter((t) => !t.isCancelled && t.dealAmountManwon != null && t.officialPrice.manwon != null)
    .map((t) => {
      const age = daysSince(t.contractDate);
      const recency = Math.exp(-age / 365);
      const shape = similarity(t.exclusiveArea, t.buildYear, null);
      return { kind: "trade" as const, gap: t.dealAmountManwon - Math.round(t.officialPrice.manwon! * rate), weight: 0.35 + recency * 1.55, ...shape };
    });
  const candidates = [...tradeCandidates, ...listingCandidates];
  const strict = candidates.filter((c) => c.strict);
  const selected = (strict.length >= 3 ? strict : candidates.filter((c) => c.score >= 40))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (!selected.length) return { targetJeonse, selected: [], expected: null, averageGap: null, strict: strict.length >= 3 };
  const weightTotal = selected.reduce((sum, c) => sum + c.weight, 0);
  const averageGap = Math.round(selected.reduce((sum, c) => sum + c.gap * c.weight, 0) / weightTotal);
  return { targetJeonse, selected, expected: targetJeonse + averageGap, averageGap, strict: strict.length >= 3 };
}

const areaFromText = (value: string | null | undefined) => {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** 같은 지번 · 같은 공시가 · 전용면적 ±1㎡ 이내인 호가를 같은 호(다른 중개사가 올린 중복)로 보고 한 행으로 묶는다. */
function groupSameUnit(out: Row[]): Row[] {
  type Bucket = { key: string; official: number | null; sig: string; area: number | null; rows: Row[] };
  const buckets: Bucket[] = [];
  const bucketOf = new Map<Row, Bucket>();
  for (const r of out) {
    if (r.kind !== "호가" || !r.listing || r.gone) continue;
    const key = r.listing.jibun || r.address;
    // 공시가를 추정하지 못한 건물(신축 등)은 공시가로 같은 호를 가릴 수 없으므로, 같은 지번·같은 층·같은 방향·같은 호가·면적 ±1㎡이면 같은 호로 본다.
    // (같은 중개사가 같은 호를 매물번호만 바꿔 여러 번 올리거나, 여러 중개사가 같은 호를 올린 경우)
    const sig = r.official == null ? `${r.floor}|${r.listing.direction ?? ""}|${r.ask ?? ""}` : "";
    const b = buckets.find((x) => x.key === key && x.official === r.official && x.sig === sig && (x.area == null || r.area == null || Math.abs(x.area - r.area) <= 1));
    if (b) {
      b.rows.push(r);
      bucketOf.set(r, b);
    } else {
      const nb: Bucket = { key, official: r.official, sig, area: r.area, rows: [r] };
      buckets.push(nb);
      bucketOf.set(r, nb);
    }
  }
  const merged: Row[] = [];
  for (const r of out) {
    const b = bucketOf.get(r);
    if (!b || b.rows.length === 1) {
      merged.push(r);
      continue;
    }
    if (b.rows[0] !== r) continue; // 묶음의 첫 행 자리에 합친 행 하나만 둔다
    const [askMin, askMax] = minMax(b.rows.map((x) => x.ask));
    const [gapMin, gapMax] = minMax(b.rows.map((x) => x.askGap));
    const [wMin, wMax] = minMax(b.rows.map((x) => x.warrant));
    const [rgMin, rgMax] = minMax(b.rows.map((x) => x.realGap));
    const floors = Array.from(new Set(b.rows.map((x) => x.floor).filter(Boolean)));
    const latest = b.rows.map((x) => x.date).filter(Boolean).sort().pop() ?? "";
    merged.push({
      ...r,
      key: `g-${r.key}`,
      floor: floors.join(", "),
      date: latest,
      ask: askMin,
      askMax,
      askGap: gapMin,
      askGapMax: gapMax,
      warrant: wMin,
      warrantMax: wMax,
      realGap: rgMin,
      realGapMax: rgMax,
      group: b.rows.map((x) => x.listing as ResearchListing),
    });
  }
  return merged;
}

type Row = {
  key: string;
  kind: "경매물건" | "호가" | "실거래";
  address: string;
  auctionNo?: string;
  auctionPricePct?: number | null;
  date: string;
  floor: string;
  area: number | null;
  /** 대지지분(㎡): 경매물건=경매코치 값, 실거래=국토부 대지권면적, 호가=같은 지번 실거래 비율로 추정(landEst) */
  land: number | null;
  landEst?: boolean;
  landBasis?: "trade" | "ledger" | null;
  year: number | null;
  rooms: number | null;
  official: number | null;
  officialBasis: string;
  jeonse: number | null;
  ask: number | null;
  askGap: number | null;
  /** 현재 전세 보증금(만원, 네이버 상세) / 실제 갭 = 호가 − 현전세 */
  warrant: number | null;
  realGap: number | null;
  typeName: string | null;
  sold: number | null;
  soldGap: number | null;
  cancelled: boolean;
  /** 호가 매물이 목록에서 사라짐(마지막 확인일은 lastSeen). */
  gone?: boolean;
  lastSeen?: string;
  /** 경매물건 중 낙찰가가 있는 것(낙찰) — 분류 뱃지를 "낙찰"로 표시한다. */
  soldAuction?: boolean;
  /** 같은 구역 현재 호가를 반영해 역산한 예상 매도가(낙찰 경매 비교용). */
  expectedSale?: number | null;
  /** 주소를 누르면 열 상세 페이지(네이버 매물 / 같은 지번 네이버 단지 / 국토부 실거래가 공개시스템). */
  /** 같은 호로 추정돼 묶인 호가 행의 범위/구성원(group이 2개 이상일 때만). 값은 최저~최고로 표시한다. */
  group?: ResearchListing[];
  askMax?: number | null;
  askGapMax?: number | null;
  warrantMax?: number | null;
  realGapMax?: number | null;
  href?: string;
  hrefTitle?: string;
  listing?: ResearchListing;
  trade?: ResearchTrade;
};

/** 국토부 실거래가 공개시스템 — 거래 1건으로 바로 가는 주소(deep link)는 제공되지 않아 사이트 첫 화면으로 연결한다. */
/** 줄 배경(옅게)과 왼쪽 띠 색 — 지도 라벨 색과 맞춘다: 호가 초록 · 실거래 노랑 · 경매 검정. */
const ROW_TINT = { 경매물건: "bg-gray-500/10", 호가: "bg-green-500/10", 실거래: "bg-yellow-400/15" } as const;
const ROW_EDGE = { 경매물건: "border-l-gray-800", 호가: "border-l-green-600", 실거래: "border-l-yellow-500" } as const;
const MOLIT_RT_URL = "https://rt.molit.go.kr/";
const naverArticleUrl = (articleNo: string) => `https://fin.land.naver.com/articles/${articleNo}`;

const BASIS_LABEL: Record<string, string> = { ho: "호수 일치", "floor+area": "층+면적 추정", "band+area": "층구간+면적 추정", "near+area": "인접층+면적 추정", area: "면적 추정", none: "" };

/** 재개발 구역 매물 조사 — 관심(★) 물건의 구역 안 네이버 매매 호가와 국토부 실거래(최근 1년)를, 대림동 680 엑셀과
 * 같은 형태(공시가 → 전세가 → 호가/실매도 대비 갭)로 보여준다. 조사 실행은 서버가 백그라운드로 처리하고 이 패널은
 * 진행 상태를 보여 준다. 사용자 요청, 2026-10-24. */
export function RedevelopmentEditResearchPanel({
  auctionId,
  zoneId,
  zoneAuctions,
  toleranceM,
  onNavigateAuction,
}: {
  /** 경매물건 기준 조사(그 물건이 속한 구역). */
  auctionId?: string;
  /** 구역 기준 조사(지도에서 구역 라벨을 눌렀을 때) — 호가·실거래와 같은 레이아웃으로 보여 준다. */
  zoneId?: string;
  /** 구역 기준 조사일 때, 이 구역 안(오차범위 포함)의 경매물건 — 표 맨 위에 검정 행으로 함께 보여 준다(사용자 요청, 2026-10-25). */
  zoneAuctions?: RedevelopmentMapAuction[];
  isFavorite?: boolean;
  toleranceM: number;
  /** 경매 행을 지도에서 찾아 상세 팝업을 열기 위한 상위 지도 콜백. */
  onNavigateAuction?: (auction: RedevelopmentMapAuction) => void;
}) {
  const queryClient = useQueryClient();
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [expanded, setExpanded] = useState<string | null>(null);
  // 빠른 조사로 모은 매물 중 자세한 값이 필요한 하나만 지금 상세 조사한다.
  const [detailBusy, setDetailBusy] = useState<string | null>(null);
  async function runListingDetail(listingZoneId: string | undefined, articleNo: string) {
    if (!listingZoneId) return;
    setDetailBusy(articleNo);
    setError(null);
    try {
      await fetchListingDetailNow(listingZoneId, articleNo);
      await queryClient.invalidateQueries({ queryKey: ["redev-research"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "상세 조사에 실패했습니다.");
    } finally {
      setDetailBusy(null);
    }
  }
  // 경매·낙찰 줄을 누르면 추천물건과 같은 경매 상세 팝업을 띄운다.
  const [detailAuctionId, setDetailAuctionId] = useState<string | null>(null);
  const detailAuction = detailAuctionId ? (zoneAuctions ?? []).find((a) => a.id === detailAuctionId) ?? null : null;
  const [error, setError] = useState<string | null>(null);
  const topTableScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollSpacerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setParams(loadParams()), []);
  const setParam = <K extends keyof Params>(k: K, v: Params[K]) =>
    setParams((p) => {
      const next = { ...p, [k]: v };
      try {
        localStorage.setItem(PARAMS_KEY, JSON.stringify(next));
      } catch {
        /* 저장 불가 환경이면 이번 화면에서만 유지 */
      }
      return next;
    });

  const queryKey = ["redev-research", zoneId ? `zone:${zoneId}` : auctionId, toleranceM];
  const query = useQuery({
    queryKey,
    queryFn: () => (zoneId ? fetchZoneResearch(zoneId, toleranceM) : fetchAuctionResearch(auctionId as string, toleranceM)),
    // 관심 여부와 상관없이 조사할 수 있다(사용자 요청 2026-10-25) — isFavorite는 호출부 호환용으로만 남긴다.
    // 조사가 도는 동안만 4초마다 상태를 다시 읽는다.
    refetchInterval: (q) => (q.state.data?.run?.status === "running" ? 4000 : false),
  });
  const data = query.data;
  const run = data?.run;
  const running = run?.status === "running";
  // 대상 물건이 속한 구역의 낙찰 경매도 함께 읽어, 실제 낙찰률을 예상 입찰가에 반영한다.
  const relatedAuctionsQuery = useQuery({
    queryKey: ["redev-zone-auctions-for-bid", data?.zone?.id],
    queryFn: () => fetchRedevelopmentZoneAuctions(data?.zone?.id as string),
    enabled: !zoneAuctions?.length && !!data?.zone?.id,
    staleTime: 60_000,
  });
  const relatedZoneAuctions = zoneAuctions?.length ? zoneAuctions : relatedAuctionsQuery.data ?? [];
  const openAuctionFromRow = (id: string) => {
    const auction = relatedZoneAuctions.find((item) => item.id === id);
    if (auction && onNavigateAuction) {
      onNavigateAuction(auction);
      return;
    }
    setDetailAuctionId(id);
  };
  // 조사로 저장된 호가·실거래가 늘면 지도의 가격 라벨도 새로 읽는다.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["redev-map-points"] });
    if (run?.status && run.status !== "running") void queryClient.invalidateQueries({ queryKey: ["redev-zone-consents"] });
  }, [queryClient, run?.status, run?.naverSaved, run?.tradesSaved]);

  const start = useMutation({
    mutationFn: () =>
      zoneId
        ? startZoneResearch(zoneId, params.tradeLimit, params.fast)
        : startAuctionResearch(auctionId as string, toleranceM, params.tradeLimit, params.fast),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "조사를 시작하지 못했습니다."),
  });

  // 구역 안 경매물건의 공시가(층·호·전용면적·대지지분 포함)만 가볍게 일괄 조회 — 네이버/국토부는 안 부른다.
  const zoneAuctionIds = relatedZoneAuctions.map((a) => a.id);
  const auctionPriceQuery = useQuery({
    queryKey: ["redev-auction-official-price-batch", zoneAuctionIds],
    queryFn: () => fetchAuctionsOfficialPriceBatch(zoneAuctionIds),
    enabled: zoneAuctionIds.length > 0,
  });
  // 지도용 경매 목록엔 연식이 비어 있는 경우가 많아, 경매 상세와 같은 원본(연식 포함)을 한 번에 가져와 채운다.
  const auctionItemsQuery = useQuery({
    queryKey: ["redev-auction-items-by-ids", zoneAuctionIds],
    queryFn: () => fetchAuctionsByIds(zoneAuctionIds),
    enabled: zoneAuctionIds.length > 0,
    staleTime: 60_000,
  });
  const auctionBuiltYearById = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of auctionItemsQuery.data ?? []) if (it.builtYear > 0) m.set(it.id, it.builtYear);
    return m;
  }, [auctionItemsQuery.data]);
  const auctionItemById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof auctionItemsQuery.data>[number]>();
    for (const item of auctionItemsQuery.data ?? []) m.set(item.id, item);
    return m;
  }, [auctionItemsQuery.data]);
  const auctionPriceById = useMemo(() => {
    const m = new Map<string, AuctionOfficialPriceBatchItem>();
    for (const item of auctionPriceQuery.data ?? []) m.set(item.id, item);
    return m;
  }, [auctionPriceQuery.data]);

  const rows = useMemo<Row[]>(() => {
    const t = data?.target;
    const hasZoneAuctions = relatedZoneAuctions.length > 0;
    if (!data?.target && !(zoneId && data?.zone) && !hasZoneAuctions) return [];
    const rate = params.ratePct / 100;
    const calc = (official: number | null) => ({ jeonse: official != null ? Math.round(official * rate) : null });
    // 같은 지번의 네이버 매물이 있으면 그 매물 페이지(단지정보 포함)를 실거래 주소 링크로 쓴다.
    const articleByJibun = new Map<string, string>();
    for (const l of data?.listings ?? []) if (l.jibun && !articleByJibun.has(l.jibun)) articleByJibun.set(l.jibun, l.articleNo);
    const out: Row[] = [];
    if (hasZoneAuctions) {
      // 대상 물건 상세에서는 같은 구역의 "낙찰" 물건만 비교군으로 추가한다.
      const auctionRows = zoneId ? relatedZoneAuctions : relatedZoneAuctions.filter((a) => a.id !== t?.id && (a.salePrice ?? 0) > 0);
      for (const a of auctionRows as RedevelopmentMapAuction[]) {
        const isSold = (a.salePrice ?? 0) > 0;
        const minManwon = isSold
          ? Math.round((a.salePrice as number) / 10000)
          : a.minPrice != null
            ? Math.round(a.minPrice / 10000)
            : null;
        const p = auctionPriceById.get(a.id);
        const auctionItem = auctionItemById.get(a.id);
        const official = p?.officialPrice.manwon ?? null;
        const ac = calc(official);
        const estimatedSale = isSold
          ? estimateSaleFromListings({
              listings: data?.listings ?? [],
              trades: data?.trades ?? [],
              rate,
              official,
              area: p?.exclusiveArea ?? areaFromText(auctionItem?.area),
              year: a.builtYear || auctionItem?.builtYear || null,
              rooms: null,
            })?.expected ?? null
          : null;
        out.push({
          key: `a-${a.id}`,
          kind: "경매물건",
          address: `${a.address}${a.near ? " (경계밖)" : ""}`,
          auctionNo: a.auctionNo,
          auctionPricePct: (a.appraisedValue ?? auctionItem?.appraisedValue ?? 0) > 0 && (isSold ? (a.salePrice ?? 0) : (a.minPrice ?? 0)) > 0
            ? Math.round(((isSold ? a.salePrice : a.minPrice) as number) / ((a.appraisedValue ?? auctionItem?.appraisedValue) as number) * 100)
            : null,
          date: a.bidDate ? a.bidDate.replace(/-/g, ".") : "",
          floor: [p?.floor ? `${p.floor}층` : "", p?.ho ? `${p.ho}호` : ""].filter(Boolean).join(" ") || a.caseState || "",
          area: p?.exclusiveArea ?? areaFromText(auctionItem?.area),
          land: p?.landShare ?? null,
          year: a.builtYear || auctionBuiltYearById.get(a.id) || null,
          rooms: null,
          official,
          officialBasis: p ? BASIS_LABEL[p.officialPrice.basis] : "",
          jeonse: ac.jeonse,
          ask: isSold ? null : minManwon,
          // 경매물건은 "낙찰받아 직접 거주/보유"가 전제라 전세가 대비 갭 개념이 안 맞아 비워 둔다(사용자 요청, 2026-10-25).
          askGap: null,
          warrant: null,
          realGap: null,
          typeName: a.propType,
          sold: isSold ? minManwon : null,
          soldGap: null,
          cancelled: false,
          soldAuction: isSold,
          expectedSale: estimatedSale,
        });
      }
    }
    if (t) {
      const tc = calc(t.officialPrice.manwon);
      out.push({
        key: "target",
        kind: "경매물건",
        address: t.address,
        auctionNo: t.auctionNo,
        auctionPricePct: t.appraisedValue > 0 && t.minPrice > 0 ? Math.round(t.minPrice / t.appraisedValue * 100) : null,
        date: "",
        floor: [t.floor ? `${t.floor}층` : "", t.ho ? `${t.ho}호` : ""].filter(Boolean).join(" "),
        area: t.exclusiveArea,
        land: t.landShare,
        year: t.builtYear,
        rooms: t.roomCount,
        official: t.officialPrice.manwon,
        officialBasis: BASIS_LABEL[t.officialPrice.basis],
        jeonse: tc.jeonse,
        // API의 최저입찰가는 원 단위이므로, 조사 표의 다른 금액과 같은 만원 단위로 맞춘다.
        ask: t.minPrice > 0 ? Math.round(t.minPrice / 10_000) : null,
        askGap: null,
        warrant: null,
        realGap: null,
        typeName: t.propType,
        sold: null,
        soldGap: null,
        cancelled: false,
      });
    }

    const similar = (area: number | null, year: number | null) => {
      if (!params.similarOnly) return true;
      if (!t) return true; // 구역 조사에는 기준 물건이 없어 비슷한 조건 필터를 적용하지 않는다.
      if (t.exclusiveArea != null && area != null && Math.abs(area - t.exclusiveArea) > params.areaTol) return false;
      if (t.builtYear && year && Math.abs(year - t.builtYear) > params.yearTol) return false;
      return true;
    };
    // 사라진 매물은 호가 목록의 맨 아래로 보낸다.
    for (const l of [...(data?.listings ?? [])].sort((a, b) => Number(!!a.gone) - Number(!!b.gone))) {
      const year = l.buildingYear;
      if (!similar(l.exclusiveArea, year)) continue;
      if (params.roomFilter && String(Math.min(l.roomCount ?? 0, 4)) !== params.roomFilter) continue;
      const c = calc(l.officialPrice.manwon);
      out.push({
        key: `l-${l.id}`,
        kind: "호가",
        address: l.address || [l.articleName, l.jibun].filter(Boolean).join(" ") || "-",
        date: l.confirmedAt ? l.confirmedAt.replace(/(\d{4})(\d{2})(\d{2})/, "$1.$2.$3") : "",
        floor: l.floorInfo ?? "",
        area: l.exclusiveArea,
        land: l.landShareEstimate,
        landEst: l.landShareEstimate != null,
        landBasis: l.landShareBasis,
        year,
        rooms: l.roomCount,
        official: l.officialPrice.manwon,
        officialBasis: BASIS_LABEL[l.officialPrice.basis],
        jeonse: c.jeonse,
        href: naverArticleUrl(l.articleNo),
        hrefTitle: "네이버 부동산 매물 페이지 열기",
        ask: l.priceManwon,
        askGap: l.priceManwon != null && c.jeonse != null ? l.priceManwon - c.jeonse : null,
        warrant: l.warrantPriceManwon,
        realGap: l.priceManwon != null && l.warrantPriceManwon != null ? l.priceManwon - l.warrantPriceManwon : null,
        typeName: l.typeName,
        sold: null,
        soldGap: null,
        cancelled: false,
        gone: !!l.gone,
        lastSeen: l.lastSeenAt ? new Date(l.lastSeenAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : undefined,
        listing: l,
      });
    }
    for (const tr of data?.trades ?? []) {
      if (!similar(tr.exclusiveArea, tr.buildYear)) continue;
      const c = calc(tr.officialPrice.manwon);
      out.push({
        key: `t-${tr.id}`,
        kind: "실거래",
        address: `${tr.umdNm} ${tr.jibun}${tr.buildingName ? ` ${tr.buildingName}` : ""}`,
        date: tr.contractDate.replace(/-/g, "."),
        floor: tr.floor ? `${tr.floor}층` : "",
        area: tr.exclusiveArea,
        land: tr.landArea,
        year: tr.buildYear,
        rooms: null,
        official: tr.officialPrice.manwon,
        officialBasis: BASIS_LABEL[tr.officialPrice.basis],
        jeonse: c.jeonse,
        href: articleByJibun.has(tr.jibun) ? naverArticleUrl(articleByJibun.get(tr.jibun) as string) : MOLIT_RT_URL,
        hrefTitle: articleByJibun.has(tr.jibun) ? "같은 지번 네이버 매물 페이지(단지정보 포함) 열기" : "국토부 실거래가 공개시스템 열기",
        ask: null,
        askGap: null,
        warrant: null,
        realGap: null,
        typeName: "연립다세대",
        sold: tr.dealAmountManwon,
        soldGap: c.jeonse != null ? tr.dealAmountManwon - c.jeonse : null,
        cancelled: tr.isCancelled,
        trade: tr,
      });
    }
    const merged = params.groupSame ? groupSameUnit(out) : out;
    // 종류별로 모아서: 경매물건 → 호가(낮은 가격순) → 실거래(최근 거래순).
    const order = { 경매물건: 0, 호가: 1, 실거래: 2 } as const;
    return merged
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const k = order[a.r.kind] - order[b.r.kind];
        if (k) return k;
        if (a.r.kind === "경매물건") {
          if (a.r.key === "target") return -1;
          if (b.r.key === "target") return 1;
        }
        if (a.r.kind === "호가") return (a.r.ask ?? Infinity) - (b.r.ask ?? Infinity) || a.i - b.i;
        if (a.r.kind === "실거래") return b.r.date.localeCompare(a.r.date) || a.i - b.i;
        return a.i - b.i;
      })
      .map((x) => x.r);
  }, [data, params, zoneId, relatedZoneAuctions, auctionPriceById, auctionBuiltYearById, auctionItemById]);

  // 긴 표와 하단에 고정되는 가로 스크롤바의 위치를 동기화한다.
  useEffect(() => {
    const top = topTableScrollRef.current;
    const table = tableScrollRef.current;
    const spacer = tableScrollSpacerRef.current;
    if (!top || !table || !spacer) return;
    let syncing = false;
    const syncWidth = () => {
      spacer.style.width = `${table.scrollWidth}px`;
      top.scrollLeft = table.scrollLeft;
    };
    const fromTop = () => {
      if (syncing) return;
      syncing = true;
      table.scrollLeft = top.scrollLeft;
      syncing = false;
    };
    const fromTable = () => {
      if (syncing) return;
      syncing = true;
      top.scrollLeft = table.scrollLeft;
      syncing = false;
    };
    top.addEventListener("scroll", fromTop);
    table.addEventListener("scroll", fromTable);
    const observer = new ResizeObserver(syncWidth);
    observer.observe(table);
    syncWidth();
    return () => {
      top.removeEventListener("scroll", fromTop);
      table.removeEventListener("scroll", fromTable);
      observer.disconnect();
    };
  }, [rows.length, data?.zone?.id, data?.target?.id]);

  /** 대상 경매물건의 추정 전세가에, 조건이 가까운 현재 호가들의 평균 갭을 더한다.
   * 가격 자체를 평균 내면 면적이 큰 매물에 과도하게 끌리므로, 화면에서 쓰는
   * "호가 대비 갭(호가 - 추정 전세가)"만 평균 내어 대상 물건 기준으로 환산한다. */
  const expectedAsk = useMemo(() => {
    const target = data?.target;
    const rate = params.ratePct / 100;
    const base = target
      ? estimateSaleFromListings({
          listings: data?.listings ?? [],
          trades: data?.trades ?? [],
          rate,
          official: target.officialPrice.manwon,
          area: target.exclusiveArea,
          year: target.builtYear,
          rooms: target.roomCount,
        })
      : null;
    if (!target || !base) return null;
    const targetJeonse = base.targetJeonse;
    const candidates = (data.listings ?? [])
      .filter((l) => !l.gone && l.priceManwon != null && l.officialPrice.manwon != null)
      .map((l) => {
        const areaDiffPct = target.exclusiveArea && l.exclusiveArea
          ? Math.abs(l.exclusiveArea - target.exclusiveArea) / target.exclusiveArea
          : 0;
        const yearDiff = target.builtYear && l.buildingYear ? Math.abs(l.buildingYear - target.builtYear) : 0;
        const roomMismatch = target.roomCount && l.roomCount ? target.roomCount !== l.roomCount : false;
        const gap = l.priceManwon! - Math.round(l.officialPrice.manwon! * rate);
        // 면적을 가장 크게, 연식과 방 수를 그 다음으로 반영한 비교 우선순위다.
        const score = 100 - areaDiffPct * 100 - Math.min(yearDiff, 20) * 1.5 - (roomMismatch ? 15 : 0);
        const strict =
          areaDiffPct <= 0.2 &&
          yearDiff <= 10 &&
          (!target.roomCount || !l.roomCount || !roomMismatch);
        return { l, gap, score, strict };
      });
    const strict = candidates.filter((c) => c.strict);
    // 같은 조건의 매물이 3건보다 적으면, 유사도 상위 5건으로 보완하되 계산 근거를 함께 표시한다.
    const selected = (strict.length >= 3 ? strict : candidates.filter((c) => c.score >= 40))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    if (!selected.length && base.expected == null) {
      return {
        targetJeonse,
        selected: [],
        expected: null,
        averageGap: null,
        strict: strict.length >= 3,
        soldComparables: [] as Array<{ id: string; sold: number; expectedSale: number; bidRate: number }>,
        medianBidRate: null,
        expectedBid: null,
      };
    }
    const averageGap = Math.round(selected.reduce((sum, c) => sum + c.gap, 0) / selected.length);
    const legacyBase = {
      targetJeonse,
      selected,
      expected: targetJeonse + averageGap,
      averageGap,
      strict: strict.length >= 3,
    };
    const soldComparables = relatedZoneAuctions
      .filter((a) => a.id !== target.id && (a.salePrice ?? 0) > 0)
      .map((a) => {
        const p = auctionPriceById.get(a.id);
        const item = auctionItemById.get(a.id);
        const expectedSale = estimateSaleFromListings({
          listings: data.listings ?? [],
          trades: data.trades ?? [],
          rate,
          official: p?.officialPrice.manwon ?? null,
          area: p?.exclusiveArea ?? areaFromText(item?.area),
          year: a.builtYear || item?.builtYear || null,
          rooms: null,
        })?.expected ?? null;
        const sold = Math.round((a.salePrice ?? 0) / 10_000);
        return { id: a.id, sold, expectedSale, bidRate: expectedSale && expectedSale > 0 ? sold / expectedSale : null };
      })
      .filter((x): x is { id: string; sold: number; expectedSale: number; bidRate: number } => x.expectedSale != null && x.bidRate != null);
    const rates = soldComparables.map((x) => x.bidRate).sort((a, b) => a - b);
    // 특수 조건의 한 건을 완화하기 위해 평균 대신 중앙값으로 최종 입찰가를 환산한다.
    const medianBidRate = rates.length ? (rates[Math.floor((rates.length - 1) / 2)] + rates[Math.ceil((rates.length - 1) / 2)]) / 2 : null;
    return {
      ...base,
      soldComparables,
      medianBidRate,
      expectedBid: medianBidRate != null && base.expected != null ? Math.round(base.expected * medianBidRate) : null,
    };
  }, [data, params.ratePct, relatedZoneAuctions, auctionPriceById, auctionItemById]);

  function downloadCsv() {
    const head = ["분류", "주소", "거래일/확인일", "층·호", "전용면적(㎡)", "전용(평)", "대지지분(㎡)", "대지지분(평)", "연식", "방", "공시가(만원)", "공시가 근거", "전세가(만원)", "호가(만원)", "호가대비갭", "현전세보증금(만원)", "실매도(만원)", "매도대비갭", "중개사", "중개사 전화", "중개사 주소", "비고"];
    // 묶인 행(같은 호 추정)도 CSV에는 매물별로 풀어서 내보낸다.
    const csvRows: Row[] = rows.flatMap((r) => {
      if (!r.group || r.group.length < 2) return [r];
      return r.group.map((l) => {
        const jeonse = r.jeonse;
        return {
          ...r,
          group: undefined,
          listing: l,
          floor: l.floorInfo ?? "",
          date: l.confirmedAt ? l.confirmedAt.replace(/(\d{4})(\d{2})(\d{2})/, "$1.$2.$3") : "",
          area: l.exclusiveArea,
          ask: l.priceManwon,
          askMax: null,
          askGap: l.priceManwon != null && jeonse != null ? l.priceManwon - jeonse : null,
          askGapMax: null,
          warrant: l.warrantPriceManwon,
          warrantMax: null,
          realGap: l.priceManwon != null && l.warrantPriceManwon != null ? l.priceManwon - l.warrantPriceManwon : null,
          realGapMax: null,
        } as Row;
      });
    });
    const lines = csvRows.map((r) =>
      [
        r.kind,
        r.address,
        r.date,
        r.floor,
        r.area ?? "",
        r.area != null ? (r.area / PYEONG).toFixed(1) : "",
        r.land ?? "",
        r.land != null && r.land > 0 ? (r.land / PYEONG).toFixed(1) : "",
        r.year ?? "",
        r.rooms ?? "",
        r.official ?? "",
        r.officialBasis,
        r.jeonse ?? "",
        r.ask ?? "",
        r.askGap ?? "",
        r.warrant ?? "",
        r.sold ?? "",
        r.soldGap ?? "",
        r.listing?.realtor ?? "",
        r.listing?.realtorPhone ?? "",
        r.listing?.realtorAddress ?? "",
        r.cancelled ? "해제(취소)된 거래" : "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `재개발조사_${data?.zone?.name ?? ""}_${data?.target?.auctionNo ?? ""}.csv`.replace(/[\\/:*?"<>|]/g, "_");
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const input = "w-20 px-1.5 py-1 text-xs border border-border rounded-sm bg-background text-foreground";
  const kindTone: Record<Row["kind"], string> = {
    경매물건: "bg-gray-900 text-white",
    호가: "bg-green-600 text-white",
    실거래: "bg-yellow-500 text-white",
  };
  const kindLabel: Record<Row["kind"], string> = { 경매물건: "경매", 호가: "호가", 실거래: "실거래" };

  return (
    <div className="border-t border-border bg-card p-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold text-foreground">{zoneId ? "재개발 구역 매물·실거래 조사" : "같은 재개발 구역 매물·실거래 조사"}</span>
        {data?.zone && (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
            {data.zone.name}
            {data.zone.stage ? ` · ${data.zone.stage}` : ""}
          </span>
        )}
        <button
          type="button"
          disabled={running || start.isPending || !data?.zone}
          onClick={() => start.mutate()}
          className="rounded-sm bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {running || start.isPending
            ? "조사 중..."
            : run && run.status !== "idle"
              ? run.naverDetailRemaining > 0 || run.status === "error" || run.status === "interrupted"
                ? "이어서 수집"
                : "다시 조사"
              : "조사 시작"}
        </button>
        <label
          className="flex items-center gap-1.5 text-foreground"
          title="켜면 네이버는 목록과 매물당 지번 조회 1번만 부르고, 연식·대지지분은 건축물대장으로 채웁니다(방 수·소수점 면적은 비거나 추정). 끄면 매물당 상세·단지 정보까지 모두 조회합니다(느리고 호출이 많음)."
        >
          <input type="checkbox" checked={params.fast} onChange={(e) => setParam("fast", e.target.checked)} />
          빠른 조사(목록+지번)
        </label>
        <label className="flex items-center gap-1.5 text-foreground" title="구역 안에서 가장 최근 거래부터 최대 이 건수까지 모읍니다(5~100). 그 기간에 거래가 적으면 적은 대로 두고, 이미 조사한 구역은 최근 거래월만 다시 조회합니다.">
          실거래 조회
          <input
            type="number"
            min={5}
            max={100}
            className={input}
            value={params.tradeLimit}
            onChange={(e) => setParam("tradeLimit", Math.min(100, Math.max(5, Math.round(Number(e.target.value)) || 20)))}
          />
          건
        </label>
        {rows.length > 1 && (
          <button type="button" onClick={downloadCsv} className="rounded-sm border border-border px-3 py-1.5 text-foreground hover:bg-muted">
            엑셀(CSV) 내려받기
          </button>
        )}
      </div>

      {query.isPending && <p className="text-muted-foreground">불러오는 중...</p>}
      {query.isError && <p className="text-destructive">{query.error instanceof Error ? query.error.message : "불러오지 못했습니다."}</p>}
      {error && <p className="text-destructive">{error}</p>}
      {data && !data.zone && <p className="text-muted-foreground">{data.message ?? "이 물건이 속한 재개발 구역을 찾지 못했습니다."}</p>}

      {run && run.status !== "idle" && (
        <div className="rounded-sm border border-border bg-muted/40 px-3 py-2 text-muted-foreground">
          <span className={`mr-2 rounded px-1.5 py-0.5 font-semibold ${running ? "bg-blue-500/15 text-blue-700 dark:text-blue-400" : run.status === "done" ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
            {running ? "진행 중" : run.status === "done" ? "완료" : run.status === "interrupted" ? "중단됨" : "오류"}
          </span>
          {run.phase} · 네이버 매물 {run.naverSaved}건(상세 {run.naverDetailDone}건 수집
          {run.naverDetailRemaining > 0 ? `, ${run.naverDetailRemaining}건 남음` : ""}) · 실거래 {run.tradesSaved}건
          {run.finishedAt && !running && <span className="ml-2">({new Date(run.finishedAt).toLocaleString("ko-KR")})</span>}
          {run.error && <div className="mt-1 text-destructive">{run.error}</div>}
          {running && <div className="mt-1">네이버 호출은 요청 간격을 두고 천천히 진행됩니다(몇 분 걸릴 수 있음). 이 화면을 열어 둔 채 기다리면 자동으로 갱신됩니다.</div>}
        </div>
      )}
      {data?.zone && (!run || run.status === "idle") && (
        <p className="text-muted-foreground">아직 조사하지 않았습니다. "조사 시작"을 누르면 구역 안 네이버 매매 매물(호가)과, 최근 1년 이내 가장 최근 거래부터 10건(샘플)의 국토부 빌라 실거래를 가져옵니다.</p>
      )}

      {(data?.target || (zoneId && data?.zone)) && (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-sm border border-border px-3 py-2">
            <label className="flex items-center gap-1.5 text-foreground">
              전세가율(공시가 대비)
              <input type="number" className={input} value={params.ratePct} onChange={(e) => setParam("ratePct", Number(e.target.value) || 0)} />%
            </label>
            <label
              className="flex cursor-pointer items-center gap-1.5 text-foreground"
              title="같은 지번 · 같은 공시가 · 전용면적 ±1㎡ 이내인 호가는 같은 호를 여러 중개사가 올린 것으로 보고 한 줄로 묶습니다."
            >
              <input type="checkbox" checked={params.groupSame} onChange={(e) => setParam("groupSame", e.target.checked)} />
              같은 호 추정 묶기
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-foreground">
              <input type="checkbox" checked={params.similarOnly} onChange={(e) => setParam("similarOnly", e.target.checked)} />
              비슷한 조건만
            </label>
            {params.similarOnly && (
              <>
                <label className="flex items-center gap-1.5 text-foreground">
                  면적 ±<input type="number" className={input} value={params.areaTol} onChange={(e) => setParam("areaTol", Number(e.target.value) || 0)} />㎡
                </label>
                <label className="flex items-center gap-1.5 text-foreground">
                  연식 ±<input type="number" className={input} value={params.yearTol} onChange={(e) => setParam("yearTol", Number(e.target.value) || 0)} />년
                </label>
              </>
            )}
            <label className="flex items-center gap-1.5 text-foreground">
              호가 방 수
              <select className={input} value={params.roomFilter} onChange={(e) => setParam("roomFilter", e.target.value)}>
                <option value="">전체</option>
                <option value="1">1개</option>
                <option value="2">2개</option>
                <option value="3">3개</option>
                <option value="4">4개 이상</option>
              </select>
            </label>
            <span className="text-muted-foreground">
              공시가는 공시가격 DB에서 지번·면적·층으로 추정한 값입니다(근거 표시). 금액 단위: 만원
            </span>
          </div>

          {data?.target && (
            <div className="rounded-xl border-2 border-emerald-500 bg-gradient-to-r from-emerald-100 via-white to-amber-50 px-5 py-4 shadow-md dark:from-emerald-950/50 dark:via-card dark:to-amber-950/30">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="rounded-full bg-emerald-700 px-3 py-1 text-sm font-extrabold text-white shadow-sm">주변 시세 기반</span>
                <span className="text-lg font-extrabold text-foreground">예상 매도가</span>
                {expectedAsk?.expected != null ? (
                  <>
                    <span className="text-3xl font-extrabold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-300">{man(expectedAsk.expected)}만원</span>
                    <span className="rounded-md bg-white/80 px-2 py-1 text-sm font-semibold text-emerald-900 shadow-sm dark:bg-black/20 dark:text-emerald-100">
                      추정 전세 {man(expectedAsk.targetJeonse)}만원 + 가중 평균 갭 {man(expectedAsk.averageGap)}만원
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">공시가 또는 비교 호가·실거래가 없어 아직 산정할 수 없습니다.</span>
                )}
              </div>
              {expectedAsk?.selected.length ? (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  전용 {data.target.exclusiveArea ?? "-"}㎡ · 연식 {data.target.builtYear ?? "-"}년
                  {data.target.roomCount ? ` · 방 ${data.target.roomCount}개` : " · 방 수 정보 없음"} 기준으로
                  {expectedAsk.strict ? " 면적 ±20%·연식 ±10년·동일 방 수" : " 유사도 상위"} 비교 시세 {expectedAsk.selected.length}건
                  (실거래 {expectedAsk.selected.filter((item) => item.kind === "trade").length}건 · 호가 {expectedAsk.selected.filter((item) => item.kind === "listing").length}건)을 반영했습니다.
                  최근 실거래 &gt; 최근 호가 &gt; 과거 실거래 순으로 가중하고, 미체결 호가는 갭의 85%만 보수적으로 반영합니다.
                </p>
              ) : null}
            </div>
          )}

          <div ref={tableScrollRef} className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <table className="w-full min-w-[1520px] table-fixed border-separate border-spacing-0">
              <colgroup>
                <col className="w-[64px]" />
                <col className="w-[190px]" />
                <col className="w-[90px]" />
                <col className="w-[64px]" />
                <col className="w-[72px]" />
                <col className="w-[56px]" />
                <col className="w-[90px]" />
                <col className="w-[56px]" />
                <col className="w-[48px]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[160px]" />
                <col className="w-[100px]" />
                <col className="w-[90px]" />
                <col className="w-[220px]" />
              </colgroup>
              <thead>
                <tr className="bg-muted text-left text-muted-foreground">
                  {["분류", "주소", "거래일·확인일", "층·호", "전용(㎡)", "평", "대지지분(㎡)", "연식", "방", "공시가", "전세가", "최저가/호가/실매도", "구역갭", "현전세", "중개사 · 연락처"].map((h, i) => (
                    <th key={h} className={`whitespace-nowrap px-2 py-2 font-semibold ${i >= 4 && i !== 7 && i !== 8 && i !== 14 ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = expanded === r.key;
                  const isAuctionRow = r.kind === "경매물건" && r.key.startsWith("a-");
                  const clickable = !!r.listing || !!r.trade || isAuctionRow;
                  const gapTone = (v: number | null) => (v == null ? "" : v >= 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400");
                  return (
                    <Fragment key={r.key}>
                      <tr
                        onClick={() => (isAuctionRow ? openAuctionFromRow(r.key.slice(2)) : clickable && setExpanded(open ? null : r.key))}
                        className={`border-b border-border align-top ${ROW_TINT[r.kind]} ${clickable ? "cursor-pointer hover:brightness-95" : ""} ${r.cancelled ? "text-muted-foreground line-through" : r.gone ? "text-muted-foreground opacity-60" : "text-foreground"}`}
                      >
                        <td className={`border-b border-border border-l-4 px-2 py-2 ${ROW_EDGE[r.kind]}`}>
                          <span className={`whitespace-nowrap rounded px-1.5 py-0.5 font-semibold ${r.kind === "경매물건" && r.soldAuction ? "bg-red-700 text-white" : kindTone[r.kind]}`}>{r.kind === "경매물건" && r.soldAuction ? "낙찰" : kindLabel[r.kind]}</span>
                          {r.gone && (
                            <span className="mt-1 block whitespace-nowrap rounded bg-gray-500 px-1.5 py-0.5 text-[10px] font-semibold text-white" title={r.lastSeen ? `마지막 확인 ${r.lastSeen}` : undefined}>
                              사라짐{r.lastSeen ? ` ${r.lastSeen}` : ""}
                            </span>
                          )}
                          {r.cancelled && <span className="ml-1 text-[11px] text-red-500 no-underline">해제</span>}
                        </td>
                        <td className="border-b border-border px-2 py-2">
                          {r.kind === "경매물건" && r.auctionNo && (
                            <span className="mb-0.5 block whitespace-nowrap font-bold text-slate-800 dark:text-slate-100">{r.auctionNo}</span>
                          )}
                          {r.href ? (
                            <a
                              href={r.href}
                              target="_blank"
                              rel="noreferrer"
                              title={r.hrefTitle}
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline"
                            >
                              {r.address} ↗
                            </a>
                          ) : (
                            r.address
                          )}
                          {r.listing?.complexName && <span className="ml-1.5 text-xs text-muted-foreground">{r.listing.complexName}</span>}
                          {r.group && r.group.length > 1 && (
                            <span
                              className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
                              title="같은 지번 · 같은 공시가 · 면적 ±1㎡ — 같은 호를 여러 중개사가 올린 것으로 보고 묶었습니다. 행을 펼치면 매물별로 보입니다."
                            >
                              같은 호 추정 ×{r.group.length}
                            </span>
                          )}
                          {r.kind === "호가" && r.typeName && (
                            <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{r.typeName}</span>
                          )}
                        </td>
                        <td className="border-b border-border px-2 py-2 tabular-nums">{r.date}</td>
                        <td className="border-b border-border px-2 py-2">{r.floor}</td>
                        <td className="border-b border-border px-2 py-2 text-right tabular-nums">{r.area ?? ""}</td>
                        <td className="border-b border-border px-2 py-2 text-right tabular-nums">{r.area != null ? (r.area / PYEONG).toFixed(1) : ""}</td>
                        <td className="border-b border-border px-2 py-2 text-right tabular-nums" title={r.landEst ? (r.landBasis === "ledger" ? "건축물대장 대지면적을 이 건물 호들의 전용면적 비율로 나눈 추정값" : "같은 지번 실거래의 대지권면적 비율로 추정한 값") : undefined}>
                          {r.land != null && r.land > 0 ? r.land : ""}
                          {r.land != null && r.land > 0 && <span className="block text-[11px] text-muted-foreground">{(r.land / PYEONG).toFixed(1)}평</span>}
                          {r.landEst && r.land != null && <span className="block text-[10px] text-muted-foreground">{r.landBasis === "ledger" ? "대장 비례 추정" : "실거래 기준 추정"}</span>}
                        </td>
                        <td className="border-b border-border px-2 py-2">{r.year ?? r.listing?.ageTag ?? ""}</td>
                        <td className="border-b border-border px-2 py-2">{r.rooms ?? ""}</td>
                        <td className="border-b border-border px-2 py-2 text-right tabular-nums" title={r.officialBasis}>
                          {man(r.official)}
                          {r.officialBasis && r.kind !== "경매물건" && <span className="block text-[10px] text-muted-foreground">{r.officialBasis}</span>}
                        </td>
                        <td className="border-b border-border px-2 py-2 text-right tabular-nums">{man(r.jeonse)}</td>
                        {/* 호가와 실매도를 한 칸에 두고 줄 배경색·왼쪽 띠로 구분(호가=초록, 실거래=노랑, 경매물건=회색). 갭도 한 칸(구역갭) — 호가 줄은 호가−전세가, 실거래 줄은 실거래−전세가. */}
                        <td className="border-b border-border px-2 py-2 text-right font-semibold tabular-nums">
                          <span className={`whitespace-nowrap ${r.kind === "경매물건" && r.soldAuction ? "text-red-600" : ""}`} title={r.auctionPricePct != null ? "감정가 대비 비율" : undefined}>{r.sold != null ? man(r.sold) : rng(r.ask, r.askMax)}{r.auctionPricePct != null ? ` (${r.auctionPricePct}%)` : ""}</span>
                          <span className={`block text-[10px] font-normal ${r.kind === "경매물건" && r.soldAuction ? "text-red-600" : "text-muted-foreground"}`}>
                            {r.kind === "경매물건" ? (r.soldAuction ? "낙찰가" : "최저가") : r.kind === "실거래" ? "실매도" : "호가"}
                          </span>
                          {r.expectedSale != null && (
                            <span className="mt-1 block whitespace-nowrap rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white" title="같은 구역의 실거래·현재 호가를 가중 반영해 계산한 예상 매도가">
                              예상 매도가 {man(r.expectedSale)}
                            </span>
                          )}
                          {r.group && r.group.length > 1 && (
                            <span className="ml-1 block whitespace-nowrap rounded bg-green-600/15 px-1 text-[10px] font-bold text-green-700 dark:text-green-400" title="같은 호로 추정되어 묶인 호가 건수">
                              ×{r.group.length}
                            </span>
                          )}
                        </td>
                        <td className={`border-b border-border px-2 py-2 text-right tabular-nums ${gapTone(r.sold != null ? r.soldGap : r.askGap)}`}>
                          <span className="whitespace-nowrap">{r.sold != null ? man(r.soldGap) : rng(r.askGap, r.askGapMax)}</span>
                        </td>
                        <td className="border-b border-border px-2 py-2 text-right tabular-nums">{rng(r.warrant, r.warrantMax)}</td>
                        <td className="border-b border-border px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          {r.kind === "호가" &&
                            (r.group && r.group.length > 1 ? r.group : r.listing ? [r.listing] : []).map((l) => (
                              <div key={l.id} className="whitespace-normal">
                                {r.group && r.group.length > 1 && l.priceManwon != null && (
                                  <span className="mr-1 font-semibold text-foreground">{man(l.priceManwon)}</span>
                                )}
                                <span className="text-foreground">{l.realtor ?? "-"}</span>
                                {l.realtorPhone ? (
                                  <a href={`tel:${l.realtorPhone}`} className="ml-1.5 text-primary hover:underline">
                                    {l.realtorPhone}
                                  </a>
                                ) : (
                                  <span className="ml-1.5 text-muted-foreground">(번호 수집 전)</span>
                                )}
                                {l.realtorAddress && <div className="max-w-[200px] whitespace-normal text-[11px] leading-snug text-muted-foreground">{l.realtorAddress}</div>}
                                {!l.hasDetail && (
                                  <button
                                    type="button"
                                    disabled={detailBusy != null}
                                    onClick={() => void runListingDetail(zoneId ?? data?.zone?.id, l.articleNo)}
                                    className="mt-1 rounded-sm border border-border px-2 py-0.5 text-[11px] text-foreground hover:bg-muted disabled:opacity-50"
                                    title="이 매물만 네이버 상세·단지 정보를 조회해 방 수·정확한 면적·전세 보증금·중개사 전화 등을 채웁니다(네이버 최대 3회)."
                                  >
                                    {detailBusy === l.articleNo ? "조회 중..." : "상세 조사"}
                                  </button>
                                )}
                              </div>
                            ))}
                        </td>
                      </tr>
                      {open && r.listing && (r.group && r.group.length > 1 ? r.group : [r.listing]).map((l) => <ListingDetail key={l.id} l={l} />)}
                      {open && r.trade && <TradeDetail t={r.trade} naverHref={r.href !== MOLIT_RT_URL ? r.href : undefined} />}
                    </Fragment>
                  );
                })}
                {rows.length === 1 && (
                  <tr>
                    <td colSpan={15} className="px-2 py-4 text-center text-muted-foreground">
                      {running ? "수집 중입니다. 완료되면 호가와 실거래가 여기에 표시됩니다." : "조사된 호가·실거래가 없습니다."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div
            ref={topTableScrollRef}
            className="sticky bottom-0 z-20 overflow-x-scroll overflow-y-hidden rounded-t-md border border-border bg-muted/50 [scrollbar-gutter:stable]"
            title="표 가로 스크롤"
            aria-label="조사표 가로 스크롤"
          >
            <div ref={tableScrollSpacerRef} className="h-px min-w-[1520px]" />
          </div>
          {data.otherZones && data.otherZones.length > 0 && (
            <p className="text-muted-foreground">
              경계 오차범위 안에 다른 구역도 있습니다: {data.otherZones.map((z) => `${z.name}(${z.distanceM}m)`).join(", ")} — 가장 가까운 구역을 조사합니다.
            </p>
          )}
        </>
      )}
      {detailAuction && (
        // 상세 팝업이 구역 팝업 안에 렌더되므로, 팝업 안 마우스 이벤트가 구역 팝업의 "바깥 클릭 닫기"로 번지지 않게 막는다.
        <div onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <RedevelopmentEditSelectedAuction key={detailAuction.id} auction={detailAuction} toleranceM={toleranceM} onClose={() => setDetailAuctionId(null)} />
        </div>
      )}
    </div>
  );
}

/** 공시가 추정 근거 — 같은 건물에서 면적이 맞은 호들과 그중 실제로 쓰인 호(굵게)를 보여준다. */
function OfficialPriceBasis({ est, floor }: { est: OfficialPriceEstimate; floor: number | null }) {
  const label = { ho: "호수 일치", "floor+area": "층+면적 추정", "band+area": "층 구간(저/중/고)+면적 추정", "near+area": "같은 층 호가 없어 가장 가까운 층+면적 추정", area: "면적 추정(층 매칭 실패)", none: "추정 불가" }[est.basis];
  return (
    <div className="mt-3 border-t border-border pt-2 text-xs">
      <div className="font-semibold text-foreground">
        공시가 추정 근거 · {label}
        {est.manwon != null && <span className="ml-1 font-normal text-muted-foreground">→ {est.manwon.toLocaleString("ko-KR")}만원</span>}
      </div>
      <div className="text-muted-foreground">
        이 건물 공시가격 데이터 {est.buildingRowCount ?? 0}호{floor != null ? ` · 기준 층 ${floor < 0 ? "지하" : `${floor}층`}` : ""}
        {est.basis === "area" && est.rows && est.rows.length > 0 && " · 호 이름에서 읽은 층이 일치하는 호가 없어 면적이 맞는 호의 중간값을 썼습니다"}
        {est.basis === "none" && (est.buildingRowCount ?? 0) === 0 && " · 이 지번의 공시가격이 DB에 없습니다"}
        {est.basis === "none" && (est.buildingRowCount ?? 0) > 0 && " · 면적이 맞는 호가 없습니다(아래는 면적이 가까운 호)"}
      </div>
      {est.rows && est.rows.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
          {est.rows.map((r, i) => (
            <span key={`${r.ho}-${i}`} className={r.used ? "font-semibold text-foreground" : "text-muted-foreground"}>
              {r.dong ? `${r.dong}동 ` : ""}
              {r.ho}호 · {r.area ?? "-"}㎡ · {r.manwon.toLocaleString("ko-KR")}만{r.floor != null ? ` · ${r.floor < 0 ? "지하" : `${r.floor}층`}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ListingDetail({ l }: { l: ResearchListing }) {
  const kv = (label: string, value: string | number | null | undefined) =>
    value == null || value === "" ? null : (
      <div className="flex gap-2">
        <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
        <span className="whitespace-pre-wrap break-words text-foreground">{value}</span>
      </div>
    );
  const mapUrl = l.lat != null && l.lng != null ? `https://new.land.naver.com/houses?ms=${l.lat},${l.lng},17&a=DDDGG:VL&b=A1&e=RETAIL&ad=true` : null;
  return (
    <tr>
      <td colSpan={15} className="bg-muted/30 px-4 py-3">
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs md:grid-cols-2 xl:grid-cols-3">
          {kv("매물번호", l.articleNo)}
          {kv("매물명", l.articleName)}
          {kv("유형", l.typeName)}
          {kv("가격(원문)", l.priceText)}
          {kv("공급/전용(㎡)", [l.supplyArea, l.exclusiveArea].filter((v) => v != null).join(" / "))}
          {kv("층", l.floorInfo)}
          {kv("방향", l.direction)}
          {kv("방 수", l.roomCount)}
          {kv("준공연도", l.buildingYear)}
          {kv("사용승인일", l.useApprovalDate)}
          {kv("연식(대략)", l.ageTag)}
          {kv("관리비", l.adminCostManwon != null ? `${l.adminCostManwon}만원` : l.adminCostMemo)}
          {kv("현 전세 보증금", l.warrantPriceManwon != null ? `${l.warrantPriceManwon.toLocaleString("ko-KR")}만원` : null)}
          {kv("욕실 수", l.bathroomCount)}
          {kv("세대 수", l.householdCount)}
          {kv("주차 대수", l.parkingCount)}
          {kv("지하철 도보", l.subwayWalkMin != null ? `${l.subwayWalkMin}분` : null)}
          {kv("단지명", l.complexName ? `${l.complexName}${l.complexNumber ? ` (단지번호 ${l.complexNumber})` : ""}` : null)}
          {kv("지번 주소", l.address)}
          {kv("도로명 주소", l.roadAddress)}
          {kv("단지 세대수", l.totalHouseholdNumber != null ? `${l.totalHouseholdNumber}세대` : null)}
          {kv("건설사", l.constructionCompany)}
          {kv("용적률·건폐율", l.floorAreaRatio != null || l.buildingCoverageRatio != null ? `${l.floorAreaRatio ?? "-"}% / ${l.buildingCoverageRatio ?? "-"}%` : null)}
          {kv("엘리베이터", l.elevatorCount != null ? `총 ${l.elevatorCount}대` : null)}
          {kv("단지 주차", l.totalParkingCount != null ? `${l.totalParkingCount}대` : null)}
          {kv("사용승인 경과", l.approvalElapsedYear != null ? `${l.approvalElapsedYear}년차` : null)}
          {kv("건물 용도", l.lawUsage)}
          {kv("난방", l.heatMethod)}
          {kv("필지번호(PNU)", l.pnu)}
          {kv("입주 가능", l.moveInText)}
          {kv("특징", l.feature)}
          {kv("매물 특징 설명", l.featureDesc)}
          {kv("소개글", l.introText)}
          {kv("중개사", l.realtor)}
          {l.realtorPhone && (
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">중개사 연락처</span>
              <a href={`tel:${l.realtorPhone}`} className="text-primary hover:underline">
                {l.realtorPhone}
              </a>
            </div>
          )}
          {kv("중개사 소재지", l.realtorAddress)}
          {kv("구역 경계 거리", l.distanceToZoneM != null ? `${l.distanceToZoneM}m` : null)}
          {kv("처음 확인", new Date(l.firstSeenAt).toLocaleDateString("ko-KR"))}
          {kv("최근 확인", new Date(l.lastSeenAt).toLocaleDateString("ko-KR"))}
          {kv("사진", l.photoUrls.length ? `${l.photoUrls.length}장` : null)}
          {!l.hasDetail && <div className="text-muted-foreground">상세 정보는 아직 수집 전입니다("이어서 수집"으로 가져옵니다).</div>}
        </div>
        <OfficialPriceBasis est={l.officialPrice} floor={l.floor} />
        <a href={naverArticleUrl(l.articleNo)} target="_blank" rel="noreferrer" className="mt-2 mr-4 inline-block text-primary hover:underline">
          네이버 부동산 매물 페이지 열기 ↗
        </a>
        {mapUrl && (
          <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-primary hover:underline">
            네이버 부동산에서 이 위치 보기
          </a>
        )}
      </td>
    </tr>
  );
}

function TradeDetail({ t, naverHref }: { t: ResearchTrade; naverHref?: string }) {
  const kv = (label: string, value: string | number | null | undefined) =>
    value == null || value === "" ? null : (
      <div className="flex gap-2">
        <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
        <span className="text-foreground">{value}</span>
      </div>
    );
  return (
    <tr>
      <td colSpan={15} className="bg-muted/30 px-4 py-3">
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs md:grid-cols-2 xl:grid-cols-3">
          {kv("건물명", t.buildingName)}
          {kv("지번", `${t.umdNm} ${t.jibun}`)}
          {kv("계약일", t.contractDate)}
          {kv("등기일", t.registeredAt)}
          {kv("거래금액", `${t.dealAmountManwon.toLocaleString("ko-KR")}만원`)}
          {kv("층", t.floor ? `${t.floor}층` : null)}
          {kv("전용면적", `${t.exclusiveArea}㎡`)}
          {kv("대지면적(대지권)", t.landArea != null ? `${t.landArea}㎡ (${(t.landArea / 3.3058).toFixed(1)}평)` : null)}
          {kv("건축년도", t.buildYear)}
          {kv("거래유형", t.dealingType)}
          {kv("매수자", t.buyerType)}
          {kv("매도자", t.sellerType)}
          {kv("주택유형", t.houseType === "RH" ? "연립다세대" : t.houseType)}
          {kv("해제 여부", t.isCancelled ? `해제됨${t.cancelledAt ? ` (${t.cancelledAt})` : ""}` : null)}
          {kv("구역 경계 거리", t.distanceToZoneM != null ? `${t.distanceToZoneM}m` : null)}
        </div>
        <OfficialPriceBasis est={t.officialPrice} floor={t.floor || null} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {naverHref && (
            <a href={naverHref} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              같은 지번 네이버 매물 페이지(단지정보) 열기 ↗
            </a>
          )}
          <a href={MOLIT_RT_URL} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            국토부 실거래가 공개시스템 열기 ↗ (거래 1건 직접 링크는 없어 사이트 첫 화면으로 이동)
          </a>
        </div>
      </td>
    </tr>
  );
}
