"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, FileText, Heart, LogOut, MapPin, Target } from "lucide-react";
import type { AuctionItem, UserProfile } from "@/types/auction";
import { clearAuthCookie } from "@/lib/auth";
import {
  fetchAuctionsByIds,
  fetchFavorites,
  addFavorite,
  removeFavorite,
  fetchMyProfile,
  logoutUser,
  fetchMyBidPlans,
  type FavoriteItem,
  type BidPlanWithAuction,
} from "@/lib/api";
import { AuctionDetailModal } from "@/components/AuctionDetailModal";
import { CaseStateBadge } from "@/components/CaseStateBadge";
import { UpdatedBadge } from "@/components/UpdatedBadge";
import { formatWonShort } from "@/lib/investment-money";
import { AppHeader, HEADER_BTN, HEADER_NAV_TRAILING, HEADER_TAB_ACTIVE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";

const UNCATEGORIZED = "미분류";

function PlanMetric({
  label,
  value,
  primary = false,
  positive,
}: {
  label: string;
  value: string;
  primary?: boolean;
  positive?: boolean;
}) {
  const valueClass = primary
    ? "text-primary"
    : positive === true
      ? "text-blue-600"
      : positive === false
        ? "text-red-500"
        : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 lg:block lg:text-right">
      <span className="text-[0.66rem] text-muted-foreground lg:hidden">{label}</span>
      <span className={`text-sm font-bold ${valueClass}`} style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>{value}</span>
    </div>
  );
}

