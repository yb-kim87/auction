export type UserRole =
  | "admin"
  | "consultant"
  | "consulting_student"
  | "student"
  | "member";
export type AuctionStatus = "pending" | "approved" | "rejected";

export interface StrategyTagItem {
  code: string;
  label: string;
  description: string;
  icon: string;
}

export interface AuctionItem {
  id: string;
  memo: string;
  link: string;
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
  builtYear: number;
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
  tenantDetail: string;
  priceDetail: string;
  tradingDetail: string;
  recordTime: string;
  /** 특이사항 텍스트로 자동 판별되지 않아 관리자가 직접 표시하는 재개발 여부 */
  isRedevelopment: boolean;
  city: string;
  district: string;
  propType: "아파트" | "빌라";
  strategyTagsList?: StrategyTagItem[];
  status: AuctionStatus;
  submittedBy: string;
  isUpdated: boolean;
  updatedAt: string | null;
  updatedBy: string;
  createdAt: string;
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
}

export interface AuctionKnowledgeItem {
  id: string;
  title: string;
  category: string;
  tags: string;
  content: string;
  /** 중요도 등급. 1이 가장 중요, 숫자가 클수록 낮음. 기본값 3. */
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
};
