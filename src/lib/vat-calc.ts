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

/** 국세청 용도지수표(CrawlerVatTab.tsx의 RESIDENTIAL/COMMERCIAL_USAGE_OPTIONS와
 * 동일 데이터, atomtax-app 실측 대조로 확정). keywords는 건축물대장 API의
 * mainPurpsCdNm(공공데이터포털 표준 주용도명, 예: "공동주택(아파트)",
 * "업무시설(오피스텔)", "제2종근린생활시설(사무소)")을 매칭하기 위한 부분
 * 문자열 목록이다. 배열 순서가 우선순위 — 더 구체적인 항목을 앞에 둔다
 * (예: "오피스텔"이 "업무시설"보다 먼저 매칭돼야 함). */
export const USAGE_TABLE: {
  usageType: "주거용" | "상업용";
  value: string;
  label: string;
  keywords: string[];
}[] = [
  // 주거용
  { usageType: "주거용", value: "140", label: "오피스텔 (주거용 임대)", keywords: ["오피스텔"] },
  { usageType: "주거용", value: "110", label: "아파트", keywords: ["아파트"] },
  {
    usageType: "주거용",
    value: "100",
    label: "단독·다세대·연립·기숙사 등",
    keywords: ["단독주택", "다세대주택", "연립주택", "기숙사", "다가구주택", "공동주택"],
  },
  // 상업용 — 숙박
  { usageType: "상업용", value: "140", label: "관광호텔 5/4성급", keywords: ["관광호텔"] },
  { usageType: "상업용", value: "130", label: "호텔·콘도·펜션 등", keywords: ["호텔", "콘도", "펜션"] },
  { usageType: "상업용", value: "120", label: "도시민박·한옥체험시설", keywords: ["민박", "한옥체험"] },
  { usageType: "상업용", value: "115", label: "여관(모텔 포함)", keywords: ["여관", "모텔"] },
  { usageType: "상업용", value: "105", label: "다중생활시설", keywords: ["다중생활시설"] },
  { usageType: "상업용", value: "100", label: "여인숙", keywords: ["여인숙"] },
  // 상업용 — 판매
  { usageType: "상업용", value: "135", label: "백화점", keywords: ["백화점"] },
  {
    usageType: "상업용",
    value: "125",
    label: "대형점·쇼핑센터·복합쇼핑몰",
    keywords: ["대형점", "쇼핑센터", "복합쇼핑몰", "대규모점포"],
  },
  { usageType: "상업용", value: "100", label: "일반상점·기타 판매시설", keywords: ["판매시설", "상점"] },
  {
    usageType: "상업용",
    value: "85",
    label: "도매시장·전통시장·공판장",
    keywords: ["도매시장", "전통시장", "공판장"],
  },
  // 상업용 — 교통·유흥·집회
  {
    usageType: "상업용",
    value: "120",
    label: "여객터미널·철도·공항·항만",
    keywords: ["여객터미널", "철도", "공항", "항만", "운수시설"],
  },
  { usageType: "상업용", value: "140", label: "무도장", keywords: ["무도장"] },
  { usageType: "상업용", value: "135", label: "유흥주점·카지노", keywords: ["유흥주점", "카지노"] },
  { usageType: "상업용", value: "120", label: "유원시설업 시설", keywords: ["유원시설"] },
  { usageType: "상업용", value: "115", label: "단란주점", keywords: ["단란주점"] },
  { usageType: "상업용", value: "90", label: "무도학원", keywords: ["무도학원"] },
  {
    usageType: "상업용",
    value: "130",
    label: "집회장(장외발매소 등)",
    keywords: ["집회장", "장외발매소"],
  },
  { usageType: "상업용", value: "120", label: "예식장·공연장·공회당", keywords: ["예식장", "공연장", "공회당"] },
  { usageType: "상업용", value: "110", label: "동물원·식물원·전시장", keywords: ["동물원", "식물원", "전시장"] },
  {
    usageType: "상업용",
    value: "105",
    label: "관람장·체육관·운동장",
    keywords: ["관람장", "체육관", "운동장"],
  },
  { usageType: "상업용", value: "100", label: "교회·성당·사찰 등", keywords: ["교회", "성당", "사찰", "종교시설"] },
  {
    usageType: "상업용",
    value: "125",
    label: "골프장·스키장·종합체육시설",
    keywords: ["골프장", "스키장", "종합체육시설"],
  },
  { usageType: "상업용", value: "105", label: "기타 체육시설", keywords: ["체육시설", "운동시설"] },
  // 상업용 — 의료·업무
  { usageType: "상업용", value: "125", label: "종합병원", keywords: ["종합병원"] },
  {
    usageType: "상업용",
    value: "110",
    label: "일반·치과·한방·요양 등 병원",
    keywords: ["병원", "의원", "요양", "의료시설"],
  },
  { usageType: "상업용", value: "140", label: "오피스텔(상업용)", keywords: ["오피스텔"] },
  {
    usageType: "상업용",
    value: "115",
    label: "사무소·금융업소·출판사 등",
    keywords: ["사무소", "금융업소", "출판사", "업무시설"],
  },
  { usageType: "상업용", value: "110", label: "방송국·통신용시설", keywords: ["방송국", "통신용시설"] },
  {
    usageType: "상업용",
    value: "110",
    label: "야외음악당·관광지 부수 시설",
    keywords: ["야외음악당", "관광지"],
  },
  // 상업용 — 교육·복지
  { usageType: "상업용", value: "107", label: "학원·교습소", keywords: ["학원", "교습소"] },
  {
    usageType: "상업용",
    value: "100",
    label: "학교·교육원·연구소·도서관",
    keywords: ["학교", "교육원", "연구소", "도서관", "교육연구시설"],
  },
  {
    usageType: "상업용",
    value: "107",
    label: "아동·노인·사회복지시설",
    keywords: ["아동복지", "노인복지", "사회복지시설"],
  },
  { usageType: "상업용", value: "80", label: "고아원·경로당 등", keywords: ["고아원", "경로당"] },
  { usageType: "상업용", value: "110", label: "청소년수련시설", keywords: ["청소년수련시설"] },
  // 상업용 — 목욕·위락·장례
  { usageType: "상업용", value: "130", label: "목욕장 3,000㎡ 이상", keywords: ["목욕장"] },
  {
    usageType: "상업용",
    value: "105",
    label: "풍속영업시설(노래방·게임장 등)",
    keywords: ["노래방", "게임장", "풍속영업"],
  },
  {
    usageType: "상업용",
    value: "100",
    label: "일반 근린생활시설(음식점·미용원·소형 학원 등)",
    keywords: ["근린생활시설", "음식점", "미용원"],
  },
  { usageType: "상업용", value: "130", label: "화장시설·봉안당", keywords: ["화장시설", "봉안당"] },
  { usageType: "상업용", value: "115", label: "장례식장", keywords: ["장례식장"] },
];

