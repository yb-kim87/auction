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

const STRUCTURE_OPTIONS = [
  "통나무조",
  "목구조",
  "철골(철골철근)콘크리트조 (SRC)",
  "철근콘크리트조 (RC)",
  "석조",
  "프리캐스트 콘크리트조 (PC)",
  "라멘조",
  "목조",
  "ALC조",
  "스틸하우스조",
  "연와조",
  "철골조",
  "보강콘크리트조",
  "보강블록조",
  "시멘트벽돌조",
  "황토조",
  "시멘트블록조",
  "와이어패널조",
  "철골조 중 조립식패널(EPS패널)",
  "조립식패널조",
  "경량철골조",
  "석회/흙벽돌조, 돌담/토담조",
  "철파이프조",
  "컨테이너건물",
];

const USAGE_OPTIONS = [
  { value: "110", label: "아파트 (110)" },
  { value: "100", label: "단독·다세대·연립·기숙사 등 (100)" },
  { value: "140", label: "오피스텔 (주거용 임대) (140)" },
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

  const [landArea, setLandArea] = useState("");
  const [buildingArea, setBuildingArea] = useState("");
  const [salePrice, setSalePrice] = useState("");

  const [usageType, setUsageType] = useState<"주거용" | "상업용">("주거용");
  const [structure, setStructure] = useState(STRUCTURE_OPTIONS[3]);
  const [usage, setUsage] = useState(USAGE_OPTIONS[0].value);
  const [builtYear, setBuiltYear] = useState("");

  const [landPricePerM2, setLandPricePerM2] = useState("");
  const [buildingStandardPrice, setBuildingStandardPrice] = useState("");

  const [autoFetchLoading, setAutoFetchLoading] = useState(false);
  const [autoFetchMessage, setAutoFetchMessage] = useState("");

  const [calculated, setCalculated] = useState(false);

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
    if (!pnu) return;
    setAutoFetchLoading(true);
    setAutoFetchMessage("");
    try {
      const info = await fetchVatBuildingRegister(pnu);
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

  function handleReset() {
    setAddress("");
    setAddressMessage("");
    setPnu(null);
    setLandArea("");
    setBuildingArea("");
    setSalePrice("");
    setUsageType("주거용");
    setStructure(STRUCTURE_OPTIONS[3]);
    setUsage(USAGE_OPTIONS[0].value);
    setBuiltYear("");
    setLandPricePerM2("");
    setBuildingStandardPrice("");
    setAutoFetchMessage("");
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
                disabled={!pnu || autoFetchLoading}
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
                onClick={() => setUsageType(v)}
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
            value={structure}
            onChange={(e) => setStructure(e.target.value)}
            className={fieldClass}
          >
            {STRUCTURE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium">용도*</span>
          <select
            value={usage}
            onChange={(e) => setUsage(e.target.value)}
            className={fieldClass}
          >
            {USAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
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
          <input
            value={buildingStandardPrice}
            onChange={(e) => setBuildingStandardPrice(e.target.value)}
            placeholder="예: 265,800,000"
            className={fieldClass}
          />
          <p className={hintClass}>
            직접 입력하거나, 구조/용도/신축연도 입력 후 계산해 주세요.
          </p>
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
