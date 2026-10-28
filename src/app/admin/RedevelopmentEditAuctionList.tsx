"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addFavorite,
  fetchAuctionsByIds,
  fetchFavorites,
  removeFavorite,
  type FavoriteItem,
  type RedevelopmentMapAuction,
} from "@/lib/api";
import { formatWon } from "@/lib/kakao-maps";
import type { AuctionItem } from "@/types/auction";
import { RedevelopmentEditAuctionDetail } from "./RedevelopmentEditAuctionDetail";
import { RedevelopmentEditResearchPanel } from "./RedevelopmentEditResearchPanel";

/** 이 탭에서 담은 관심물건의 분류 — 기존 관심물건(내 물건)과 같은 저장소를 쓰되 분류로 구분한다. */
const FAVORITE_CATEGORY = "재개발";
const FETCH_CHUNK = 40;
const EOK = 100_000_000;

type SortKey = "bidDate" | "appraisedValue" | "minPrice" | "discount" | "salePrice" | "naverPrice" | "area" | "builtYear";
type SortDir = "asc" | "desc";

/** 정렬에 쓸 숫자 값 — 값이 없으면 null(항상 맨 아래로 보낸다). */
function sortValue(a: AuctionItem, key: SortKey): number | null {
  const pos = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n > 0 ? n : null);
  switch (key) {
    case "bidDate":
      return pos(Number((a.bidDate ?? "").replace(/\D/g, "")));
    case "appraisedValue":
      return pos(a.appraisedValue);
    case "minPrice":
      return pos(a.minPrice);
    case "discount":
      return discountPct(a);
    case "salePrice":
      return pos(a.salePrice);
    case "naverPrice":
      return pos(a.naverPrice);
    case "area":
      return pos(parseFloat(String(a.area ?? "").replace(/[^\d.]/g, "")));
    case "builtYear":
      return pos(a.builtYear);
  }
}

/** 숫자 열은 처음 누를 때 이 방향으로 시작한다(날짜·최저가는 낮은 순, 나머지는 높은 순). */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  bidDate: "asc",
  minPrice: "asc",
  appraisedValue: "desc",
  discount: "desc",
  salePrice: "desc",
  naverPrice: "desc",
  area: "desc",
  builtYear: "desc",
};

/** 주소를 건물 단위로 줄인다 — "서울특별시 금천구 독산동 884-26 성주아트빌 제4층 제403호" → "독산동 884-26 성주아트빌". */
function shortAddress(address: string): string {
  return address
    .replace(/\([^)]*\)/g, "")
    .replace(/^\S+\s+\S+[구군]\s+/, "")
    .replace(/\s+제?\d+[층호동].*$/, "")
    .replace(/\s+/g, " ")
    .replace(/[,\s]+$/, "")
    .trim();
}

type YesNo = "" | "yes" | "no";

type Filters = {
  fav: YesNo;
  zone: string;
  address: string;
  propType: string;
  areaMin: string;
  areaMax: string;
  yearMin: string;
  yearMax: string;
  apprMin: string;
  apprMax: string;
  minMin: string;
  minMax: string;
  status: string;
  sale: YesNo;
  naver: YesNo;
  tenant: string;
  note: string;
  memo: YesNo;
};

const EMPTY_FILTERS: Filters = {
  fav: "",
  zone: "",
  address: "",
  propType: "",
  areaMin: "",
  areaMax: "",
  yearMin: "",
  yearMax: "",
  apprMin: "",
  apprMax: "",
  minMin: "",
  minMax: "",
  status: "",
  sale: "",
  naver: "",
  tenant: "",
  note: "",
  memo: "",
};

async function fetchItemsChunked(ids: string[]): Promise<AuctionItem[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) chunks.push(ids.slice(i, i + FETCH_CHUNK));
  const results = await Promise.all(chunks.map((c) => fetchAuctionsByIds(c)));
  return results.flat();
}

function discountPct(a: AuctionItem): number | null {
  if (!a.appraisedValue || !a.minPrice) return null;
  return Math.round((1 - a.minPrice / a.appraisedValue) * 100);
}

