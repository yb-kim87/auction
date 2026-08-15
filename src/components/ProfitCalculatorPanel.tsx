"use client";

import { useEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from "react";
import type { AuctionAnalysisResult, AuctionItem } from "@/types/auction";
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
  saveVatBuildingInfo,
  fetchBidPlan,
  saveBidPlan,
  deleteBidPlan,
  fetchMyProfile,
  fetchAssignmentByAuction,
  createAssignment,
  fetchCoachBidPlan,
  fetchCoachAssignmentByAuction,
  updateCoachAssignment,
  type BidPlan,
  type AuctionAssignment,
} from "@/lib/api";

/** "과제제출" 버튼을 볼 수 있는 등급 — 기존 /assignments 페이지의
 * 접근 등급과 동일(사용자 요청, 2026-08-07: 물건 상세에서 바로
 * 과제제출하는 방식으로 변경). */
const ASSIGNMENT_ELIGIBLE_ROLES = new Set(["student", "consulting_student", "consultant", "admin"]);

/** 숫자만 남기고 콤마 포맷으로 보여주는 간단한 금액 입력 — 과제제출
 * 폼의 전화시세/안전마진 조사 항목에 사용(기존 /assignments 페이지와
 * 동일한 입력 방식). */
function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}
function formatDigits(value: string): string {
  const n = Number(digitsOnly(value) || 0);
  return n.toLocaleString("ko-KR");
}

/** 내용 길이에 맞춰 세로로 늘어나는 textarea — 과제 메모/피드백처럼 길이가
 * 들쭉날쭉한 텍스트가 고정 높이에 잘려 보이지 않도록 한다(사용자 요청,
 * 2026-08-14: 과제 확인 화면에서 긴 메모가 스크롤에 잘려 보인다는 지적). */
function AutoGrowTextarea({
  value,
  minRows = 2,
  className,
  ...rest
}: {
  value: string;
  minRows?: number;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "rows">) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    resize(ref.current);
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onInput={(e) => resize(e.currentTarget)}
      className={`${className ?? ""} overflow-hidden`}
      {...rest}
    />
  );
}

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

function CashBreakdownRow({
  label,
  value,
  status,
  tone = "default",
}: {
  label: string;
  value: number;
  status: string;
  tone?: "default" | "deduction" | "warning";
}) {
  const statusClass =
    tone === "warning"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : tone === "deduction"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-secondary/60 text-muted-foreground border-border";

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-b-0">
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-[12px] text-foreground">{label}</span>
        <span className={`px-1.5 py-0.5 rounded border text-[10px] whitespace-nowrap ${statusClass}`}>
          {status}
        </span>
      </div>
      <span
        className={`text-[12px] font-medium whitespace-nowrap ${
          value < 0 ? "text-blue-600" : "text-foreground"
        }`}
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {value < 0 ? "−" : ""}
        {formatWonShort(Math.abs(value))}
      </span>
    </div>
  );
}