/** 건축법상 "아파트"는 5개층 이상 공동주택, "연립·다세대주택"은 4개층
 * 이하다(건축법 시행령 별표1) — 건축물대장 API의 mainPurpsCdNm은 둘 다
 * "공동주택"으로 뭉뚱그려 나와 이 값만으로는 구분이 안 된다(실측:
 * "인천 미추홀구 용현동 630-70"은 mainPurpsCdNm="공동주택",
 * grndFlrCnt=6 — atomtax-app은 이를 "아파트(110)"로 분류했는데 우리는
 * groundFloors 없이 무조건 "단독·다세대·연립·기숙사 등(100)"으로
 * 잘못 매칭하고 있었다, 2026-07-23). */
const APARTMENT_MIN_FLOORS = 5;

/** 건축물대장 API의 주용도명(mainPurpsCdNm)을 국세청 용도지수표에
 * 매칭한다. 매칭 실패 시 null(호출자가 usageType="주거용", 첫 옵션인
 * 아파트(110)로 폴백).
 * groundFloors(지상층수)를 넘기면 "공동주택"이 "아파트" 키워드보다
 * 먼저 매칭되는 것을 층수로 교정한다: 5층 이상이면 아파트(110), 4층
 * 이하면 단독·다세대·연립 등(100). */
