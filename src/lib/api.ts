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

  return res.json() as Promise<{ imported: number; total: number; status?: string }>;
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
