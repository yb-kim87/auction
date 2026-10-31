"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addFavorite, fetchAuctionsByIds, fetchFavorites, removeFavorite, type RedevelopmentMapAuction, type RedevelopmentZone } from "@/lib/api";
import { AuctionDetailModal } from "@/components/AuctionDetailModal";
import { RedevelopmentEditResearchPanel } from "./RedevelopmentEditResearchPanel";

const FAVORITE_CATEGORY = "재개발";

/** 지도에서 점을 눌러 고른 경매물건 — 추천물건과 같은 상세 팝업을 띄우고, 팝업 안 "재개발 조사" 탭에서
 * 네이버 호가·국토부 실거래 조사를 한다. */
export function RedevelopmentEditSelectedAuction({
  auction,
  toleranceM,
  onClose,
  onNavigateAuction,
  resolveZone,
  onOpenZone,
  floating = false,
}: {
  auction: RedevelopmentMapAuction;
  toleranceM: number;
  onClose: () => void;
  /** 조사표의 같은 구역 경매를 누를 때 지도 중심·상세 팝업을 함께 전환한다. */
  onNavigateAuction?: (auction: RedevelopmentMapAuction) => void;
  /** 구역 id로 전체 구역 정보를 찾는다(구역 머리글의 색·사업종류용). */
  resolveZone?: (zoneId: string) => RedevelopmentZone | undefined;
  /** 구역 머리글을 눌렀을 때 구역 상세로 넘어가는 콜백. */
  onOpenZone?: (zoneId: string) => void;
  floating?: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const itemQuery = useQuery({
    queryKey: ["redev-auction-item", auction.id],
    queryFn: async () => (await fetchAuctionsByIds([auction.id]))[0] ?? null,
    staleTime: 60_000,
  });
  const favoritesQuery = useQuery({ queryKey: ["redev-favorites"], queryFn: fetchFavorites, staleTime: 30_000 });
  const fav = useMemo(() => (favoritesQuery.data ?? []).find((f) => f.auctionId === auction.id), [favoritesQuery.data, auction.id]);
  const isFav = !!fav;

  async function toggleFavorite(next: boolean, category?: string | null, memo?: string | null) {
    setBusy(true);
    try {
      if (!next) await removeFavorite(auction.id);
      else await addFavorite(auction.id, category ?? fav?.category ?? FAVORITE_CATEGORY, memo ?? fav?.memo ?? null);
      await queryClient.invalidateQueries({ queryKey: ["redev-favorites"] });
    } finally {
      setBusy(false);
    }
  }

  if (!itemQuery.data) return null;

  return (
    <AuctionDetailModal
      item={itemQuery.data}
      onClose={onClose}
      floating={floating}
      isAdmin
      isFavorite={isFav}
      favoriteBusy={busy}
      favoriteMemo={fav?.memo ?? null}
      favoriteCategory={fav?.category ?? null}
      onToggleFavorite={toggleFavorite}
      extraTab={{
        label: "재개발 조사",
        content: (
          <RedevelopmentEditResearchPanel
            auctionId={auction.id}
            isFavorite={fav?.category === FAVORITE_CATEGORY}
            toleranceM={toleranceM}
            onNavigateAuction={onNavigateAuction}
            resolveZone={resolveZone}
            onOpenZone={onOpenZone}
          />
        ),
      }}
    />
  );
}