export function matchUsage(
  mainPurposeName: string | null | undefined,
  groundFloors?: number | null,
): { usageType: "주거용" | "상업용"; value: string; label: string } | null {
  const name = String(mainPurposeName ?? "").trim();
  if (!name) return null;

  if (name.includes("공동주택") && !name.includes("아파트") && groundFloors != null) {
    const apartmentRow = USAGE_TABLE.find((r) => r.label === "아파트");
    const etcRow = USAGE_TABLE.find((r) => r.label === "단독·다세대·연립·기숙사 등");
    const row = groundFloors >= APARTMENT_MIN_FLOORS ? apartmentRow : etcRow;
    if (row) return { usageType: row.usageType, value: row.value, label: row.label };
  }

  for (const row of USAGE_TABLE) {
    if (row.keywords.some((keyword) => name.includes(keyword))) {
      return { usageType: row.usageType, value: row.value, label: row.label };
    }
  }
  return null;
}

/** 위치지수표(개별공시지가 원/㎡ 구간별) — 국세청 최신 고시 기준(atomtax-app
 * "2025년 국세청 고시 기준" 재실측으로 갱신, 2026-07-23). 기존 표(2024.1.1.
 * 시행 기준으로 기록돼 있었음)와 비교해 전 구간에서 지수가 상향 조정됨
 * (예: 20,000원/㎡ 미만 78→변동없음이나 20,000원대는 78→83, 1,000,000원대는
 * 102→104 등) — 고시가 최신화된 것으로 판단해 표 전체를 교체함. */
const LOCATION_INDEX_BRACKETS: [number, number][] = [
  [20000, 78], [30000, 83], [50000, 85], [70000, 86], [100000, 87],
  [130000, 88], [150000, 89], [180000, 90], [200000, 91], [300000, 92],
  [350000, 93], [500000, 94], [650000, 97], [800000, 100], [1000000, 102],
  [1200000, 104], [1600000, 106], [2000000, 108], [2500000, 114], [3000000, 116],
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

function roundToUnit(value: number, unit: number): number {
  return Math.round(value / unit) * unit;
}

export type VatResult = {
  landAlloc: number;
  buildingAlloc: number;
  vatLow: number;
  vatMarket: number;
};

/** 부가세 안분계산(atomtax-app 실측 대조로 확정한 공식) —
 * CrawlerVatTab.tsx와 동일: 건물 공급가액(정상가) 산출 → 70%를 최종
 * 건물가액으로, 그 10%를 부가세(최저가)로 삼는다.
 *
 * 반올림 단위는 항목마다 다르다(atomtax-app 결과값 역산으로 확정,
 * 2026-07-23 — 이전엔 buildingAlloc도 만원 단위로 반올림해 최종 결과가
 * 최대 2만원까지 어긋났었다):
 * - vatMarket(시가): 원 단위 반올림(소수점만 정리, 만원 단위 아님)
 * - buildingAlloc(건물가액): 십만원 단위 반올림
 * - vatLow(최저가): 만원 단위 반올림 */
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
  const vatMarket = Math.round(buildingSupplyMarket * 0.1);
  const buildingAlloc = roundToUnit(buildingSupplyMarket * 0.7, 100000);
  const vatLow = roundToManWon(buildingAlloc * 0.1);
  const landAlloc = salePrice - buildingAlloc - vatLow;
  return { landAlloc, buildingAlloc, vatLow, vatMarket };
}
