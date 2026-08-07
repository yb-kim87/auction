"use client";

import { useEffect, useState } from "react";
import {
  fetchCoachAssignments,
  fetchCoachBidPlan,
  updateCoachAssignment,
  type AuctionAssignment,
  type BidPlan,
} from "@/lib/api";
import { formatWonShort } from "@/lib/investment-money";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "제출됨" },
  { value: "reviewed", label: "코치 확인됨" },
];

/** 입찰계획 inputsJson의 계산기 전체 입력값 라벨 — ProfitCalculatorPanel.tsx
 * handleSaveBidPlan()이 저장하는 키와 1:1 대응(사용자 요청, 2026-08-07:
 * "제출된 과제는 관리자(코치)한테는 어떻게 보여? 입찰계획까지 보이나??
 * 지금은 안보이는거 같아서"). */
const BID_PLAN_INPUT_LABELS: { key: string; label: string; unit?: string; percent?: boolean }[] = [
  { key: "holdingMonths", label: "보유기간", unit: "개월" },
  // loanRatioByAppraisal/loanRatioByBidPrice/loanInterestRate/
  // earlyRepaymentFeeRate는 ProfitCalculatorPanel의 NumberField(suffix="%")
  // 입력값을 그대로 저장한 것이라 이미 70·4.5 같은 %단위 숫자다(0~1
  // 소수가 아님) — *100 하면 안 된다(2026-08-07, 실측 확인: 저장된
  // 80이 "8000.0%"로 잘못 표시되는 걸 발견해 수정).
  { key: "loanRatioByAppraisal", label: "감정가 기준 대출비율", unit: "%" },
  { key: "loanRatioByBidPrice", label: "낙찰가 기준 대출비율", unit: "%" },
  { key: "loanInterestRate", label: "대출 연이자율", unit: "%" },
  { key: "earlyRepaymentFeeRate", label: "중도상환수수료율", unit: "%" },
  { key: "interiorCost", label: "인테리어 비용", unit: "원" },
  { key: "evictionCost", label: "명도비", unit: "원" },
  { key: "unpaidMaintenanceFee", label: "미납관리비", unit: "원" },
  { key: "extraRealtyFee", label: "부동산 추가수수료", unit: "원" },
  { key: "vatAmount", label: "부가세", unit: "원" },
  { key: "existingIncome", label: "기존소득(연간)", unit: "원" },
];

