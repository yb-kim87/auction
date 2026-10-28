"use client";

import { useEffect, useState } from "react";
import { fetchRedevelopmentMapData, type RedevelopmentMapAuction } from "@/lib/api";
import { RedevelopmentEditSelectedAuction } from "../RedevelopmentEditSelectedAuction";

/** 비교용 별도 브라우저 창: 관리자 메뉴 없이 경매 물건 상세 팝업만 렌더링한다. */
export function AuctionPopupClient() {
  const [auction, setAuction] = useState<RedevelopmentMapAuction | null>(null);
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
        else setAuction(found);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "물건 정보를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (auction) {
    return <RedevelopmentEditSelectedAuction auction={auction} toleranceM={30} onClose={() => window.close()} />;
  }
  return <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-sm text-slate-600">{error ?? "경매 물건 상세를 불러오는 중입니다."}</main>;
}
