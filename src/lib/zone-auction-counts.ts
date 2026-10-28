import type { RedevelopmentMapAuction } from "./api";

/** 구역 다각형 안에 좌표가 있는 빌라만 세며, 종결 및 낙찰 물건을 제외한다. */
export function countCurrentZoneAuctions(auctions: RedevelopmentMapAuction[]) {
  const counts = new Map<string, { active: number; unknown: number }>();
  for (const auction of auctions) {
    const state = auction.caseState?.trim() ?? "";
    if (auction.propType !== "빌라" || (auction.salePrice ?? 0) > 0 || auction.isClosedCase === true || /^(낙찰|매각|허가|취하|취소|기각|각하|지급기한|배당)/.test(state)) continue;
    // 사건 상태 자체가 명확하면 서버 버전별 보조 필드의 유무와 관계없이 집계한다.
    const active = /^(진행|유찰|신건|변경|재매각)/.test(state);
    for (const id of new Set(auction.zoneIds ?? [])) {
      const entry = counts.get(id) ?? { active: 0, unknown: 0 };
      if (active) entry.active += 1;
      else entry.unknown += 1;
      counts.set(id, entry);
    }
  }
  return counts;
}
