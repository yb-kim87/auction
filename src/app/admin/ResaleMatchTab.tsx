"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchResaleMatches,
  reviewResaleMatch,
  runResaleMatchNow,
  type ResaleMatchQaItem,
} from "@/lib/api";

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
  const [running, setRunning] = useState(false);
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

  async function handleRunNow() {
    setRunning(true);
    setMessage(null);
    try {
      const result = await runResaleMatchNow();
      setMessage(result.message);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "실행 실패");
    } finally {
      setRunning(false);
    }
  }

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
        <button
          type="button"
          onClick={() => void handleRunNow()}
          disabled={running}
          className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {running ? "실행 중..." : "지금 바로 매칭 배치 실행"}
        </button>
        <button type="button" onClick={load} className="text-xs text-primary hover:underline">
          새로고침
        </button>
      </div>

      <div className="border border-border rounded-sm overflow-x-auto">
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
              {items.map((item) => (
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
                  <td className="px-3 py-2 whitespace-nowrap truncate overflow-hidden">
                    {item.aptNm} {item.buildingDong ? `${item.buildingDong}동 ` : ""}
                    {item.floor}층 / {item.exclusiveArea}㎡
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
    </div>
  );
}
