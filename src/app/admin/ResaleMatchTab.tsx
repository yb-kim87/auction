"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  fetchResaleMatches,
  fetchResaleMatchesForMap,
  reviewResaleMatch,
  type ResaleMatchMapItem,
  type ResaleMatchQaItem,
} from "@/lib/api";
import { CITIES, getDistricts, getWards } from "@/data/korea-regions";
import { ResaleMatchMapView } from "./ResaleMatchMapView";

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function exportResaleMatchesToCsv(items: ResaleMatchQaItem[]) {
  const headers = [
    "사건번호",
    "법원",
    "용도",
    "주소",
    "완납일",
    "낙찰가",
    "실거래 주소",
    "실거래 건물명",
    "층",
    "전용면적",
    "거래금액",
    "계약일",
    "매도차익",
    "점수",
    "등급",
    "노출",
    "검토상태",
  ];
  const rows = items.map((item) => {
    const deal = item.dealAmount == null ? null : Number(item.dealAmount);
    const sale = item.salePrice == null ? null : Number(item.salePrice);
    const profit = deal != null && sale != null && Number.isFinite(deal) && Number.isFinite(sale) ? deal - sale : null;
    return [
      item.auctionNo,
      item.court,
      item.propType ?? "",
      item.address,
      item.paymentCompletedAt ?? "",
      item.salePrice ?? "",
      `${item.city} ${item.district} ${item.umdNm} ${item.jibun}`,
      item.aptNm,
      item.floor,
      item.exclusiveArea,
      item.dealAmount ?? "",
      item.contractDate,
      profit ?? "",
      item.scoreTotal,
      item.confidenceTier,
      item.isDisplayed ? "노출됨" : "-",
      STATUS_LABELS[item.status],
    ];
  });
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  // Excel에서 한글이 깨지지 않도록 UTF-8 BOM을 붙인다.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `매도분석_${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatWon(value: number | string | null): string {
  if (value == null) return "-";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "-";
  if (num >= 100000000) return `${(num / 100000000).toFixed(2)}억`;
  if (num >= 10000) return `${(num / 10000).toFixed(0)}만`;
  return num.toLocaleString("ko-KR");
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR");
}

const TIER_STYLES: Record<ResaleMatchQaItem["confidenceTier"], string> = {
  VERY_HIGH: "bg-emerald-100 text-emerald-800 border-emerald-200",
  HIGH: "bg-sky-100 text-sky-800 border-sky-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW: "bg-secondary text-muted-foreground border-border",
};

const STATUS_LABELS: Record<ResaleMatchQaItem["status"], string> = {
  CANDIDATE: "미검토",
  CONFIRMED: "승인됨",
  REJECTED: "반려됨",
  SUPERSEDED: "대체됨",
};

const COLUMN_KEYS = [
  "auctionNo",
  "propType",
  "address",
  "paymentCompletedAt",
  "salePrice",
  "trade",
  "dealAmount",
  "contractDate",
  "profit",
  "score",
  "tier",
  "displayed",
  "status",
  "actions",
] as const;

const DEFAULT_COLUMN_WIDTHS: Record<(typeof COLUMN_KEYS)[number], number> = {
  auctionNo: 140,
  propType: 90,
  address: 260,
  paymentCompletedAt: 100,
  salePrice: 90,
  trade: 220,
  dealAmount: 90,
  contractDate: 100,
  profit: 100,
  score: 70,
  tier: 130,
  displayed: 70,
  status: 90,
  actions: 100,
};

function ResizableTh({
  colKey,
  width,
  onResize,
  className,
  children,
}: {
  colKey: string;
  width: number;
  onResize: (colKey: string, width: number) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: width };
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragState.current) return;
      const delta = moveEvent.clientX - dragState.current.startX;
      const next = Math.max(16, dragState.current.startWidth + delta);
      onResize(colKey, next);
    };
    const handleMouseUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <th
      className={`relative px-3 py-2 font-semibold text-foreground whitespace-nowrap select-none ${className ?? ""}`}
    >
      {children}
      <span
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40"
      />
    </th>
  );
}

