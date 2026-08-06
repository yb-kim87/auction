export type UserRole =
  | "admin"
  | "consultant"
  | "consulting_student"
  | "student"
  | "member"
  | "ot_student";
export type AuctionStatus = "pending" | "approved" | "rejected";

export interface StrategyTagItem {
  code: string;
  label: string;
  description: string;
  icon: string;
}

/** 서로 다른 전략 규칙(code)이 같은 label로 설정된 경우(관리자 설정
 * 중복), 화면에는 label 기준으로 1개만 보여준다(사용자 요청,
 * 2026-07-21). */
export function dedupeStrategyTagsByLabel(
  tags: StrategyTagItem[] | undefined,
): StrategyTagItem[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const result: StrategyTagItem[] = [];
  for (const tag of tags) {
    if (seen.has(tag.label)) continue;
    seen.add(tag.label);
    result.push(tag);
  }
  return result;
}

export interface AuctionItem {
  id: string;
  memo: string;
  /** 크롤링 출처 원본 링크. 관리자/컨설턴트에게만 내려온다(수강생 응답에는 없음). */
  link?: string;
  views: number;
  auctionNo: string;
  /** 담당 법원+계(예: "수원지방법원 9계"). 사건번호는 법원마다 겹칠 수 있어
   * 이 값으로 구분한다. */
  court?: string;
  /** 탱크옥션 사건상태 원문(진행/변경/취하/매각 등). */
  caseState?: string;
  address: string;
  totalUnits: number;
  usage: string;
  area: string;
  sharedArea?: string;
  builtYear: number;
  /** 부가세계산기 자동계산이 조회해 캐싱한 물건 고유값(PNU·구조명·
   * 주용도명·지상층수) — 있으면 VWorld/건축물대장 API 재호출 없이
   * 재사용한다. 공시지가는 매년 갱신될 수 있어 여기 포함하지 않고
   * 항상 API로 새로 받는다. */
  vatPnu?: string | null;
  vatStructureName?: string | null;
  vatMainPurposeName?: string | null;
  vatGroundFloors?: number | null;
  /** 건축물대장 표제부에서 매칭된 관리건축물대장PK/동명 — 국토부 주택
   * 공시가격 CSV의 연계키로 쓴다(사용자 요청, 2026-08-06). */
  housingLedgerPk?: string | null;
  housingLedgerDongNm?: string | null;
  bidDate: string;
  appraisedValue: number;
  minPrice: number;
  salePrice: number | null;
  naverPrice: number;
  naverPriceFloor?: number | null;
  naverPriceFloorLabel?: string | null;
  naverId: string;
  diffNaverSale: number | null;
  diffNaverMin: number;
  diffNaverAppraised: number;
  elevator: string;
  parking: string;
  landShare: string;
  buildingRegistry: string;
  education: string;
  tradingCount: string;
  bidInfo: string;
  owner: string;
  appraiser: string;
  officialLandPrice: number;
  tenantInfo: string;
  specialNote: string;
  rightsReview?: AuctionRightsReview | null;
  /** 탱크옥션이 관리사무소에 개별 문의해 조사한 미납 관리비(체납금액).
   * 조사가 안 된 물건은 0/빈 문자열 — 크롤링 누락이 아니라 원본 조사
   * 자체가 없는 정상 케이스. */
  unpaidFeeAmount?: number;
  unpaidFeeNote?: string;
  unpaidFeeCheckedAt?: string;
  /** 매도분석(재판매 매칭) 결과 — 관리자에게만 내려온다(아직 내부 검증
   * 중인 신호라 컨설턴트·수강생 응답에는 없음, 2026-08-01). */
  resaleMatchedTradeId?: string | null;
  resaleMatchScore?: number | null;
  resaleMatchTier?: "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW" | null;
  tenantDetail: string;
  priceDetail: string;
  tradingDetail: string;
  recordTime: string;
  /** 특이사항 텍스트로 자동 판별되지 않아 관리자가 직접 표시하는 재개발 여부 */
  isRedevelopment: boolean;
  city: string;
  district: string;
  propType: "아파트" | "빌라" | "오피스텔";
  strategyTagsList?: StrategyTagItem[];
  status: AuctionStatus;
  submittedBy: string;
  isUpdated: boolean;
  updatedAt: string | null;
  updatedBy: string;
  createdAt: string;
}

export type RightsReviewStatus =
  | "uninvestigated"
  | "in_progress"
  | "none"
  | "confirmed"
  | "unverifiable";

