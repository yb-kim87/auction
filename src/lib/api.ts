import type {
  AuctionItem,
  UpdateAuctionPayload,
  UserProfile,
  UserRole,
} from "@/types/auction";
import { getAuthRole, getAuthUser } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function authHeaders(extra?: HeadersInit): HeadersInit {
  const headers = new Headers(extra);
  const user = getAuthUser();
  const role = getAuthRole();
  if (user) headers.set("X-Auction-User", user);
  if (role) headers.set("X-Auction-Role", role);
  return headers;
}

async function parseErrorMessage(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.message)) return data.message.join(", ");
  return null;
}

export async function loginUser(username: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "로그인에 실패했습니다.",
    );
  }
  return res.json() as Promise<UserProfile>;
}

export async function signupUser(
  username: string,
  password: string,
  name: string,
) {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, name }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "회원가입에 실패했습니다.",
    );
  }
  return res.json() as Promise<UserProfile>;
}

export async function fetchAuctions(): Promise<AuctionItem[]> {
  const res = await fetch(`${API_BASE}/auctions`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 데이터를 불러오지 못했습니다.",
    );
  }
  return res.json();
}

export async function fetchFavoriteIds(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/favorites`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "관심물건 목록을 불러오지 못했습니다.",
    );
  }
  const data = (await res.json()) as { auctionIds?: string[] };
  return data.auctionIds ?? [];
}

export async function addFavorite(auctionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/favorites/${auctionId}`, {
    method: "POST",
    headers: authHeaders(),
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
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "관심물건 해제에 실패했습니다.",
    );
  }
}

export async function fetchAdminAuctions(): Promise<AuctionItem[]> {
  const res = await fetch(`${API_BASE}/auctions/manage`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 데이터를 불러오지 못했습니다.",
    );
  }
  return res.json();
}

export async function fetchPendingAuctions(): Promise<AuctionItem[]> {
  const res = await fetch(`${API_BASE}/auctions/pending`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "승인 대기 목록을 불러오지 못했습니다.",
    );
  }
  return res.json();
}

export async function fetchMyAuctions(): Promise<AuctionItem[]> {
  const res = await fetch(`${API_BASE}/auctions/my`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "내 등록 물건을 불러오지 못했습니다.",
    );
  }
  return res.json();
}

export async function fetchAuctionCount(): Promise<{ total: number; pending: number }> {
  const res = await fetch(`${API_BASE}/auctions/count`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) return { total: 0, pending: 0 };
  return res.json();
}

export async function uploadAuctionExcel(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/auctions/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "엑셀 업로드에 실패했습니다.",
    );
  }

  return res.json() as Promise<{
    imported: number;
    created: number;
    updated: number;
    total: number;
    status?: string;
  }>;
}

export async function createAuction(data: UpdateAuctionPayload) {
  const res = await fetch(`${API_BASE}/auctions`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 등록에 실패했습니다.",
    );
  }
  return res.json() as Promise<AuctionItem>;
}

export function getTemplateDownloadUrl() {
  return `${API_BASE}/auctions/template`;
}

export async function updateMyAuction(id: string, data: UpdateAuctionPayload) {
  const res = await fetch(`${API_BASE}/auctions/my/${id}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 수정에 실패했습니다.",
    );
  }
  return res.json() as Promise<AuctionItem>;
}

export async function deleteMyAuction(id: string) {
  const res = await fetch(`${API_BASE}/auctions/my/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 삭제에 실패했습니다.",
    );
  }
  return res.json() as Promise<{ deleted: number; total: number }>;
}

export async function deleteAuction(id: string) {
  const res = await fetch(`${API_BASE}/auctions/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 삭제에 실패했습니다.",
    );
  }
  return res.json() as Promise<{ deleted: number; total: number }>;
}

export async function deleteAuctions(ids: string[]) {
  const res = await fetch(`${API_BASE}/auctions/delete-many`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "선택 항목 삭제에 실패했습니다.",
    );
  }
  return res.json() as Promise<{ deleted: number; total: number }>;
}

export async function deleteAllAuctions() {
  const res = await fetch(`${API_BASE}/auctions/all`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "전체 삭제에 실패했습니다.",
    );
  }
  return res.json() as Promise<{ deleted: number; total: number }>;
}

export async function fetchAuctionChangeHistory(auctionId: string) {
  const res = await fetch(`${API_BASE}/auctions/${auctionId}/changes`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "변경 이력을 불러오지 못했습니다.",
    );
  }
  return res.json() as Promise<import("@/types/auction").AuctionChangeLogEntry[]>;
}

export async function updateAuction(id: string, data: UpdateAuctionPayload) {
  const res = await fetch(`${API_BASE}/auctions/${id}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "물건 수정에 실패했습니다.",
    );
  }
  return res.json() as Promise<AuctionItem>;
}

export async function approveAuction(id: string) {
  const res = await fetch(`${API_BASE}/auctions/${id}/approve`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "승인에 실패했습니다.",
    );
  }
  return res.json() as Promise<AuctionItem>;
}

export async function rejectAuction(id: string) {
  const res = await fetch(`${API_BASE}/auctions/${id}/reject`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "반려에 실패했습니다.",
    );
  }
  return res.json() as Promise<AuctionItem>;
}

export async function approveAuctions(ids: string[]) {
  const res = await fetch(`${API_BASE}/auctions/approve-many`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "일괄 승인에 실패했습니다.",
    );
  }
  return res.json() as Promise<{ approved: number; pending: number }>;
}

