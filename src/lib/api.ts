import type {
  AuctionItem,
  AuctionAnalysisResult,
  AuctionKnowledgeItem,
  CafeCrawlStatus,
  KnowledgeDraftItem,
  KnowledgeDraftStatus,
  UpdateAuctionPayload,
  UserProfile,
  UserRole,
} from "@/types/auction";

/** 브라우저는 항상 같은 출처(/api)로 호출 — JWT HttpOnly 쿠키 전달 */
const API_BASE = "/api";

const FETCH_CREDENTIALS: RequestCredentials = "include";

function withJsonHeaders(extra?: HeadersInit): HeadersInit {
  const headers = new Headers(extra);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function parseJsonResponseText<T>(text: string): Promise<T | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T | null> {
  return parseJsonResponseText<T>(await res.text());
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = await parseJsonResponseText<T>(text);
  if (data !== null) return data;
  const snippet = text.trim().slice(0, 200);
  throw new Error(
    snippet || `서버 응답을 해석하지 못했습니다. (HTTP ${res.status})`,
  );
}

async function parseErrorMessage(res: Response) {
  const text = await res.text();
  const data = await parseJsonResponseText<{ message?: string | string[] }>(text);
  if (data?.message) {
    if (typeof data.message === "string") return data.message;
    if (Array.isArray(data.message)) return data.message.join(", ");
  }
  const trimmed = text.trim();
  if (trimmed && !trimmed.startsWith("{")) return trimmed.slice(0, 200);
  return null;
}

export async function loginUser(username: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "로그인에 실패했습니다.",
    );
  }
  return readJsonResponse<{ ok: boolean }>(res);
}

/** access 토큰(30분) 만료 시 refresh 토큰(30일)으로 새 토큰 쌍을 발급받는다. */
export async function refreshAuthToken(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  return res.ok;
}

export async function logoutUser() {
  const res = await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "로그아웃에 실패했습니다.",
    );
  }
}

export async function fetchCurrentUser(): Promise<UserProfile> {
  return fetchMyProfile();
}

export async function signupUser(input: {
  username: string;
  password: string;
  name: string;
  phone: string;
  investableFunds: string;
  existingLoanAmount: string;
  housingCount: number;
  creditScore: string;
  annualNetIncome: string;
  investmentGoal: string;
  targetReturn: string;
  firstTimeBuyer: boolean;
}) {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "회원가입에 실패했습니다.",
    );
  }
  return readJsonResponse<{ ok: boolean }>(res);
}

export async function fetchAuctions(): Promise<AuctionItem[]> {
  const res = await fetch(`${API_BASE}/auctions`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 데이터를 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function fetchFavoriteIds(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/favorites`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "관심물건 목록을 불러오지 못했습니다.",
    );
  }
  const data = await readJsonResponse<{ auctionIds?: string[] }>(res);
  return data.auctionIds ?? [];
}

export async function addFavorite(auctionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/favorites/${auctionId}`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "관심물건 등록에 실패했습니다.",
    );
  }
}

export async function removeFavorite(auctionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/favorites/${auctionId}`, {
    method: "DELETE",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "관심물건 해제에 실패했습니다.",
    );
  }
}

export type UserActionType =
  | "impression"
  | "click"
  | "detail_view"
  | "ai_analysis_click"
  | "favorite"
  | "dislike"
  | "reviewed";

export type LogActionInput = {
  itemId: string;
  actionType: UserActionType;
  durationSeconds?: number;
  metadata?: Record<string, unknown> | null;
};

/** 사용자 행동 로그 — 향후 개인화 추천용 수집. 실패해도 화면 동작을 막지 않음. */
export function logUserAction(input: LogActionInput): void {
  fetch(`${API_BASE}/actions`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  }).catch(() => {
    // 수집 실패는 무시 — UX에 영향 주지 않음
  });
}

export function logUserActionsBatch(items: LogActionInput[]): void {
  if (items.length === 0) return;
  fetch(`${API_BASE}/actions/batch`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ items }),
  }).catch(() => {
    // 수집 실패는 무시
  });
}

export async function fetchAdminAuctions(): Promise<AuctionItem[]> {
  const res = await fetch(`${API_BASE}/auctions/manage`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 데이터를 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function fetchPendingAuctions(): Promise<AuctionItem[]> {
  const res = await fetch(`${API_BASE}/auctions/pending`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "승인 대기 목록을 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function fetchMyAuctions(): Promise<AuctionItem[]> {
  const res = await fetch(`${API_BASE}/auctions/my`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "내 등록 물건을 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function fetchAuctionCount(): Promise<{ total: number; pending: number }> {
  const res = await fetch(`${API_BASE}/auctions/count`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) return { total: 0, pending: 0 };
  return readJsonResponse(res);
}

export async function uploadAuctionExcel(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/auctions/upload`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    body: formData,
  });

  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "엑셀 업로드에 실패했습니다.",
    );
  }

  return readJsonResponse<{
    imported: number;
    created: number;
    updated: number;
    total: number;
    status?: string;
  }>(res);
}

export async function createAuction(data: UpdateAuctionPayload) {
  const res = await fetch(`${API_BASE}/auctions`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 등록에 실패했습니다.",
    );
  }
  return readJsonResponse<AuctionItem>(res);
}

export function getTemplateDownloadUrl() {
  return `${API_BASE}/auctions/template`;
}

export async function updateMyAuction(id: string, data: UpdateAuctionPayload) {
  const res = await fetch(`${API_BASE}/auctions/my/${id}`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 수정에 실패했습니다.",
    );
  }
  return readJsonResponse<AuctionItem>(res);
}

export async function deleteMyAuction(id: string) {
  const res = await fetch(`${API_BASE}/auctions/my/${id}`, {
    method: "DELETE",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 삭제에 실패했습니다.",
    );
  }
  return readJsonResponse<{ deleted: number; total: number }>(res);
}

export async function deleteAuction(id: string) {
  const res = await fetch(`${API_BASE}/auctions/${id}`, {
    method: "DELETE",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 삭제에 실패했습니다.",
    );
  }
  return readJsonResponse<{ deleted: number; total: number }>(res);
}

export async function deleteAuctions(ids: string[]) {
  const res = await fetch(`${API_BASE}/auctions/delete-many`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "선택 항목 삭제에 실패했습니다.",
    );
  }
  return readJsonResponse<{ deleted: number; total: number }>(res);
}

export async function deleteAllAuctions() {
  const res = await fetch(`${API_BASE}/auctions/all`, {
    method: "DELETE",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "전체 삭제에 실패했습니다.",
    );
  }
  return readJsonResponse<{ deleted: number; total: number }>(res);
}

export async function fetchAuctionChangeHistory(auctionId: string) {
  const res = await fetch(`${API_BASE}/auctions/${auctionId}/changes`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "변경 이력을 불러오지 못했습니다.",
    );
  }
  return readJsonResponse<import("@/types/auction").AuctionChangeLogEntry[]>(res);
}

