"use client";

import { useEffect, useState } from "react";
import { fetchCoachAssignments, updateCoachAssignment, type AuctionAssignment } from "@/lib/api";
import { formatWonShort } from "@/lib/investment-money";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "제출됨" },
  { value: "reviewed", label: "코치 확인됨" },
];

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
                  <span>수익 {formatWonShort(row.finalProfit)}</span>
                  <span>{new Date(row.updatedAt).toLocaleDateString("ko-KR")}</span>
                </div>
              </button>

              {expandedId === row.id && (
                <div className="border-t border-border p-4 space-y-3 text-sm">
                  {row.memo && (
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">메모</span> · {row.memo}
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
