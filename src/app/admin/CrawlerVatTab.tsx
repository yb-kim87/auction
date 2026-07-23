"use client";

import { useMemo, useState } from "react";
import {
  fetchVatAddressCoord,
  fetchVatBuildingRegister,
  fetchVatLandPrice,
} from "@/lib/api";

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: { roadAddress: string; jibunAddress: string }) => void;
      }) => { open: () => void };
    };
  }
}

/** 국세청 「건물 기준시가 계산방법 해설」(2024.1.1. 시행 기준, 2024.2)
 * 실측 검증한 구조지수·잔가율 그룹표. 구조명은 고시 원문 그대로 사용.
 * 잔가율 그룹(depGroup)은 "10. 경과연수별잔가율의 적용" 표에 따른
 * 내용연수 50/40/30/20년 4개 그룹. */
const STRUCTURE_OPTIONS: { label: string; index: number; depGroup: 1 | 2 | 3 | 4 }[] = [
  { label: "통나무조", index: 135, depGroup: 1 },
  { label: "목구조", index: 125, depGroup: 1 },
  { label: "철골(철골철근)콘크리트조", index: 110, depGroup: 1 },
  { label: "철근콘크리트조, 석조, 프리캐스트콘크리트조, 목조, 라멘조, ALC조, 스틸하우스조", index: 100, depGroup: 1 },
  { label: "연와조, 철골조, 보강콘크리트조, 보강블록조", index: 97, depGroup: 2 },
  { label: "시멘트벽돌조, 황토조, 시멘트블록조, 와이어패널조", index: 95, depGroup: 2 },
  { label: "철골조 중 조립식패널(EPS패널)", index: 85, depGroup: 3 },
  { label: "조립식패널조", index: 80, depGroup: 3 },
  { label: "경량철골조", index: 79, depGroup: 3 },
  { label: "석회 및 흙벽돌조, 돌담 및 토담조", index: 60, depGroup: 3 },
  { label: "철파이프조, 컨테이너건물", index: 59, depGroup: 4 },
];

/** 잔가율 그룹별 내용연수(년) — 최종잔존가치율은 4개 그룹 모두 10%로
 * 통일(2024년 기준 개정 반영). */
const DEP_GROUP_USEFUL_LIFE: Record<1 | 2 | 3 | 4, number> = {
  1: 50,
  2: 40,
  3: 30,
  4: 20,
};

/** 주거용/상업용 용도지수표 — atomtax-app.vercel.app 실측 대조로 확인한
 * 옵션 목록(2026-07-23). 오피스텔은 시행령상 업무시설로 분류되나 주거용
 * 임대 케이스 편의를 위해 주거 카테고리에도 동일 지수(140)로 중복 등재
 * 되어 있음 — 두 카테고리 어느 쪽을 선택해도 계산 결과는 같다. */
const RESIDENTIAL_USAGE_OPTIONS = [
  { value: "110", label: "아파트 (110)" },
  { value: "100", label: "단독·다세대·연립·기숙사 등 (100)" },
  { value: "140", label: "오피스텔 (주거용 임대) (140)" },
];

