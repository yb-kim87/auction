/**
 * 국세청 「건물 기준시가 계산방법 해설」(2024.1.1. 시행 기준) 공식과
 * atomtax-app.vercel.app 실측 대조로 확정한 부가세 계산 로직.
 * CrawlerVatTab.tsx(관리자 부가세계산 탭)과 동일한 공식을 재사용하기
 * 위해 공용 함수로 분리(수익계산 패널의 85㎡ 초과 물건 부가세 자동
 * 계산에도 동일 로직을 쓴다, 2026-07-21).
 */

/** 구조지수·잔가율 그룹표. 아파트는 대부분 철근콘크리트조(index=100,
 * depGroup=1)이므로 자동 계산 시 이 값을 기본으로 쓴다. */
export const STRUCTURE_INDEX_RC = 100;
export const DEP_GROUP_USEFUL_LIFE: Record<1 | 2 | 3 | 4, number> = {
  1: 50,
  2: 40,
  3: 30,
  4: 20,
};
export const RC_DEP_GROUP = 1 as const;

/** 국세청 「건물 기준시가 계산방법 해설」 구조지수·잔가율 그룹표(고시
 * 원문, CrawlerVatTab.tsx의 STRUCTURE_OPTIONS와 동일 — 실측 검증,
 * 2026-07-21). keywords는 건축물대장 API의 strctCdNm(공공데이터포털
 * 표준 구조코드명, 예: "철근콘크리트구조")을 매칭하기 위한 부분 문자열
 * 목록이다. */
export const STRUCTURE_TABLE: {
  label: string;
  index: number;
  depGroup: 1 | 2 | 3 | 4;
  keywords: string[];
}[] = [
  { label: "통나무조", index: 135, depGroup: 1, keywords: ["통나무"] },
  { label: "목구조", index: 125, depGroup: 1, keywords: ["목구조"] },
  {
    label: "철골(철골철근)콘크리트조",
    index: 110,
    depGroup: 1,
    keywords: ["철골철근콘크리트", "철골콘크리트", "SRC"],
  },
  {
    label: "철근콘크리트조, 석조, 프리캐스트콘크리트조, 목조, 라멘조, ALC조, 스틸하우스조",
    index: 100,
    depGroup: 1,
    keywords: [
      "철근콘크리트",
      "석조",
      "프리캐스트콘크리트",
      "라멘조",
      "ALC",
      "스틸하우스",
    ],
  },
  {
    label: "연와조, 철골조, 보강콘크리트조, 보강블록조",
    index: 97,
    depGroup: 2,
    keywords: ["연와조", "철골조", "보강콘크리트", "보강블록"],
  },
  {
    label: "시멘트벽돌조, 황토조, 시멘트블록조, 와이어패널조",
    index: 95,
    depGroup: 2,
    keywords: ["시멘트벽돌", "황토조", "시멘트블록", "와이어패널"],
  },
  {
    label: "철골조 중 조립식패널(EPS패널)",
    index: 85,
    depGroup: 3,
    keywords: ["EPS패널"],
  },
  { label: "조립식패널조", index: 80, depGroup: 3, keywords: ["조립식패널"] },
  { label: "경량철골조", index: 79, depGroup: 3, keywords: ["경량철골"] },
  {
    label: "석회 및 흙벽돌조, 돌담 및 토담조",
    index: 60,
    depGroup: 3,
    keywords: ["흙벽돌", "돌담", "토담"],
  },
  {
    label: "철파이프조, 컨테이너건물",
    index: 59,
    depGroup: 4,
    keywords: ["철파이프", "컨테이너"],
  },
];

/** 건축물대장 API의 구조명(strctCdNm, 예: "철근콘크리트구조")을 국세청
 * 구조지수표에 매칭한다. 매칭 실패 시(구조명이 없거나 표에 없는 값)
 * null을 반환 — 호출자가 기본값(RC, 100)으로 폴백한다. */
export function matchStructureIndex(
  structureName: string | null | undefined,
): { index: number; depGroup: 1 | 2 | 3 | 4 } | null {
  const name = String(structureName ?? "").trim();
  if (!name) return null;
  for (const row of STRUCTURE_TABLE) {
    if (row.keywords.some((keyword) => name.includes(keyword))) {
      return { index: row.index, depGroup: row.depGroup };
    }
  }
  return null;
}