export function ResaleMatchTab() {
  const [items, setItems] = useState<ResaleMatchQaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "map">("table");
  const [mapItems, setMapItems] = useState<ResaleMatchMapItem[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapMessage, setMapMessage] = useState<string | null>(null);
  const [filterCity, setFilterCity] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("");
  const [filterWard, setFilterWard] = useState("");
  const [filterPropType, setFilterPropType] = useState("");
  const filterDistrictOptions = filterCity ? getDistricts(filterCity) : [];
  const [filterWardOptions, setFilterWardOptions] = useState<string[]>([]);
  const [wardsLoading, setWardsLoading] = useState(false);
  const propTypeOptions = useMemo(
    () =>
      Array.from(new Set(items.map((item) => item.propType).filter((v): v is string => Boolean(v)))).sort(
        (a, b) => a.localeCompare(b, "ko"),
      ),
    [items],
  );

  useEffect(() => {
    setFilterWard("");
    if (!filterCity || !filterDistrict) {
      setFilterWardOptions([]);
      return;
    }
    let cancelled = false;
    setWardsLoading(true);
    getWards(filterCity, filterDistrict)
      .then((wards) => {
        if (!cancelled) setFilterWardOptions(wards);
      })
      .finally(() => {
        if (!cancelled) setWardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterCity, filterDistrict]);

  const filteredItems = useMemo(
    () =>
      items
        .filter(
          (item) =>
            (!filterCity || item.city === filterCity) &&
            (!filterDistrict || item.district === filterDistrict) &&
            (!filterWard || item.umdNm === filterWard) &&
            (!filterPropType || item.propType === filterPropType),
        )
        .sort((a, b) => a.address.localeCompare(b.address, "ko")),
    [items, filterCity, filterDistrict, filterWard, filterPropType],
  );

  const filteredMapItems = useMemo(
    () =>
      mapItems.filter(
        (item) =>
          (!filterCity || item.city === filterCity) &&
          (!filterDistrict || item.district === filterDistrict) &&
          (!filterWard || item.umdNm === filterWard) &&
          (!filterPropType || item.propType === filterPropType),
      ),
    [mapItems, filterCity, filterDistrict, filterWard, filterPropType],
  );

  const loadMap = useCallback(() => {
    setMapLoading(true);
    setMapMessage(null);
    fetchResaleMatchesForMap()
      .then((res) => {
        setMapItems(res.items);
        if (res.pendingCount > 0) {
          setMapMessage(
            `이번 조회에서 ${res.geocodedNow}건 좌표를 새로 확보했습니다. 아직 ${res.pendingCount}건이 남아있어 "지도 새로고침"을 몇 번 더 누르면 이어서 채워집니다.`,
          );
        }
      })
      .catch((err) => setMapMessage(err instanceof Error ? err.message : "지도 데이터를 불러오지 못했습니다."))
      .finally(() => setMapLoading(false));
  }, []);

  useEffect(() => {
    if (viewMode === "map" && mapItems.length === 0 && !mapLoading) {
      loadMap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);
  const [pageSize, setPageSize] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pagedItems = useMemo(
    () => filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredItems, currentPage, pageSize],
  );
  useEffect(() => {
    setCurrentPage(1);
  }, [filterCity, filterDistrict, filterWard, filterPropType, pageSize]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS);

  const handleResize = useCallback((colKey: string, width: number) => {
    setColWidths((prev) => ({ ...prev, [colKey]: width }));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetchResaleMatches()
      .then(setItems)
      .catch((err) => setMessage(err instanceof Error ? err.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleReview(matchId: string, status: "CONFIRMED" | "REJECTED") {
    setReviewingId(matchId);
    try {
      await reviewResaleMatch(matchId, status);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "검토 상태 저장 실패");
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[100rem]">
      <div>
        <h2 className="text-lg font-bold text-foreground">낙찰물건 매도분석</h2>
        <p className="text-sm text-muted-foreground mt-1">
          매각대금완납일 이후 국토부 실거래가와 대조해, 낙찰받은 그 물건이 실제로 되팔렸을
          가능성이 있는 사례를 모아 보여줍니다. 55점(MEDIUM) 이상만 표시하며, 70점 이상이면서
          1·2위 점수차가 8점 이상 벌어진 경우에만 사용자 화면 노출 대상(표시됨)입니다. 나머지는
          참고용이니 검토 후 승인/반려해 주세요.
        </p>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-sm border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`px-3 py-1.5 text-xs font-semibold ${
              viewMode === "table" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
            }`}
          >
            테이블
          </button>
          <button
            type="button"
            onClick={() => setViewMode("map")}
            className={`px-3 py-1.5 text-xs font-semibold border-l border-border ${
              viewMode === "map" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
            }`}
          >
            지도
          </button>
        </div>
        {viewMode === "table" ? (
          <button type="button" onClick={load} className="text-xs text-primary hover:underline">
            새로고침
          </button>
        ) : (
          <button type="button" onClick={loadMap} disabled={mapLoading} className="text-xs text-primary hover:underline disabled:opacity-50">
            {mapLoading ? "불러오는 중..." : "지도 새로고침"}
          </button>
        )}
      </div>

      {viewMode === "map" && mapMessage && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {mapMessage}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">지역 필터</span>
        <select
          value={filterCity}
          onChange={(e) => {
            setFilterCity(e.target.value);
            setFilterDistrict("");
          }}
          className="px-3 py-2 text-sm border border-border rounded-sm bg-card"
        >
          <option value="">시/도 전체</option>
          {CITIES.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        <select
          value={filterDistrict}
          onChange={(e) => setFilterDistrict(e.target.value)}
          disabled={!filterCity}
          className="px-3 py-2 text-sm border border-border rounded-sm bg-card disabled:opacity-50"
        >
          <option value="">시/군/구 전체</option>
          {filterDistrictOptions.map((district) => (
            <option key={district} value={district}>
              {district}
            </option>
          ))}
        </select>
        <select
          value={filterWard}
          onChange={(e) => setFilterWard(e.target.value)}
          disabled={!filterCity || !filterDistrict || wardsLoading}
          className="px-3 py-2 text-sm border border-border rounded-sm bg-card disabled:opacity-50"
        >
          <option value="">
            {wardsLoading ? "불러오는 중..." : "읍/면/동 전체"}
          </option>
          {filterWardOptions.map((ward) => (
            <option key={ward} value={ward}>
              {ward}
            </option>
          ))}
        </select>
        <select
          value={filterPropType}
          onChange={(e) => setFilterPropType(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-sm bg-card"
        >
          <option value="">용도 전체</option>
          {propTypeOptions.map((propType) => (
            <option key={propType} value={propType}>
              {propType}
            </option>
          ))}
        </select>
        {(filterCity || filterDistrict || filterWard || filterPropType) && (
          <button
            type="button"
            onClick={() => {
              setFilterCity("");
              setFilterDistrict("");
              setFilterWard("");
              setFilterPropType("");
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            필터 초기화
          </button>
        )}
        <button
          type="button"
          onClick={() => exportResaleMatchesToCsv(filteredItems)}
          disabled={filteredItems.length === 0}
          className="px-3 py-1.5 text-xs font-semibold rounded-sm border border-primary text-primary hover:bg-primary/5 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          엑셀로 저장 ({filteredItems.length}건)
        </button>
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredItems.length}건 / 전체 {items.length}건
        </span>
      </div>

      {viewMode === "map" ? (
        <ResaleMatchMapView items={filteredMapItems} />
      ) : (
        <>
      <div className="border border-border rounded-sm overflow-x-auto overflow-y-auto" style={{ height: "min(560px, calc(100vh - 320px))" }}>
        {loading ? (
          <p className="text-sm text-muted-foreground p-4">불러오는 중...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">
            MEDIUM(55점) 이상 후보가 아직 없습니다.
          </p>
        ) : (
          <table
            className="text-xs border-collapse"
            style={{
              tableLayout: "fixed",
              width: COLUMN_KEYS.reduce((sum, key) => sum + colWidths[key], 0),
            }}
          >
            <colgroup>
              {COLUMN_KEYS.map((key) => (
                <col key={key} style={{ width: colWidths[key] }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 bg-secondary/50">
              <tr className="text-left">
                <ResizableTh colKey="auctionNo" width={colWidths.auctionNo} onResize={handleResize}>
                  사건번호/법원
                </ResizableTh>
                <ResizableTh colKey="propType" width={colWidths.propType} onResize={handleResize}>
                  용도
                </ResizableTh>
                <ResizableTh colKey="address" width={colWidths.address} onResize={handleResize}>
                  주소
                </ResizableTh>
                <ResizableTh colKey="paymentCompletedAt" width={colWidths.paymentCompletedAt} onResize={handleResize}>
                  완납일
                </ResizableTh>
                <ResizableTh colKey="salePrice" width={colWidths.salePrice} onResize={handleResize} className="text-right">
                  낙찰가
                </ResizableTh>
                <ResizableTh colKey="trade" width={colWidths.trade} onResize={handleResize}>
                  실거래(층/면적)
                </ResizableTh>
                <ResizableTh colKey="dealAmount" width={colWidths.dealAmount} onResize={handleResize} className="text-right">
                  거래금액
                </ResizableTh>
                <ResizableTh colKey="contractDate" width={colWidths.contractDate} onResize={handleResize}>
                  계약일
                </ResizableTh>
                <ResizableTh colKey="profit" width={colWidths.profit} onResize={handleResize} className="text-right">
                  매도차익
                </ResizableTh>
                <ResizableTh colKey="score" width={colWidths.score} onResize={handleResize} className="text-right">
                  점수
                </ResizableTh>
                <ResizableTh colKey="tier" width={colWidths.tier} onResize={handleResize}>
                  등급
                </ResizableTh>
                <ResizableTh colKey="displayed" width={colWidths.displayed} onResize={handleResize}>
                  노출
                </ResizableTh>
                <ResizableTh colKey="status" width={colWidths.status} onResize={handleResize}>
                  검토상태
                </ResizableTh>
                <ResizableTh colKey="actions" width={colWidths.actions} onResize={handleResize}></ResizableTh>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((item) => (
                <tr key={item.matchId} className="border-t border-border align-top">
                  <td className="px-3 py-2 whitespace-nowrap truncate overflow-hidden">
                    <div className="font-semibold truncate">{item.auctionNo}</div>
                    <div className="text-muted-foreground truncate">{item.court}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap truncate overflow-hidden">{item.propType ?? "-"}</td>
                  <td className="px-3 py-2 truncate whitespace-nowrap overflow-hidden" title={item.address}>
                    {item.address}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap truncate overflow-hidden">{formatDate(item.paymentCompletedAt)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap truncate overflow-hidden">{formatWon(item.salePrice)}</td>
                  <td
                    className="px-3 py-2 whitespace-nowrap truncate overflow-hidden"
                    title={`${item.city} ${item.district} ${item.umdNm} ${item.jibun} ${item.aptNm}`}
                  >
                    <div className="truncate">
                      {item.city} {item.district} {item.umdNm} {item.jibun}
                    </div>
                    <div className="text-muted-foreground truncate">
                      {item.aptNm} {item.buildingDong ? `${item.buildingDong}동 ` : ""}
                      {item.floor}층 / {item.exclusiveArea}㎡
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap truncate overflow-hidden">{formatWon(item.dealAmount)}</td>
                  <td className="px-3 py-2 whitespace-nowrap truncate overflow-hidden">
                    {formatDate(item.contractDate)}
                    {item.registeredAt && (
                      <div className="text-emerald-700 text-[10px] truncate">
                        등기 {formatDate(item.registeredAt)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap truncate overflow-hidden">
                    {(() => {
                      const deal = item.dealAmount == null ? null : Number(item.dealAmount);
                      const sale = item.salePrice == null ? null : Number(item.salePrice);
                      if (deal == null || sale == null || !Number.isFinite(deal) || !Number.isFinite(sale)) {
                        return "-";
                      }
                      const profit = deal - sale;
                      return (
                        <span className={profit >= 0 ? "text-emerald-700 font-semibold" : "text-destructive font-semibold"}>
                          {profit >= 0 ? "+" : "-"}
                          {formatWon(Math.abs(profit))}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-semibold overflow-hidden">
                    {item.scoreTotal}
                    {item.runnerUpScore != null && (
                      <span className="text-muted-foreground font-normal"> / {item.runnerUpScore}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap overflow-hidden">
                    <span
                      className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-sm border ${TIER_STYLES[item.confidenceTier]}`}
                    >
                      {item.confidenceTier}
                    </span>
                    {item.ambiguous && (
                      <span className="ml-1 inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-sm border bg-red-100 text-red-700 border-red-200">
                        애매
                      </span>
                    )}
                    {item.isPreCompletion && (
                      <span className="ml-1 inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-sm border bg-orange-100 text-orange-700 border-orange-200">
                        완납전계약
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap overflow-hidden">
                    {item.isDisplayed ? (
                      <span className="text-emerald-700 font-semibold">노출됨</span>
                    ) : (
                      <span className="text-muted-foreground">비노출</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap overflow-hidden">
                    {STATUS_LABELS[item.status]}
                    {item.reviewedBy && (
                      <div className="text-muted-foreground truncate">{item.reviewedBy}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right space-x-2 overflow-hidden">
                    <button
                      type="button"
                      disabled={reviewingId === item.matchId}
                      onClick={() => void handleReview(item.matchId, "CONFIRMED")}
                      className="text-xs text-emerald-700 hover:underline disabled:opacity-50"
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === item.matchId}
                      onClick={() => void handleReview(item.matchId, "REJECTED")}
                      className="text-xs text-destructive hover:underline disabled:opacity-50"
                    >
                      반려
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filteredItems.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>페이지당</span>
            <div className="relative">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="appearance-none bg-card border border-border rounded-sm pl-3 pr-7 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary hover:border-primary/50 cursor-pointer"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}개
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                처음
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                이전
              </button>
              <span className="px-2 font-mono text-muted-foreground">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                다음
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                마지막
              </button>
            </div>
          )}

          <span className="text-xs text-muted-foreground">
            {totalPages}페이지 중 {currentPage}페이지
          </span>
        </div>
      )}
        </>
      )}
    </div>
  );
}
