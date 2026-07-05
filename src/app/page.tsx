"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
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
import { AppHeader, HEADER_ACCENT_BAR, HEADER_BTN, HEADER_NAV_TRAILING, HEADER_TITLE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";
import { AuctionDetailModal } from "@/components/AuctionDetailModal";
import { formatWonShort } from "@/lib/investment-money";
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
  onOpen,
}: {
  item: AuctionItem;
  loanRatio: number | null;
  loanPolicyLabel: string | null;
  onOpen: () => void;
}) {
  const requiredEquity = loanRatio != null ? requiredEquityForMinPrice(item.minPrice, loanRatio) : null;
  const failureRate = getFailureRateRatio(item.minPrice, item.appraisedValue);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left bg-card border border-border rounded-xl shadow-sm px-4 py-3.5 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-foreground text-[15px] flex items-center gap-1.5 min-w-0">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground bg-secondary/60 rounded-sm px-1.5 py-0.5">
            {item.usage || "물건"}
          </span>
          <span className="truncate font-mono">{item.auctionNo}</span>
        </p>
        {failureRate != null && (
          <span className="shrink-0 text-[12px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-1.5 py-0.5">
            유찰 {failureRate}%
          </span>
        )}
      </div>

      <p className="text-[13px] text-muted-foreground mt-1.5 line-clamp-1">{item.address}</p>

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

      <main className="max-w-[560px] mx-auto px-4 py-8 space-y-4">
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
          <div className="space-y-2.5">
            {items.map((item) => (
              <RecommendCard
                key={item.id}
                item={item}
                loanRatio={loanRatio}
                loanPolicyLabel={loanPolicyLabel}
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