/** 주소에서 동 이름을 뽑는다 — "서울특별시 금천구 독산동 884-26 …" → "독산동". */
function dongOf(address: string): string {
  const m = address.match(/[구군]\s+([가-힣0-9]+?(?:동|가))(?=\s|$)/);
  return m ? m[1] : "";
}

function statusOf(a: AuctionItem): string {
  return a.caseState || a.status || "";
}

function statusTone(s: string): string {
  if (/취하|취소|기각|종결/.test(s)) return "bg-gray-500/15 text-gray-600 dark:text-gray-400";
  if (/매각|낙찰|허가|대금/.test(s)) return "bg-green-500/15 text-green-700 dark:text-green-400";
  if (/유찰|변경|연기|지연/.test(s)) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
}

function inRange(value: number, min: string, max: string): boolean {
  if (min !== "" && !(value >= Number(min) * EOK)) return false;
  if (max !== "" && !(value <= Number(max) * EOK)) return false;
  return true;
}

/** 단위 변환 없이 숫자 그대로 범위 비교(면적 ㎡, 연식 연도). 값이 없는 물건은 범위를 걸면 제외한다. */
function inPlainRange(value: number | null, min: string, max: string): boolean {
  if (min !== "" && (value == null || value < Number(min))) return false;
  if (max !== "" && (value == null || value > Number(max))) return false;
  return true;
}

