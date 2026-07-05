"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Heart, Calendar } from "lucide-react";
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
} from "@/lib/api";
import { AppHeader, HEADER_ACCENT_BAR, HEADER_BTN, HEADER_NAV_TRAILING, HEADER_TAB_ACTIVE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";
import { AuctionDetailModal } from "@/components/AuctionDetailModal";
import { formatWonShort } from "@/lib/investment-money";
import { requiredEquityForMinPrice } from "@/lib/investment-criteria";
import { getFailureRateRatio, getFailureRoundCount } from "@/lib/failure-rate";

const fmtEok = (n: number) => {
  if (!n) return "-";
  const abs = Math.abs(n);
  if (abs >= 100000000) return `${(abs / 100000000).toFixed(2)}억`;
  if (abs >= 10000) return `${Math.round(abs / 10000).toLocaleString("ko-KR")}만`;
  return abs.toLocaleString("ko-KR");
};

function formatAreaLabel(area: string | null | undefined): string {
  const num = Number.parseFloat(String(area ?? "").match(/[\d.]+/)?.[0] ?? "");
  return Number.isFinite(num) && num > 0 ? `${Math.round(num)}㎡` : "-";
}

function RecommendCard({
  item,
  loanRatio,
  loanPolicyLabel,
  isFavorite,
  favoriteBusy,
  onToggleFavorite,
  onOpen,
}: {
  item: AuctionItem;
  loanRatio: number | null;
  loanPolicyLabel: string | null;
  isFavorite: boolean;
  favoriteBusy: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
}) {
  const requiredEquity = loanRatio != null ? requiredEquityForMinPrice(item.minPrice, loanRatio) : null;
  const failureRate = getFailureRateRatio(item.minPrice, item.appraisedValue);
  const failureCount = getFailureRoundCount(item.minPrice, item.appraisedValue, item.city);
  const isNew = failureRate === 100;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden hover:border-primary/40 transition-colors">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="px-4 pt-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground bg-secondary/60 rounded-sm px-1.5 py-0.5">
              {item.usage || "물건"}
            </span>
            {isNew ? (
              <span className="shrink-0 text-[11px] font-semibold text-primary bg-primary/10 rounded-sm px-1.5 py-0.5">
                신건
              </span>
            ) : failureRate != null ? (
              <span className="shrink-0 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-1.5 py-0.5">
                유찰 {failureCount}회 · {failureRate}%
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            disabled={favoriteBusy}
            aria-label={isFavorite ? "관심물건 해제" : "관심물건 추가"}
            className="shrink-0 p-1 rounded-full hover:bg-secondary/60 disabled:opacity-50"
          >
            <Heart size={16} className={isFavorite ? "fill-rose-500 text-rose-500" : "text-muted-foreground"} />
          </button>
        </div>

        <div className="px-4 mt-1 flex items-center justify-between gap-2">
          <p className="text-[12px] text-muted-foreground font-mono">{item.auctionNo}</p>
          {item.specialNote && item.specialNote !== "없음" && (
            <p className="shrink-0 text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-sm px-1.5 py-0.5 truncate max-w-[55%]">
              {item.specialNote}
            </p>
          )}
        </div>

        <div className="px-4 mt-2">
          <p className="font-semibold text-foreground text-[15px] truncate">{item.address}</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground flex items-center gap-3 flex-wrap">
            <span>{formatAreaLabel(item.area)}</span>
            <span className="inline-flex items-center gap-1">
              <Calendar size={11} />
              {item.bidDate || "-"}
            </span>
          </p>
        </div>

        {requiredEquity != null && (
          <div className="mx-4 mt-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">최소 투자금</p>
            <p className="mt-0.5 text-[19px] font-bold text-primary font-mono">
              {formatWonShort(requiredEquity)}
            </p>
            <p className="mt-1 text-[11.5px] text-muted-foreground leading-relaxed">
              최저입찰가 {fmtEok(item.minPrice)}
              {loanRatio != null && <> ~ 예상대출 {fmtEok(Math.round(item.minPrice * loanRatio))}</>}
              {loanPolicyLabel && <> ({loanPolicyLabel} {Math.round(loanRatio! * 100)}%)</>}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-px mt-3 bg-border">
          <div className="bg-card px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground">최저입찰가</p>
            <p className="mt-0.5 text-[15px] font-semibold font-mono text-foreground">{fmtEok(item.minPrice)}</p>
          </div>
          <div className="bg-card px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground">감정가</p>
            <p className="mt-0.5 text-[15px] font-semibold font-mono text-foreground">{fmtEok(item.appraisedValue)}</p>
          </div>
        </div>
      </button>
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

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <AppHeader
        maxWidth="1400"
        nav={
          <>
            <div className={HEADER_ACCENT_BAR} />
            <span className={HEADER_TAB_ACTIVE}>추천 물건</span>
            <Link href="/search" className={HEADER_BTN}>
              전체 검색
            </Link>
            {isConsultant && (
              <Link href="/consultant" className={HEADER_BTN}>
                컨설턴트
              </Link>
            )}
            <div className={HEADER_NAV_TRAILING}>
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

      <main className="max-w-[1400px] mx-auto px-4 py-8 space-y-4">
        <h1 className="text-[19px] font-semibold text-foreground">오늘의 추천</h1>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {items.map((item) => (
              <RecommendCard
                key={item.id}
                item={item}
                loanRatio={loanRatio}
                loanPolicyLabel={loanPolicyLabel}
                isFavorite={favoriteIds.has(item.id)}
                favoriteBusy={favoriteBusy}
                onToggleFavorite={() => handleToggleFavorite(item.id, !favoriteIds.has(item.id))}
                onOpen={() => {
                  logUserAction({ itemId: item.id, actionType: "click", metadata: { recommended: true } });
                  setSelectedItem(item);
                }}
              />
            ))}
          </div>
        )}
      </main>

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
