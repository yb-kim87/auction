"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Sparkles, Send, Scale, X } from "lucide-react";
import type { AuctionItem, UserProfile } from "@/types/auction";
import { clearAuthCookie, getLoginRedirect } from "@/lib/auth";
import {
  fetchRecommendations,
  fetchMyProfile,
  fetchFavoriteIds,
  addFavorite,
  removeFavorite,
  logoutUser,
  logUserAction,
  logUserActionsBatch,
  askAi,
  compareAuctions,
  type AuctionCompareRow,
} from "@/lib/api";
import { AppHeader, HEADER_ACCENT_BAR, HEADER_BTN, HEADER_NAV_TRAILING, HEADER_TITLE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";
import { AuctionDetailModal } from "@/components/AuctionDetailModal";
import { parseMoneyToWon, formatWonShort } from "@/lib/investment-money";
import { requiredEquityForMinPrice } from "@/lib/investment-criteria";
import { getFailureRateRatio } from "@/lib/failure-rate";

const fmtEok = (n: number) => {
  if (!n) return "-";
  const abs = Math.abs(n);
  if (abs >= 100000000) return `${(abs / 100000000).toFixed(2)}억`;
  if (abs >= 10000) return `${Math.round(abs / 10000).toLocaleString("ko-KR")}만`;
  return abs.toLocaleString("ko-KR");
};

function RecommendCard({
  item,
  loanRatio,
  loanPolicyLabel,
  selected,
  selectable,
  onToggleSelect,
  onOpen,
}: {
  item: AuctionItem;
  loanRatio: number | null;
  loanPolicyLabel: string | null;
  selected: boolean;
  selectable: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const failureRate = getFailureRateRatio(item.minPrice, item.appraisedValue);
  const requiredEquity = loanRatio != null ? requiredEquityForMinPrice(item.minPrice, loanRatio) : null;

  return (
    <div
      className={`relative bg-card border rounded-sm shadow-sm px-4 py-3.5 transition-colors ${
        selected ? "border-primary ring-1 ring-primary/40" : "border-border"
      }`}
    >
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-center justify-between gap-2 pr-16">
          <p className="font-semibold text-foreground text-[15px] flex items-center gap-1.5 min-w-0">
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground bg-secondary/60 rounded-sm px-1.5 py-0.5">
              {item.usage || "물건"}
            </span>
            <span className="truncate">{item.auctionNo}</span>
          </p>
          {failureRate != null && (
            <span className="shrink-0 text-[12px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-1.5 py-0.5">
              유찰 {failureRate}%
            </span>
          )}
        </div>

        <p className="text-[13px] text-muted-foreground mt-1.5 line-clamp-1">
          {item.address} <span className="text-[11px] text-muted-foreground/70">· {item.area}</span>
        </p>

        {item.specialNote && item.specialNote !== "없음" && (
          <p className="text-[12px] text-red-600 mt-1 line-clamp-1">{item.specialNote}</p>
        )}

        <div className="flex items-center gap-4 mt-2 text-[13px]">
          <span className="text-muted-foreground">
            감정가 <span className="font-mono text-foreground">{fmtEok(item.appraisedValue)}</span>
          </span>
          <span className="text-muted-foreground">
            최저가 <span className="font-mono text-foreground font-semibold">{fmtEok(item.minPrice)}</span>
          </span>
        </div>

        {requiredEquity != null && (
          <p className="mt-2 text-[13px] text-primary bg-primary/5 border border-primary/20 rounded-sm px-2 py-1.5 inline-block">
            필요 자기자금 약 <span className="font-mono font-semibold">{formatWonShort(requiredEquity)}</span>
            {loanPolicyLabel && (
              <span className="text-muted-foreground"> · {loanPolicyLabel} {Math.round(loanRatio! * 100)}% 대출 적용</span>
            )}
          </p>
        )}
      </button>
      {selectable && (
        <label className="absolute top-3 right-3 flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="accent-primary"
          />
          비교
        </label>
      )}
    </div>
  );
}

function AskAiBox({
  onBudgetOverride,
}: {
  onBudgetOverride: (budgetWon: number, rawText: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed) return;
    setError("");
    setAnswer(null);

    // 예산이 명확한 질문은 AI 설명 없이 바로 리스트를 그 조건으로 갱신한다(빠르고 정확, 토큰도 안 씀).
    const budgetWon = parseMoneyToWon(trimmed);
    if (budgetWon != null && budgetWon > 0) {
      onBudgetOverride(budgetWon, trimmed);
      return;
    }

    setLoading(true);
    try {
      const result = await askAi({ question: trimmed });
      setAnswer(result.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "질문 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-sm shadow-sm px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-primary shrink-0" />
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAsk();
          }}
          placeholder="예: 5천만원으로 가능한 물건 찾아줘"
          className="flex-1 min-w-0 bg-transparent text-[14px] focus:outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          onClick={() => void handleAsk()}
          disabled={loading || !question.trim()}
          className="shrink-0 p-1.5 rounded-sm text-primary hover:bg-primary/10 disabled:opacity-40"
          aria-label="질문하기"
        >
          <Send size={16} />
        </button>
      </div>
      {loading && <p className="mt-2 text-[13px] text-muted-foreground">답변을 준비하고 있어요...</p>}
      {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}
      {answer && (
        <p className="mt-2 text-[13px] text-foreground leading-relaxed whitespace-pre-wrap border-t border-border pt-2">
          {answer}
        </p>
      )}
    </div>
  );
}

function CompareModal({
  idA,
  idB,
  onClose,
}: {
  idA: string;
  idB: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    table: { a: AuctionCompareRow; b: AuctionCompareRow };
    ai: { summary: string; betterChoice: string; reasons: string[] } | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    compareAuctions(idA, idB)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "비교에 실패했습니다."))
      .finally(() => setLoading(false));
  }, [idA, idB]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/45" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl bg-card border border-border rounded-sm shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Scale size={16} className="text-primary" />
            물건 비교
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded-sm hover:bg-secondary">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">비교하는 중...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[data.table.a, data.table.b].map((row, i) => (
                <div key={row.id} className="border border-border rounded-sm p-3 space-y-1.5">
                  <p className="font-semibold text-foreground">{i === 0 ? "A" : "B"} · {row.auctionNo}</p>
                  <p className="text-muted-foreground text-[13px] line-clamp-2">{row.address}</p>
                  <p>최저가 <span className="font-mono font-semibold">{fmtEok(row.minPrice)}</span></p>
                  <p>감정가 <span className="font-mono">{fmtEok(row.appraisedValue)}</span></p>
                  {row.naverPrice > 0 && (
                    <p>
                      네이버 호가 <span className="font-mono">{fmtEok(row.naverPrice)}</span>
                      {row.naverPriceFloorLabel ? ` (${row.naverPriceFloorLabel})` : ""}
                    </p>
                  )}
                  <p className="text-muted-foreground text-[13px]">입찰 {row.bidDate}</p>
                </div>
              ))}
            </div>
            {data.ai && (
              <div className="bg-primary/5 border border-primary/20 rounded-sm p-3 text-sm space-y-1.5">
                <p className="font-semibold text-primary">
                  {data.ai.betterChoice === "A" || data.ai.betterChoice === "B"
                    ? `${data.ai.betterChoice} 추천`
                    : "상황에 따라 다름"}
                </p>
                <p>{data.ai.summary}</p>
                <ul className="list-disc list-inside text-muted-foreground">
                  {data.ai.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [budgetFilter, setBudgetFilter] = useState<{ won: number; text: string } | null>(null);
  const [loanRatio, setLoanRatio] = useState<number | null>(null);
  const [loanPolicyLabel, setLoanPolicyLabel] = useState<string | null>(null);

  const isAdmin = profile?.role === "admin";
  const isConsultant = profile?.role === "consultant";

  useEffect(() => {
    fetchMyProfile()
      .then(setProfile)
      .catch(() => {});
    fetchFavoriteIds()
      .then((ids) => setFavoriteIds(new Set(ids)))
      .catch(() => {});
  }, []);

  function loadRecommendations(budget?: string) {
    setLoading(true);
    setLoadError("");
    fetchRecommendations(budget)
      .then((res) => {
        setItems(res.items);
        setLoanRatio(res.loanRatio);
        setLoanPolicyLabel(res.loanPolicyLabel);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "추천 물건을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleBudgetOverride(budgetWon: number, rawText: string) {
    setBudgetFilter({ won: budgetWon, text: rawText });
    loadRecommendations(String(budgetWon));
  }

  function resetBudgetFilter() {
    setBudgetFilter(null);
    loadRecommendations();
  }

  useEffect(() => {
    if (items.length === 0) return;
    const timer = setTimeout(() => {
      logUserActionsBatch(
        items.map((item) => ({ itemId: item.id, actionType: "impression", metadata: { recommended: true } })),
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [items]);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // ignore
    }
    clearAuthCookie();
    router.replace("/login");
  };

  async function handleToggleFavorite(auctionId: string, next: boolean) {
    setFavoriteBusy(true);
    try {
      if (next) {
        await addFavorite(auctionId);
        setFavoriteIds((prev) => new Set([...Array.from(prev), auctionId]));
      } else {
        await removeFavorite(auctionId);
        setFavoriteIds((prev) => {
          const nextSet = new Set(prev);
          nextSet.delete(auctionId);
          return nextSet;
        });
      }
    } finally {
      setFavoriteBusy(false);
    }
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <AppHeader
        maxWidth="960"
        nav={
          <>
            <div className={HEADER_ACCENT_BAR} />
            <span className={HEADER_TITLE}>추천 물건</span>
            <div className={HEADER_NAV_TRAILING}>
              <Link href="/search" className={HEADER_BTN}>
                전체 검색
              </Link>
              {isConsultant && (
                <Link href="/consultant" className={HEADER_BTN}>
                  컨설턴트
                </Link>
              )}
              {isAdmin && (
                <Link href="/admin" className={HEADER_BTN}>
                  관리자
                </Link>
              )}
              <AccountNavLink />
              <button type="button" onClick={handleLogout} className={HEADER_BTN}>
                <LogOut size={16} />
                로그아웃
              </button>
            </div>
          </>
        }
      />

      <main className="max-w-[720px] mx-auto px-4 py-6 space-y-4">
        <AskAiBox onBudgetOverride={handleBudgetOverride} />

        {budgetFilter && (
          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-sm px-3 py-2 text-[13px]">
            <span className="text-primary font-medium">
              &quot;{budgetFilter.text}&quot; 조건으로 다시 추천했어요
            </span>
            <button
              type="button"
              onClick={resetBudgetFilter}
              className="text-muted-foreground hover:text-foreground underline shrink-0 ml-3"
            >
              기본 추천으로
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">추천 물건을 불러오는 중...</div>
        ) : loadError ? (
          <div className="text-center py-16 text-destructive text-sm">{loadError}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm space-y-2">
            <p>아직 추천할 물건이 없습니다.</p>
            <p className="text-[13px]">
              <Link href="/account" className="text-primary hover:underline">
                회원정보
              </Link>
              에서 투자가능자금을 입력하면 추천이 시작됩니다.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => (
              <RecommendCard
                key={item.id}
                item={item}
                loanRatio={loanRatio}
                loanPolicyLabel={loanPolicyLabel}
                selected={compareIds.includes(item.id)}
                selectable={compareIds.includes(item.id) || compareIds.length < 2}
                onToggleSelect={() => toggleCompare(item.id)}
                onOpen={() => {
                  logUserAction({ itemId: item.id, actionType: "click", metadata: { recommended: true } });
                  setSelectedItem(item);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {compareIds.length === 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-full shadow-lg hover:bg-accent transition-colors"
          >
            <Scale size={15} />
            선택한 물건 비교하기
          </button>
        </div>
      )}

      {compareOpen && compareIds.length === 2 && (
        <CompareModal idA={compareIds[0]} idB={compareIds[1]} onClose={() => setCompareOpen(false)} />
      )}

      <AuctionDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        editable={false}
        isFavorite={selectedItem ? favoriteIds.has(selectedItem.id) : false}
        favoriteBusy={favoriteBusy}
        onToggleFavorite={
          selectedItem ? (next) => handleToggleFavorite(selectedItem.id, next) : undefined
        }
        onAiAnalysisClick={(row) =>
          logUserAction({ itemId: row.id, actionType: "ai_analysis_click", metadata: { recommended: true } })
        }
      />
    </div>
  );
}