export async function updateAuction(id: string, data: UpdateAuctionPayload) {
  const res = await fetch(`${API_BASE}/auctions/${id}`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 수정에 실패했습니다.",
    );
  }
  return readJsonResponse<AuctionItem>(res);
}

export async function approveAuction(id: string) {
  const res = await fetch(`${API_BASE}/auctions/${id}/approve`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "승인에 실패했습니다.",
    );
  }
  return readJsonResponse<AuctionItem>(res);
}

export async function rejectAuction(id: string) {
  const res = await fetch(`${API_BASE}/auctions/${id}/reject`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "반려에 실패했습니다.",
    );
  }
  return readJsonResponse<AuctionItem>(res);
}

export async function approveAuctions(ids: string[]) {
  const res = await fetch(`${API_BASE}/auctions/approve-many`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "일괄 승인에 실패했습니다.",
    );
  }
  return readJsonResponse<{ approved: number; pending: number }>(res);
}

export async function rejectAuctions(ids: string[]) {
  const res = await fetch(`${API_BASE}/auctions/reject-many`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "일괄 반려에 실패했습니다.",
    );
  }
  return readJsonResponse<{ rejected: number; pending: number }>(res);
}

export async function fetchUsers(): Promise<UserProfile[]> {
  const res = await fetch(`${API_BASE}/users`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "회원 목록을 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function updateUserRole(id: string, role: UserRole) {
  const res = await fetch(`${API_BASE}/users/${id}/role`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "권한 변경에 실패했습니다.",
    );
  }
  return readJsonResponse<UserProfile>(res);
}

export async function updateUserAiAnalysisLimit(id: string, limit: number) {
  const res = await fetch(`${API_BASE}/users/${id}/ai-limit`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ limit }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "AI 분석 제한 변경에 실패했습니다.",
    );
  }
  return readJsonResponse<UserProfile>(res);
}

export async function fetchMyProfile(): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/users/me`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "회원 정보를 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function updateMyProfile(input: {
  name?: string;
  currentPassword?: string;
  newPassword?: string;
  investableFunds?: string;
  existingLoanAmount?: string;
  housingCount?: number;
  creditScore?: string;
  annualNetIncome?: string;
  targetReturn?: string;
  investmentGoal?: string;
  firstTimeBuyer?: boolean;
}): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/users/me`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "회원 정보 수정에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export type LoanPolicy = {
  id: string;
  label: string;
  /** 낙찰가(최저가) 대비 대출 비율 */
  loanRatio: number;
  /** 감정가 대비 대출 비율. 실제 대출한도는 min(감정가×이 비율, 낙찰가×loanRatio) */
  appraisalRatio: number;
  regulatedArea: boolean;
  loanUnavailable: boolean;
  businessLoanOnly: boolean;
  sortOrder: number;
};

export async function fetchLoanPolicies(): Promise<LoanPolicy[]> {
  const res = await fetch(`${API_BASE}/loan-policies`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "대출 정책을 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function updateLoanPolicy(
  id: string,
  input: { loanRatio: number; appraisalRatio: number },
): Promise<LoanPolicy> {
  const res = await fetch(`${API_BASE}/loan-policies/${id}`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "대출 정책 저장에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function fetchIncomeLoanMultiplier(): Promise<number> {
  const res = await fetch(`${API_BASE}/loan-policies/income-multiplier`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "소득 대비 대출 배수를 불러오지 못했습니다.");
  }
  const data = await readJsonResponse<{ value: number }>(res);
  return data.value;
}

export async function updateIncomeLoanMultiplier(value: number): Promise<number> {
  const res = await fetch(`${API_BASE}/loan-policies/income-multiplier`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "소득 대비 대출 배수 저장에 실패했습니다.");
  }
  const data = await readJsonResponse<{ value: number }>(res);
  return data.value;
}

export type TagRule = {
  id: string;
  tagName: string;
  tagCode: string;
  category: "fact" | "strategy";
  field: string;
  operator: string;
  value: string;
  active: boolean;
  sortOrder: number;
};

export type StrategyRule = {
  id: string;
  strategyCode: string;
  requiredFactCodes: string[];
  /** 연결된 노출 라벨(StrategyLabel)의 id. 라벨은 여러 전략이 동시에 재사용 가능. */
  labelId: string | null;
  description: string;
  active: boolean;
  sortOrder: number;
};

export type StrategyLabel = {
  id: string;
  label: string;
  icon: string;
};

export type TagRuleFieldDef = {
  key: string;
  label: string;
  type: "number" | "string" | "boolean";
  hasValueOptions?: boolean;
};
export type TagRuleOperatorDef = { key: string; label: string; types: string[] };