export async function rejectAuctions(ids: string[]) {
  const res = await fetch(`${API_BASE}/auctions/reject-many`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "일괄 반려에 실패했습니다.",
    );
  }
  return res.json() as Promise<{ rejected: number; pending: number }>;
}

export async function fetchUsers(): Promise<UserProfile[]> {
  const res = await fetch(`${API_BASE}/users`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "회원 목록을 불러오지 못했습니다.",
    );
  }
  return res.json();
}

export async function updateUserRole(id: string, role: UserRole) {
  const res = await fetch(`${API_BASE}/users/${id}/role`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "권한 변경에 실패했습니다.",
    );
  }
  return res.json() as Promise<UserProfile>;
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
};

export type CrawlerSearchConfig = {
  listType: "auction" | "public";
  propertyTypes: string[];
  status: string;
  appraisalMin: string;
  appraisalMax: string;
  preserveRegistryFrom: string;
  excludeSpecialConditions: string[];
  pageSize: string;
};

export type CrawlerAlgorithmConfig = {
  enabled: boolean;
  minArea: number;
  minGapPriceMan: number;
  minHouseholds: number;
  registryKeyword: string;
  telegramEnabled: boolean;
};

export type CrawlerScheduleConfig = {
  enabled: boolean;
  time: string;
  preset: string;
  repeatAfterCollect: boolean;
  excludeDuplicates: boolean;
  repeatDaily: boolean;
  oneTimeCompleted?: boolean;
};

export type CrawlerCredentialsConfig = {
  userId: string;
  password: string;
};

export type CrawlerConfig = {
  search: CrawlerSearchConfig;
  algorithm: CrawlerAlgorithmConfig;
  schedule: CrawlerScheduleConfig;
  credentials: CrawlerCredentialsConfig;
};

export type CrawlerLogEntry = {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
};

export async function fetchCrawlerStatus(): Promise<CrawlerStatus> {
  const res = await fetch(`${API_BASE}/crawler/status`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "크롤러 상태를 불러오지 못했습니다.",
    );
  }
  return res.json();
}

export async function fetchCrawlerLogs(limit = 200): Promise<CrawlerLogEntry[]> {
  const res = await fetch(`${API_BASE}/crawler/logs?limit=${limit}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "크롤러 로그를 불러오지 못했습니다.",
    );
  }
  return res.json();
}

export async function crawlerLogin(credentials?: {
  userId?: string;
  password?: string;
}) {
  const res = await fetch(`${API_BASE}/crawler/login`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(credentials ?? {}),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "로그인 요청에 실패했습니다.",
    );
  }
  return res.json();
}

export async function fetchCrawlerConfig(): Promise<CrawlerConfig> {
  const res = await fetch(`${API_BASE}/crawler/config`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "크롤러 설정을 불러오지 못했습니다.",
    );
  }
  return res.json();
}

export async function updateCrawlerConfig(
  config: Partial<CrawlerConfig>,
): Promise<CrawlerConfig> {
  const res = await fetch(`${API_BASE}/crawler/config`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "크롤러 설정 저장에 실패했습니다.",
    );
  }
  return res.json();
}

export async function crawlerCollectUrls(
  preset: string,
  options?: {
    clear?: boolean;
    search?: Partial<CrawlerSearchConfig>;
  },
) {
  const res = await fetch(`${API_BASE}/crawler/collect-urls`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      preset,
      clear: options?.clear ?? true,
      search: options?.search,
    }),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "주소 수집에 실패했습니다.",
    );
  }
  return res.json() as Promise<{
    urls: CrawlerUrlEntry[];
    message?: string;
    excluded?: number;
  }>;
}

export async function crawlerLoadExcel(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/crawler/load-excel`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "엑셀 불러오기에 실패했습니다.",
    );
  }
  return res.json() as Promise<{ urls: CrawlerUrlEntry[]; imported: number }>;
}

export async function crawlerManageUrls(body: {
  action: "add" | "remove" | "clear";
  url?: string;
  indices?: number[];
}) {
  const res = await fetch(`${API_BASE}/crawler/urls`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "URL 목록 변경에 실패했습니다.",
    );
  }
  return res.json() as Promise<{ urls: CrawlerUrlEntry[] }>;
}

export async function crawlerStart(options?: {
  repeatAfterCollect?: boolean;
}) {
  const res = await fetch(`${API_BASE}/crawler/start`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "조회 시작에 실패했습니다.",
    );
  }
  return res.json();
}

export async function crawlerStop() {
  const res = await fetch(`${API_BASE}/crawler/stop`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "작업 중단에 실패했습니다.",
    );
  }
  return res.json();
}

export async function crawlerRestartWorker() {
  const res = await fetch(`${API_BASE}/crawler/restart-worker`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "워커 재시작에 실패했습니다.",
    );
  }
  return res.json();
}

export async function crawlerBackfillNaverIds() {
  const res = await fetch(`${API_BASE}/crawler/backfill-naver-id`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "네이버 ID 수집 시작에 실패했습니다.",
    );
  }
  return res.json() as Promise<{ ok: boolean; message?: string; total?: number }>;
}

export async function crawlerClearLogs() {
  const res = await fetch(`${API_BASE}/crawler/logs/clear`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      (await parseErrorMessage(res)) ?? "로그 초기화에 실패했습니다.",
    );
  }
  return res.json();
}
