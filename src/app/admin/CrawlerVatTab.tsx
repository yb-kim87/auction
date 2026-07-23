"use client";

import { useMemo, useState } from "react";
import {
  fetchVatAddressCoord,
  fetchVatBuildingRegister,
  fetchVatLandPrice,
} from "@/lib/api";
import {
  matchStructureIndex,
  matchUsage,
  getLocationIndex,
  calcResidualRate,
  BUILDING_BASE_PRICE_PER_M2,
} from "@/lib/vat-calc";

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
  const [landPriceGosi, setLandPriceGosi] = useState<{
    year: string | null;
    month: string | null;
  } | null>(null);
  const [landPriceAutoFetched, setLandPriceAutoFetched] = useState(false);

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
    setLandPriceGosi(null);
    setLandPriceAutoFetched(false);
    try {
      const coord = await fetchVatAddressCoord(fullAddress);
      if (!coord) {
        setAddressMessage("주소를 좌표로 변환하지 못했습니다. 지번주소로 다시 시도해 주세요.");
        return;
      }
      setPnu(coord.pnu);
      await fetchLandPriceForCoord(coord.x, coord.y);
    } catch (err) {
      setAddressMessage(err instanceof Error ? err.message : "공시지가 조회에 실패했습니다.");
    } finally {
      setAddressLoading(false);
    }
  }

  const [lastCoord, setLastCoord] = useState<{ x: string; y: string } | null>(null);

  async function fetchLandPriceForCoord(x: string, y: string) {
    setLastCoord({ x, y });
    const result = await fetchVatLandPrice(x, y);
    if (result == null) {
      setAddressMessage("이 위치의 개별공시지가를 찾지 못했습니다. 직접 입력해 주세요.");
      setLandPriceGosi(null);
      setLandPriceAutoFetched(false);
      return;
    }
    setLandPricePerM2(String(result.jiga));
    setLandPriceGosi({ year: result.gosiYear, month: result.gosiMonth });
    setLandPriceAutoFetched(true);
    setAddressMessage("");
  }

  async function handleRefetchLandPrice() {
    if (!lastCoord) return;
    setAddressLoading(true);
    setAddressMessage("");
    try {
      await fetchLandPriceForCoord(lastCoord.x, lastCoord.y);
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

      // 구조/용도 자동 채우기 — atomtax-app처럼 건축물대장 조회 결과로
      // 드롭박스까지 자동 매칭한다(사용자 요청, 2026-07-23). 매칭 실패 시
      // 기존 선택값을 그대로 두고 사용자가 직접 고르게 한다.
      let matchedStructureLabel: string | null = null;
      const structureMatch = matchStructureIndex(info.structureName);
      if (structureMatch) {
        const idx = STRUCTURE_OPTIONS.findIndex((s) => s.index === structureMatch.index);
        if (idx >= 0) {
          setStructureIndex(idx);
          matchedStructureLabel = STRUCTURE_OPTIONS[idx].label;
        }
      }

      let matchedUsageLabel: string | null = null;
      const usageMatch = matchUsage(info.mainPurposeName);
      if (usageMatch) {
        setUsageType(usageMatch.usageType);
        const options =
          usageMatch.usageType === "주거용" ? RESIDENTIAL_USAGE_OPTIONS : COMMERCIAL_USAGE_OPTIONS;
        const idx = options.findIndex((o) => o.label.startsWith(usageMatch.label));
        if (idx >= 0) {
          setUsageOptionIndex(idx);
          matchedUsageLabel = options[idx].label;
        }
      }

      const parts = [
        info.totalArea != null ? `연면적 ${info.totalArea}㎡` : null,
        info.builtYear ? `사용승인 ${info.builtYear}년` : null,
        matchedStructureLabel ? `구조 ${matchedStructureLabel} 자동선택` : info.structureName ? `구조 ${info.structureName}(매칭 실패, 직접 선택 필요)` : null,
        matchedUsageLabel ? `용도 ${matchedUsageLabel} 자동선택` : info.mainPurposeName ? `주용도 ${info.mainPurposeName}(매칭 실패, 직접 선택 필요)` : null,
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
    setLandPriceGosi(null);
    setLandPriceAutoFetched(false);
    setLastCoord(null);
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

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (parseNum(salePrice) <= 0) missing.push("매도예상가");
    if (parseNum(landArea) <= 0) missing.push("토지면적");
    if (parseNum(landPricePerM2) <= 0) missing.push("토지공시지가");
    if (parseNum(buildingStandardPrice) <= 0) missing.push("건물기준시가");
    return missing;
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
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">토지공시지가(원/㎡) *</span>
            {landPriceAutoFetched && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                  ✓ 자동 조회됨
                </span>
                {lastCoord && (
                  <button
                    type="button"
                    onClick={() => void handleRefetchLandPrice()}
                    disabled={addressLoading}
                    className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    ↻ 다시 조회
                  </button>
                )}
              </div>
            )}
          </div>
          <input
            value={landPricePerM2}
            onChange={(e) => setLandPricePerM2(e.target.value)}
            placeholder="예: 3,553,000"
            className={fieldClass}
          />
          {landPriceAutoFetched && landPriceGosi?.year ? (
            <p className="text-xs text-destructive border border-destructive/40 rounded-sm px-2 py-1.5 bg-destructive/5">
              {landPriceGosi.year}년 공시
              {landPriceGosi.month ? ` (${landPriceGosi.year}-${landPriceGosi.month})` : ""} —
              VWorld API 자동 조회. 실제 최신값은{" "}
              <a
                href="https://www.realtyprice.kr:447/notice/gsindividual/util/util.htm"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                개별공시지가 조회
              </a>
              에서 비교하세요.
            </p>
          ) : (
            <p className={hintClass}>
              주소 검색 시 자동 조회됩니다. 실제 최신값은 개별공시지가
              조회에서 확인 가능합니다.
            </p>
          )}
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

      {calculated && missingFields.length > 0 && (
        <div className="border border-destructive/40 rounded-sm p-4 bg-destructive/5">
          <p className="text-sm text-destructive font-medium">
            다음 항목을 입력해야 계산할 수 있습니다: {missingFields.join(", ")}
          </p>
        </div>
      )}

      {calculated && missingFields.length === 0 && (
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