/** 위치지수표(개별공시지가 원/㎡ 구간별) — 국세청 고시 2024.1.1. 시행
 * 기준 실측 검증. */
const LOCATION_INDEX_BRACKETS: [number, number][] = [
  [20000, 78], [30000, 83], [50000, 85], [70000, 86], [100000, 87],
  [130000, 88], [150000, 89], [180000, 90], [200000, 91], [300000, 92],
  [350000, 94], [500000, 96], [650000, 98], [800000, 100], [1000000, 102],
  [1200000, 105], [1600000, 108], [2000000, 111], [2500000, 114], [3000000, 116],
  [3500000, 118], [4000000, 120], [4500000, 122], [5000000, 124], [5500000, 126],
  [6000000, 128], [7000000, 130], [8000000, 132], [9000000, 134], [10000000, 137],
  [15000000, 140], [20000000, 143], [25000000, 146], [30000000, 149], [35000000, 152],
  [40000000, 155], [45000000, 158], [50000000, 161], [55000000, 164], [60000000, 167],
  [65000000, 170], [70000000, 173], [75000000, 176], [80000000, 179],
];
const LOCATION_INDEX_MAX = 182;

export function getLocationIndex(pricePerM2: number): number {
  for (const [upperBound, index] of LOCATION_INDEX_BRACKETS) {
    if (pricePerM2 < upperBound) return index;
  }
  return LOCATION_INDEX_MAX;
}

/** 건물신축가격기준액(원/㎡) — 최신 고시 기준. */
export const BUILDING_BASE_PRICE_PER_M2 = 850000;

/** 경과연수별잔가율(정액법). 최종잔존가치율 10%, 고시연도(baseYear)를
 * 경과연수 1년으로 계산. */
export function calcResidualRate(
  builtYear: number,
  usefulLife: number,
  baseYear: number,
): number {
  const finalResidualRate = 0.1;
  const annualRate = (1 - finalResidualRate) / usefulLife;
  const elapsed = Math.max(0, baseYear - builtYear);
  return Math.max(finalResidualRate, 1 - annualRate * elapsed);
}

/** ㎡당 건물기준시가(1,000원 단위 절사, 고시 규정). */
export function calcBuildingStandardPricePerM2(params: {
  structureIndex: number;
  usageIndex: number;
  locationIndex: number;
  residualRate: number;
}): number {
  const { structureIndex, usageIndex, locationIndex, residualRate } = params;
  return (
    Math.floor(
      (BUILDING_BASE_PRICE_PER_M2 *
        (structureIndex / 100) *
        (usageIndex / 100) *
        (locationIndex / 100) *
        residualRate) /
        1000,
    ) * 1000
  );
}

function roundToManWon(value: number): number {
  return Math.round(value / 10000) * 10000;
}

export type VatResult = {
  landAlloc: number;
  buildingAlloc: number;
  vatLow: number;
  vatMarket: number;
};

/** 부가세 안분계산(atomtax-app 실측 대조로 확정한 공식) —
 * CrawlerVatTab.tsx와 동일: 건물 공급가액(정상가) 산출 → 70%를 최종
 * 건물가액으로, 그 10%를 부가세(최저가)로 삼는다. */
export function calcVat(params: {
  salePrice: number;
  landArea: number;
  landPricePerM2: number;
  buildingStandardPrice: number;
}): VatResult {
  const { salePrice, landArea, landPricePerM2, buildingStandardPrice } = params;
  const landStdTotal = landArea * landPricePerM2;
  const denominator = landStdTotal + 1.1 * buildingStandardPrice;
  const buildingSupplyMarket =
    denominator > 0 ? (salePrice * buildingStandardPrice) / denominator : 0;
  const buildingAlloc = roundToManWon(buildingSupplyMarket * 0.7);
  const vatLow = roundToManWon(buildingAlloc * 0.1);
  const landAlloc = salePrice - buildingAlloc - vatLow;
  const vatMarket = roundToManWon(buildingSupplyMarket * 0.1);
  return { landAlloc, buildingAlloc, vatLow, vatMarket };
}