export function ProfitCalculatorPanel({
  item,
  rightsAnalysis,
  loanRatio,
  appraisalRatio,
  incomeLoanLimit,
  existingLoanWon,
  housingCount,
  regulatedArea,
  annualNetIncomeWon,
  coachViewUsername,
  initialShowAssignmentEditor = false,
}: {
  item: AuctionItem;
  rightsAnalysis?: AuctionAnalysisResult | null;
  loanRatio?: number | null;
  appraisalRatio?: number | null;
  incomeLoanLimit?: number | null;
  existingLoanWon?: number | null;
  housingCount?: number | null;
  regulatedArea?: boolean | null;
  /** 회원 투자정보의 연순소득(원). 저장된 입찰계획이 없을 때 "기존소득(연간)"
   * 초기값으로 자동 반영한다(사용자 요청, 2026-08-02). */
  annualNetIncomeWon?: number | null;
  /** 코치(관리자)가 과제 검토 목록에서 물건번호를 눌러 들어온 경우 이
   * 수강생의 아이디 — 지정되면 로그인한 본인(관리자) 것이 아니라 이
   * 수강생이 저장한 입찰계획·제출한 과제를 읽기 전용으로 보여준다
   * (사용자 요청, 2026-08-07: "과제 물건번호를 누르면 입찰계획으로
   * 넘어가고 거기에 수강생이 과제로 제출한 정보가 보이게 하는건
   * 어떨까?"). */
  coachViewUsername?: string | null;
  /** "내 물건 > 과제제출"에서 "물건 상세에서 수정"으로 들어온 경우, 진입
   * 즉시 과제제출 편집 패널이 펼쳐진 상태로 보여준다(사용자 요청,
   * 2026-08-15: 수정하려고 들어가면 한 번 더 "제출한 과제 수정"을
   * 눌러야 하는 게 불편하다는 지적). */
  initialShowAssignmentEditor?: boolean;
}) {
  const isCoachView = Boolean(coachViewUsername);
  // 이미 낙찰된 물건은 예상 최저가가 아니라 실제 낙찰가(item.salePrice,
  // DB 엑셀 컬럼명 "낙찰가")로 초기값을 채운다(사용자 요청: "낙찰된
  // 물건은 낙찰가에 최저가를 넣지 말고 실제 낙찰가정보를 넣어줘",
  // 2026-07-23). caseState만으로 판정하면 안 된다 — 낙찰 이후에도
  // "허가"/"지급기한"/"배당기일"/"배당종결" 등 여러 후속 상태를 거치며
  // (실측: "2024타경109501"이 caseState="배당종결"인데도 salePrice가
  // 정상 존재) caseState==="낙찰"만 좁게 검사하면 이런 물건들을 놓친다.
  // salePrice 존재 여부 자체가 낙찰 여부의 더 정확한 신호다.
  const [bidPrice, setBidPrice] = useState(item.salePrice ?? item.minPrice);
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
  const hasUnpaidFeeInvestigation = Boolean(item.unpaidFeeCheckedAt?.trim());
  const investigatedUnpaidFee = hasUnpaidFeeInvestigation
    ? Math.max(0, item.unpaidFeeAmount ?? 0)
    : 0;
  const [unpaidMaintenanceFee, setUnpaidMaintenanceFee] = useState(investigatedUnpaidFee);
  const confirmedRightsAssumption =
    rightsAnalysis?.autoRights?.calculationReady
      ? Math.max(0, rightsAnalysis.autoRights.assumptionAmount ?? 0)
      : 0;
  const [extraRealtyFee, setExtraRealtyFee] = useState(0);
  // 오피스텔은 면적(85㎡)과 무관하게 항상 부가세 부담이 발생한다(사용자
  // 확인, 2026-07-23) — 85㎡ 초과 판정에 오피스텔 여부를 OR 조건으로 추가.
  const isOfficetelItem = isOfficetel(item.usage);
  const over85 = isOver85Sqm(item.area) || isOfficetelItem;
  const [vatAmount, setVatAmount] = useState(over85 ? Math.round(item.appraisedValue * 0.1 * 0.5) : 0);
  const [vatEdited, setVatEdited] = useState(false);
  const [applyProgressiveDeduction, setApplyProgressiveDeduction] = useState(true);
  const [existingIncome, setExistingIncome] = useState(annualNetIncomeWon ?? 0);

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

  // 입찰 계획 저장 — "이 가격에 이렇게 입찰하겠다"는 계산기 입력값을
  // 물건+회원 단위로 서버에 스냅샷 저장해두고, 다시 열면 그대로
  // 불러온다(사용자 요청, 2026-08-01).
  const [bidPlanMemo, setBidPlanMemo] = useState("");
  const [savedBidPlan, setSavedBidPlan] = useState<BidPlan | null>(null);
  const [bidPlanSaving, setBidPlanSaving] = useState(false);
  const [bidPlanMessage, setBidPlanMessage] = useState("");
  const [showBidPlanEditor, setShowBidPlanEditor] = useState(false);

  // 과제제출 — 물건 상세에서 바로 "메모/전화시세결과/주변 안전마진
  // 조사"를 입력해 현재 입찰계획 값과 함께 제출한다(사용자 요청,
  // 2026-08-07: "기존에 과제 제출에 있었던 메모/전화시세결과/주변
  // 안전마진 조사 부분을 입력하게 하고 그거랑 같이 입찰계획 내용이
  // 같이 저장돼서 과제제출이 되면"). 제출 현황·수정은 내 물건 >
  // 과제제출 탭에서 한다 — 여기서는 제출/재제출만 담당.
  const [assignmentEligible, setAssignmentEligible] = useState(false);
  const [savedAssignment, setSavedAssignment] = useState<AuctionAssignment | null>(null);
  const [showAssignmentEditor, setShowAssignmentEditor] = useState(initialShowAssignmentEditor);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [assignmentMemo, setAssignmentMemo] = useState("");
  const [phoneBuyer, setPhoneBuyer] = useState("");
  const [phoneSeller, setPhoneSeller] = useState("");
  const [phoneBidder, setPhoneBidder] = useState("");
  const [phoneFinal, setPhoneFinal] = useState("");
  const [safetyResearch1, setSafetyResearch1] = useState("");
  const [safetyResearch2, setSafetyResearch2] = useState("");
  const [safetyResearch3, setSafetyResearch3] = useState("");
  const [finalSafetyMargin, setFinalSafetyMargin] = useState("");

  // 코치 보기 모드 전용 — 이 화면에서 바로 피드백을 남길 수 있게 한다.
  const [coachFeedbackDraft, setCoachFeedbackDraft] = useState("");
  const [coachFeedbackSaving, setCoachFeedbackSaving] = useState(false);
  const [coachFeedbackMessage, setCoachFeedbackMessage] = useState("");

  async function handleSaveCoachFeedback() {
    if (!savedAssignment) return;
    setCoachFeedbackSaving(true);
    setCoachFeedbackMessage("");
    try {
      const saved = await updateCoachAssignment(savedAssignment.id, { coachFeedback: coachFeedbackDraft });
      setSavedAssignment(saved);
      setCoachFeedbackMessage("피드백을 저장했습니다.");
    } catch (err) {
      setCoachFeedbackMessage(err instanceof Error ? err.message : "피드백 저장에 실패했습니다.");
    } finally {
      setCoachFeedbackSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setShowBidPlanEditor(isCoachView);
    setBidPlanMessage("");
    const loadPlan = isCoachView ? fetchCoachBidPlan(coachViewUsername as string, item.id) : fetchBidPlan(item.id);
    loadPlan
      .then((plan) => {
        if (cancelled || !plan) return;
        setSavedBidPlan(plan);
        setBidPlanMemo(plan.memo ?? "");
        try {
          const saved = JSON.parse(plan.inputsJson || "{}") as Record<string, unknown>;
          if (typeof saved.bidPrice === "number") setBidPrice(saved.bidPrice);
          if (typeof saved.salePrice === "number") setSalePrice(saved.salePrice);
          if (typeof saved.holdingMonths === "number") setHoldingMonths(saved.holdingMonths);
          if (typeof saved.loanRatioByAppraisal === "number") setLoanRatioByAppraisal(saved.loanRatioByAppraisal);
          if (typeof saved.loanRatioByBidPrice === "number") setLoanRatioByBidPrice(saved.loanRatioByBidPrice);
          if (typeof saved.loanInterestRate === "number") setLoanInterestRate(saved.loanInterestRate);
          if (typeof saved.earlyRepaymentFeeRate === "number") setEarlyRepaymentFeeRate(saved.earlyRepaymentFeeRate);
          if (typeof saved.interiorCost === "number") setInteriorCost(saved.interiorCost);
          if (typeof saved.evictionCost === "number") setEvictionCost(saved.evictionCost);
          if (typeof saved.unpaidMaintenanceFee === "number") setUnpaidMaintenanceFee(saved.unpaidMaintenanceFee);
          if (typeof saved.extraRealtyFee === "number") setExtraRealtyFee(saved.extraRealtyFee);
          if (typeof saved.vatAmount === "number") {
            setVatAmount(saved.vatAmount);
            setVatEdited(true);
          }
          if (typeof saved.applyProgressiveDeduction === "boolean") {
            setApplyProgressiveDeduction(saved.applyProgressiveDeduction);
          }
          if (typeof saved.existingIncome === "number") setExistingIncome(saved.existingIncome);
        } catch {
          // 저장된 입력값 파싱 실패는 무시하고 계산기 기본값을 그대로 둔다.
        }
      })
      .catch(() => {
        // 저장된 계획이 없거나 조회 실패 — 조용히 무시(기본값 사용).
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, isCoachView, coachViewUsername]);

  useEffect(() => {
    if (isCoachView) {
      // 코치 보기 모드에서는 관리자 본인 등급과 무관하게 제출/저장 버튼을
      // 항상 숨긴다(읽기 전용) — 관리자 계정으로 실수로 저장하는 것을 방지.
      setAssignmentEligible(false);
      return;
    }
    fetchMyProfile()
      .then((profile) => setAssignmentEligible(ASSIGNMENT_ELIGIBLE_ROLES.has(profile.role)))
      .catch(() => setAssignmentEligible(false));
  }, [isCoachView]);

  useEffect(() => {
    let cancelled = false;
    setShowAssignmentEditor(isCoachView);
    setAssignmentMessage("");
    setSavedAssignment(null);
    setAssignmentMemo("");
    setPhoneBuyer("");
    setPhoneSeller("");
    setPhoneBidder("");
    setPhoneFinal("");
    setSafetyResearch1("");
    setSafetyResearch2("");
    setSafetyResearch3("");
    setFinalSafetyMargin("");
    const loadAssignment = isCoachView
      ? fetchCoachAssignmentByAuction(coachViewUsername as string, item.id)
      : fetchAssignmentByAuction(item.id);
    loadAssignment
      .then((a) => {
        if (cancelled || !a) return;
        setSavedAssignment(a);
        setAssignmentMemo(a.memo ?? "");
        setPhoneBuyer(a.phoneBuyer ?? "");
        setPhoneSeller(a.phoneSeller ?? "");
        setPhoneBidder(a.phoneBidder ?? "");
        setPhoneFinal(a.phoneFinal ?? "");
        setSafetyResearch1(a.safetyResearch1 ?? "");
        setSafetyResearch2(a.safetyResearch2 ?? "");
        setSafetyResearch3(a.safetyResearch3 ?? "");
        setFinalSafetyMargin(a.finalSafetyMargin ?? "");
        if (isCoachView) setCoachFeedbackDraft(a.coachFeedback ?? "");
      })
      .catch(() => {
        // 제출한 과제가 없거나 조회 실패 — 조용히 무시(빈 폼 유지).
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, isCoachView, coachViewUsername]);

  async function handleSaveBidPlan() {
    setBidPlanSaving(true);
    setBidPlanMessage("");
    try {
      const plan = await saveBidPlan(item.id, {
        bidPrice,
        salePrice,
        finalProfit: result.finalProfit,
        requiredEquity: result.equity,
        memo: bidPlanMemo,
        inputs: {
          bidPrice,
          salePrice,
          holdingMonths,
          loanRatioByAppraisal,
          loanRatioByBidPrice,
          loanInterestRate,
          earlyRepaymentFeeRate,
          interiorCost,
          evictionCost,
          unpaidMaintenanceFee,
          extraRealtyFee,
          vatAmount,
          applyProgressiveDeduction,
          existingIncome,
        },
      });
      setSavedBidPlan(plan);
      setBidPlanMessage("입찰 계획을 저장했습니다.");
    } catch (err) {
      setBidPlanMessage(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setBidPlanSaving(false);
    }
  }

  async function handleDeleteBidPlan() {
    setBidPlanSaving(true);
    setBidPlanMessage("");
    try {
      await deleteBidPlan(item.id);
      setSavedBidPlan(null);
      setBidPlanMessage("저장된 입찰 계획을 삭제했습니다.");
    } catch (err) {
      setBidPlanMessage(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBidPlanSaving(false);
    }
  }

  async function handleSubmitAssignment() {
    setAssignmentSaving(true);
    setAssignmentMessage("");
    try {
      // 과제제출은 현재 입찰계획 값도 함께 저장한다(사용자 요청: "입찰계획
      // 내용이 같이 저장돼서 과제제출이 되면") — 계획을 아직 저장 안 한
      // 상태에서 과제만 먼저 제출하는 경우도 있으므로 여기서도 한 번 더
      // 입찰계획을 저장해 둔다.
      const plan = await saveBidPlan(item.id, {
        bidPrice,
        salePrice,
        finalProfit: result.finalProfit,
        requiredEquity: result.equity,
        memo: bidPlanMemo,
        inputs: {
          bidPrice,
          salePrice,
          holdingMonths,
          loanRatioByAppraisal,
          loanRatioByBidPrice,
          loanInterestRate,
          earlyRepaymentFeeRate,
          interiorCost,
          evictionCost,
          unpaidMaintenanceFee,
          extraRealtyFee,
          vatAmount,
          applyProgressiveDeduction,
          existingIncome,
        },
      });
      setSavedBidPlan(plan);

      const saved = await createAssignment({
        auctionId: item.id,
        auctionNo: item.auctionNo,
        address: item.address,
        memo: assignmentMemo,
        phoneBuyer,
        phoneSeller,
        phoneBidder,
        phoneFinal,
        safetyResearch1,
        safetyResearch2,
        safetyResearch3,
        finalSafetyMargin,
        finalMarketPrice: salePrice,
        targetBidPrice: bidPrice,
        requiredEquity: result.equity,
        finalProfit: result.finalProfit,
      });
      setSavedAssignment(saved);
      setAssignmentMessage("과제가 제출되었습니다. 제출 현황은 내 물건 > 과제제출에서 확인할 수 있습니다.");
    } catch (err) {
      setAssignmentMessage(err instanceof Error ? err.message : "과제 제출에 실패했습니다.");
    } finally {
      setAssignmentSaving(false);
    }
  }

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
      // 지수 판정에 신뢰할 수 없다 — 구조/용도/층수는 건축물대장 API로
      // 확보한다. 단, 물건 고유값(PNU·구조·용도·층수)은 한 번 조회하면
      // 바뀌지 않으므로 DB에 캐싱된 값이 있으면 재호출을 생략한다
      // (사용자 요청: "공시지가는 매년 바뀔 수 있으니 호출해오고 나머지
      // 고유값은 저장해두자", 2026-07-24) — 공시지가만 항상 새로 받는다.
      const hasCachedBuildingInfo =
        !!item.vatStructureName || !!item.vatMainPurposeName || item.vatGroundFloors != null;
      const hasCachedHousingLedgerPk = !!item.housingLedgerPk;
      // 구조/용도/층수가 이미 캐싱돼 있어도 housingLedgerPk가 아직 없으면
      // (2026-08-06에 새로 추가된 필드라 이전 캐싱분엔 없다) 건축물대장을
      // 다시 조회해 PK만이라도 채운다.
      const needsBuildingLookup = !hasCachedBuildingInfo || !hasCachedHousingLedgerPk;
      const [jiga, buildingInfo] = await Promise.all([
        fetchVatLandPrice(coord.x, coord.y),
        needsBuildingLookup && coord.pnu
          ? fetchVatBuildingRegister(coord.pnu, dong ?? undefined, ho ?? undefined)
          : null,
      ]);
      if (jiga == null) {
        setVatAutoNote("개별공시지가를 조회하지 못해 자동계산을 사용할 수 없습니다.");
        return;
      }
      const jigaValue = jiga.jiga;
      const structureName = hasCachedBuildingInfo
        ? (item.vatStructureName ?? null)
        : (buildingInfo?.structureName ?? null);
      const mainPurposeName = hasCachedBuildingInfo
        ? (item.vatMainPurposeName ?? null)
        : (buildingInfo?.mainPurposeName ?? null);
      const groundFloors = hasCachedBuildingInfo
        ? (item.vatGroundFloors ?? null)
        : (buildingInfo?.groundFloors ?? null);
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
      setVatStructureName(structureName);
      setVatMainPurposeName(mainPurposeName);
      setVatGroundFloors(groundFloors);
      setVatAutoReady(true);
      setVatEdited(false);
      setVatAutoNote(
        `자동계산 완료 · 토지 ${landArea}㎡ · 건물 ${buildingArea.toFixed(2)}㎡ · 공시지가 ${jigaValue.toLocaleString("ko-KR")}원/㎡`,
      );

      // 새로 조회한 건축물대장 정보(처음 자동계산하는 물건)는 DB에
      // 캐싱해 다음번엔 API 호출을 건너뛴다. 이미 캐싱돼 있던 물건은
      // 다시 저장할 필요 없다.
      if (!hasCachedBuildingInfo && buildingInfo) {
        void saveVatBuildingInfo(item.id, {
          vatPnu: coord.pnu ?? null,
          vatStructureName: buildingInfo.structureName ?? null,
          vatMainPurposeName: buildingInfo.mainPurposeName ?? null,
          vatGroundFloors: buildingInfo.groundFloors ?? null,
          ...(hasCachedHousingLedgerPk
            ? {}
            : {
                housingLedgerPk: buildingInfo.housingLedgerPk ?? null,
                housingLedgerDongNm: buildingInfo.housingLedgerDongNm ?? null,
              }),
        });
      } else if (!hasCachedHousingLedgerPk && buildingInfo?.housingLedgerPk) {
        // 구조/용도/층수는 이미 캐싱돼 자동조회를 건너뛴 물건이라도,
        // PK만 따로 아직 없을 수 있다(2026-08-06에 새로 추가된 필드라
        // 그 전에 저장된 물건들이 이 케이스다) — PK만 보강 저장한다.
        void saveVatBuildingInfo(item.id, {
          housingLedgerPk: buildingInfo.housingLedgerPk,
          housingLedgerDongNm: buildingInfo.housingLedgerDongNm ?? null,
        });
      }
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
    rightsAssumptionAmount: confirmedRightsAssumption,
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
    confirmedRightsAssumption,
    extraRealtyFee,
    vatAmount,
    applyProgressiveDeduction,
    housingCount,
    regulatedArea,
    item.usage,
  ]);
  const safetyMargin = salePrice - bidPrice;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-foreground">
            {isCoachView ? `${coachViewUsername}님의 입찰 계획` : "나의 입찰 계획"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {isCoachView
              ? "수강생이 과제제출 당시 저장한 입찰계획과 제출 내용입니다(읽기 전용)."
              : "목표 입찰가와 매도가를 조정해 필요한 자금과 예상 수익을 확인하세요. 대출한도는 min(감정가×감정가비율, 낙찰가×낙찰가비율)로 계산되며, 아래 비율은 이 물건에 적용된 대출정책 값으로 기본 설정되어 있습니다."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {isCoachView ? (
            <span className="rounded-lg border border-amber-400/40 bg-amber-400/[0.08] px-3 py-2 text-xs font-semibold text-amber-700">
              코치 보기 모드
            </span>
          ) : (
            <>
              {assignmentEligible && (
                <button
                  type="button"
                  onClick={() => setShowAssignmentEditor((open) => !open)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    showAssignmentEditor
                      ? "border-amber-500 bg-amber-500 text-white"
                      : savedAssignment
                        ? "border-amber-400/40 bg-amber-400/[0.08] text-amber-700 hover:bg-amber-400/[0.15]"
                        : "border-border bg-card text-foreground hover:bg-secondary"
                  }`}
                >
                  {showAssignmentEditor ? "과제제출 닫기" : savedAssignment ? "제출한 과제 수정" : "과제제출"}
                </button>
              )}
              <div className="flex items-center gap-2">
                {savedBidPlan && !showBidPlanEditor && (
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    {new Date(savedBidPlan.updatedAt).toLocaleDateString("ko-KR")} 저장됨
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowBidPlanEditor((open) => !open)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    showBidPlanEditor
                      ? "border-primary bg-primary text-primary-foreground"
                      : savedBidPlan
                        ? "border-primary/25 bg-primary/[0.05] text-primary hover:bg-primary/[0.1]"
                        : "border-border bg-card text-foreground hover:bg-secondary"
                  }`}
                >
                  {showBidPlanEditor ? "계획 닫기" : savedBidPlan ? "저장된 입찰계획" : "입찰계획 저장"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showAssignmentEditor && isCoachView && !savedAssignment && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.04] p-4">
          <p className="text-xs text-muted-foreground">
            {coachViewUsername}님이 이 물건에 제출한 과제가 없습니다.
          </p>
        </div>
      )}

      {showAssignmentEditor && (!isCoachView || savedAssignment) && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.04] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">
              {isCoachView ? "제출한 과제" : "과제제출"}
              {savedAssignment && (
                <span className="ml-2 font-normal text-muted-foreground">
                  {new Date(savedAssignment.updatedAt).toLocaleString("ko-KR")} 제출됨
                </span>
              )}
            </p>
          </div>
          {!isCoachView && (
            <p className="text-[11px] text-muted-foreground">
              현재 입찰계획(낙찰가 {bidPrice.toLocaleString("ko-KR")}원 · 매도가 {salePrice.toLocaleString("ko-KR")}원 ·
              최종수익 {result.finalProfit.toLocaleString("ko-KR")}원)과 함께 아래 내용을 제출합니다.
            </p>
          )}
          <AutoGrowTextarea
            placeholder="메모"
            value={assignmentMemo}
            onChange={(e) => setAssignmentMemo(e.target.value)}
            readOnly={isCoachView}
            className="w-full px-3 py-2 text-xs border border-border rounded-sm bg-card read-only:bg-secondary/10"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs font-semibold text-foreground mb-2">전화 시세 결과</p>
              {(
                [
                  ["매수자", phoneBuyer, setPhoneBuyer],
                  ["매도자", phoneSeller, setPhoneSeller],
                  ["입찰자", phoneBidder, setPhoneBidder],
                  ["최종 시세", phoneFinal, setPhoneFinal],
                ] as const
              ).map(([label, value, setValue]) => (
                <label key={label} className="mt-1.5 flex items-center gap-2 text-xs first:mt-0">
                  <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
                  <input
                    inputMode="numeric"
                    value={value ? formatDigits(value) : ""}
                    onChange={(e) => setValue(digitsOnly(e.target.value))}
                    readOnly={isCoachView}
                    className="flex-1 px-2 py-1.5 border border-border rounded-sm bg-secondary/10 text-right"
                  />
                </label>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs font-semibold text-foreground mb-2">주변 안전마진 조사</p>
              {(
                [
                  ["조사 1", safetyResearch1, setSafetyResearch1],
                  ["조사 2", safetyResearch2, setSafetyResearch2],
                  ["조사 3", safetyResearch3, setSafetyResearch3],
                  ["최종 안전마진", finalSafetyMargin, setFinalSafetyMargin],
                ] as const
              ).map(([label, value, setValue]) => (
                <label key={label} className="mt-1.5 flex items-center gap-2 text-xs first:mt-0">
                  <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
                  <input
                    inputMode="numeric"
                    value={value ? formatDigits(value) : ""}
                    onChange={(e) => setValue(digitsOnly(e.target.value))}
                    readOnly={isCoachView}
                    className="flex-1 px-2 py-1.5 border border-border rounded-sm bg-secondary/10 text-right"
                  />
                </label>
              ))}
            </div>
          </div>

          {isCoachView ? (
            <div className="space-y-2 border-t border-amber-400/20 pt-3">
              <p className="text-xs font-semibold text-foreground">코치 피드백</p>
              <AutoGrowTextarea
                minRows={3}
                value={coachFeedbackDraft}
                onChange={(e) => setCoachFeedbackDraft(e.target.value)}
                placeholder="이 과제에 대한 피드백을 남겨 주세요."
                className="w-full px-3 py-2 text-xs border border-border rounded-sm bg-card"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveCoachFeedback()}
                  disabled={coachFeedbackSaving}
                  className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-amber-500 text-white disabled:opacity-50"
                >
                  {coachFeedbackSaving ? "저장 중..." : "피드백 저장"}
                </button>
                {coachFeedbackMessage && <span className="text-xs text-muted-foreground">{coachFeedbackMessage}</span>}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSubmitAssignment()}
                  disabled={assignmentSaving}
                  className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-amber-500 text-white disabled:opacity-50"
                >
                  {assignmentSaving ? "제출 중..." : savedAssignment ? "다시 제출하기" : "과제 제출하기"}
                </button>
                {assignmentMessage && <span className="text-xs text-muted-foreground">{assignmentMessage}</span>}
              </div>
              <p className="text-[11px] text-muted-foreground">
                제출한 과제는 상단 메뉴의 내 물건 &gt; 과제제출에서 모아보고 수정할 수 있습니다.
              </p>
            </>
          )}
        </div>
      )}

      {showBidPlanEditor && isCoachView && !savedBidPlan && (
        <div className="rounded-xl border border-primary/15 bg-primary/[0.025] p-4">
          <p className="text-xs text-muted-foreground">{coachViewUsername}님이 저장한 입찰계획이 없습니다.</p>
        </div>
      )}

      {showBidPlanEditor && (!isCoachView || savedBidPlan) && (
      <div className="rounded-xl border border-primary/15 bg-primary/[0.025] p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">
            {isCoachView ? "저장된 입찰계획" : "입찰 계획 저장"}
            {savedBidPlan && (
              <span className="ml-2 font-normal text-muted-foreground">
                {new Date(savedBidPlan.updatedAt).toLocaleString("ko-KR")} 저장됨
              </span>
            )}
          </p>
        </div>
        <AutoGrowTextarea
          placeholder="메모(예: 이 가격 이하로만 입찰, 전세가 확인 후 결정 등)"
          value={bidPlanMemo}
          onChange={(e) => setBidPlanMemo(e.target.value)}
          readOnly={isCoachView}
          className="w-full px-3 py-2 text-xs border border-border rounded-sm bg-secondary/10"
        />
        {!isCoachView && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSaveBidPlan()}
              disabled={bidPlanSaving}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
            >
              {bidPlanSaving ? "처리 중..." : savedBidPlan ? "다시 저장" : "이 계획 저장하기"}
            </button>
            {savedBidPlan && (
              <button
                type="button"
                onClick={() => void handleDeleteBidPlan()}
                disabled={bidPlanSaving}
                className="px-3 py-1.5 text-xs font-medium border border-border rounded-sm hover:bg-secondary disabled:opacity-50"
              >
                삭제
              </button>
            )}
            {bidPlanMessage && <span className="text-xs text-muted-foreground">{bidPlanMessage}</span>}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">저장한 계획은 상단 메뉴의 내 물건 &gt; 입찰계획에서 모아볼 수 있습니다.</p>
      </div>
      )}

      <div
        className="rounded-xl p-4"
        style={{ background: "linear-gradient(135deg,#EEF4FF,#F0F5FF)", border: "1px solid rgba(42,82,152,0.15)" }}
      >
        <p className="mb-2 text-[12px] font-bold text-primary">계획 기준 예상 수익</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <ResultRow label="대출금(LTV)" value={formatWonShort(result.loanAmount)} />
          <ResultRow
            label="실제 필요자금"
            value={formatWonShort(result.requiredCash)}
            helper="대출 실행 후 낙찰·취득·수리·명도 등에 필요한 현금"
          />
          <ResultRow
            label="감정가 대비 낙찰가율"
            value={`${(result.bidRatio * 100).toFixed(1)}%`}
            helper="입찰가 ÷ 감정가"
          />
          <ResultRow
            label="안전마진"
            value={formatWonShort(safetyMargin)}
            positive={safetyMargin >= 0}
            helper="매도가 − 입찰가(세금·비용 차감 전)"
          />
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
        <details className="mt-3 pt-3 border-t border-primary/10 group">
          <summary className="flex items-center justify-between cursor-pointer list-none text-[12px] font-semibold text-primary">
            <span>실제 필요자금 상세보기</span>
            <span className="text-[11px] font-normal text-muted-foreground group-open:hidden">
              펼치기
            </span>
            <span className="text-[11px] font-normal text-muted-foreground hidden group-open:inline">
              접기
            </span>
          </summary>
          <div className="mt-2 px-3 rounded-lg bg-white/70 border border-primary/10">
            <CashBreakdownRow label="낙찰대금" value={bidPrice} status="입력값" />
            <CashBreakdownRow
              label="대출금 차감"
              value={-result.loanAmount}
              status="자동 계산"
              tone="deduction"
            />
            <CashBreakdownRow label="취득세" value={result.acquisitionTax} status="자동 계산" />
            <CashBreakdownRow label="법무비" value={result.legalFee} status="자동 계산" />
            <CashBreakdownRow label="인테리어 비용" value={interiorCost} status="예상 입력" />
            <CashBreakdownRow label="명도비" value={evictionCost} status="예상 입력" />
            <CashBreakdownRow
              label="미납 관리비"
              value={unpaidMaintenanceFee}
              status={
                hasUnpaidFeeInvestigation
                  ? "조사 완료"
                  : unpaidMaintenanceFee > 0
                    ? "미조사·직접 입력"
                    : "미조사"
              }
              tone={hasUnpaidFeeInvestigation ? "default" : "warning"}
            />
            {confirmedRightsAssumption > 0 && (
              <CashBreakdownRow
                label="권리 인수 예상금액"
                value={confirmedRightsAssumption}
                status="관리자 확인"
              />
            )}
            <CashBreakdownRow label="대출이자" value={result.loanInterest} status="자동 계산" />
            <CashBreakdownRow
              label="중도상환수수료"
              value={result.earlyRepaymentFee}
              status="자동 계산"
            />
            <div className="flex items-center justify-between py-2.5 border-t border-primary/20">
              <span className="text-[12px] font-bold text-foreground">최종 실제 필요자금</span>
              <span
                className="text-sm font-bold text-primary"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                {formatWonShort(result.requiredCash)}
              </span>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            매도 중개수수료와 부동산 추가수수료는 매도 시 발생하는 비용이므로 준비자금에서
            제외하고 예상 수익 계산에만 반영합니다.
          </p>
        </details>
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
            helper={
              item.salePrice
                ? `낙찰가 ${formatWonShort(item.salePrice)}`
                : `최저가 ${formatWonShort(item.minPrice)}`
            }
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
            helper={
              hasUnpaidFeeInvestigation
                ? investigatedUnpaidFee > 0
                  ? `물건 조사금액 ${investigatedUnpaidFee.toLocaleString("ko-KR")}원 자동 반영`
                  : "조사 결과 미납 관리비 없음"
                : "아직 조사되지 않은 항목입니다. 확인 후 직접 입력해 주세요."
            }
          />
          {confirmedRightsAssumption > 0 && (
            <NumberField
              label="권리 인수 예상금액"
              value={confirmedRightsAssumption}
              readOnly
              suffix="원"
              helper="관리자가 권리자료를 확인한 금액만 자동 반영"
            />
          )}
        </div>

        <div className="px-3 py-2 bg-secondary/30">
          <p className="text-[12px] font-semibold text-foreground">매도 비용</p>
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
          <p className="text-[12px] font-semibold text-foreground">소득세 계산상세</p>
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
