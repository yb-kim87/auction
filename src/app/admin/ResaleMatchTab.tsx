"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchResaleMatches,
  fetchResaleSoldStats,
  reviewResaleMatch,
  runResaleMatchNow,
  type ResaleMatchQaItem,
  type ResaleSoldStats,
} from "@/lib/api";
import { CITIES, getDistricts } from "@/data/korea-regions";
import { PROPERTY_TYPE_OPTIONS } from "@/data/property-type-options";

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

function SoldFilterStatsPanel() {
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [propTypes, setPropTypes] = useState<string[]>([]);
  const [stats, setStats] = useState<ResaleSoldStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const districts = city ? getDistricts(city) : [];

  function toggleProp(type: string) {
    setPropTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  async function handleSearch() {
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const result = await fetchResaleSoldStats({
        city: city ? [city] : undefined,
        district: district ? [district] : undefined,
        propType: propTypes.length > 0 ? propTypes : undefined,
      });
      setStats(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        지역/물건종류 필터를 물건작업 필터와 동일하게 적용하되, 대상을 "진행 중" 물건이 아니라
        <b> 이미 낙찰된(salePrice 확정) 물건</b>으로 바꿔서, 그 필터에 걸리는 주소들이 실제로
        매도분석상 매도로 얼마나 연결됐는지 확인합니다.
      </p>

      <div className="flex flex-wrap items-end gap-3 p-4 border border-border rounded-sm bg-secondary/10">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">시/도</label>
          <select
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setDistrict("");
            }}
            className="px-2 py-1.5 text-sm border border-border rounded-sm bg-card min-w-[9rem]"
          >
            <option value="">전체</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">구/군</label>
          <select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            disabled={!city}
            className="px-2 py-1.5 text-sm border border-border rounded-sm bg-card disabled:opacity-50 min-w-[9rem]"
          >
            <option value="">전체</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[16rem]">
          <label className="block text-xs font-medium text-muted-foreground mb-1">물건종류</label>
          <div className="flex flex-wrap gap-1.5">
            {PROPERTY_TYPE_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleProp(t)}
                className={`px-2.5 py-1 text-xs rounded-sm border ${
                  propTypes.includes(t)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={loading}
          className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {loading ? "조회 중..." : "조회"}
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {stats && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 border border-border rounded-sm bg-card">
              <p className="text-xs text-muted-foreground">필터 조건 낙찰 물건</p>
              <p className="text-2xl font-bold text-foreground mt-1">{stats.total}건</p>
            </div>
            <div className="p-4 border border-border rounded-sm bg-card">
              <p className="text-xs text-muted-foreground">QA 후보 있음(55점+)</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {stats.withCandidate}건
                <span className="text-sm font-normal text-muted-foreground ml-1.5">
                  ({stats.total > 0 ? Math.round((stats.withCandidate / stats.total) * 100) : 0}%)
                </span>
              </p>
            </div>
            <div className="p-4 border border-border rounded-sm bg-card">
              <p className="text-xs text-muted-foreground">매도 확정 표시(70점+)</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">
                {stats.displayed}건
                <span className="text-sm font-normal text-muted-foreground ml-1.5">
                  ({stats.total > 0 ? Math.round((stats.displayed / stats.total) * 100) : 0}%)
                </span>
              </p>
            </div>
          </div>

          <div className="border border-border rounded-sm overflow-x-auto">
            {stats.items.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">조건에 맞는 낙찰 물건이 없습니다.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-secondary/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">사건번호/법원</th>
                    <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">주소</th>
                    <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">용도</th>
                    <th className="px-3 py-2 font-semibold text-foreground text-right whitespace-nowrap">낙찰가</th>
                    <th className="px-3 py-2 font-semibold text-foreground text-right whitespace-nowrap">점수</th>
                    <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">등급</th>
                    <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">노출</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.items.map((item) => (
                    <tr key={item.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="font-semibold">{item.auctionNo}</div>
                        <div className="text-muted-foreground">{item.court}</div>
                      </td>
                      <td className="px-3 py-2 max-w-[16rem]">{item.address}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{item.usage}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{formatWon(item.salePrice)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">
                        {item.candidateScore ?? "-"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {item.candidateTier ? (
                          <span
                            className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-sm border ${
                              TIER_STYLES[item.candidateTier as ResaleMatchQaItem["confidenceTier"]] ??
                              TIER_STYLES.LOW
                            }`}
                          >
                            {item.candidateTier}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">후보 없음</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {item.displayed ? (
                          <span className="text-emerald-700 font-semibold">노출됨</span>
                        ) : (
                          <span className="text-muted-foreground">비노출</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {!stats && !loading && searched === false && (
        <p className="text-sm text-muted-foreground">필터를 선택하고 조회 버튼을 눌러주세요.</p>
      )}
    </div>
  );
}

export function ResaleMatchTab() {
  const [subTab, setSubTab] = useState<"qa" | "soldStats">("qa");
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
        <h2 className="text-lg font-bold text-foreground">낙찰물건 매도분석</h2>
        <p className="text-sm text-muted-foreground mt-1">
          매각대금완납일 이후 국토부 실거래가와 대조해, 낙찰받은 그 물건이 실제로 되팔렸을
          가능성이 있는 사례를 모아 보여줍니다. 55점(MEDIUM) 이상만 표시하며, 70점 이상이면서
          1·2위 점수차가 8점 이상 벌어진 경우에만 사용자 화면 노출 대상(표시됨)입니다. 나머지는
          참고용이니 검토 후 승인/반려해 주세요.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setSubTab("qa")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
            subTab === "qa"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          QA 목록
        </button>
        <button
          type="button"
          onClick={() => setSubTab("soldStats")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
            subTab === "soldStats"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          필터별 매도 통계
        </button>
      </div>

      {subTab === "soldStats" ? (
        <SoldFilterStatsPanel />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
