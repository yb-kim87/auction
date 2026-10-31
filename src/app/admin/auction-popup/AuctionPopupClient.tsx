"use client";

import { useEffect, useState } from "react";
import { fetchRedevelopmentMapData, type RedevelopmentMapAuction, type RedevelopmentZone } from "@/lib/api";
import { RedevelopmentEditSelectedAuction } from "../RedevelopmentEditSelectedAuction";

/** 비교용 별도 브라우저 창: 관리자 메뉴 없이 경매 물건 상세 팝업만 렌더링한다. */
export function AuctionPopupClient() {
  const [auction, setAuction] = useState<RedevelopmentMapAuction | null>(null);
  const [zones, setZones] = useState<RedevelopmentZone[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auctionId = new URLSearchParams(window.location.search).get("auctionId");
    if (!auctionId) {
      setError("열 물건 정보가 없습니다.");
      return;
    }
    let cancelled = false;
    void fetchRedevelopmentMapData()
      .then((result) => {
        if (cancelled) return;
        const found = result.auctions.find((item) => item.id === auctionId) ?? null;
        if (!found) setError("해당 경매 물건을 찾을 수 없습니다.");
        else {
          setZones(result.zones);
          setAuction(found);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "물건 정보를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (auction) {
    return (
      <RedevelopmentEditSelectedAuction
        auction={auction}
        toleranceM={30}
        onClose={() => window.close()}
        resolveZone={(id) => zones.find((z) => z.id === id)}
        // 이 창은 관리자 화면과 따로 열려 있어서, 구역을 누르면 같은 창을 관리자 재개발 화면으로 바꿔 그 구역 상세를 연다.
        onOpenZone={(zoneId) => {
          const url = new URL("/admin", window.location.origin);
          url.searchParams.set("popup", "auction-compare");
          url.searchParams.set("zoneId", zoneId);
          window.location.assign(url.toString());
        }}
      />
    );
  }
  return <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-sm text-slate-600">{error ?? "경매 물건 상세를 불러오는 중입니다."}</main>;
}
