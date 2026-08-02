"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, LogOut, MapPin } from "lucide-react";
import type { AuctionItem, UserProfile } from "@/types/auction";
import { clearAuthCookie } from "@/lib/auth";
import {
  fetchAuctionsByIds,
  fetchFavorites,
  addFavorite,
  removeFavorite,
  fetchMyProfile,
  logoutUser,
  type FavoriteItem,
} from "@/lib/api";
import { AuctionDetailModal } from "@/components/AuctionDetailModal";
import { CaseStateBadge } from "@/components/CaseStateBadge";
import { UpdatedBadge } from "@/components/UpdatedBadge";
import { formatWonShort } from "@/lib/investment-money";
import { AppHeader, HEADER_BTN, HEADER_NAV_TRAILING, HEADER_TAB_ACTIVE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";

const UNCATEGORIZED = "미분류";

export default function FavoritesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

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
    fetchFavorites()
      .then((favs) => {
        if (cancelled) return Promise.resolve([] as AuctionItem[]);
        setFavorites(favs);
        return fetchAuctionsByIds(favs.map((f) => f.auctionId));
      })
      .then((auctions) => {
        if (!cancelled) setItems(auctions);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setFavorites([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
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

  async function handleToggleFavorite(auctionId: string, next: boolean, category?: string | null) {
    setFavoriteBusy(true);
    try {
      if (next) {
        await addFavorite(auctionId, category);
        setFavorites((prev) => {
          const withoutExisting = prev.filter((f) => f.auctionId !== auctionId);
          return [...withoutExisting, { auctionId, category: category?.trim() || null }];
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
            <span className={HEADER_TAB_ACTIVE}>관심물건</span>
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
        <div className="flex items-center gap-2">
          <Heart size={18} className="text-primary" />
          <h1 className="text-lg font-bold text-foreground">관심물건</h1>
          <span className="text-sm text-muted-foreground">({favorites.length}건)</span>
        </div>

        {loading ? (
          <div className="rounded-sm border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
            불러오는 중...
          </div>
        ) : favorites.length === 0 ? (
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
                  </button>
                );
              })}
            </div>
          </>
        )}
      </main>

      <AuctionDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        editable={false}
        isAdmin={isAdmin}
        isFavorite={selectedItem ? favoriteIds.has(selectedItem.id) : false}
        favoriteBusy={favoriteBusy}
        onToggleFavorite={
          selectedItem
            ? (next, category) => handleToggleFavorite(selectedItem.id, next, category)
            : undefined
        }
      />
    </div>
  );
}
