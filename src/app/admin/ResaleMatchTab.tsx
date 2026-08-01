"use client";

import { useCallback, useEffect, useState } from "react";
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

export function ResaleMatchTab() {
  const [items, setItems] = useState<ResaleMatchQaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

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
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h2 className="text-lg font-bold text-foreground">낙찰물건 매도분석 QA</h2>
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
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-secondary/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">사건번호/법원</th>
                <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">주소</th>
                <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">완납일</th>
                <th className="px-3 py-2 font-semibold text-foreground text-right whitespace-nowrap">낙찰가</th>
                <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">실거래(층/면적)</th>
                <th className="px-3 py-2 font-semibold text-foreground text-right whitespace-nowrap">거래금액</th>
                <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">계약일</th>
                <th className="px-3 py-2 font-semibold text-foreground text-right whitespace-nowrap">점수</th>
                <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">등급</th>
                <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">노출</th>
                <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">검토상태</th>
                <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.matchId} className="border-t border-border align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-semibold">{item.auctionNo}</div>
                    <div className="text-muted-foreground">{item.court}</div>
                  </td>
                  <td className="px-3 py-2 max-w-[16rem]">{item.address}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.paymentCompletedAt)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatWon(item.salePrice)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {item.aptNm} {item.floor}층 / {item.exclusiveArea}㎡
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatWon(item.dealAmount)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.contractDate)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">
                    {item.scoreTotal}
                    {item.runnerUpScore != null && (
                      <span className="text-muted-foreground font-normal"> / {item.runnerUpScore}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
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
                  <td className="px-3 py-2 whitespace-nowrap">
                    {item.isDisplayed ? (
                      <span className="text-emerald-700 font-semibold">노출됨</span>
                    ) : (
                      <span className="text-muted-foreground">비노출</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {STATUS_LABELS[item.status]}
                    {item.reviewedBy && (
                      <div className="text-muted-foreground">{item.reviewedBy}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right space-x-2">
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