export interface AuctionRightsReview {
  status: RightsReviewStatus;
  baselineRightType: string;
  baselineRightDate: string;
  seniorTenantStatus: "unknown" | "none" | "possible" | "confirmed";
  opposabilityStatus: "unknown" | "none" | "possible" | "confirmed";
  depositAmount: number | null;
  expectedDividendAmount: number | null;
  assumptionAmount: number | null;
  specialRights: string;
  evidenceNote: string;
  confirmedAt: string;
  confirmedBy: string;
}

export type UpdateAuctionPayload = Omit<
  AuctionItem,
  | "id"
  | "city"
  | "district"
  | "propType"
  | "status"
  | "submittedBy"
  | "isUpdated"
  | "updatedAt"
  | "updatedBy"
  | "createdAt"
>;

export interface AuctionFieldChange {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
}

export interface AuctionChangeLogEntry {
  id: string;
  auctionId: string;
  changedAt: string;
  changedBy: string;
  source: string;
  changes: AuctionFieldChange[];
}

export const CHANGE_SOURCE_LABELS: Record<string, string> = {
  excel: "엑셀 업로드",
  crawler: "크롤러 수집",
  manual_create: "수동 등록",
  admin_edit: "관리자 수정",
  consultant_edit: "컨설턴트 수정",
};

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  phone?: string;
  role: UserRole;
  investableFunds?: string;
  existingLoanAmount?: string;
  housingCount?: number;
  creditScore?: string;
  annualNetIncome?: string;
  investmentGoal?: string;
  targetReturn?: string;
  firstTimeBuyer?: boolean;
  aiAnalysisLimit?: number;
  aiAnalysisUsed?: number;
  createdAt: string;
}

export interface AuctionAnalysisResult {
  id?: string;
  auctionId?: string;
  model?: string;
  createdAt?: string;
  cached?: boolean;
  stale?: boolean;
  summary: string;
  priceAnalysis: string;
  rightsAnalysis: string;
  loanAnalysis: string;
  investmentFit: string;
  checklist: string[];
  recommendation: string;
  risks: string[];
  citations?: string[];
  knowledgeCount?: number;
  /** rules_only는 외부 AI와 사용자 이용횟수를 사용하지 않는다. */
  analysisSource?: "rules_only" | "ai_with_rag";
  structuredRights?: {
    reviewStatus: "unknown" | "possible" | "none";
    baselineRight: { type: string; date: string; reason: string };
    tenant: {
      priorityStatus: "unknown" | "possible" | "none";
      opposability: "unknown" | "possible" | "none";
      depositAmount: number | null;
    };
    assumption: {
      status: "unknown" | "possible" | "none";
      estimatedAmount: number | null;
      reason: string;
    };
    missingEvidence: string[];
    evidence: string[];
  };
  autoRights?: {
    status: "auto_complete" | "risk_detected" | "needs_data" | "unavailable";
    label: string;
    calculationReady: boolean;
    assumptionAmount: number | null;
    confidence: "high" | "medium" | "low";
    exceptionReasons: string[];
  };
}

export interface AuctionKnowledgeItem {
  id: string;
  title: string;
  category: string;
  tags: string;
  content: string;
  /** RAG 적용 정책. 1=항상 적용, 2=조건부 적용, 3=참고 자료. */
  grade: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeDraftStatus =
  | "raw"
  | "structured"
  | "approved"
  | "rejected"
  | "skipped";

export interface KnowledgeDraftItem {
  id: string;
  sourceArticleId: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceBoard: string;
  cafeUrl: string;
  rawContent: string;
  title: string;
  category: string;
  tags: string;
  content: string;
  aiNote: string;
  status: KnowledgeDraftStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CafeCrawlStatus {
  phase: string;
  subPhase?: string;
  cafeUrl?: string;
  completed?: number;
  total?: number;
  imported?: number;
  skipped?: number;
  urlCollectTotal?: number;
  collectedUrls?: Array<{ url: string; title?: string; articleId?: string }>;
  browserReady?: boolean;
  naverLoggedIn?: boolean;
  error?: string | null;
  lastMessage?: string | null;
  events?: string[];
}

export const STATUS_LABELS: Record<AuctionStatus, string> = {
  pending: "승인대기",
  approved: "승인됨",
  rejected: "반려됨",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "관리자",
  consultant: "컨설턴트",
  consulting_student: "컨설팅 수강생",
  student: "수강생",
  member: "승인대기",
  ot_student: "OT수강생",
};
