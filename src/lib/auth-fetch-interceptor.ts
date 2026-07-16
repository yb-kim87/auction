"use client";

/**
 * accessToken(30분)이 만료되어 API가 401을 반환하면, refreshToken(30일)으로
 * 자동 재발급받은 뒤 원래 요청을 한 번 재시도한다. 이렇게 하면 사용자가 30분마다
 * 강제 로그아웃되지 않고, 실제로 refreshToken까지 만료됐을 때만(최대 30일) 다시
 * 로그인 화면으로 이동한다.
 *
 * 전역 window.fetch를 감싸는 방식이라 기존 api.ts의 개별 fetch 호출을 전혀
 * 수정하지 않고도 모든 API 요청에 적용된다.
 */
let installed = false;
let refreshInFlight: Promise<boolean> | null = null;

function isApiRequest(input: RequestInfo | URL): boolean {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  return url.startsWith("/api/") || url.startsWith("/api");
}

function isAuthEndpoint(input: RequestInfo | URL): boolean {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  return url.includes("/auth/login") || url.includes("/auth/refresh") || url.includes("/auth/logout");
}

async function tryRefresh(originalFetch: typeof fetch): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = originalFetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export function installAuthFetchInterceptor(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);

    if (response.status !== 401 || !isApiRequest(input) || isAuthEndpoint(input)) {
      return response;
    }

    const refreshed = await tryRefresh(originalFetch);
    if (!refreshed) return response;

    // refresh 성공 시 원래 요청을 새 accessToken 쿠키로 한 번 재시도
    return originalFetch(input, init);
  };
}