function BidPlanDetail({ plan, loading }: { plan: BidPlan | null; loading: boolean }) {
  if (loading) return <p className="text-xs text-muted-foreground">입찰계획을 불러오는 중...</p>;
  if (!plan) return <p className="text-xs text-muted-foreground">저장된 입찰계획이 없습니다.</p>;

  let inputs: Record<string, unknown> = {};
  try {
    inputs = JSON.parse(plan.inputsJson || "{}");
  } catch {
    inputs = {};
  }

  return (
    <div className="rounded-sm border border-primary/20 bg-primary/[0.03] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary">입찰계획 상세</p>
        <span className="text-[10px] text-muted-foreground">
          {new Date(plan.updatedAt).toLocaleString("ko-KR")} 저장
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div className="flex justify-between">
          <span className="text-muted-foreground">낙찰가(입찰가)</span>
          <span className="font-medium">{formatWonShort(plan.bidPrice)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">매도가</span>
          <span className="font-medium">{formatWonShort(plan.salePrice)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">투입자금</span>
          <span className="font-medium">{plan.requiredEquity != null ? formatWonShort(plan.requiredEquity) : "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">최종수익</span>
          <span className="font-medium">{plan.finalProfit != null ? formatWonShort(plan.finalProfit) : "-"}</span>
        </div>
        {BID_PLAN_INPUT_LABELS.map(({ key, label, unit, percent }) => {
          const raw = inputs[key];
          if (typeof raw !== "number") return null;
          const value = percent ? `${(raw * 100).toFixed(1)}%` : `${raw.toLocaleString("ko-KR")}${unit ?? ""}`;
          return (
            <div key={key} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          );
        })}
      </div>
      {plan.memo && (
        <p className="text-xs text-muted-foreground border-t border-border pt-2">
          <span className="font-semibold text-foreground">입찰계획 메모</span> · {plan.memo}
        </p>
      )}
    </div>
  );
}

/** 코치(관리자)가 수강생이 제출한 과제(물건 상세의 "과제제출" 버튼으로
 * 제출한 내용)를 전체 조회하고 피드백을 남기는 탭(사용자 요청,
 * 2026-08-07: "코치(관리자는) 해당 제출된 내용을 볼 수 있으면
 * 좋겠어"). */
export function AssignmentReviewTab() {
  const [rows, setRows] = useState<AuctionAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [bidPlan, setBidPlan] = useState<BidPlan | null>(null);
  const [bidPlanLoading, setBidPlanLoading] = useState(false);

  function load() {
    setLoading(true);
    fetchCoachAssignments()
      .then((data) => {
        setRows(data);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "과제 목록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function toggleExpand(row: AuctionAssignment) {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    setFeedbackDraft(row.coachFeedback ?? "");
    setBidPlan(null);
    setBidPlanLoading(true);
    fetchCoachBidPlan(row.username, row.auctionId)
      .then(setBidPlan)
      .catch(() => setBidPlan(null))
      .finally(() => setBidPlanLoading(false));
  }

  async function handleSaveFeedback(row: AuctionAssignment, status?: string) {
    setSaving(true);
    try {
      const saved = await updateCoachAssignment(row.id, {
        coachFeedback: feedbackDraft,
        status: status ?? row.status,
      });
      setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "피드백 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">과제 검토</h2>
          <p className="text-sm text-muted-foreground mt-1">
            수강생이 물건 상세에서 제출한 과제(입찰계획 + 전화시세·안전마진 조사)를 확인하고 피드백을 남깁니다.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-3 py-2 text-sm border border-border rounded-sm hover:bg-secondary/40"
        >
          새로고침
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <div className="rounded-sm border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
          제출된 과제가 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-sm border border-border bg-card">
              <button
                type="button"
                onClick={() => toggleExpand(row)}
                className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-primary">{row.username}</span>
                    <span className="text-xs font-semibold">{row.auctionNo || "사건번호 없음"}</span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-sm border ${
                        row.status === "reviewed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {STATUS_OPTIONS.find((s) => s.value === row.status)?.label ?? row.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{row.address || "주소 정보 없음"}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                  <span>입찰가 {formatWonShort(row.targetBidPrice)}</span>
                  <span>매도가 {formatWonShort(row.finalMarketPrice)}</span>
                  <span>투입자금 {formatWonShort(row.requiredEquity)}</span>
                  <span>수익 {formatWonShort(row.finalProfit)}</span>
                  <span>{new Date(row.updatedAt).toLocaleDateString("ko-KR")}</span>
                </div>
              </button>

              {expandedId === row.id && (
                <div className="border-t border-border p-4 space-y-3 text-sm">
                  <BidPlanDetail plan={bidPlan} loading={bidPlanLoading} />

                  {row.memo && (
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">과제 메모</span> · {row.memo}
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-sm border border-border p-3">
                      <p className="text-xs font-semibold text-foreground mb-1.5">전화 시세 결과</p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        <li>매수자 · {row.phoneBuyer || "-"}</li>
                        <li>매도자 · {row.phoneSeller || "-"}</li>
                        <li>입찰자 · {row.phoneBidder || "-"}</li>
                        <li>최종 시세 · {row.phoneFinal || "-"}</li>
                      </ul>
                    </div>
                    <div className="rounded-sm border border-border p-3">
                      <p className="text-xs font-semibold text-foreground mb-1.5">주변 안전마진 조사</p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        <li>조사 1 · {row.safetyResearch1 || "-"}</li>
                        <li>조사 2 · {row.safetyResearch2 || "-"}</li>
                        <li>조사 3 · {row.safetyResearch3 || "-"}</li>
                        <li>최종 안전마진 · {row.finalSafetyMargin || "-"}</li>
                      </ul>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground">코치 피드백</p>
                    <textarea
                      rows={3}
                      value={feedbackDraft}
                      onChange={(e) => setFeedbackDraft(e.target.value)}
                      placeholder="이 과제에 대한 피드백을 남겨 주세요."
                      className="w-full px-3 py-2 text-xs border border-border rounded-sm bg-secondary/10 resize-y"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveFeedback(row)}
                        disabled={saving}
                        className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
                      >
                        {saving ? "저장 중..." : "피드백 저장"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveFeedback(row, row.status === "reviewed" ? "draft" : "reviewed")}
                        disabled={saving}
                        className="px-3 py-1.5 text-xs font-semibold rounded-sm border border-border disabled:opacity-50"
                      >
                        {row.status === "reviewed" ? "확인 취소" : "확인 완료로 표시"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