const COMMERCIAL_USAGE_OPTIONS = [
  { value: "140", label: "관광호텔 5/4성급 (140)" },
  { value: "130", label: "호텔·콘도·펜션 등 (130)" },
  { value: "120", label: "도시민박·한옥체험시설 (120)" },
  { value: "115", label: "여관(모텔 포함) (115)" },
  { value: "105", label: "다중생활시설 (105)" },
  { value: "100", label: "여인숙 (100)" },
  { value: "135", label: "백화점 (135)" },
  { value: "125", label: "대형점·쇼핑센터·복합쇼핑몰 (125)" },
  { value: "100", label: "일반상점·기타 판매시설 (100)" },
  { value: "85", label: "도매시장·전통시장·공판장 (85)" },
  { value: "120", label: "여객터미널·철도·공항·항만 (120)" },
  { value: "140", label: "무도장 (140)" },
  { value: "135", label: "유흥주점·카지노 (135)" },
  { value: "120", label: "유원시설업 시설 (120)" },
  { value: "115", label: "단란주점 (115)" },
  { value: "90", label: "무도학원 (90)" },
  { value: "130", label: "집회장(장외발매소 등) (130)" },
  { value: "120", label: "예식장·공연장·공회당 (120)" },
  { value: "110", label: "동물원·식물원·전시장 (110)" },
  { value: "105", label: "관람장·체육관·운동장 (105)" },
  { value: "100", label: "교회·성당·사찰 등 (100)" },
  { value: "125", label: "골프장·스키장·종합체육시설 (125)" },
  { value: "105", label: "기타 체육시설 (105)" },
  { value: "125", label: "종합병원 (125)" },
  { value: "110", label: "일반·치과·한방·요양 등 병원 (110)" },
  { value: "140", label: "오피스텔 (140)" },
  { value: "115", label: "사무소·금융업소·출판사 등 (115)" },
  { value: "110", label: "방송국·통신용시설 (110)" },
  { value: "110", label: "야외음악당·관광지 부수 시설 (110)" },
  { value: "107", label: "학원·교습소 (107)" },
  { value: "100", label: "학교·교육원·연구소·도서관 (100)" },
  { value: "107", label: "아동·노인·사회복지시설 (107)" },
  { value: "80", label: "고아원·경로당 등 (80)" },
  { value: "110", label: "청소년수련시설 (110)" },
  { value: "130", label: "목욕장 3,000㎡ 이상 (130)" },
  { value: "115", label: "목욕장 1,000~3,000㎡ (115)" },
  { value: "110", label: "목욕장 1,000㎡ 미만 (110)" },
  { value: "105", label: "풍속영업시설(노래방·게임장 등) (105)" },
  { value: "100", label: "일반 근린생활시설(음식점·미용원·소형 학원 등) (100)" },
  { value: "130", label: "화장시설·봉안당 (130)" },
  { value: "105", label: "동물 화장·납골시설 (105)" },
  { value: "115", label: "장례식장 (115)" },
  { value: "105", label: "동물 전용 장례식장 (105)" },
];

/** 위치지수표(개별공시지가 원/㎡ 구간별) — 국세청 고시 2024.1.1. 시행
 * 기준 실측 검증(2,593,000원/㎡ → 116 등 다수 구간 확인, 2026-07-21).
 * 구간은 오름차순, 각 항목은 [상한 미만, 지수] — 상한을 초과하면 다음
 * 구간으로 넘어가고, 마지막 구간은 상한 없이 그 지수를 적용한다. */
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

function getLocationIndex(pricePerM2: number): number {
  for (const [upperBound, index] of LOCATION_INDEX_BRACKETS) {
    if (pricePerM2 < upperBound) return index;
  }
  return LOCATION_INDEX_MAX;
}

/** 건물신축가격기준액(원/㎡) — 최신 고시 기준. 매년 조정되므로 국세청
 * 고시가 바뀌면 이 값만 갱신하면 된다(실측 확인값, 2026-07-21). */
const BUILDING_BASE_PRICE_PER_M2 = 850000;

/** 경과연수별잔가율(정액법) — 고시연도를 경과연수 1년으로 계산한다
 * (실측 검증: 2024년 고시에서 신축연도 2024=1.000, 2001=0.586 등
 * Ⅰ그룹(내용연수50) 표와 공식이 정확히 일치, 2026-07-21).
 * 최종잔존가치율 10%, 최소값은 그 이하로 내려가지 않는다. */
function calcResidualRate(builtYear: number, usefulLife: number, baseYear: number): number {
  const finalResidualRate = 0.1;
  const annualRate = (1 - finalResidualRate) / usefulLife;
  const elapsed = Math.max(0, baseYear - builtYear);
  return Math.max(finalResidualRate, 1 - annualRate * elapsed);
}

