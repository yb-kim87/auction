import axios, { type InternalAxiosRequestConfig } from "axios";

/** 브라우저는 항상 같은 출처(/api)로 호출 — JWT HttpOnly 쿠키 전달 */
const API_BASE = "/api";

export const http = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

/** accessToken(30분)이 만료되어 API가 401을 반환하면, refreshToken(30일)으로
 * 자동 재발급받은 뒤 원래 요청을 한 번 재시도한다. src/lib/auth-fetch-interceptor.ts가
 * 전역 window.fetch에 대해 하는 것과 동일한 동작을 axios 요청에도 적용한다 —
 * axios는 window.fetch를 거치지 않으므로 별도로 구현해야 한다. */
let refreshInFlight: Promise<boolean> | null = null;

function isAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  return url.includes("/auth/login") || url.includes("/auth/refresh") || url.includes("/auth/logout");
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(`${API_BASE}/auth/refresh`, null, { withCredentials: true })
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// useQuery/useMutation 등에서 직접 쓰는 http.get/post/... 호출용 — axios 기본
// validateStatus(2xx만 성공)를 그대로 쓰므로, 401은 reject되어 여기서 잡힌다.
http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config as RetriableConfig | undefined;
    if (
      !config ||
      error?.response?.status !== 401 ||
      isAuthEndpoint(config.url) ||
      config._retried
    ) {
      return Promise.reject(error);
    }
    const refreshed = await tryRefresh();
    if (!refreshed) return Promise.reject(error);
    config._retried = true;
    return http(config);
  },
);

/** 서버 에러 응답의 message 필드를 기존 parseErrorMessage()와 동일한 규칙으로 추출한다. */
export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | string | undefined;
    if (data && typeof data === "object" && "message" in data && data.message) {
      return Array.isArray(data.message) ? data.message.join(", ") : data.message;
    }
    if (typeof data === "string") {
      const trimmed = data.trim();
      if (trimmed && !trimmed.startsWith("{")) return trimmed.slice(0, 200);
    }
  }
  return fallback;
}

function toResponse(raw: { data: unknown; status: number; statusText: string }): Response {
  const body = typeof raw.data === "string" ? raw.data : raw.data == null ? "" : String(raw.data);
  return new Response(body, { status: raw.status, statusText: raw.statusText });
}

/** window.fetch와 동일한 시그니처의 axios 기반 어댑터.
 * api.ts에 있는 200개가 넘는 fetch() 호출부의 에러 파싱/JSON 처리 로직은
 * 그대로 두고, 실제 네트워크 전송 계층만 axios로 옮기기 위한 것 — 그래서
 * 각 호출부는 `fetch(` → `apiFetch(` 한 줄만 바뀌고 나머지 동작(에러 메시지,
 * 응답 파싱)은 100% 동일하게 유지된다. 401 자동 재발급도 여기서 직접
 * 처리한다(위 axios 인터셉터는 validateStatus 기본값에 의존하는데, 여기서는
 * 호출부가 res.ok를 직접 검사하도록 validateStatus를 항상 true로 둬야 하기
 * 때문에 인터셉터의 reject 기반 로직이 걸리지 않는다). */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const path = input.startsWith(API_BASE) ? input.slice(API_BASE.length) : input;
  const config = {
    url: path,
    method: (init?.method ?? "GET") as string,
    data: init?.body as unknown,
    headers: init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined,
    responseType: "text" as const,
    transformResponse: (data: string) => data,
    validateStatus: () => true,
  };

  const res = await http.request(config);

  if (res.status === 401 && !isAuthEndpoint(path)) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const retryRes = await http.request(config);
      return toResponse(retryRes);
    }
  }

  return toResponse(res);
}
