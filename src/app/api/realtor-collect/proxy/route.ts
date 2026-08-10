import { NextRequest, NextResponse } from "next/server";

/** Vercel 서울 리전(icn1)에서 실행 — Railway(해외 리전, sfo)가
 * karhanbang.com(한방)에 연결하지 못하는 문제를 우회한다(실측,
 * 2026-08-10: 백엔드에서 직접 fetch 시 매번 `ConnectTimeoutError`/
 * `fetch failed`로 실패, VWorld API에서 이미 겪었던 것과 동일한
 * "Railway 해외 리전" 이슈). 백엔드(`RealtorCollectService`)가 한방
 * 목록/상세/지역콤보 페이지를 요청할 때마다 이 라우트를 거쳐가도록
 * 바꿨다 — 서버 간 호출이라 브라우저 세션 쿠키 대신 공유 시크릿
 * 헤더로 인증한다. */
export const preferredRegion = "icn1";
export const runtime = "nodejs";
export const maxDuration = 30;

/** 실측(2026-08-11): 동시 요청이 몇 개만 겹쳐도 응답이 느려지는
 * 현상이 있어, 무한정 기다리는 대신 12초에서 끊고 백엔드가 재시도
 * 하도록 한다(끝없이 매달리다 Vercel 함수 자체가 죽는 것보다, 짧게
 * 실패시켜 백엔드의 재시도 로직이 더 빨리 판단하게 하는 게 낫다). */
const FETCH_TIMEOUT_MS = 12_000;

const ALLOWED_HOST = "www.karhanbang.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-realtor-proxy-secret");
  const expected = process.env.REALTOR_PROXY_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ message: "인증 실패" }, { status: 401 });
  }

  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ message: "url 파라미터가 필요합니다." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ message: "유효하지 않은 url입니다." }, { status: 400 });
  }
  if (parsed.host !== ALLOWED_HOST) {
    return NextResponse.json({ message: "허용되지 않은 도메인입니다." }, { status: 400 });
  }

  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (request.nextUrl.searchParams.get("ajax") === "1") {
    headers.Accept = "application/json, text/javascript, */*; q=0.01";
    headers.Referer = "https://www.karhanbang.com/office/office_list.asp?topM=09";
    headers["X-Requested-With"] = "XMLHttpRequest";
  }

  try {
    const res = await fetch(parsed.toString(), { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("[realtor-collect proxy] 호출 실패:", err);
    return NextResponse.json({ message: "한방 사이트에 연결하지 못했습니다." }, { status: 503 });
  }
}
