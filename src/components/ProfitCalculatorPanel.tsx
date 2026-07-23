"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AuctionItem } from "@/types/auction";
import { formatWonShort } from "@/lib/investment-money";
import {
  calculateProfit,
  isOver85Sqm,
  isOfficetel,
  acquisitionTaxBracketLabel,
  type ProfitCalculatorInput,
} from "@/lib/profit-calculator";
import { parseAuctionAddress } from "@/lib/address-parse";
import {
  fetchVatAddressCoord,
  fetchVatBuildingRegister,
  fetchVatCalc,
  fetchVatLandPrice,
} from "@/lib/api";

function parseAreaNumber(value: string | null | undefined): number | null {
  const num = Number.parseFloat(String(value ?? "").match(/[\d.]+/)?.[0] ?? "");
  return Number.isFinite(num) && num > 0 ? num : null;
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  helper,
  readOnly,
}: {
  label: string;
  value: number;
  onChange?: (next: number) => void;
  suffix?: string;
  helper?: string;
  readOnly?: boolean;
}) {
  // 값이 커서 콤마 없이는 자릿수를 헷갈리기 쉽다는 지적(사용자 요청,
  // 2026-07-23) — type="number" input은 브라우저가 콤마 포함 문자열을
  // 거부해 표시할 수 없으므로 text input + 직접 포맷팅으로 전환.
  // 편집 중에도 콤마를 계속 보여달라는 요청(2026-07-23)에 따라, draft는
  // 콤마 없는 순수 숫자만 들고 화면엔 항상 포맷팅해서 표시한다. 커서
  // 위치는 "끝에서부터 남은 글자 수"로 재계산해 콤마가 늘거나 줄어도
  // 입력 지점이 튀지 않게 유지한다.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const caretFromEndRef = useRef<number | null>(null);

  function formatDraft(raw: string): string {
    if (raw === "" || raw === ".") return raw;
    const [intPart, decPart] = raw.split(".");
    const formattedInt = intPart === "" ? "" : Number(intPart).toLocaleString("ko-KR");
    return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
  }

  const displayValue = editing ? formatDraft(draft) : value.toLocaleString("ko-KR");

  useEffect(() => {
    if (!editing || caretFromEndRef.current == null || !inputRef.current) return;
    const pos = Math.max(0, displayValue.length - caretFromEndRef.current);
    inputRef.current.setSelectionRange(pos, pos);
    caretFromEndRef.current = null;
  }, [displayValue, editing]);

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {helper && <p className="text-[11px] text-muted-foreground mt-0.5">{helper}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {readOnly ? (
          <span
            className="w-32 text-sm text-right text-foreground/70"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {value.toLocaleString("ko-KR")}
          </span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={displayValue}
            onFocus={() => {
              setEditing(true);
              setDraft(String(value));
            }}
            onChange={(e) => {
              // 앞자리 불필요한 0 제거("0" 뒤에 숫자를 이어 쳐도
              // "0172032000"처럼 0이 안 지워지고 남는 문제 수정,
              // 사용자 지적 2026-07-23) — 소수점(대출 연이자율 등)은
              // 유지하되, 정수부 선행 0만 없앤다. 전부 지운 빈 값이나
              // "." 하나만 남은 상태는 정규화하지 않고 그대로 둔다
              // (소수점 입력 도중에 값이 사라지는 것을 방지).
              const caretPos = e.target.selectionStart ?? e.target.value.length;
              caretFromEndRef.current = e.target.value.length - caretPos;
              const raw = e.target.value.replace(/[^\d.]/g, "");
              const normalized =
                raw === "" || raw === "."
                  ? raw
                  : raw.replace(/^0+(?=\d)/, "");
              setDraft(normalized);
              onChange?.(Number(normalized) || 0);
            }}
            onBlur={() => setEditing(false)}
            className="w-32 px-2 py-1.5 text-sm text-right border border-border rounded-sm bg-card"
            style={{ fontFamily: "'Inter', sans-serif" }}
          />
        )}
        {suffix && <span className="text-xs text-muted-foreground w-6">{suffix}</span>}
      </div>
    </div>
  );
}