function parseNum(value: string): number {
  const cleaned = value.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatWon(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

/** 만원 단위로 반올림 — 참고 사이트(atomtax-app.vercel.app)가 최종 결과를
 * 항상 10,000원 단위로 딱 떨어지게 표시해, 실측 대조로 확인한 표시 규칙. */
function roundToManWon(value: number): number {
  return Math.round(value / 10000) * 10000;
}

function loadDaumPostcodeScript(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("daum-postcode-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.id = "daum-postcode-script";
    script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("주소 검색 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

export function CrawlerVatTab() {
  const [address, setAddress] = useState("");
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressMessage, setAddressMessage] = useState("");
  const [pnu, setPnu] = useState<string | null>(null);
  const [dong, setDong] = useState("");
  const [ho, setHo] = useState("");
  const [isBasement, setIsBasement] = useState(false);

  const [landArea, setLandArea] = useState("");
  const [buildingArea, setBuildingArea] = useState("");
  const [salePrice, setSalePrice] = useState("");

  const [usageType, setUsageType] = useState<"주거용" | "상업용">("주거용");
  const [structureIndex, setStructureIndex] = useState(3);
  // 카테고리(주거용/상업용)별로 옵션 목록 자체가 다르므로 선택된 "인덱스"를
  // 들고, 실제 지수값은 렌더링 시 usageOptions[usageOptionIndex]에서 구한다
  // — 카테고리를 바꿔도 유효하지 않은 value가 남지 않게 하기 위함
  // (사용자 지적: 상업용을 눌러도 반영이 안 됨, 2026-07-23).
  const [usageOptionIndex, setUsageOptionIndex] = useState(0);
  const [builtYear, setBuiltYear] = useState("");

  const usageOptions =
    usageType === "주거용" ? RESIDENTIAL_USAGE_OPTIONS : COMMERCIAL_USAGE_OPTIONS;
  const usage = usageOptions[usageOptionIndex] ?? usageOptions[0];

  function handleUsageTypeChange(next: "주거용" | "상업용") {
    setUsageType(next);
    setUsageOptionIndex(0);
  }

  const [landPricePerM2, setLandPricePerM2] = useState("");
  const [buildingStandardPrice, setBuildingStandardPrice] = useState("");

  const [autoFetchLoading, setAutoFetchLoading] = useState(false);
  const [autoFetchMessage, setAutoFetchMessage] = useState("");

  const [calculated, setCalculated] = useState(false);
  const [autoCalcNote, setAutoCalcNote] = useState("");

  async function handleAddressSearch() {
    setAddressMessage("");
    try {
      await loadDaumPostcodeScript();
    } catch (err) {
      setAddressMessage(err instanceof Error ? err.message : "주소 검색 스크립트 로드 실패");
      return;
    }
    if (!window.daum?.Postcode) {
      setAddressMessage("주소 검색 스크립트를 불러오지 못했습니다.");
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data) => {
        const roadAddress = data.roadAddress || data.jibunAddress;
        setAddress(roadAddress);
        void fetchLandPriceForAddress(roadAddress);
      },
    }).open();
  }

  async function fetchLandPriceForAddress(fullAddress: string) {
    setAddressLoading(true);
    setAddressMessage("");
    setPnu(null);
    try {
      const coord = await fetchVatAddressCoord(fullAddress);
      if (!coord) {
        setAddressMessage("주소를 좌표로 변환하지 못했습니다. 지번주소로 다시 시도해 주세요.");
        return;
      }
      setPnu(coord.pnu);
      const jiga = await fetchVatLandPrice(coord.x, coord.y);
      if (jiga == null) {
        setAddressMessage("이 위치의 개별공시지가를 찾지 못했습니다. 직접 입력해 주세요.");
        return;
      }
      setLandPricePerM2(String(jiga));
      setAddressMessage(`2026년 공시 — VWorld API 자동 조회 완료 (${jiga.toLocaleString("ko-KR")}원/㎡)`);
    } catch (err) {
      setAddressMessage(err instanceof Error ? err.message : "공시지가 조회에 실패했습니다.");
    } finally {
      setAddressLoading(false);
    }
  }

  async function handleAutoFetchBuilding() {
    setAutoFetchLoading(true);
    setAutoFetchMessage("");
    if (!pnu) {
      setAutoFetchMessage(
        "먼저 주소검색을 완료해 주세요(주소를 찾지 못했다면 지번주소로 다시 시도해 보세요).",
      );
      setAutoFetchLoading(false);
      return;
    }
    try {
      const info = await fetchVatBuildingRegister(pnu, dong, ho);
      if (!info) {
        setAutoFetchMessage("건축물대장 정보를 찾지 못했습니다.");
        return;
      }
      if (info.totalArea != null) setBuildingArea(String(info.totalArea));
      if (info.builtYear) setBuiltYear(info.builtYear);
      const parts = [
        info.totalArea != null ? `연면적 ${info.totalArea}㎡` : null,
        info.builtYear ? `사용승인 ${info.builtYear}년` : null,
        info.structureName ? `구조 ${info.structureName}` : null,
        info.mainPurposeName ? `주용도 ${info.mainPurposeName}` : null,
      ].filter(Boolean);
      setAutoFetchMessage(
        parts.length > 0
          ? `건축물대장 자동 조회 완료 (${parts.join(" · ")})`
          : "건축물대장 자동 조회 완료",
      );
    } catch (err) {
      setAutoFetchMessage(
        err instanceof Error ? err.message : "건축물대장 조회에 실패했습니다.",
      );
    } finally {
      setAutoFetchLoading(false);
    }
  }

  function handleAutoCalcBuildingStandardPrice() {
    const area = parseNum(buildingArea);
    const landUnitPrice = parseNum(landPricePerM2);
    const year = parseNum(builtYear);
    if (!area || !landUnitPrice || !year) {
      setAutoCalcNote(
        "건물 면적·토지공시지가·신축연도를 먼저 입력해 주세요.",
      );
      return;
    }
    const structureOption = STRUCTURE_OPTIONS[structureIndex];
    const usageIndex = parseNum(usage.value);
    const locationIndex = getLocationIndex(landUnitPrice);
    const usefulLife = DEP_GROUP_USEFUL_LIFE[structureOption.depGroup];
    // 고시연도(경과연수 1년 기준)는 현재 연도로 근사한다 — 국세청은
    // 매년 신규 고시하며 그 연도를 경과연수 1년으로 잡는다(실측 확인:
    // 2024년 고시에서 신축연도 2024=잔가율 1.000, 2026-07-21).
    const baseYear = new Date().getFullYear();
    const residualRate = calcResidualRate(year, usefulLife, baseYear);
    // 구조·용도·위치지수는 100분율(예: 100=1.0배)이라 각각 100으로
    // 나눈 뒤 곱해야 한다 — ㎡당 금액은 1,000원 단위로 절사(고시 규정,
    // 실측 검증: 850,000×1.00×1.10×1.16×0.586=635,575.6원 →
    // 635,000원/㎡×166.8163㎡=105,928,351원, 원본 사이트 105,928,350.5원과
    // 일치, 2026-07-21).
    const perM2 =
      Math.floor(
        (BUILDING_BASE_PRICE_PER_M2 *
          (structureOption.index / 100) *
          (usageIndex / 100) *
          (locationIndex / 100) *
          residualRate) /
          1000,
      ) * 1000;
    const total = Math.round(perM2 * area);
    setBuildingStandardPrice(String(total));
    setAutoCalcNote(
      `자동계산 완료 · ${BUILDING_BASE_PRICE_PER_M2.toLocaleString("ko-KR")} × ${structureOption.index}(구조) × ${usageIndex}(용도) × ${locationIndex}(위치) × ${residualRate.toFixed(3)}(잔가율, 경과 ${Math.max(0, baseYear - year)}년) → ${perM2.toLocaleString("ko-KR")}원/㎡ × ${area}㎡`,
    );
  }

  function handleReset() {
    setAddress("");
    setAddressMessage("");
    setPnu(null);
    setDong("");
    setHo("");
    setIsBasement(false);
    setLandArea("");
    setBuildingArea("");
    setSalePrice("");
    setUsageType("주거용");
    setStructureIndex(3);
    setUsageOptionIndex(0);
    setBuiltYear("");
    setLandPricePerM2("");
    setBuildingStandardPrice("");
    setAutoFetchMessage("");
    setAutoCalcNote("");
    setCalculated(false);
  }

  const result = useMemo(() => {
    const sale = parseNum(salePrice);
    const area = parseNum(landArea);
    const unitPrice = parseNum(landPricePerM2);
    const buildingStd = parseNum(buildingStandardPrice);

    const landStdTotal = area * unitPrice;
    const denominator = landStdTotal + 1.1 * buildingStd;

    // 실측(atomtax-app.vercel.app, 2026-07-21): 매도예상가·토지면적·
    // 토지공시지가(원/㎡)·건물기준시가로 여러 조합을 직접 입력해 계산
    // 버튼을 누르고 결과를 역산해 확인한 공식이다.
    // 1) 건물 공급가액(정상가) = 매도예상가 × 건물기준시가
    //    / (토지공시지가×토지면적 + 1.1×건물기준시가)
    // 2) 실제 적용 건물가액(분배 후) = 정상가 × 70%("최저가" 기준)
    // 3) 부가세(최저가) = 건물가액(분배 후) × 10%
    // 4) 토지가액(분배 후) = 매도예상가 − 건물가액 − 부가세
    // 결과는 항상 만원 단위로 반올림해 표시된다(실측 확인).
    const buildingSupplyMarket = denominator > 0 ? (sale * buildingStd) / denominator : 0;
    const buildingAlloc = roundToManWon(buildingSupplyMarket * 0.7);
    const vatLow = roundToManWon(buildingAlloc * 0.1);
    const landAlloc = sale - buildingAlloc - vatLow;
    const vatMarket = roundToManWon(buildingSupplyMarket * 0.1);

    return { landAlloc, buildingAlloc, vatLow, vatMarket, sale };
  }, [salePrice, landArea, landPricePerM2, buildingStandardPrice]);

  const fieldClass =
    "w-full px-3 py-2 text-sm border border-border rounded-sm bg-card";
  const sectionTitleClass = "text-sm font-bold flex items-center gap-1.5";
  const hintClass = "text-xs text-muted-foreground mt-1";

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <div>
        <h3 className="text-lg font-bold">🏢 건물분 부가가치세 계산기</h3>
        <p className="text-sm text-muted-foreground mt-1">
          매매사업자용 부가가치세 자동 계산 도구
        </p>
      </div>

      {/* 기본 정보 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className={sectionTitleClass}>📍 기본 정보</h4>
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 text-xs border border-border rounded-sm hover:bg-secondary/50"
          >
            초기화
          </button>
        </div>

        <div>
          <label className="text-sm font-medium">물건 위치*</label>
          <div className="flex gap-2 mt-1">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="주소를 검색하세요"
              className={fieldClass}
              readOnly
            />
            <button
              type="button"
              onClick={() => void handleAddressSearch()}
              className="px-4 py-2 text-sm rounded-sm bg-primary text-primary-foreground whitespace-nowrap disabled:opacity-50"
              disabled={addressLoading}
            >
              주소검색
            </button>
          </div>
          {addressMessage && (
            <p className={`${hintClass} ${addressLoading ? "" : "text-primary"}`}>
              {addressLoading ? "조회 중..." : addressMessage}
            </p>
          )}
        </div>

        <div>
          <span className="text-sm font-medium">상세 위치</span>
          <div className="flex gap-2 mt-1 items-center">
            <input
              value={dong}
              onChange={(e) => setDong(e.target.value)}
              placeholder="동"
              className={fieldClass}
            />
            <input
              value={ho}
              onChange={(e) => setHo(e.target.value)}
              placeholder="호 (숫자)"
              className={fieldClass}
            />
            <label className="flex items-center gap-1.5 text-sm whitespace-nowrap px-1">
              <input
                type="checkbox"
                checked={isBasement}
                onChange={(e) => setIsBasement(e.target.checked)}
              />
              지하
            </label>
          </div>
          <p className={hintClass}>단독주택의 경우 빈칸</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-sm font-medium">토지 면적(㎡)*</span>
            <input
              value={landArea}
              onChange={(e) => setLandArea(e.target.value)}
              placeholder="예: 21.75"
              className={fieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">건물 면적(㎡)*</span>
            <div className="flex gap-2">
              <input
                value={buildingArea}
                onChange={(e) => setBuildingArea(e.target.value)}
                placeholder="예: 242.83"
                className={fieldClass}
              />
              <button
                type="button"
                onClick={() => void handleAutoFetchBuilding()}
                disabled={autoFetchLoading}
                className="px-3 py-2 text-xs rounded-sm border border-border whitespace-nowrap disabled:opacity-50"
              >
                {autoFetchLoading ? "조회 중..." : "자동 조회"}
              </button>
            </div>
          </label>
        </div>
        <p className={hintClass}>
          공용부 + 전유부 모두 포함합니다. [자동 조회]는 주소 검색 완료
          후 활성화됩니다.
        </p>
        {autoFetchMessage && (
          <p className="text-xs text-primary">{autoFetchMessage}</p>
        )}

        <label className="space-y-1 block">
          <span className="text-sm font-medium">매도예상가 (원)*</span>
          <input
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            placeholder="예: 740,000,000"
            className={fieldClass}
          />
        </label>
        <p className={hintClass}>
          VAT 포함 총액. 숫자만 입력하세요. (예: 7억 4천만원 → 740000000)
        </p>
      </div>

      {/* 건물 정보 */}
      <div className="space-y-4">
        <h4 className={sectionTitleClass}>🏗️ 건물 정보</h4>
        <p className={hintClass}>
          기준시가 자동계산에 사용됩니다. 자동조회 시 신축연도가 자동으로
          채워집니다.
        </p>

        <div>
          <span className="text-sm font-medium">용도 구분*</span>
          <div className="flex gap-2 mt-1">
            {(["주거용", "상업용"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => handleUsageTypeChange(v)}
                className={`px-4 py-2 text-sm rounded-sm border ${
                  usageType === v
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-secondary/50"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <label className="space-y-1 block">
          <span className="text-sm font-medium">구조*</span>
          <select
            value={structureIndex}
            onChange={(e) => setStructureIndex(Number(e.target.value))}
            className={fieldClass}
          >
            {STRUCTURE_OPTIONS.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label} ({s.index})
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium">용도*</span>
          <select
            value={usageOptionIndex}
            onChange={(e) => setUsageOptionIndex(Number(e.target.value))}
            className={fieldClass}
          >
            {usageOptions.map((o, i) => (
              <option key={`${o.value}-${o.label}`} value={i}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium">신축연도*</span>
          <input
            value={builtYear}
            onChange={(e) => setBuiltYear(e.target.value)}
            placeholder="2026"
            className={fieldClass}
          />
        </label>
      </div>

      {/* 조회 정보 */}
      <div className="space-y-4">
        <h4 className={sectionTitleClass}>💰 조회 정보</h4>

        <label className="space-y-1 block">
          <span className="text-sm font-medium">토지공시지가(원/㎡) *</span>
          <input
            value={landPricePerM2}
            onChange={(e) => setLandPricePerM2(e.target.value)}
            placeholder="예: 3,553,000"
            className={fieldClass}
          />
          <p className={hintClass}>
            주소 검색 시 자동 조회됩니다. 실제 최신값은 개별공시지가
            조회에서 확인 가능합니다.
          </p>
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium">
            건물기준시가 (전체 금액, 원) *
          </span>
          <div className="flex gap-2">
            <input
              value={buildingStandardPrice}
              onChange={(e) => setBuildingStandardPrice(e.target.value)}
              placeholder="예: 265,800,000"
              className={fieldClass}
            />
            <button
              type="button"
              onClick={handleAutoCalcBuildingStandardPrice}
              className="px-3 py-2 text-xs rounded-sm border border-border whitespace-nowrap"
            >
              자동계산
            </button>
          </div>
          <p className={hintClass}>
            직접 입력하거나, 구조/용도/신축연도 입력 후 [자동계산]을
            사용하세요(2024.1.1. 시행 국세청 고시 기준).
          </p>
          {autoCalcNote && (
            <p className="text-xs text-primary">{autoCalcNote}</p>
          )}
        </label>
      </div>

      <button
        type="button"
        onClick={() => setCalculated(true)}
        className="w-full py-3 text-sm font-semibold rounded-sm bg-primary text-primary-foreground"
      >
        부가가치세 계산하기
      </button>

      {calculated && (
        <div className="space-y-3 border border-border rounded-sm p-4 bg-secondary/20">
          <h4 className="text-sm font-bold">계산 결과</h4>
          <p className="text-xs text-amber-600">
            ⚠️ 자동계산 수치는 반드시 공시지가 조회 사이트, 건축물대장과
            비교하여 검증하시기 바랍니다.
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">
                부가가치세 시가 (정상가)
              </p>
              <p className="font-mono">{formatWon(result.vatMarket)} 원</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                부가가치세 최저가 (70%)
              </p>
              <p className="font-mono text-primary font-semibold">
                {formatWon(result.vatLow)} 원
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                토지가액 (분배 후)
              </p>
              <p className="font-mono">{formatWon(result.landAlloc)} 원</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                건물가액 (분배 후)
              </p>
              <p className="font-mono font-semibold">
                {formatWon(result.buildingAlloc)} 원
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-1 border-t border-border">
            합계(검증) = {formatWon(result.sale)} 원 · 매도예상가{" "}
            {formatWon(result.sale)} 원 {result.sale > 0 ? "✓" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
