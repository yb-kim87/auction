"use client";

import { useEffect, useState } from "react";
import { fetchAuctionsByIds, fetchCoachAssignments, type AuctionAssignment } from "@/lib/api";
import type { AuctionItem } from "@/types/auction";
import { formatWonShort } from "@/lib/investment-money";
import { AuctionDetailModal } from "@/components/AuctionDetailModal";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "제출됨" },
  { value: "reviewed", label: "코치 확인됨" },
];

/** 코치(관리자)가 수강생이 제출한 과제(물건 상세의 "과제제출" 버튼으로
 * 제출한 내용)를 전체 조회하는 탭. 목록의 행을 누르면 실제 물건
 * 상세(입찰계획 탭)로 이동해 그 수강생이 제출한 정보를 그대로 보여준다
 * (사용자 요청, 2026-08-07: "과제 물건번호를 누르면 입찰계획으로
 * 넘어가고 거기에 수강생이 과제로 제출한 정보가 보이게 하는건
 * 어떨까? 관리자는 해당 물건에 과제로 제출한 수강생 이력을 누르면
 * 그 정보로 보이게 하는거지"). */
export function AssignmentReviewTab() {
  const [rows, setRows] = useState<AuctionAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ item: AuctionItem; username: string } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

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

  async function openRow(row: AuctionAssignment) {
    setOpeningId(row.id);
    setError("");
    try {
      const items = await fetchAuctionsByIds([row.auctionId]);
      const item = items[0];
      if (!item) {
        setError("물건 정보를 찾을 수 없습니다(삭제된 물건일 수 있습니다).");
        return;
      }
      setSelected({ item, username: row.username });
    } catch (err) {
      setError(err instanceof Error ? err.message : "물건 정보를 불러오지 못했습니다.");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">과제 검토</h2>
          <p className="text-sm text-muted-foreground mt-1">
            수강생이 물건 상세에서 제출한 과제 목록입니다. 행을 누르면 그 물건의 입찰계획 화면으로 이동해 제출
            내용을 확인하고 피드백을 남길 수 있습니다.
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
        <div className="overflow-hidden rounded-sm border border-border bg-card">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => void openRow(row)}
              disabled={openingId === row.id}
              className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left border-b border-border last:border-b-0 hover:bg-secondary/25 transition-colors disabled:opacity-60"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-primary">{row.username}</span>
                  <span className="text-xs font-semibold underline decoration-dotted">
                    {openingId === row.id ? "여는 중..." : row.auctionNo || "사건번호 없음"}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-sm border ${
                      row.status === "reviewed"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    {STATUS_OPTIONS.find((s) => s.value === row.status)?.label ?? row.status}
                  </span>
                  {row.coachFeedback && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-sm border border-primary/20 bg-primary/[0.06] text-primary">
                      피드백 있음
                    </span>
                  )}
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
          ))}
        </div>
      )}

      <AuctionDetailModal
        item={selected?.item ?? null}
        onClose={() => setSelected(null)}
        editable={false}
        isAdmin
        initialTab="profit"
        coachViewUsername={selected?.username ?? null}
      />
    </div>
  );
}