function ResultRow({
  label,
  value,
  emphasis,
  positive,
  helper,
  labelDark,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  positive?: boolean;
  helper?: string;
  labelDark?: boolean;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <span
          className={`text-[13px] ${
            emphasis ? "font-semibold text-foreground" : labelDark ? "font-medium text-foreground" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
        <span
          className={`text-sm ${emphasis ? "font-bold" : "font-medium"} ${
            positive === true ? "text-blue-600" : positive === false ? "text-red-500" : "text-foreground"
          }`}
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {value}
        </span>
      </div>
      {helper && <p className="text-[11px] text-muted-foreground mt-0.5">{helper}</p>}
    </div>
  );
}

export function ProfitCalculatorPanel({
  item,
  loanRatio,
  appraisalRatio,
  incomeLoanLimit,
  existingLoanWon,
  housingCount,
  regulatedArea,
}: {
  item: AuctionItem;
  loanRatio?: number | null;
  appraisalRatio?: number | null;
  incomeLoanLimit?: number | null;
  existingLoanWon?: number | null;
  housingCount?: number | null;
  regulatedArea?: boolean | null;
}) {
  // 이미 낙찰된 물건(caseState="낙찰")은 예상 최저가가 아니라 실제
  // 낙찰가(item.salePrice, DB 엑셀 컬럼명 "낙찰가")로 초기값을 채운다
  // (사용자 요청: "낙찰된 물건은 낙찰가에 최저가를 넣지 말고 실제
  // 낙찰가정보를 넣어줘", 2026-07-23).
  const [bidPrice, setBidPrice] = useState(
    item.caseState === "낙찰" && item.salePrice ? item.salePrice : item.minPrice,
  );
  const [salePrice, setSalePrice] = useState(item.appraisedValue);
  const [holdingMonths, setHoldingMonths] = useState(4);
  const [loanRatioByAppraisal, setLoanRatioByAppraisal] = useState(
    Math.round((appraisalRatio ?? 0.7) * 100),
  );
  const [loanRatioByBidPrice, setLoanRatioByBidPrice] = useState(
    Math.round(Math.min(loanRatio ?? 0.8, 1) * 100),
  );
  const [loanInterestRate, setLoanInterestRate] = useState(4.5);
  const [earlyRepaymentFeeRate, setEarlyRepaymentFeeRate] = useState(0);
  const [interiorCost, setInteriorCost] = useState(2_000_000);
  const [evictionCost, setEvictionCost] = useState(2_000_000);
  const [unpaidMaintenanceFee, setUnpaidMaintenanceFee] = useState(1_000_000);
  const [extraRealtyFee, setExtraRealtyFee] = useState(0);
  // 오피스텔은 면적(85㎡)과 무관하게 항상 부가세 부담이 발생한다(사용자
  // 확인, 2026-07-23) — 85㎡ 초과 판정에 오피스텔 여부를 OR 조건으로 추가.
  const isOfficetelItem = isOfficetel(item.usage);
  const over85 = isOver85Sqm(item.area) || isOfficetelItem;
  const [vatAmount, setVatAmount] = useState(over85 ? Math.round(item.appraisedValue * 0.1 * 0.5) : 0);
  const [vatEdited, setVatEdited] = useState(false);
  const [applyProgressiveDeduction, setApplyProgressiveDeduction] = useState(true);
  const [existingIncome, setExistingIncome] = useState(0);

  // 85㎡ 초과 물건의 부가세는 매도가×10%×50% 추정치 대신, 관리자
  // 부가세계산 탭(CrawlerVatTab)과 동일한 국세청 고시 공식으로 정확히
  // 계산할 수 있다 — 토지면적은 물건의 landShare, 신축연도는 builtYear를
  // 그대로 쓰고, 건물면적·토지공시지가는 물건 주소로 VWorld/건축물대장
  // API를 자동조회해서 채운다. 물건 상세를 열 때마다 외부 API를 부르면
  // 낭비이므로, "자동계산" 버튼을 눌렀을 때만 조회한다(사용자 요청,
  // 2026-07-21). 계산에 필요한 자료가 갖춰지면 매도가가 바뀔 때마다
  // calcVat만 다시 돌려 부가세 최저가를 갱신한다.
  const [vatAutoLoading, setVatAutoLoading] = useState(false);
  const [vatAutoNote, setVatAutoNote] = useState<string | null>(null);
  const [vatAutoReady, setVatAutoReady] = useState(false);
  const [vatLandArea, setVatLandArea] = useState<number | null>(null);
  const [vatLandPricePerM2, setVatLandPricePerM2] = useState<number | null>(null);
  const [vatBuildingArea, setVatBuildingArea] = useState<number | null>(null);
  const [vatBuiltYear, setVatBuiltYear] = useState<number | null>(null);
  const [vatStructureName, setVatStructureName] = useState<string | null>(null);
  const [vatMainPurposeName, setVatMainPurposeName] = useState<string | null>(null);
  const [vatGroundFloors, setVatGroundFloors] = useState<number | null>(null);
  // 계산에 실제 쓰인 용도지수 라벨 — 화면 helper에 함께 표시해 "매도가는
  // 맞는데 결과가 다르다"는 문의가 왔을 때 용도 판정 자체가 어긋난 건
  // 아닌지 바로 확인할 수 있게 한다(사용자 요청, 2026-07-23).
  const [vatUsageLabel, setVatUsageLabel] = useState<string | null>(null);
  // 부가세는 기본으로 정상가(시가) 기준을 노출하고, 체크박스를 켜면
  // 최저가(국세청 고시상 하한) 기준으로 전환한다(사용자 요청, 2026-07-21).
  const [vatUseLowPrice, setVatUseLowPrice] = useState(false);

  async function handleAutoCalcVat() {
    setVatAutoLoading(true);
    setVatAutoNote(null);
    try {
      const landArea = parseAreaNumber(item.landShare);
      if (!landArea) {
        setVatAutoNote("토지지분 정보가 없어 자동계산을 사용할 수 없습니다.");
        return;
      }
      const { searchAddress, dong, ho } = parseAuctionAddress(item.address);
      const coord = await fetchVatAddressCoord(searchAddress);
      if (!coord) {
        setVatAutoNote("주소를 좌표로 변환하지 못해 자동계산을 사용할 수 없습니다.");
        return;
      }
      const dbSharedArea = parseAreaNumber(item.sharedArea ?? "") ?? 0;
      // 크롤링 DB에 저장된 usage 텍스트는 건축물대장 실측값과 다를 수
      // 있어(실측: "오피스텔(주거)"로 크롤링됐지만 실제 건축물대장은
      // "공동주택"·6층이라 아파트로 계산해야 했던 사례, 2026-07-23) 용도
      // 지수 판정에 신뢰할 수 없다 — 구조/용도/층수는 건축물대장 API를
      // 항상 호출해 가져온다(사용자 요청: "앞으로는 api를 호출해서
      // 가져오는걸로 하자"). 다만 면적·토지·공시지가는 이미 DB에 신뢰할
      // 수 있는 값이 있으면 그대로 쓴다(API 재호출로 값이 흔들리지 않게,
      // "공시가 토지는 그대로 쓰되 용도랑 구조만 가져오자").
      const [jiga, buildingInfo] = await Promise.all([
        fetchVatLandPrice(coord.x, coord.y),
        !coord.pnu ? null : fetchVatBuildingRegister(coord.pnu, dong ?? undefined, ho ?? undefined),
      ]);
      if (jiga == null) {
        setVatAutoNote("개별공시지가를 조회하지 못해 자동계산을 사용할 수 없습니다.");
        return;
      }
      const jigaValue = jiga.jiga;
      const builtYear = item.builtYear || parseAreaNumber(String(buildingInfo?.builtYear ?? "")) || null;
      if (!builtYear) {
        setVatAutoNote("신축연도 정보가 없어 자동계산을 사용할 수 없습니다.");
        return;
      }
      const exclusiveArea = parseAreaNumber(item.area) ?? 0;
      const buildingArea =
        dbSharedArea > 0 ? exclusiveArea + dbSharedArea : (buildingInfo?.totalArea ?? exclusiveArea);

      setVatLandArea(landArea);
      setVatLandPricePerM2(jigaValue);
      setVatBuildingArea(buildingArea);
      setVatBuiltYear(builtYear);
      setVatStructureName(buildingInfo?.structureName ?? null);
      setVatMainPurposeName(buildingInfo?.mainPurposeName ?? null);
      setVatGroundFloors(buildingInfo?.groundFloors ?? null);
      setVatAutoReady(true);
      setVatEdited(false);
      setVatAutoNote(
        `자동계산 완료 · 토지 ${landArea}㎡ · 건물 ${buildingArea.toFixed(2)}㎡ · 공시지가 ${jigaValue.toLocaleString("ko-KR")}원/㎡`,
      );
    } catch (err) {
      setVatAutoNote(
        err instanceof Error ? err.message : "부가세 자동계산에 실패했습니다.",
      );
    } finally {
      setVatAutoLoading(false);
    }
  }

  // 매도가가 바뀌면 부가세도 자동으로 따라간다. 자동계산 자료가 준비됐으면
  // 국세청 공식(기본: 정상가, 체크박스 선택 시 최저가)을, 아직이면 기존
  // 추정치(매도가×10%×50%)를 쓴다. 사용자가 부가세를 직접 수정한 뒤에는
  // 더 이상 자동 갱신하지 않는다.
  useEffect(() => {
    if (!over85 || vatEdited) return;
    if (
      vatAutoReady &&
      vatLandArea != null &&
      vatLandPricePerM2 != null &&
      vatBuildingArea != null &&
      vatBuiltYear != null
    ) {
      let cancelled = false;
      fetchVatCalc({
        salePrice,
        landArea: vatLandArea,
        landPricePerM2: vatLandPricePerM2,
        buildingArea: vatBuildingArea,
        builtYear: vatBuiltYear,
        usage: item.usage,
        structureName: vatStructureName,
        mainPurposeName: vatMainPurposeName,
        groundFloors: vatGroundFloors,
      })
        .then((vat) => {
          if (cancelled) return;
          setVatAmount(vatUseLowPrice ? vat.vatLow : vat.vatMarket);
          setVatUsageLabel(vat.usageLabel ?? null);
        })
        .catch(() => {
          if (cancelled) return;
          setVatAmount(Math.round(salePrice * 0.1 * 0.5));
        });
      return () => {
        cancelled = true;
      };
    }
    setVatAmount(Math.round(salePrice * 0.1 * 0.5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    salePrice,
    over85,
    vatAutoReady,
    vatLandArea,
    vatLandPricePerM2,
    vatBuildingArea,
    vatBuiltYear,
    vatStructureName,
    vatMainPurposeName,
    vatGroundFloors,
    vatUseLowPrice,
  ]);

  const input: ProfitCalculatorInput = {
    minPrice: item.minPrice,
    appraisedValue: item.appraisedValue,
    bidPrice,
    salePrice,
    holdingMonths,
    loanRatioByAppraisal: loanRatioByAppraisal / 100,
    loanRatioByBidPrice: loanRatioByBidPrice / 100,
    incomeLoanLimit: incomeLoanLimit ?? null,
    existingLoanWon: existingLoanWon ?? 0,
    loanInterestRate: loanInterestRate / 100,
    earlyRepaymentFeeRate: earlyRepaymentFeeRate / 100,
    interiorCost,
    evictionCost,
    unpaidMaintenanceFee,
    extraRealtyFee,
    isOver85sqm: over85,
    vatAmount,
    applyProgressiveDeduction,
    existingIncome,
    housingCount,
    regulatedArea,
    usage: item.usage,
  };

  const result = useMemo(() => calculateProfit(input), [
    item.minPrice,
    item.appraisedValue,
    bidPrice,
    salePrice,
    holdingMonths,
    loanRatioByAppraisal,
    loanRatioByBidPrice,
    incomeLoanLimit,
    existingLoanWon,
    loanInterestRate,
    earlyRepaymentFeeRate,
    existingIncome,
    interiorCost,
    evictionCost,
    unpaidMaintenanceFee,
    extraRealtyFee,
    vatAmount,
    applyProgressiveDeduction,
    housingCount,
    regulatedArea,
    item.usage,
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-foreground">입찰가 산정 및 수익률 분석</h3>
        <p className="text-xs text-muted-foreground mt-1">
          낙찰가(입찰가)와 매도가를 조정하면 예상 수익률이 자동으로 계산됩니다. 대출한도는
          min(감정가×감정가비율, 낙찰가×낙찰가비율)로 계산되며, 아래 비율은 이 물건에 적용된
          대출정책 값으로 기본 설정되어 있습니다.
        </p>
      </div>

      <div
        className="rounded-xl p-4"
        style={{ background: "linear-gradient(135deg,#EEF4FF,#F0F5FF)", border: "1px solid rgba(42,82,152,0.15)" }}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <ResultRow label="대출금(LTV)" value={formatWonShort(result.loanAmount)} />
          <ResultRow label="실투자금(내자본금)" value={formatWonShort(result.equity)} />
          <ResultRow
            label="수익률"
            value={`${result.profitRate.toFixed(1)}%`}
            emphasis
            positive={result.profitRate >= 0}
          />
        </div>
        <div className="mt-2 pt-2 border-t border-primary/10">
          <ResultRow
            label="최종수익"
            value={formatWonShort(result.finalProfit)}
            emphasis
            positive={result.finalProfit >= 0}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border divide-y divide-border">
        <div className="px-3 py-2 bg-secondary/30">
          <p className="text-[12px] font-semibold text-foreground">기본 입력</p>
        </div>
        <div className="px-3">
          <NumberField
            label="낙찰가(입찰가)"
            value={bidPrice}
            onChange={setBidPrice}
            suffix="원"
            helper={`최저가 ${formatWonShort(item.minPrice)}`}
          />
          <NumberField
            label="매도가"
            value={salePrice}
            onChange={setSalePrice}
            suffix="원"
            helper={`감정가 ${formatWonShort(item.appraisedValue)}`}
          />
          <NumberField label="보유기간" value={holdingMonths} onChange={setHoldingMonths} suffix="개월" />
        </div>

        <div className="px-3 py-2 bg-secondary/30">
          <p className="text-[12px] font-semibold text-foreground">대출(LTV)</p>
        </div>
        <div className="px-3">
          <NumberField
            label="감정가 기준 비율"
            value={loanRatioByAppraisal}
            onChange={setLoanRatioByAppraisal}
            suffix="%"
          />
          <NumberField
            label="낙찰가 기준 비율"
            value={loanRatioByBidPrice}
            onChange={setLoanRatioByBidPrice}
            suffix="%"
          />
          <NumberField label="대출 연이자율" value={loanInterestRate} onChange={setLoanInterestRate} suffix="%" />
          <p className="text-[11px] text-muted-foreground leading-relaxed py-2">
            현재 대출 금액은 추정치이므로 반드시 대출상담사와 다시 한 번 확인 후 진행하세요.
          </p>
          <NumberField
            label="중도상환수수료율"
            value={earlyRepaymentFeeRate}
            onChange={setEarlyRepaymentFeeRate}
            suffix="%"
          />
        </div>

        <div className="px-3 py-2 bg-secondary/30">
          <p className="text-[12px] font-semibold text-foreground">취득/보유 비용</p>
        </div>
        <div className="px-3">
          <NumberField
            label="취득세"
            value={result.acquisitionTax}
            readOnly
            suffix="원"
            helper={
              isOfficetel(item.usage)
                ? `오피스텔 고정 취득세율 ${(result.acquisitionTaxRate * 100).toFixed(2)}% 자동 계산`
                : `${acquisitionTaxBracketLabel(housingCount, regulatedArea, item.usage)} · 취득세율 ${(result.acquisitionTaxRate * 100).toFixed(2)}% 자동 계산`
            }
          />
          <NumberField
            label="법무비"
            value={result.legalFee}
            readOnly
            suffix="원"
            helper="법무사 보수비 추정치(낙찰가의 0.7%, 임의 적용값이므로 실제와 다를 수 있습니다)"
          />
          <NumberField
            label="대출이자"
            value={result.loanInterest}
            readOnly
            suffix="원"
            helper="대출금×연이자율÷12×보유기간(개월)"
          />
          <NumberField label="인테리어(필요경비)" value={interiorCost} onChange={setInteriorCost} suffix="원" />
          <NumberField label="명도비" value={evictionCost} onChange={setEvictionCost} suffix="원" />
          <NumberField
            label="미납관리비"
            value={unpaidMaintenanceFee}
            onChange={setUnpaidMaintenanceFee}
            suffix="원"
          />
        </div>

        <div className="px-3 py-2 bg-secondary/30">
          <p className="text-[12px] font-semibold text-foreground">매도/세금</p>
        </div>
        <div className="px-3">
          <NumberField
            label="중개수수료(매도)"
            value={result.saleBrokerageFee}
            readOnly
            suffix="원"
            helper={`매도가 구간별 요율 ${(result.saleBrokerageRate * 100).toFixed(2)}% 자동 계산`}
          />
          <NumberField label="부동산 추가수수료" value={extraRealtyFee} onChange={setExtraRealtyFee} suffix="원" />
          {over85 && (
            <div
              className="my-2 px-3 py-2 rounded-lg"
              style={{
                background: "linear-gradient(135deg,#FFF7ED,#FFFBEB)",
                border: "1px solid rgba(234,88,12,0.25)",
              }}
            >
              <NumberField
                label="부가세"
                value={vatAmount}
                onChange={(next) => {
                  setVatEdited(true);
                  setVatAmount(next);
                }}
                suffix="원"
                helper={
                  vatAutoReady
                    ? `국세청 고시 공식 기준 부가가치세 ${vatUseLowPrice ? "최저가" : "정상가"}로 자동 계산됨(직접 수정 가능)`
                    : isOfficetelItem
                      ? "오피스텔 물건: 건물분 부가가치세가 발생하여 매도가의 10%×50%를 기본값으로 사용 중"
                      : "전용 85㎡ 초과 물건: 매도가의 10%×50%를 기본값으로 사용 중"
                }
              />
              {vatAutoReady && (
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer pb-1">
                  <input
                    type="checkbox"
                    checked={vatUseLowPrice}
                    onChange={(e) => {
                      setVatUseLowPrice(e.target.checked);
                      setVatEdited(false);
                    }}
                    className="w-3.5 h-3.5"
                  />
                  부가세 최저가로 표시
                </label>
              )}
              <div className="flex items-center justify-between gap-3 pb-1">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {vatAutoLoading
                    ? "물건 주소로 토지공시지가·건물면적을 조회해 정확한 부가세를 계산하는 중..."
                    : vatAutoNote ?? "물건 주소로 정확한 부가세(국세청 고시 공식)를 계산할 수 있습니다."}
                  {!vatAutoLoading && vatAutoReady && (
                    <>
                      {" "}
                      · 매도가 {salePrice.toLocaleString("ko-KR")}원
                      {vatUsageLabel && <> · 용도 {vatUsageLabel}</>}
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => void handleAutoCalcVat()}
                  disabled={vatAutoLoading}
                  className="px-3 py-1.5 text-xs rounded-sm border border-border whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  {vatAutoLoading ? "계산 중..." : "자동계산"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border p-3 space-y-1">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[12px] font-semibold text-foreground">계산 상세</p>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={applyProgressiveDeduction}
              onChange={(e) => setApplyProgressiveDeduction(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            누진공제 적용
          </label>
        </div>
        <ResultRow label="매도가" value={formatWonShort(salePrice)} />
        <ResultRow label="취득금액합계" value={formatWonShort(result.totalAcquisitionCost)} />
        <ResultRow label="매매차익" value={formatWonShort(result.saleMargin)} />
        <NumberField
          label="기존소득(연간)"
          value={existingIncome}
          onChange={setExistingIncome}
          suffix="원"
          helper="입력한 기존소득과 매매차익을 합산해 소득세율 구간을 판정합니다"
        />
        <ResultRow
          label="소득세"
          labelDark
          value={formatWonShort(result.capitalGainsTax)}
          helper={
            applyProgressiveDeduction
              ? `소득세율 ${(result.capitalGainsTaxRate * 100).toFixed(0)}% (누진공제 ${formatWonShort(result.capitalGainsTaxDeduction)})`
              : `소득세율 ${(result.capitalGainsTaxRate * 100).toFixed(0)}% (누진공제 미적용)`
          }
        />
      </div>
    </div>
  );
}