export async function fetchTagRules(): Promise<TagRule[]> {
  const res = await fetch(`${API_BASE}/tag-rules`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "태그 규칙을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function fetchTagRuleFields(): Promise<{
  fields: TagRuleFieldDef[];
  operators: TagRuleOperatorDef[];
}> {
  const res = await fetch(`${API_BASE}/tag-rules/fields`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "태그 필드 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function fetchTagRuleFieldValueOptions(fieldKey: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/tag-rules/fields/${encodeURIComponent(fieldKey)}/value-options`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "값 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function createTagRule(input: {
  tagName: string;
  field: string;
  operator: string;
  value: string;
  active?: boolean;
  sortOrder?: number;
}): Promise<TagRule> {
  const res = await fetch(`${API_BASE}/tag-rules`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "태그 규칙 생성에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function updateTagRule(
  id: string,
  input: Partial<{
    tagName: string;
    field: string;
    operator: string;
    value: string;
    active: boolean;
    sortOrder: number;
  }>,
): Promise<TagRule> {
  const res = await fetch(`${API_BASE}/tag-rules/${id}`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "태그 규칙 저장에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function removeTagRule(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/tag-rules/${id}`, {
    method: "DELETE",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "태그 규칙 삭제에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function backfillTagRules(): Promise<{ total: number; updated: number }> {
  const res = await fetch(`${API_BASE}/tag-rules/backfill`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "태그 재계산에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function analyzeSecurityLogNow(): Promise<{ ran: boolean; reason?: string }> {
  const res = await fetch(`${API_BASE}/security-log/analyze-now`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "보안 로그 분석 실행에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function fetchRecentSecurityLog(): Promise<{ lines: string[] }> {
  const res = await fetch(`${API_BASE}/security-log/recent`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "보안 로그를 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export type SecurityLogIpExclusion = {
  id: string;
  ip: string;
  note: string;
  createdAt: string;
};

export async function fetchSecurityLogIpExclusions(): Promise<SecurityLogIpExclusion[]> {
  const res = await fetch(`${API_BASE}/security-log/ip-exclusions`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "예외 IP 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function addSecurityLogIpExclusion(
  ip: string,
  note: string,
): Promise<SecurityLogIpExclusion> {
  const res = await fetch(`${API_BASE}/security-log/ip-exclusions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: FETCH_CREDENTIALS,
    body: JSON.stringify({ ip, note }),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "예외 IP 추가에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function removeSecurityLogIpExclusion(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/security-log/ip-exclusions/${id}`, {
    method: "DELETE",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "예외 IP 삭제에 실패했습니다.");
  }
}

export async function fetchStrategyRules(): Promise<StrategyRule[]> {
  const res = await fetch(`${API_BASE}/tag-rules/strategy-rules`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "Strategy 규칙을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function createStrategyRule(input: {
  strategyCode: string;
  requiredFactCodes: string[];
  labelId?: string;
  description?: string;
  active?: boolean;
  sortOrder?: number;
}): Promise<StrategyRule> {
  const res = await fetch(`${API_BASE}/tag-rules/strategy-rules`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "Strategy 규칙 생성에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function updateStrategyRule(
  id: string,
  input: Partial<{
    strategyCode: string;
    requiredFactCodes: string[];
    labelId: string;
    description: string;
    active: boolean;
    sortOrder: number;
  }>,
): Promise<StrategyRule> {
  const res = await fetch(`${API_BASE}/tag-rules/strategy-rules/${id}`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "Strategy 규칙 저장에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function removeStrategyRule(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/tag-rules/strategy-rules/${id}`, {
    method: "DELETE",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "Strategy 규칙 삭제에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function fetchStrategyLabels(): Promise<StrategyLabel[]> {
  const res = await fetch(`${API_BASE}/tag-rules/strategy-labels`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "Strategy 문구를 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function createStrategyLabel(input: {
  label: string;
  icon?: string;
}): Promise<StrategyLabel> {
  const res = await fetch(`${API_BASE}/tag-rules/strategy-labels`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "라벨 생성에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function updateStrategyLabel(
  id: string,
  input: Partial<{ label: string; icon: string }>,
): Promise<StrategyLabel> {
  const res = await fetch(`${API_BASE}/tag-rules/strategy-labels/${id}`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "라벨 수정에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function removeStrategyLabel(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/tag-rules/strategy-labels/${id}`, {
    method: "DELETE",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "Strategy 문구 삭제에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export type RegulatedRegion = {
  id: string;
  name: string;
  createdAt: string;
};

export async function fetchRegulatedRegions(): Promise<RegulatedRegion[]> {
  const res = await fetch(`${API_BASE}/regulated-regions`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "규제지역 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function addRegulatedRegion(name: string): Promise<RegulatedRegion> {
  const res = await fetch(`${API_BASE}/regulated-regions`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "규제지역 추가에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function removeRegulatedRegion(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/regulated-regions/${id}`, {
    method: "DELETE",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "규제지역 삭제에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export type AiPlatformEngineType = "normalizer" | "feature" | "tag";
export type AiPlatformActionType = "auto_generate" | "manual_update" | "regenerate";

export type AiPlatformHistoryEntry = {
  id: string;
  itemId: string;
  engineType: AiPlatformEngineType;
  actionType: AiPlatformActionType;
  beforeData: string | null;
  afterData: string;
  changedBy: string;
  createdAt: string;
};

export type NormalizedDataRow = {
  id: string;
  itemId: string;
  normalizedData: Record<string, unknown>;
  normalizedSources: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AiFeatureRow = {
  id: string;
  itemId: string;
  features: Record<string, unknown>;
  featureSources: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AiTagRow = {
  id: string;
  itemId: string;
  autoTags: string[];
  manualTags: string[] | null;
  finalTags: string[];
  tagSources: Record<string, unknown>;
  confidence: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

async function aiPlatformGet<T>(path: string, fallbackError: string): Promise<T> {
  const res = await fetch(`${API_BASE}/ai-platform/${path}`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) throw new Error((await parseErrorMessage(res)) ?? fallbackError);
  return readJsonResponse(res);
}

async function aiPlatformRegenerate(
  engine: "normalizer" | "features" | "tags",
  itemIds: string[] | undefined,
): Promise<{ count: number }> {
  const res = await fetch(`${API_BASE}/ai-platform/${engine}/regenerate`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ itemIds }),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "재생성에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export function fetchNormalizedDataList(): Promise<NormalizedDataRow[]> {
  return aiPlatformGet("normalizer", "정규화 데이터를 불러오지 못했습니다.");
}
export function fetchNormalizedDataHistory(itemId: string): Promise<AiPlatformHistoryEntry[]> {
  return aiPlatformGet(`normalizer/${itemId}/history`, "이력을 불러오지 못했습니다.");
}
export function regenerateNormalizedData(itemIds?: string[]) {
  return aiPlatformRegenerate("normalizer", itemIds);
}
export async function updateNormalizedData(
  itemId: string,
  data: Record<string, unknown>,
): Promise<NormalizedDataRow> {
  const res = await fetch(`${API_BASE}/ai-platform/normalizer/${itemId}`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await parseErrorMessage(res)) ?? "수정에 실패했습니다.");
  return readJsonResponse(res);
}

export function fetchAiFeatureList(): Promise<AiFeatureRow[]> {
  return aiPlatformGet("features", "Feature 데이터를 불러오지 못했습니다.");
}
export function fetchAiFeatureHistory(itemId: string): Promise<AiPlatformHistoryEntry[]> {
  return aiPlatformGet(`features/${itemId}/history`, "이력을 불러오지 못했습니다.");
}
export function regenerateAiFeatures(itemIds?: string[]) {
  return aiPlatformRegenerate("features", itemIds);
}
export async function updateAiFeature(
  itemId: string,
  data: Record<string, unknown>,
): Promise<AiFeatureRow> {
  const res = await fetch(`${API_BASE}/ai-platform/features/${itemId}`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await parseErrorMessage(res)) ?? "수정에 실패했습니다.");
  return readJsonResponse(res);
}

export function fetchAiTagList(): Promise<AiTagRow[]> {
  return aiPlatformGet("tags", "Tag 데이터를 불러오지 못했습니다.");
}
export function fetchAiTagHistory(itemId: string): Promise<AiPlatformHistoryEntry[]> {
  return aiPlatformGet(`tags/${itemId}/history`, "이력을 불러오지 못했습니다.");
}
export function regenerateAiTags(itemIds?: string[]) {
  return aiPlatformRegenerate("tags", itemIds);
}
export async function updateAiManualTags(
  itemId: string,
  manualTags: string[] | null,
): Promise<AiTagRow> {
  const res = await fetch(`${API_BASE}/ai-platform/tags/${itemId}/manual-tags`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ manualTags }),
  });
  if (!res.ok) throw new Error((await parseErrorMessage(res)) ?? "수정에 실패했습니다.");
  return readJsonResponse(res);
}

export type RecommendationFilters = {
  city?: string;
  propType?: string;
  maxFailureRate?: string;
  favoritesOnly?: boolean;
  progressStatus?: "all" | "active" | "ended";
  search?: string;
};

export async function fetchRecommendations(
  budget?: string,
  page?: { limit: number; offset: number },
  filters?: RecommendationFilters,
): Promise<{
  items: AuctionItem[];
  hasCriteria: boolean;
  loanRatio: number | null;
  loanPolicyLabel: string | null;
  loanInfoByItemId: Record<
    string,
    {
      loanRatio: number;
      appraisalRatio: number;
      loanPolicyLabel: string;
      requiredEquity: number;
      regulatedArea: boolean;
      incomeLoanLimit: number | null;
      existingLoanWon: number;
      loanUnavailable?: boolean;
    }
  >;
  total: number;
  hasMore: boolean;
  creditScoreWarning: boolean;
}> {
  const query = new URLSearchParams();
  if (budget) query.set("budget", budget);
  if (page) {
    query.set("limit", String(page.limit));
    query.set("offset", String(page.offset));
  }
  if (filters?.city) query.set("city", filters.city);
  if (filters?.propType) query.set("propType", filters.propType);
  if (filters?.maxFailureRate) query.set("maxFailureRate", filters.maxFailureRate);
  if (filters?.favoritesOnly) query.set("favoritesOnly", "true");
  if (filters?.progressStatus) query.set("progressStatus", filters.progressStatus);
  if (filters?.search) query.set("search", filters.search);
  const qs = query.toString();
  const res = await fetch(`${API_BASE}/recommendations${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "추천 물건을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function askAi(input: {
  question: string;
  auctionId?: string;
}): Promise<{ answer: string; matchedCount?: number; criteriaApplied?: boolean }> {
  const res = await fetch(`${API_BASE}/ai/ask`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "질문 처리에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export type AuctionCompareRow = {
  id: string;
  auctionNo: string;
  address: string;
  usage: string;
  area: string;
  appraisedValue: number;
  minPrice: number;
  naverPrice: number;
  naverPriceFloorLabel: string | null;
  bidDate: string;
};

export async function compareAuctions(
  auctionIdA: string,
  auctionIdB: string,
): Promise<{
  table: { a: AuctionCompareRow; b: AuctionCompareRow };
  ai: { summary: string; betterChoice: string; reasons: string[] } | null;
}> {
  const res = await fetch(`${API_BASE}/ai/compare`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ auctionIdA, auctionIdB }),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "비교에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export type CrawlerPhase =
  | "idle"
  | "starting"
  | "logging_in"
  | "collecting"
  | "crawling"
  | "stopped"
  | "error";

export type CrawlerUrlEntry = {
  label: string;
  url: string;
};

export type CrawlerStatus = {
  workerRunning: boolean;
  browserReady: boolean;
  phase: CrawlerPhase;
  preset: string;
  urls: CrawlerUrlEntry[];
  completed: number;
  total: number;
  created: number;
  updated: number;
  repeatAfterCollect: boolean;
  scheduledTime: string | null;
  scheduleEnabled: boolean;
  scheduleRepeatDaily: boolean;
  excludeDuplicates: boolean;
  error: string | null;
  lastMessage: string | null;
  tankLoggedIn?: boolean | null;
  remoteWorker?: boolean;
};

export type CrawlerSearchConfig = {
  listType: "auction" | "public";
  propertyTypes: string[];
  status: string;
  appraisalMin: string;
  appraisalMax: string;
  preserveRegistryFrom: string;
  /** 보존등기 상한 연도(탱크옥션 prsvEnd, 예: "2005" = ~2005년, "구축" 조건의 핵심). */
  preserveRegistryTo?: string;
  excludeSpecialConditions: string[];
  /** 특수조건 선택 항목들을 어떻게 적용할지. 탱크옥션 splSrchType과 동일.
   * 미지정/undefined면 "exclude"(선택 제외, 기존 동작)로 취급한다. */
  specialConditionMode?: "include-any" | "include-all" | "exclude";
  pageSize: string;
  caseYear?: string;
  caseSerial?: string;
  itemNumber?: string;
  regionSiCd?: string;
  regionGuCd?: string;
  regionDnCd?: string;
  regionAdrPlural?: string;
  addressKeyword?: string;
  minPriceMin?: string;
  minPriceMax?: string;
  minPricePctMin?: string;
  minPricePctMax?: string;
  landAreaMin?: string;
  landAreaMax?: string;
  buildingAreaMin?: string;
  buildingAreaMax?: string;
  totalFloorMin?: string;
  totalFloorMax?: string;
  /** 해당층(물건이 위치한 층) 하한 — 순수 층수(예: "1"). "저층 단타" 조건의 핵심. */
  objectFloorMin?: string;
  /** 해당층 상한(순수 층수, 예: "3"). */
  objectFloorMax?: string;
  failCountMin?: string;
  failCountMax?: string;
  bidDateFrom?: string;
  bidDateTo?: string;
  auctionType?: string;
  saleDivision?: string;
};

export type CrawlerAlgorithmConfig = {
  enabled: boolean;
  minArea: number;
  minGapPriceMan: number;
  minHouseholds: number;
  registryKeyword: string;
  telegramEnabled: boolean;
};

/**
 * v1: 기존 Selenium 전체 경로. v2: HTTPX(목록/상세)+Selenium(네이버) 하이브리드.
 * v3: 완전 HTTPX(브라우저 없음). 미지정 시 v1(기존 동작).
 */
export type CrawlerVersion = "v1" | "v2" | "v3";

export type CrawlerScheduleConfig = {
  enabled: boolean;
  time: string;
  preset: string;
  repeatAfterCollect: boolean;
  excludeDuplicates: boolean;
  repeatDaily: boolean;
  oneTimeCompleted?: boolean;
  crawlerVersion?: CrawlerVersion;
};

export type CrawlerCredentialsConfig = {
  userId: string;
  password: string;
};

export type SavedSearchPreset = {
  id: string;
  name: string;
  search: CrawlerSearchConfig;
  createdAt: string;
  updatedAt: string;
};

export type TankFavoriteSearch = {
  id: string;
  title: string;
  count?: number;
  search: Partial<CrawlerSearchConfig>;
};

export type CrawlerConfig = {
  search: CrawlerSearchConfig;
  algorithm: CrawlerAlgorithmConfig;
  schedule: CrawlerScheduleConfig;
  credentials: CrawlerCredentialsConfig;
  naverCredentials?: CrawlerCredentialsConfig;
  savedSearches?: SavedSearchPreset[];
};

export type CrawlerLogEntry = {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
};

export async function fetchCrawlerStatus(): Promise<CrawlerStatus> {
  const res = await fetch(`${API_BASE}/crawler/status`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "크롤러 상태를 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function fetchCrawlerLogs(limit = 200): Promise<CrawlerLogEntry[]> {
  const res = await fetch(`${API_BASE}/crawler/logs?limit=${limit}`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "크롤러 로그를 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function crawlerLogin(credentials?: {
  userId?: string;
  password?: string;
}) {
  const res = await fetch(`${API_BASE}/crawler/login`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(credentials ?? {}),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "로그인 요청에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function fetchCrawlerConfig(): Promise<CrawlerConfig> {
  const res = await fetch(`${API_BASE}/crawler/config`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "크롤러 설정을 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function updateCrawlerConfig(
  config: Partial<CrawlerConfig>,
): Promise<CrawlerConfig> {
  const res = await fetch(`${API_BASE}/crawler/config`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "크롤러 설정 저장에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function checkTankLoginV3(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/crawler/tank-login-check`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: "{}",
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "탱크옥션 로그인 확인에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function fetchTankFavoriteSearches(): Promise<{
  ok: boolean;
  items: TankFavoriteSearch[];
}> {
  const res = await fetch(`${API_BASE}/crawler/tank-favorite-searches`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "즐겨쓰는 검색 목록을 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function fetchSavedSearches(): Promise<SavedSearchPreset[]> {
  const res = await fetch(`${API_BASE}/crawler/saved-searches`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "저장된 검색조건을 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function saveSavedSearch(body: {
  id?: string;
  name: string;
  search: CrawlerSearchConfig;
}): Promise<SavedSearchPreset> {
  const res = await fetch(`${API_BASE}/crawler/saved-searches`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "검색조건 저장에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function deleteSavedSearch(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/crawler/saved-searches/delete`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "검색조건 삭제에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function countSearchResultsV3(
  search: CrawlerSearchConfig,
): Promise<{ ok: boolean; total: number }> {
  const res = await fetch(`${API_BASE}/crawler/count-search-v3`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ search }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "건수 조회에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function crawlerCollectUrls(
  preset: string,
  options?: {
    clear?: boolean;
    search?: Partial<CrawlerSearchConfig>;
    crawlerVersion?: CrawlerVersion;
  },
) {
  const res = await fetch(`${API_BASE}/crawler/collect-urls`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({
      preset,
      clear: options?.clear ?? true,
      search: options?.search,
      crawlerVersion: options?.crawlerVersion,
    }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "주소 수집에 실패했습니다.",
    );
  }
  return readJsonResponse<{
    urls: CrawlerUrlEntry[];
    message?: string;
    rawCount?: number;
    excluded?: number;
    deduped?: number;
    naverRefresh?: number;
  }>(res);
}

export async function crawlerLoadExcel(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/crawler/load-excel`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    body: form,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "엑셀 불러오기에 실패했습니다.",
    );
  }
  return readJsonResponse<{ urls: CrawlerUrlEntry[]; imported: number }>(res);
}

export async function crawlerManageUrls(body: {
  action: "add" | "remove" | "clear";
  url?: string;
  indices?: number[];
}) {
  const res = await fetch(`${API_BASE}/crawler/urls`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "URL 목록 변경에 실패했습니다.",
    );
  }
  return readJsonResponse<{ urls: CrawlerUrlEntry[] }>(res);
}

export async function crawlerStart(options?: {
  repeatAfterCollect?: boolean;
  crawlerVersion?: CrawlerVersion;
}) {
  const res = await fetch(`${API_BASE}/crawler/start`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "조회 시작에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function crawlerStop() {
  const res = await fetch(`${API_BASE}/crawler/stop`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "작업 중단에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function crawlerRestartWorker() {
  const res = await fetch(`${API_BASE}/crawler/restart-worker`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "워커 재시작에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function crawlerBackfillNaverIds() {
  const res = await fetch(`${API_BASE}/crawler/backfill-naver-id`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "네이버 ID 수집 시작에 실패했습니다.",
    );
  }
  return readJsonResponse<{ ok: boolean; message?: string; total?: number }>(res);
}

export async function crawlerClearLogs() {
  const res = await fetch(`${API_BASE}/crawler/logs/clear`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "로그 초기화에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function fetchAuctionAnalysis(
  auctionId: string,
): Promise<AuctionAnalysisResult | null> {
  const res = await fetch(`${API_BASE}/ai/auctions/${auctionId}/analysis`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "경매코치 AI 분석 결과를 불러오지 못했습니다.",
    );
  }
  return parseJsonResponse<AuctionAnalysisResult>(res);
}

export async function analyzeAuction(
  auctionId: string,
  refresh = false,
): Promise<AuctionAnalysisResult> {
  const res = await fetch(`${API_BASE}/ai/auctions/${auctionId}/analyze`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "경매코치 AI 분석에 실패했습니다.",
    );
  }
  const data = await parseJsonResponse<AuctionAnalysisResult>(res);
  if (!data) {
    throw new Error("경매코치 AI 분석 응답이 비어 있습니다.");
  }
  return data;
}

export async function fetchKnowledgeItems(): Promise<AuctionKnowledgeItem[]> {
  const res = await fetch(`${API_BASE}/ai/knowledge`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "경매지식 목록을 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function createKnowledgeItem(input: {
  title: string;
  category?: string;
  tags?: string;
  content: string;
  active?: boolean;
}): Promise<AuctionKnowledgeItem> {
  const res = await fetch(`${API_BASE}/ai/knowledge`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "경매지식 저장에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function structureKnowledgeInput(input: {
  category: string;
  rawText: string;
}): Promise<{ title: string; tags: string; content: string }> {
  const res = await fetch(`${API_BASE}/ai/knowledge/structure`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "AI 정리에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function updateKnowledgeItem(
  id: string,
  input: Partial<{
    title: string;
    category: string;
    tags: string;
    content: string;
    active: boolean;
  }>,
): Promise<AuctionKnowledgeItem> {
  const res = await fetch(`${API_BASE}/ai/knowledge/${id}`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "경매지식 수정에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function deleteKnowledgeItem(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/ai/knowledge/${id}`, {
    method: "DELETE",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "경매지식 삭제에 실패했습니다.",
    );
  }
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export async function fetchKnowledgeCategories(): Promise<KnowledgeCategory[]> {
  const res = await fetch(`${API_BASE}/ai/knowledge-categories`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "분류 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function createKnowledgeCategory(name: string): Promise<KnowledgeCategory> {
  const res = await fetch(`${API_BASE}/ai/knowledge-categories`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "분류 추가에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function deleteKnowledgeCategory(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/ai/knowledge-categories/${id}`, {
    method: "DELETE",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "분류 삭제에 실패했습니다.");
  }
}

export async function fetchKnowledgeDrafts(
  status?: KnowledgeDraftStatus,
): Promise<KnowledgeDraftItem[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`${API_BASE}/ai/knowledge-drafts${qs}`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "카페 지식 초안을 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function updateKnowledgeDraft(
  id: string,
  input: Partial<{
    title: string;
    category: string;
    tags: string;
    content: string;
    status: KnowledgeDraftStatus;
  }>,
): Promise<KnowledgeDraftItem> {
  const res = await fetch(`${API_BASE}/ai/knowledge-drafts/${id}`, {
    method: "PATCH",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "초안 수정에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function structureKnowledgeDraft(
  id: string,
): Promise<KnowledgeDraftItem> {
  const res = await fetch(`${API_BASE}/ai/knowledge-drafts/${id}/structure`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "AI 정리에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function structureKnowledgeDraftBatch(
  limit = 20,
): Promise<{ total: number; structured: number; skipped: number; failed: number }> {
  const res = await fetch(`${API_BASE}/ai/knowledge-drafts/structure-batch`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ limit }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "AI 일괄 정리에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function approveKnowledgeDraft(id: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/ai/knowledge-drafts/${id}/approve`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "승인에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function rejectKnowledgeDraft(
  id: string,
): Promise<KnowledgeDraftItem> {
  const res = await fetch(`${API_BASE}/ai/knowledge-drafts/${id}/reject`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "거절 처리에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function deleteKnowledgeDraft(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/ai/knowledge-drafts/${id}`, {
    method: "DELETE",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "초안 삭제에 실패했습니다.",
    );
  }
}

export async function fetchCafeCrawlStatus(): Promise<CafeCrawlStatus> {
  const res = await fetch(`${API_BASE}/crawler/cafe/status`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "카페 수집 상태를 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function cafeLogin(credentials: {
  userId: string;
  password: string;
}): Promise<{
  ok: boolean;
  message?: string;
  naverLoggedIn?: boolean;
  needsManualAuth?: boolean;
}> {
  const res = await fetch(`${API_BASE}/crawler/cafe/login`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({
      userId: credentials.userId,
      password: credentials.password,
    }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "네이버 로그인에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function cafeRestartBrowser(navigate?: string): Promise<{
  ok: boolean;
  message?: string;
  naverLoggedIn?: boolean;
  currentUrl?: string;
}> {
  const res = await fetch(`${API_BASE}/crawler/cafe/browser/restart`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(navigate ? { navigate } : {}),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "Chrome 재시작에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function cafeOpenLogin(): Promise<{
  ok: boolean;
  message?: string;
  naverLoggedIn?: boolean;
  profileDir?: string;
}> {
  const res = await fetch(`${API_BASE}/crawler/cafe/open-login`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "브라우저를 열지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function cafeOpen(
  cafeUrl: string,
): Promise<{ ok: boolean; message?: string; naverLoggedIn?: boolean }> {
  const res = await fetch(`${API_BASE}/crawler/cafe/open`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ cafeUrl }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "카페 페이지를 열지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function cafeCheckLogin(): Promise<{
  ok: boolean;
  naverLoggedIn?: boolean;
  message?: string;
}> {
  const res = await fetch(`${API_BASE}/crawler/cafe/check-login`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "로그인 확인에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function fetchCafeCollectedUrls(): Promise<{
  ok: boolean;
  cafeUrl?: string;
  collectedAt?: string | null;
  total?: number;
  urls?: Array<{ url: string; title?: string; articleId?: string }>;
}> {
  const res = await fetch(`${API_BASE}/crawler/cafe/collected-urls`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "수집된 URL 목록을 불러오지 못했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function cafeCollectUrls(options?: {
  cafeUrl?: string;
  maxArticles?: number;
  maxPages?: number;
  userId?: string;
  password?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/crawler/cafe/collect-urls`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "URL 수집 시작에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function cafeCrawlStart(options?: {
  cafeUrl?: string;
  maxArticles?: number;
  maxPages?: number;
  userId?: string;
  password?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/crawler/cafe/start`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "카페 수집 시작에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function cafeCrawlStop(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/crawler/cafe/stop`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "카페 수집 중단에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

export async function cafeImportArticle(options: {
  articleUrl: string;
  cafeUrl?: string;
  userId?: string;
  password?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/crawler/cafe/import-article`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "단일 글 수집에 실패했습니다.",
    );
  }
  return readJsonResponse(res);
}

// ─── 알림톡 관리(kakao-notify) ─────────────────────────────────────────────

export type KakaoLeadSource = "imweb" | "instagram" | "manual_sheet";
export type KakaoLeadStatus = "pending" | "sent" | "failed" | "skipped_duplicate";

export interface KakaoLead {
  id: string;
  source: KakaoLeadSource;
  sourceRefId: string;
  name: string;
  phone: string;
  email: string;
  gender: string;
  birthDate: string;
  address: string;
  adName: string;
  /** source를 세분화하는 채널명(수동시트 전용, 예: "naver폼"). 유입경로 필터에 사용. */
  channel: string;
  /** 설문형 유입 소스(수동시트 등)의 질문명→응답 JSON 문자열. 없으면 빈 문자열. */
  surveyAnswers: string;
  joinedAt: string | null;
  rawPayload: string;
  status: KakaoLeadStatus;
  excludedFromBulk: boolean;
  groupLabel: string;
  /** 랜딩페이지 방문~가입완료 시각 매칭으로 추정한 유입 캠페인 정보(참고용, 아임웹 소스만 해당) */
  utmSource: string;
  utmCampaign: string;
  utmMedium: string;
  utmContent: string;
  /** 가입완료 페이지의 "카톡방 참여하기" 버튼을 가장 최근에 클릭한 시각(재클릭 시 갱신) */
  kakaoRoomClickedAt: string | null;
  /** 카톡방 버튼을 처음 클릭한 시각(최초 1회만 기록) */
  firstKakaoRoomClickedAt: string | null;
  /** 카톡방 버튼 클릭 총 횟수(재방문 재클릭 포함) */
  kakaoRoomClickCount: number;
  createdAt: string;
  updatedAt: string;
  /** 목록 조회(fetchKakaoLeads) 시에만 포함됨: 같은 전화번호의 다른 신청 이력 존재 여부 */
  hasDuplicateApplications?: boolean;
}

export interface KakaoDispatchLog {
  id: string;
  leadId: string | null;
  attemptNo: number;
  templateCode: string;
  requestPayload: string;
  responsePayload: string;
  result: "success" | "failed";
  errorMessage: string | null;
  triggeredBy: "auto" | "manual_retry" | "test" | "bulk_manual" | "scheduled";
  triggeredByAdmin: string | null;
  sentAt: string;
}

export interface KakaoSyncState {
  source: KakaoLeadSource;
  lastSyncedAt: string | null;
  lastCursor: string | null;
  lastRunAt: string | null;
  lastRunStatus: "ok" | "error" | "never_run";
  lastErrorMessage: string | null;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchKakaoLeads(params: {
  source?: KakaoLeadSource;
  channel?: string;
  status?: KakaoLeadStatus;
  search?: string;
  group?: string;
  joinedFrom?: string;
  joinedTo?: string;
  duplicateOnly?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<PagedResult<KakaoLead>> {
  const query = new URLSearchParams();
  if (params.source) query.set("source", params.source);
  if (params.channel) query.set("channel", params.channel);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.group) query.set("group", params.group);
  if (params.joinedFrom) query.set("joinedFrom", params.joinedFrom);
  if (params.joinedTo) query.set("joinedTo", params.joinedTo);
  if (params.duplicateOnly) query.set("duplicateOnly", "true");
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));

  const res = await fetch(`${API_BASE}/kakao-notify/leads?${query.toString()}`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "고객 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

/** 필터/검색 조건에 맞는 리드 전체의 ID만 조회한다("전체선택"용, 페이징 없음). */
export async function fetchKakaoLeadIds(params: {
  source?: KakaoLeadSource;
  channel?: string;
  status?: KakaoLeadStatus;
  search?: string;
  group?: string;
  joinedFrom?: string;
  joinedTo?: string;
  duplicateOnly?: boolean;
}): Promise<string[]> {
  const query = new URLSearchParams();
  if (params.source) query.set("source", params.source);
  if (params.channel) query.set("channel", params.channel);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.group) query.set("group", params.group);
  if (params.joinedFrom) query.set("joinedFrom", params.joinedFrom);
  if (params.joinedTo) query.set("joinedTo", params.joinedTo);
  if (params.duplicateOnly) query.set("duplicateOnly", "true");

  const res = await fetch(`${API_BASE}/kakao-notify/leads/ids?${query.toString()}`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "고객 ID 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function fetchKakaoGroupLabels(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/kakao-notify/leads/groups`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "그룹 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function fetchKakaoChannels(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/kakao-notify/leads/channels`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "유입매체 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function setKakaoLeadGroup(id: string, groupLabel: string): Promise<KakaoLead> {
  const res = await fetch(`${API_BASE}/kakao-notify/leads/${id}/group`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ groupLabel }),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "그룹 지정에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function setKakaoLeadGroupBulk(
  ids: string[],
  groupLabel: string,
): Promise<{ updated: number }> {
  const res = await fetch(`${API_BASE}/kakao-notify/leads/group-bulk`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ ids, groupLabel }),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "일괄 그룹 지정에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function fetchKakaoLeadDetail(
  id: string,
): Promise<{
  lead: KakaoLead;
  logs: KakaoDispatchLog[];
  otherApplications: KakaoLead[];
  landingVisit: { landingUrl: string; referrer: string } | null;
}> {
  const res = await fetch(`${API_BASE}/kakao-notify/leads/${id}`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "고객 상세 정보를 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function resendKakaoLead(id: string): Promise<KakaoDispatchLog> {
  const res = await fetch(`${API_BASE}/kakao-notify/leads/${id}/resend`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "재발송에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function sendKakaoTestMessage(input: {
  name: string;
  phone: string;
  templateCode?: string;
  templateName?: string;
  variables?: Record<string, string>;
  source?: KakaoLeadSource;
  scheduledAt?: string;
}): Promise<KakaoDispatchLog | KakaoScheduledDispatch> {
  const res = await fetch(`${API_BASE}/kakao-notify/test-send`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "테스트 발송에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function fetchKakaoDispatchLogs(params: {
  result?: "success" | "failed";
  page?: number;
  pageSize?: number;
}): Promise<PagedResult<KakaoDispatchLog>> {
  const query = new URLSearchParams();
  if (params.result) query.set("result", params.result);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));

  const res = await fetch(`${API_BASE}/kakao-notify/dispatch-logs?${query.toString()}`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "발송 이력을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function fetchKakaoSyncState(): Promise<KakaoSyncState[]> {
  const res = await fetch(`${API_BASE}/kakao-notify/sync-state`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "동기화 상태를 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export interface KakaoSyncRunResult {
  processed: number;
  created: number;
}

export interface KakaoSyncRunAllResult {
  imweb: KakaoSyncRunResult | { error: string };
  instagram: KakaoSyncRunResult | { error: string };
}

/** 알림톡 자동발송(아임웹+인스타 신규 리드 수집 및 발송)을 동시에 실행한다. */
export async function runKakaoAutoSend(): Promise<KakaoSyncRunAllResult> {
  const res = await fetch(`${API_BASE}/kakao-notify/sync/run-now`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "자동발송 실행에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function cancelKakaoAutoSend(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/kakao-notify/sync/cancel`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "중단 요청에 실패했습니다.");
  }
  return readJsonResponse(res);
}

/** 아임웹 또는 인스타 한쪽만 개별로 신규 리드 수집+발송을 실행한다. */
export async function runKakaoAutoSendOne(
  source: KakaoLeadSource,
): Promise<KakaoSyncRunResult> {
  const res = await fetch(`${API_BASE}/kakao-notify/sync/run-now/${source}`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "자동발송 실행에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function cancelKakaoAutoSendOne(
  source: KakaoLeadSource,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/kakao-notify/sync/cancel/${source}`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "중단 요청에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function fetchKakaoSchedulerStatus(): Promise<{
  enabled: boolean;
  intervalMinutes: number;
}> {
  const res = await fetch(`${API_BASE}/kakao-notify/scheduler/status`, {
    credentials: FETCH_CREDENTIALS,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "자동발송 상태를 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function toggleKakaoScheduler(enabled: boolean): Promise<{ enabled: boolean }> {
  const res = await fetch(`${API_BASE}/kakao-notify/scheduler/toggle`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "자동발송 설정 변경에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function updateKakaoSchedulerInterval(
  intervalMinutes: number,
): Promise<{ intervalMinutes: number }> {
  const res = await fetch(`${API_BASE}/kakao-notify/scheduler/interval`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ intervalMinutes }),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "간격 설정 변경에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export interface KakaoSyncRunState {
  running: boolean;
  processed: number;
  cancelRequested: boolean;
  startedAt: string | null;
}

export async function fetchKakaoAutoSendStatus(): Promise<{
  imweb: KakaoSyncRunState;
  instagram: KakaoSyncRunState;
}> {
  const res = await fetch(`${API_BASE}/kakao-notify/sync/status`, {
    credentials: FETCH_CREDENTIALS,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "진행 상태를 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function backfillImwebExistingMembers(): Promise<{
  processed: number;
  created: number;
}> {
  const res = await fetch(`${API_BASE}/kakao-notify/imweb/backfill-existing`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "기존 회원 백필에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function backfillInstagramExistingRows(): Promise<{
  processed: number;
  created: number;
}> {
  const res = await fetch(`${API_BASE}/kakao-notify/instagram/backfill-existing`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "기존 인스타 리드 백필에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function deleteKakaoLeadsBySource(
  source: KakaoLeadSource,
): Promise<{ deleted: number }> {
  const res = await fetch(`${API_BASE}/kakao-notify/leads/delete-by-source/${source}`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "고객 데이터 삭제에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function deleteKakaoLeadsByIds(ids: string[]): Promise<{ deleted: number }> {
  const res = await fetch(`${API_BASE}/kakao-notify/leads/delete`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "선택한 고객 삭제에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export interface KakaoBulkSendResult {
  total: number;
  success: number;
  failed: number;
  excluded: number;
}

export type KakaoScheduledDispatchStatus = "scheduled" | "sent" | "canceled" | "failed";
export type KakaoScheduledDispatchKind = "bulk" | "test";

export interface KakaoScheduledDispatch {
  id: string;
  kind: KakaoScheduledDispatchKind;
  leadIdsJson: string;
  testPhone: string;
  testName: string;
  templateCode: string;
  templateName: string;
  variablesJson: string;
  templateNameVar: string;
  scheduledAt: string;
  status: KakaoScheduledDispatchStatus;
  targetCount: number;
  successCount: number | null;
  failedCount: number | null;
  errorMessage: string | null;
  createdByAdmin: string;
  createdAt: string;
  processedAt: string | null;
}

function isScheduledDispatch(
  result: KakaoBulkSendResult | KakaoDispatchLog | KakaoScheduledDispatch,
): result is KakaoScheduledDispatch {
  return typeof (result as KakaoScheduledDispatch).status === "string";
}

export { isScheduledDispatch };

export async function bulkSendKakaoLeads(input: {
  ids: string[];
  templateCode: string;
  templateName?: string;
  variables: Record<string, string>;
  templateNameVar?: string;
  scheduledAt?: string;
}): Promise<KakaoBulkSendResult | KakaoScheduledDispatch> {
  const res = await fetch(`${API_BASE}/kakao-notify/leads/bulk-send`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "일괄 발송에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function fetchKakaoScheduledDispatches(params: {
  status?: KakaoScheduledDispatchStatus;
  page?: number;
  pageSize?: number;
}): Promise<PagedResult<KakaoScheduledDispatch>> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));

  const res = await fetch(`${API_BASE}/kakao-notify/scheduled-dispatches?${query.toString()}`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "예약 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function cancelKakaoScheduledDispatch(
  id: string,
): Promise<KakaoScheduledDispatch> {
  const res = await fetch(`${API_BASE}/kakao-notify/scheduled-dispatches/${id}/cancel`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "예약 취소에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export interface InstagramSheetConfig {
  spreadsheetId: string;
  sheetRange: string;
}

export async function fetchInstagramSheetConfig(): Promise<InstagramSheetConfig> {
  const res = await fetch(`${API_BASE}/kakao-notify/instagram/sheet-config`, {
    credentials: FETCH_CREDENTIALS,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "구글시트 설정을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function updateInstagramSheetConfig(
  input: InstagramSheetConfig,
): Promise<InstagramSheetConfig> {
  const res = await fetch(`${API_BASE}/kakao-notify/instagram/sheet-config`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "구글시트 설정 저장에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export interface ManualSheetConfig {
  spreadsheetId: string;
  sheetRange: string;
}

export async function fetchManualSheetConfig(): Promise<ManualSheetConfig> {
  const res = await fetch(`${API_BASE}/kakao-notify/manual-sheet/config`, {
    credentials: FETCH_CREDENTIALS,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "구글시트 설정을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function updateManualSheetConfig(
  input: ManualSheetConfig,
): Promise<ManualSheetConfig> {
  const res = await fetch(`${API_BASE}/kakao-notify/manual-sheet/config`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "구글시트 설정 저장에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function applyManualSheet(): Promise<{
  processed: number;
  created: number;
  duplicate: number;
  invalidPhone: number;
}> {
  const res = await fetch(`${API_BASE}/kakao-notify/manual-sheet/apply`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "구글시트 적용에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export interface SolapiTemplateButton {
  buttonType?: string;
  buttonName?: string;
  linkAnd?: string;
  linkIos?: string;
  linkPc?: string;
  linkMo?: string;
}

export interface SolapiTemplate {
  templateId: string;
  name: string;
  status: string;
  content: string;
  buttons: SolapiTemplateButton[];
  emphasizeTitle: string | null;
  emphasizeSubtitle: string | null;
  extra: string | null;
}

export async function fetchKakaoTemplates(): Promise<SolapiTemplate[]> {
  const res = await fetch(`${API_BASE}/kakao-notify/templates`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "템플릿 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export interface KakaoNotifySetting {
  key: "default";
  templateCode: string;
  templateName: string;
  variablesJson: string;
  templateNameVar: string;
}

export async function fetchKakaoSettings(): Promise<KakaoNotifySetting> {
  const res = await fetch(`${API_BASE}/kakao-notify/settings`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "알림톡 설정을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function updateKakaoSetting(input: {
  templateCode: string;
  templateName: string;
  variables: Record<string, string>;
  templateNameVar?: string;
}): Promise<KakaoNotifySetting> {
  const res = await fetch(`${API_BASE}/kakao-notify/settings`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "알림톡 설정 저장에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export interface KakaoLeadFieldOption {
  field: string;
  label: string;
}

export async function fetchKakaoLeadFields(): Promise<KakaoLeadFieldOption[]> {
  const res = await fetch(`${API_BASE}/kakao-notify/lead-fields`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "리드 필드 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export interface KakaoDailyStat {
  date: string;
  imweb: number;
  instagram: number;
  total: number;
}

export async function fetchKakaoDailyStats(
  params: { days: number } | { from: string; to: string },
): Promise<KakaoDailyStat[]> {
  const query = new URLSearchParams();
  if ("from" in params) {
    query.set("from", params.from);
    query.set("to", params.to);
  } else {
    query.set("days", String(params.days));
  }
  const res = await fetch(`${API_BASE}/kakao-notify/leads/daily-stats?${query.toString()}`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "일자별 통계를 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function setKakaoLeadBulkExclusion(
  id: string,
  excluded: boolean,
): Promise<KakaoLead> {
  const res = await fetch(`${API_BASE}/kakao-notify/leads/${id}/bulk-exclusion`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify({ excluded }),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "알림톡 제외 설정에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export interface KakaoAdCreative {
  id: string;
  adName: string;
  label: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  createdAt: string;
}

export async function fetchKakaoAdCreatives(): Promise<KakaoAdCreative[]> {
  const res = await fetch(`${API_BASE}/kakao-notify/ad-creatives`, {
    cache: "no-store",
    credentials: FETCH_CREDENTIALS,
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "유입소재 이미지 목록을 불러오지 못했습니다.");
  }
  return readJsonResponse(res);
}

export async function upsertKakaoAdCreative(input: {
  adName: string;
  label?: string;
  mediaUrl: string;
  mediaType: "image" | "video";
}): Promise<KakaoAdCreative> {
  const res = await fetch(`${API_BASE}/kakao-notify/ad-creatives`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "유입소재 이미지 등록에 실패했습니다.");
  }
  return readJsonResponse(res);
}

export async function deleteKakaoAdCreative(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/kakao-notify/ad-creatives/${id}/delete`, {
    method: "POST",
    credentials: FETCH_CREDENTIALS,
    headers: withJsonHeaders(),
  });
  if (!res.ok) {
    throw new Error((await parseErrorMessage(res)) ?? "유입소재 이미지 삭제에 실패했습니다.");
  }
  return readJsonResponse(res);
}