function fmtArea(area: string | undefined): string {
  const n = parseFloat(String(area ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? `${n}㎡` : "-";
}

function yesNoMatch(mode: YesNo, has: boolean): boolean {
  return mode === "" || (mode === "yes" ? has : !has);
}

const filterInput = "w-full px-1.5 py-1 text-xs font-normal border border-border rounded-sm bg-background text-foreground";

/** 입력하면서 검색하고 목록에서 고를 수 있는 주소 드롭다운. 목록에 없는 글자를 그대로 두면 부분 검색이 된다. */
function AddressCombo({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, number]>;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const shown = options.filter(([a]) => !q || a.toLowerCase().includes(q)).slice(0, 80);
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="주소 선택·검색"
        className={`${filterInput} pr-6`}
      />
      {value ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          title="지우기"
        >
          ✕
        </button>
      ) : (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">▼</span>
      )}
      {open && (
        <ul className="absolute left-0 z-40 mt-1 max-h-72 w-[340px] overflow-auto rounded-sm border border-border bg-card py-1 text-xs font-normal shadow-lg">
          {shown.length === 0 && <li className="px-3 py-2 text-muted-foreground">일치하는 주소가 없습니다</li>}
          {shown.map(([addr, n]) => (
            <li key={addr}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(addr);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted ${
                  addr === value ? "bg-muted font-semibold" : ""
                }`}
              >
                <span className="truncate">{addr}</span>
                <span className="shrink-0 text-muted-foreground">{n}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 재개발 구역 안 경매물건 매물 리스트(지도 아래 전체 폭). 경매코치가 가진 정보를 표로 보여주고,
 * 열마다 필터를 걸 수 있다. 행을 누르면 상세가 펼쳐지고, ★로 관심목록에 담고, 메모를 남길 수 있다
 * (메모는 관심물건 메모로 저장돼 메모를 남기면 자동으로 관심목록에 담긴다). 사용자 요청, 2026-10-24. */
export function RedevelopmentEditAuctionList({
  auctions,
  allAuctions,
  zoneNameById,
  selectedZoneId,
  onZoneSelect,
  onClearZone,
  guLabel,
  guOptions,
  onGuChange,
  toleranceM,
  onToleranceChange,
  showAll,
  onShowAllChange,
  filterSlot,
  onFocusAuction,
}: {
  auctions: RedevelopmentMapAuction[];
  allAuctions: RedevelopmentMapAuction[];
  zoneNameById: Map<string, string>;
  selectedZoneId: string | null;
  onZoneSelect: (zoneId: string) => void;
  onClearZone: () => void;
  guLabel: string;
  /** 구 필터 선택지(구 이름, 구역 안 물건 수) */
  guOptions: Array<[string, number]>;
  onGuChange: (gu: string) => void;
  toleranceM: number;
  onToleranceChange: (m: number) => void;
  showAll: boolean;
  onShowAllChange: (v: boolean) => void;
  /** 구역 사업종류·진행단계 필터 등 상위에서 넘기는 도구(경매물건이 속한 구역 기준). */
  filterSlot?: React.ReactNode;
  /** 주소를 누르면 지도를 그 물건 위치로 옮긴다. */
  onFocusAuction?: (a: { id: string; lat: number; lng: number }) => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"list" | "fav">("list");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "bidDate", dir: "asc" });
  const [dong, setDong] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [memoEditId, setMemoEditId] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const activeFilterCount = Object.values(filters).filter((v) => v !== "").length;

  const favoritesQuery = useQuery({ queryKey: ["redev-favorites"], queryFn: fetchFavorites, staleTime: 30_000 });
  const favById = useMemo(() => {
    const m = new Map<string, FavoriteItem>();
    (favoritesQuery.data ?? []).forEach((f) => m.set(f.auctionId, f));
    return m;
  }, [favoritesQuery.data]);
  const redevFavIds = useMemo(
    () => (favoritesQuery.data ?? []).filter((f) => f.category === FAVORITE_CATEGORY).map((f) => f.auctionId),
    [favoritesQuery.data],
  );

  const mapById = useMemo(() => new Map(allAuctions.map((a) => [a.id, a])), [allAuctions]);
  const ids = useMemo(() => (tab === "list" ? auctions.map((a) => a.id) : redevFavIds), [tab, auctions, redevFavIds]);
  const idsKey = ids.join(",");

  const itemsQuery = useQuery({
    queryKey: ["redev-auction-items", idsKey],
    queryFn: () => fetchItemsChunked(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });

  // 필터 적용 전 전체 행 — 필터 선택지(상태·종류·구역)를 여기서 뽑는다.
  const baseRows = useMemo(() => {
    const itemById = new Map((itemsQuery.data ?? []).map((i) => [i.id, i]));
    return ids
      .map((id) => ({ id, item: itemById.get(id), map: mapById.get(id) }))
      .filter((r): r is { id: string; item: AuctionItem; map: RedevelopmentMapAuction | undefined } => !!r.item);
  }, [ids, itemsQuery.data, mapById]);

  // 동 선택지 — 현재 구/탭에 나온 물건의 주소에서 뽑고 건수를 같이 보여준다.
  const dongOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of baseRows) {
      const d = dongOf(r.item.address);
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [baseRows]);
  // 구를 바꿔 선택지에서 사라진 동이 남아 있으면 필터를 건 것으로 치지 않는다.
  const dongValue = dongOptions.some(([d]) => d === dong) ? dong : "";

  // 주소 드롭다운 선택지 — 현재 구/동에 나온 물건을 건물 단위로 묶고 건수를 센다.
  const addressOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of baseRows) {
      if (dongValue && dongOf(r.item.address) !== dongValue) continue;
      const s = shortAddress(r.item.address);
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [baseRows, dongValue]);

  const statusOptions = useMemo(() => Array.from(new Set(baseRows.map((r) => statusOf(r.item)).filter(Boolean))).sort(), [baseRows]);
  const propTypeOptions = useMemo(() => Array.from(new Set(baseRows.map((r) => r.item.propType).filter(Boolean))).sort(), [baseRows]);
  const zoneOptions = useMemo(
    () =>
      Array.from(new Set(baseRows.flatMap((r) => (r.map?.zoneIds ?? []).map((z) => zoneNameById.get(z) ?? "")).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "ko"),
      ),
    [baseRows, zoneNameById],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const addrQ = filters.address.trim().toLowerCase();
    const tenantQ = filters.tenant.trim().toLowerCase();
    const noteQ = filters.note.trim().toLowerCase();
    const list = baseRows.filter((r) => {
      const { item } = r;
      const zoneNames = (r.map?.zoneIds ?? []).map((z) => zoneNameById.get(z) ?? "");
      const memo = favById.get(r.id)?.memo ?? "";
      const isFav = favById.get(r.id)?.category === FAVORITE_CATEGORY;
      if (q && !`${item.auctionNo} ${item.address} ${item.court ?? ""} ${zoneNames.join(" ")} ${memo}`.toLowerCase().includes(q)) return false;
      if (dongValue && dongOf(item.address) !== dongValue) return false;
      if (filters.fav && !yesNoMatch(filters.fav, isFav)) return false;
      if (filters.zone && !zoneNames.includes(filters.zone)) return false;
      if (addrQ && !item.address.toLowerCase().includes(addrQ)) return false;
      if (filters.propType && item.propType !== filters.propType) return false;
      if (!inPlainRange(sortValue(item, "area"), filters.areaMin, filters.areaMax)) return false;
      if (!inPlainRange(sortValue(item, "builtYear"), filters.yearMin, filters.yearMax)) return false;
      if (!inRange(item.appraisedValue || 0, filters.apprMin, filters.apprMax)) return false;
      if (!inRange(item.minPrice || 0, filters.minMin, filters.minMax)) return false;
      if (filters.status && statusOf(item) !== filters.status) return false;
      if (!yesNoMatch(filters.sale, item.salePrice != null && item.salePrice > 0)) return false;
      if (!yesNoMatch(filters.naver, !!item.naverPrice)) return false;
      if (tenantQ && !`${item.tenantInfo ?? ""} ${item.tenantDetail ?? ""}`.toLowerCase().includes(tenantQ)) return false;
      if (noteQ && !(item.specialNote ?? "").toLowerCase().includes(noteQ)) return false;
      if (!yesNoMatch(filters.memo, memo.trim() !== "")) return false;
      return true;
    });
    const sign = sort.dir === "asc" ? 1 : -1;
    return list.sort((x, y) => {
      const vx = sortValue(x.item, sort.key);
      const vy = sortValue(y.item, sort.key);
      if (vx == null && vy == null) return 0;
      if (vx == null) return 1; // 값이 없는 물건은 방향과 상관없이 맨 아래
      if (vy == null) return -1;
      return (vx - vy) * sign;
    });
  }, [baseRows, search, filters, dongValue, sort, zoneNameById, favById]);

  async function refreshFavorites() {
    await queryClient.invalidateQueries({ queryKey: ["redev-favorites"] });
  }

  async function toggleFavorite(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const fav = favById.get(id);
      if (fav && fav.category === FAVORITE_CATEGORY) await removeFavorite(id);
      else await addFavorite(id, fav?.category ?? FAVORITE_CATEGORY, fav?.memo ?? null);
      await refreshFavorites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "관심 처리에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveMemo(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const fav = favById.get(id);
      await addFavorite(id, fav?.category ?? FAVORITE_CATEGORY, memoDraft);
      await refreshFavorites();
      setMemoEditId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "메모 저장에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  const tabBtn = (key: "list" | "fav", label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`px-3 py-1.5 text-sm font-semibold rounded-sm border ${
        tab === key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  const yesNoSelect = (value: YesNo, onChange: (v: YesNo) => void, yes: string, no: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value as YesNo)} className={filterInput}>
      <option value="">전체</option>
      <option value="yes">{yes}</option>
      <option value="no">{no}</option>
    </select>
  );

  type RangeKey = "apprMin" | "apprMax" | "minMin" | "minMax" | "areaMin" | "areaMax" | "yearMin" | "yearMax";
  const rangeInputs = (minKey: RangeKey, maxKey: RangeKey, unit = "억", step = 0.5) => (
    <div className="space-y-1">
      <input
        type="number"
        min={0}
        step={step}
        value={filters[minKey]}
        onChange={(e) => setFilter(minKey, e.target.value)}
        placeholder={`최소(${unit})`}
        className={filterInput}
      />
      <input
        type="number"
        min={0}
        step={step}
        value={filters[maxKey]}
        onChange={(e) => setFilter(maxKey, e.target.value)}
        placeholder={`최대(${unit})`}
        className={filterInput}
      />
    </div>
  );

  const thBase = "px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap";
  const sortTh = (key: SortKey, label: string, align: "left" | "right" = "left") => {
    const active = sort.key === key;
    return (
      <th className={`${thBase} bg-muted ${align === "right" ? "text-right" : ""}`}>
        <button
          type="button"
          onClick={() =>
            setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: DEFAULT_DIR[key] }))
          }
          className={`inline-flex items-center gap-1 text-xs font-semibold hover:text-foreground ${
            active ? "text-foreground" : "text-muted-foreground"
          }`}
          title="눌러서 오름차순/내림차순 정렬"
        >
          {label}
          <span className={active ? "text-primary" : "opacity-40"}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  };
  const stickyA = "sticky left-0 z-20 bg-muted";
  const stickyB = "sticky left-12 z-20 bg-muted";

  return (
    <div className="rounded-sm border border-border bg-card text-sm">
      {/* 1줄: 제목 · 탭 · 구/검색/정렬 */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
        <span className="text-base font-bold text-foreground">재개발구역 내 경매 매물 리스트</span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground" title="경매코치 용도 '빌라' = 다세대·연립주택·도시형생활주택">
          용도: 빌라(다세대·연립·도시형)
        </span>
        {tabBtn("list", `매물 목록 ${auctions.length}`)}
        {tabBtn("fav", `관심목록 ${redevFavIds.length}`)}
        <select
          value={guLabel}
          onChange={(e) => onGuChange(e.target.value)}
          className="px-2 py-1.5 text-sm border border-border rounded-sm bg-background"
          title="구별 필터"
        >
          <option value="">구 전체</option>
          {guOptions.map(([gu, n]) => (
            <option key={gu} value={gu}>
              {gu} ({n})
            </option>
          ))}
        </select>
        <select
          value={dongValue}
          onChange={(e) => setDong(e.target.value)}
          className="px-2 py-1.5 text-sm border border-border rounded-sm bg-background"
          title="동별 필터"
        >
          <option value="">동 전체</option>
          {dongOptions.map(([d, n]) => (
            <option key={d} value={d}>
              {d} ({n})
            </option>
          ))}
        </select>
        {selectedZoneId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
            구역: {zoneNameById.get(selectedZoneId) ?? ""}
            <button type="button" onClick={onClearZone} className="text-xs text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="사건번호·주소·구역·메모 검색"
            className="w-64 px-2 py-1.5 text-sm border border-border rounded-sm bg-background"
          />
          <select
            value={sort.key}
            onChange={(e) => {
              const key = e.target.value as SortKey;
              setSort({ key, dir: DEFAULT_DIR[key] });
            }}
            className="px-2 py-1.5 text-sm border border-border rounded-sm bg-background"
          >
            <option value="bidDate">입찰일</option>
            <option value="appraisedValue">감정가</option>
            <option value="minPrice">최저가</option>
            <option value="discount">유찰 할인율</option>
            <option value="salePrice">낙찰가</option>
            <option value="naverPrice">네이버 시세</option>
            <option value="area">전용면적</option>
            <option value="builtYear">연식</option>
          </select>
          <button
            type="button"
            onClick={() => setSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))}
            className="px-2.5 py-1.5 text-sm border border-border rounded-sm bg-background hover:bg-muted"
            title="오름차순/내림차순 전환"
          >
            {sort.dir === "asc" ? "▲ 오름차순" : "▼ 내림차순"}
          </button>
        </div>
      </div>

      {/* 2줄: 옵션 · 결과 요약 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 border-b border-border bg-muted/30 text-xs text-muted-foreground">
        <span className="text-foreground">
          <b className="text-sm">{rows.length}</b>건 표시
          {rows.length !== baseRows.length && <span className="text-muted-foreground"> / 전체 {baseRows.length}건</span>}
        </span>
        {tab === "list" && (
          <>
            <label className="flex items-center gap-1.5 text-foreground">
              경계 오차범위
              <input
                type="number"
                min={0}
                max={200}
                step={5}
                value={toleranceM}
                onChange={(e) => onToleranceChange(Math.max(0, Math.min(200, Number(e.target.value) || 0)))}
                className="w-16 px-1.5 py-0.5 text-xs border border-border rounded-sm bg-background"
              />
              m
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-foreground">
              <input type="checkbox" checked={showAll} onChange={(e) => onShowAllChange(e.target.checked)} />
              구역 밖 물건도 보기
            </label>
            {filterSlot}
          </>
        )}
        {activeFilterCount > 0 && (
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs font-semibold text-primary hover:underline">
            열 필터 {activeFilterCount}개 초기화
          </button>
        )}
        <span className="ml-auto">행을 누르면 상세 · ☆ 관심 · 메모를 남기면 관심목록에 담깁니다</span>
      </div>
      {error && <p className="px-4 py-2 text-xs text-destructive">{error}</p>}

      <div className="overflow-auto max-h-[75vh]">
        <table className="w-full min-w-[2000px] table-fixed border-separate border-spacing-0">
          <colgroup>
            <col className="w-12" />
            <col className="w-40" />
            <col className="w-44" />
            <col className="w-72" />
            <col className="w-20" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-28" />
            <col className="w-28" />
            <col className="w-36" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-56" />
            <col className="w-56" />
            <col className="w-56" />
          </colgroup>
          <thead className="sticky top-0 z-30">
            <tr className="bg-muted">
              <th className={`${thBase} ${stickyA}`}>관심</th>
              <th className={`${thBase} ${stickyB}`}>사건번호</th>
              <th className={`${thBase} bg-muted`}>재개발 구역</th>
              <th className={`${thBase} bg-muted`}>주소</th>
              <th className={`${thBase} bg-muted`}>종류</th>
              {sortTh("area", "전용면적", "right")}
              {sortTh("builtYear", "연식", "right")}
              {sortTh("appraisedValue", "감정가", "right")}
              {sortTh("minPrice", "최저가", "right")}
              {sortTh("bidDate", "입찰일·상태")}
              {sortTh("salePrice", "낙찰가", "right")}
              {sortTh("naverPrice", "네이버 시세", "right")}
              <th className={`${thBase} bg-muted`}>임차인</th>
              <th className={`${thBase} bg-muted`}>특이사항</th>
              <th className={`${thBase} bg-muted`}>메모</th>
            </tr>
            {/* 열별 필터 */}
            <tr className="bg-muted/80 align-top">
              <th className={`px-2 py-2 ${stickyA}`}>
                <select
                  value={filters.fav}
                  onChange={(e) => setFilter("fav", e.target.value as YesNo)}
                  className={filterInput}
                  title="관심 여부"
                >
                  <option value="">전체</option>
                  <option value="yes">★</option>
                  <option value="no">☆</option>
                </select>
              </th>
              <th className={`px-2 py-2 ${stickyB}`} />
              <th className="px-2 py-2 bg-muted/80">
                <select value={filters.zone} onChange={(e) => setFilter("zone", e.target.value)} className={filterInput}>
                  <option value="">구역 전체</option>
                  {zoneOptions.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-2 py-2 bg-muted/80">
                <AddressCombo value={filters.address} onChange={(v) => setFilter("address", v)} options={addressOptions} />
              </th>
              <th className="px-2 py-2 bg-muted/80">
                <select value={filters.propType} onChange={(e) => setFilter("propType", e.target.value)} className={filterInput}>
                  <option value="">종류 전체</option>
                  {propTypeOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-2 py-2 bg-muted/80">{rangeInputs("areaMin", "areaMax", "㎡", 1)}</th>
              <th className="px-2 py-2 bg-muted/80">{rangeInputs("yearMin", "yearMax", "년", 1)}</th>
              <th className="px-2 py-2 bg-muted/80">{rangeInputs("apprMin", "apprMax")}</th>
              <th className="px-2 py-2 bg-muted/80">{rangeInputs("minMin", "minMax")}</th>
              <th className="px-2 py-2 bg-muted/80">
                <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={filterInput}>
                  <option value="">상태 전체</option>
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-2 py-2 bg-muted/80">{yesNoSelect(filters.sale, (v) => setFilter("sale", v), "낙찰됨", "미낙찰")}</th>
              <th className="px-2 py-2 bg-muted/80">{yesNoSelect(filters.naver, (v) => setFilter("naver", v), "있음", "없음")}</th>
              <th className="px-2 py-2 bg-muted/80">
                <input
                  value={filters.tenant}
                  onChange={(e) => setFilter("tenant", e.target.value)}
                  placeholder="임차인 검색 (예: 임차인없음)"
                  className={filterInput}
                />
              </th>
              <th className="px-2 py-2 bg-muted/80">
                <input
                  value={filters.note}
                  onChange={(e) => setFilter("note", e.target.value)}
                  placeholder="특이사항 검색 (예: 공시가)"
                  className={filterInput}
                />
              </th>
              <th className="px-2 py-2 bg-muted/80">{yesNoSelect(filters.memo, (v) => setFilter("memo", v), "메모 있음", "메모 없음")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, item, map }) => {
              const fav = favById.get(id);
              const isFav = fav?.category === FAVORITE_CATEGORY;
              const zoneIds = map?.zoneIds ?? [];
              const zoneNames = zoneIds.map((z) => zoneNameById.get(z) ?? "").filter(Boolean);
              const pct = discountPct(item);
              const status = statusOf(item);
              const expanded = expandedId === id;
              const cell = "px-3 py-3 align-top border-b border-border";
              const rowBg = expanded ? "bg-muted" : "bg-card";
              return (
                <Fragment key={id}>
                  <tr onClick={() => setExpandedId(expanded ? null : id)} className="cursor-pointer group">
                    <td
                      className={`${cell} sticky left-0 z-10 ${rowBg} group-hover:bg-muted`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={busyId === id}
                        onClick={() => void toggleFavorite(id)}
                        className={`text-xl leading-none ${isFav ? "text-yellow-500" : "text-muted-foreground hover:text-yellow-500"} disabled:opacity-40`}
                        title={isFav ? "관심 해제" : "관심 추가"}
                      >
                        {isFav ? "★" : "☆"}
                      </button>
                    </td>
                    <td className={`${cell} sticky left-12 z-10 ${rowBg} group-hover:bg-muted`}>
                      <div className="text-sm font-bold text-foreground">{item.auctionNo}</div>
                      <div className="text-xs text-muted-foreground">{item.court}</div>
                    </td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted`} onClick={(e) => e.stopPropagation()}>
                      {zoneIds.length > 0 ? (
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => onZoneSelect(zoneIds[0])}
                            title={zoneNames.join("\n")}
                            className="block max-w-[130px] truncate text-left text-sm font-medium text-primary hover:underline"
                          >
                            {zoneNames[0]}
                          </button>
                          {map?.near && (
                            <span title="구역 경계 밖이지만 근처(100m 이내)라 구역일 가능성이 있는 물건" className="shrink-0 rounded-full bg-gray-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">
                              경계밖
                            </span>
                          )}
                          {zoneIds.length > 1 && (
                            <span
                              title={zoneNames.join("\n")}
                              className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary"
                            >
                              +{zoneIds.length - 1}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">구역 밖</span>
                      )}
                    </td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted text-foreground`}>
                      {map && onFocusAuction ? (
                        <button
                          type="button"
                          title="지도에서 이 물건 위치로 이동"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFocusAuction({ id, lat: map.latitude, lng: map.longitude });
                          }}
                          className="line-clamp-2 break-words text-left leading-snug text-primary hover:underline"
                        >
                          {item.address}
                        </button>
                      ) : (
                        <div className="line-clamp-2 break-words leading-snug">{item.address}</div>
                      )}
                    </td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted text-sm font-medium text-foreground`}>{item.propType}</td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted text-right text-sm tabular-nums`}>{fmtArea(item.area)}</td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted text-right text-sm tabular-nums`}>
                      {item.builtYear ? `${item.builtYear}년` : "-"}
                    </td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted text-right text-sm tabular-nums`}>{formatWon(item.appraisedValue || null)}</td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted text-right tabular-nums`}>
                      <div className="text-sm font-bold text-foreground">{formatWon(item.minPrice || null)}</div>
                      {pct != null && pct > 0 && (
                        <span className="inline-block mt-0.5 rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
                          -{pct}%
                        </span>
                      )}
                    </td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted`}>
                      <div className="text-sm text-foreground tabular-nums">{item.bidDate || "-"}</div>
                      {status && (
                        <span className={`inline-block mt-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${statusTone(status)}`}>{status}</span>
                      )}
                    </td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted text-right text-sm tabular-nums`}>{formatWon(item.salePrice)}</td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted text-right text-sm tabular-nums`}>{formatWon(item.naverPrice || null)}</td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted text-xs text-muted-foreground`}>
                      <div className="line-clamp-3 whitespace-pre-wrap break-words leading-snug">{item.tenantInfo || "-"}</div>
                    </td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted text-xs text-muted-foreground`}>
                      <div className="line-clamp-3 whitespace-pre-wrap break-words leading-snug">{item.specialNote || "-"}</div>
                    </td>
                    <td className={`${cell} ${rowBg} group-hover:bg-muted`} onClick={(e) => e.stopPropagation()}>
                      {memoEditId === id ? (
                        <div className="space-y-1.5">
                          <textarea
                            value={memoDraft}
                            onChange={(e) => setMemoDraft(e.target.value)}
                            rows={3}
                            autoFocus
                            className="w-full px-2 py-1 text-xs border border-border rounded-sm bg-background"
                          />
                          <div className="flex items-center gap-3 text-xs">
                            <button
                              type="button"
                              disabled={busyId === id}
                              onClick={() => void saveMemo(id)}
                              className="font-semibold text-primary hover:underline disabled:opacity-50"
                            >
                              저장
                            </button>
                            <button type="button" onClick={() => setMemoEditId(null)} className="text-muted-foreground hover:underline">
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs">
                          {fav?.memo ? (
                            <div className="whitespace-pre-wrap break-words text-foreground leading-snug">{fav.memo}</div>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setMemoEditId(id);
                              setMemoDraft(fav?.memo ?? "");
                            }}
                            className={`text-xs text-primary hover:underline ${fav?.memo ? "mt-1" : ""}`}
                          >
                            {fav?.memo ? "수정" : "+ 메모"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={15} className="p-0 border-b border-border">
                        {/* 긴 경매물건 상세는 한 줄로 접어 행 바로 아래에 두고(펼치기 전까지 접힘), 그 아래에 조사 패널을 보여준다. */}
                        <details className="border-b border-border bg-card">
                          <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                            경매물건 상세 정보 (사건·가격·위치·권리·임차) 펼치기
                          </summary>
                          <RedevelopmentEditAuctionDetail auction={item} zoneNames={zoneNames} />
                        </details>
                        <RedevelopmentEditResearchPanel auctionId={id} isFavorite={isFav} toleranceM={toleranceM} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {itemsQuery.isPending && ids.length > 0 && (
              <tr>
                <td colSpan={15} className="p-6 text-center text-muted-foreground">
                  물건 정보를 불러오는 중...
                </td>
              </tr>
            )}
            {itemsQuery.isError && (
              <tr>
                <td colSpan={15} className="p-6 text-center text-destructive">
                  {itemsQuery.error instanceof Error ? itemsQuery.error.message : "물건 정보를 불러오지 못했습니다."}
                </td>
              </tr>
            )}
            {ids.length === 0 && (
              <tr>
                <td colSpan={15} className="p-6 text-center text-muted-foreground">
                  {tab === "list"
                    ? "재개발구역에 포함된 경매물건이 없습니다. (좌표가 채워지는 중이거나, 오차범위를 늘려 보세요)"
                    : "관심목록이 비어 있습니다. 매물 목록에서 ☆를 눌러 담아 보세요."}
                </td>
              </tr>
            )}
            {ids.length > 0 && !itemsQuery.isPending && rows.length === 0 && (
              <tr>
                <td colSpan={15} className="p-6 text-center text-muted-foreground">
                  조건에 맞는 물건이 없습니다. 열 필터를 확인해 보세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