export default function FavoritesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [bidPlans, setBidPlans] = useState<BidPlanWithAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"favorites" | "plans">("favorites");

  const isAdmin = profile?.role === "admin";
  const isConsultant = profile?.role === "consultant";

  useEffect(() => {
    fetchMyProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // 관심물건은 몇 건 안 되는 경우가 대부분이라, 물건 전체 목록을 다
    // 받아올 필요 없이 즐겨찾기 id만 먼저 확인한 뒤 그 물건들만 조회한다
    // (사용자 피드백: "불러오는 속도가 너무 느린데??", 2026-08-02).
    //
    // favorites/bidPlans를 각각 독립적으로 처리한다 — 예전에는 Promise.all
    // 로 묶어 공용 .catch에서 실패 시 favorites까지 통째로 []로 리셋했는데,
    // 그러면 관심물건 조회 자체는 성공했는데도 입찰계획 쪽 API가 실패하면
    // "내 물건" 화면에 관심물건이 0개로 잘못 표시되는 버그가 있었다(사용자
    // 리포트, 2026-08-04: "관심물건이 7개나 있는데 내물건에는 1개도 안나옴").
    let favs: FavoriteItem[] = [];
    let plans: BidPlanWithAuction[] = [];

    Promise.allSettled([fetchFavorites(), fetchMyBidPlans()]).then((results) => {
      if (cancelled) return;
      const [favResult, planResult] = results;
      favs = favResult.status === "fulfilled" ? favResult.value : [];
      plans = planResult.status === "fulfilled" ? planResult.value : [];
      setFavorites(favs);
      setBidPlans(plans);

      const ids = Array.from(new Set([
        ...favs.map((f) => f.auctionId),
        ...plans.map((plan) => plan.auctionId),
      ]));
      fetchAuctionsByIds(ids)
        .then((auctions) => {
          if (!cancelled) setItems(auctions);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // ignore
    }
    clearAuthCookie();
    router.replace("/login");
  };

  async function handleToggleFavorite(auctionId: string, next: boolean, category?: string | null, memo?: string | null) {
    setFavoriteBusy(true);
    try {
      if (next) {
        await addFavorite(auctionId, category, memo);
        setFavorites((prev) => {
          const withoutExisting = prev.filter((f) => f.auctionId !== auctionId);
          return [...withoutExisting, { auctionId, category: category?.trim() || null, memo: memo?.trim() || null }];
        });
      } else {
        await removeFavorite(auctionId);
        setFavorites((prev) => prev.filter((f) => f.auctionId !== auctionId));
      }
    } finally {
      setFavoriteBusy(false);
    }
  }

  const itemById = useMemo(() => {
    const map = new Map<string, AuctionItem>();
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.auctionId)), [favorites]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, AuctionItem[]>();
    for (const fav of favorites) {
      const item = itemById.get(fav.auctionId);
      if (!item) continue;
      const key = fav.category?.trim() || UNCATEGORIZED;
      const list = byCategory.get(key) ?? [];
      list.push(item);
      byCategory.set(key, list);
    }
    const categories = Array.from(byCategory.keys()).sort((a, b) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b, "ko");
    });
    return { byCategory, categories };
  }, [favorites, itemById]);

  const visibleItems = useMemo(() => {
    if (!activeCategory) {
      // 전체 보기: 카테고리 순서대로 이어붙이되 중복 없이(하나의 물건이 한
      // 카테고리에만 속하므로 자연히 중복이 없다).
      return groups.categories.flatMap((c) => groups.byCategory.get(c) ?? []);
    }
    return groups.byCategory.get(activeCategory) ?? [];
  }, [activeCategory, groups]);

  return (
    <div className="min-h-screen bg-secondary/30">
      <AppHeader
        maxWidth="1400"
        nav={
          <>
            <Link href="/" className={HEADER_BTN}>
              추천 물건
            </Link>
            <Link href="/search" className={HEADER_BTN}>
              전체 검색
            </Link>
            {isConsultant && (
              <Link href="/consultant" className={HEADER_BTN}>
                컨설턴트
              </Link>
            )}
            <Link href="/courses" className={HEADER_BTN}>
              강의실
            </Link>
            <span className={HEADER_TAB_ACTIVE}>내 물건</span>
            <div className={HEADER_NAV_TRAILING}>
              {isAdmin && (
                <Link href="/admin" className={HEADER_BTN}>
                  관리자
                </Link>
              )}
              <AccountNavLink name={profile?.name} />
              <button type="button" onClick={handleLogout} className={HEADER_BTN}>
                <LogOut size={16} />
                로그아웃
              </button>
            </div>
          </>
        }
      />

      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-primary" />
            <div>
              <h1 className="text-lg font-bold text-foreground">내 물건</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">관심 후보와 저장한 입찰 계획을 한곳에서 관리합니다.</p>
            </div>
          </div>
          <div className="inline-flex rounded-xl border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setActiveTab("favorites")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${activeTab === "favorites" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              <Heart size={14} /> 관심물건 <span className="opacity-75">{favorites.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("plans")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${activeTab === "plans" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              <FileText size={14} /> 입찰계획 <span className="opacity-75">{bidPlans.length}</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-sm border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
            불러오는 중...
          </div>
        ) : activeTab === "favorites" ? (
          favorites.length === 0 ? (
          <div className="rounded-sm border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
            아직 등록한 관심물건이 없습니다. 물건 상세에서 "관심등록"을 눌러 추가해 보세요.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  activeCategory === null
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-secondary/60"
                }`}
              >
                전체 ({favorites.length})
              </button>
              {groups.categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    activeCategory === c
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-secondary/60"
                  }`}
                >
                  {c} ({groups.byCategory.get(c)?.length ?? 0})
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleItems.map((item) => {
                const fav = favorites.find((f) => f.auctionId === item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className="text-left rounded-xl border border-border bg-card p-4 hover:shadow-md hover:border-primary/40 transition-all"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded-md text-[0.65rem] font-bold bg-secondary text-muted-foreground">
                        {item.propType}
                      </span>
                      <CaseStateBadge caseState={item.caseState} />
                      {item.isUpdated && <UpdatedBadge />}
                      {fav?.category && (
                        <span className="ml-auto px-1.5 py-0.5 rounded-md text-[0.65rem] font-medium bg-primary/10 text-primary">
                          {fav.category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-start gap-1.5 mb-2">
                      <MapPin size={13} className="text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-[0.82rem] font-medium text-foreground line-clamp-2">
                        {item.address}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-[0.78rem]">
                      <span className="text-muted-foreground">최저가</span>
                      <span className="font-semibold text-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>
                        {formatWonShort(item.minPrice)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[0.78rem]">
                      <span className="text-muted-foreground">입찰기일</span>
                      <span className="text-foreground">{item.bidDate || "-"}</span>
                    </div>
                    {fav?.memo && (
                      <p className="mt-1.5 pt-1.5 border-t border-border/70 text-[0.72rem] text-muted-foreground line-clamp-2">
                        메모 · {fav.memo}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </>
          )
        ) : bidPlans.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
            <FileText size={28} className="mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm font-semibold text-foreground">저장한 입찰 계획이 없습니다.</p>
            <p className="mt-1 text-xs text-muted-foreground">물건 상세의 수익계산기에서 입찰가와 매도가를 설정한 후 계획을 저장해 보세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-[0.68rem] text-muted-foreground">저장된 계획</p>
                <p className="mt-1 text-lg font-bold text-foreground">{bidPlans.length}건</p>
              </div>
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-[0.68rem] text-muted-foreground">총 계획 입찰가</p>
                <p className="mt-1 text-lg font-bold text-foreground">{formatWonShort(bidPlans.reduce((sum, plan) => sum + plan.bidPrice, 0))}</p>
              </div>
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-[0.68rem] text-muted-foreground">총 필요 투자금</p>
                <p className="mt-1 text-lg font-bold text-primary">{formatWonShort(bidPlans.reduce((sum, plan) => sum + (plan.requiredEquity ?? 0), 0))}</p>
              </div>
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-[0.68rem] text-muted-foreground">총 예상수익</p>
                <p className={`mt-1 text-lg font-bold ${bidPlans.reduce((sum, plan) => sum + (plan.finalProfit ?? 0), 0) >= 0 ? "text-blue-600" : "text-red-500"}`}>
                  {formatWonShort(bidPlans.reduce((sum, plan) => sum + (plan.finalProfit ?? 0), 0))}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="hidden grid-cols-[minmax(15rem,1.5fr)_7rem_7rem_7rem_7rem_6rem] gap-3 border-b border-border bg-secondary/40 px-4 py-2.5 text-[0.68rem] font-semibold text-muted-foreground lg:grid">
                <span>물건</span><span className="text-right">계획 입찰가</span><span className="text-right">예상 매도가</span><span className="text-right">투입자금</span><span className="text-right">예상수익</span><span className="text-right">수익률</span>
              </div>
              {bidPlans.map((plan) => {
                const item = itemById.get(plan.auctionId);
                const auction = item ?? plan.auction;
                const profitRate = plan.requiredEquity && plan.requiredEquity > 0 && plan.finalProfit != null
                  ? (plan.finalProfit / plan.requiredEquity) * 100
                  : null;
                const hasFavorite = favoriteIds.has(plan.auctionId);
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => item && setSelectedItem(item)}
                    disabled={!item}
                    className="grid w-full gap-3 border-b border-border/70 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-secondary/25 disabled:cursor-default lg:grid-cols-[minmax(15rem,1.5fr)_7rem_7rem_7rem_7rem_6rem] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[0.68rem] font-semibold text-primary">{auction?.auctionNo ?? "삭제된 물건"}</span>
                        {hasFavorite && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-rose-600">관심물건</span>}
                        {item && <CaseStateBadge caseState={item.caseState} />}
                      </div>
                      <p className="mt-1 truncate text-[0.82rem] font-semibold text-foreground">{auction?.address ?? "물건 정보를 찾을 수 없습니다."}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Calendar size={11} />{auction?.bidDate || "입찰일 미정"}</span>
                        <span>{new Date(plan.updatedAt).toLocaleDateString("ko-KR")} 저장</span>
                      </div>
                      {plan.memo && <p className="mt-1.5 truncate text-[0.68rem] text-muted-foreground">메모 · {plan.memo}</p>}
                    </div>
                    <PlanMetric label="계획 입찰가" value={formatWonShort(plan.bidPrice)} />
                    <PlanMetric label="예상 매도가" value={formatWonShort(plan.salePrice)} />
                    <PlanMetric label="투입자금" value={plan.requiredEquity != null ? formatWonShort(plan.requiredEquity) : "-"} primary />
                    <PlanMetric label="예상수익" value={plan.finalProfit != null ? formatWonShort(plan.finalProfit) : "-"} positive={plan.finalProfit != null ? plan.finalProfit >= 0 : undefined} />
                    <PlanMetric label="수익률" value={profitRate != null ? `${profitRate.toFixed(1)}%` : "-"} positive={profitRate != null ? profitRate >= 0 : undefined} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <AuctionDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        editable={false}
        isAdmin={isAdmin}
        isFavorite={selectedItem ? favoriteIds.has(selectedItem.id) : false}
        favoriteBusy={favoriteBusy}
        favoriteMemo={selectedItem ? favorites.find((f) => f.auctionId === selectedItem.id)?.memo ?? null : null}
        onToggleFavorite={
          selectedItem
            ? (next, category, memo) => handleToggleFavorite(selectedItem.id, next, category, memo)
            : undefined
        }
      />
    </div>
  );
}
