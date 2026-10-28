"use client";

import type { AuctionItem } from "@/types/auction";
import { formatWon } from "@/lib/kakao-maps";

type Field = { key: keyof AuctionItem; label: string; kind?: "won" | "long" };

const SECTIONS: Array<{ title: string; fields: Field[] }> = [
  {
    title: "사건",
    fields: [
      { key: "auctionNo", label: "사건번호" },
      { key: "court", label: "법원" },
      { key: "status", label: "진행 상태" },
      { key: "caseState", label: "사건 상태" },
      { key: "propType", label: "물건 종류" },
      { key: "bidDate", label: "입찰일" },
      { key: "memo", label: "경매코치 메모", kind: "long" },
    ],
  },
  {
    title: "가격",
    fields: [
      { key: "appraisedValue", label: "감정가", kind: "won" },
      { key: "minPrice", label: "최저가", kind: "won" },
      { key: "salePrice", label: "낙찰가", kind: "won" },
      { key: "officialLandPrice", label: "공시지가", kind: "won" },
      { key: "naverPrice", label: "네이버 시세", kind: "won" },
      { key: "naverPriceFloorLabel", label: "시세 층 구분" },
      { key: "diffNaverSale", label: "시세 대비 낙찰가", kind: "won" },
      { key: "diffNaverMin", label: "시세 대비 최저가", kind: "won" },
      { key: "diffNaverAppraised", label: "시세 대비 감정가", kind: "won" },
      { key: "tradingCount", label: "실거래 건수" },
      { key: "priceDetail", label: "가격 상세", kind: "long" },
      { key: "tradingDetail", label: "실거래 상세", kind: "long" },
    ],
  },
  {
    title: "위치·건물",
    fields: [
      { key: "address", label: "주소" },
      { key: "usage", label: "용도" },
      { key: "area", label: "전용면적" },
      { key: "sharedArea", label: "공유면적" },
      { key: "landShare", label: "대지권" },
      { key: "builtYear", label: "준공연도" },
      { key: "totalUnits", label: "총 세대수" },
      { key: "elevator", label: "엘리베이터" },
      { key: "parking", label: "주차" },
      { key: "vatStructureName", label: "구조" },
      { key: "vatMainPurposeName", label: "주용도" },
      { key: "vatGroundFloors", label: "지상층수" },
      { key: "buildingRegistry", label: "건축물대장", kind: "long" },
      { key: "education", label: "주변 교육", kind: "long" },
    ],
  },
  {
    title: "권리·임차",
    fields: [
      { key: "owner", label: "소유자" },
      { key: "appraiser", label: "감정평가사" },
      { key: "tenantInfo", label: "임차인 정보", kind: "long" },
      { key: "tenantDetail", label: "임차인 상세", kind: "long" },
      { key: "specialNote", label: "특이사항", kind: "long" },
      { key: "bidInfo", label: "입찰 정보", kind: "long" },
      { key: "unpaidFeeAmount", label: "체납 관리비", kind: "won" },
      { key: "unpaidFeeNote", label: "체납 관리비 메모", kind: "long" },
    ],
  },
];

const RIGHTS_FIELDS = [
  ["baselineRightType", "말소기준권리"],
  ["baselineRightDate", "말소기준일"],
  ["seniorTenantStatus", "선순위 임차"],
  ["opposabilityStatus", "대항력"],
  ["depositAmount", "보증금"],
  ["expectedDividendAmount", "예상 배당액"],
  ["assumptionAmount", "인수금액"],
  ["specialRights", "특수권리"],
] as const;

function isEmpty(v: unknown) {
  return v == null || v === "" || v === 0 || v === "0";
}

/** 매물 리스트에서 물건 행을 펼쳤을 때 보이는 상세 — 경매코치가 가진 정보를 사건/가격/위치·건물/
 * 권리·임차/권리분석으로 나눠 보여준다(비어 있는 항목은 생략). */
export function RedevelopmentEditAuctionDetail({ auction, zoneNames }: { auction: AuctionItem; zoneNames: string[] }) {
  const rights = auction.rightsReview ?? null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-4 p-4 text-xs bg-muted/30">
      <div className="space-y-1">
        <div className="font-semibold text-foreground">포함된 재개발 구역</div>
        {zoneNames.length > 0 ? (
          zoneNames.map((n) => (
            <div key={n} className="text-primary">
              {n}
            </div>
          ))
        ) : (
          <div className="text-muted-foreground">-</div>
        )}
        {auction.link && (
          <a href={auction.link} target="_blank" rel="noreferrer" className="inline-block pt-1 text-primary hover:underline">
            원본 링크 열기
          </a>
        )}
      </div>
      {SECTIONS.map((section) => {
        const rows = section.fields.filter((f) => !isEmpty(auction[f.key]));
        if (rows.length === 0) return null;
        return (
          <div key={section.title} className="space-y-1">
            <div className="font-semibold text-foreground">{section.title}</div>
            {rows.map((f) => {
              const v = auction[f.key];
              const text = f.kind === "won" ? formatWon(typeof v === "number" ? v : Number(v)) : String(v);
              return (
                <div key={f.key} className={f.kind === "long" ? "space-y-0.5" : "flex gap-2"}>
                  <span className="shrink-0 w-24 text-muted-foreground">{f.label}</span>
                  <span className="block whitespace-pre-wrap break-words text-foreground">{text}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      {rights && (
        <div className="space-y-1">
          <div className="font-semibold text-foreground">권리분석</div>
          {RIGHTS_FIELDS.filter(([k]) => !isEmpty(rights[k])).map(([k, label]) => (
            <div key={k} className="flex gap-2">
              <span className="shrink-0 w-24 text-muted-foreground">{label}</span>
              <span className="text-foreground break-words">
                {/(Amount|deposit)/i.test(k) ? formatWon(Number(rights[k])) : String(rights[k])}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
