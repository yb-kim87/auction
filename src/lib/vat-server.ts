import { NextRequest, NextResponse } from "next/server";
import { readAuthToken, verifySessionToken } from "@/lib/session";

/** 부가세계산 자동조회(VWorld/건축물대장) API 라우트 전용 인증 체크.
 * Railway 백엔드(sfo, 해외 리전)에서 이 외부 API들을 호출하면 연결이
 * 막혀(SocketError/UND_ERR_SOCKET) 항상 실패한다(실측, 2026-07-21) —
 * Vercel(서울 리전, icn1)에서 대신 호출하도록 이 API들만 프론트 자체
 * Route Handler로 분리했다. 백엔드를 거치지 않으므로 인증도 여기서
 * 직접 세션 쿠키를 검증한다. */
export async function requireAdminFromRequest(
  request: NextRequest,
): Promise<NextResponse | null> {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { message: "관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }
  return null;
}

/** 물건 상세(수익계산 패널)의 85㎡ 초과 물건 부가세 자동계산은 관리자
 * 뿐 아니라 로그인한 일반 회원(수강생/컨설턴트 등)도 사용하므로,
 * 관리자 전용이 아니라 로그인 여부만 확인한다. */
export async function requireAuthFromRequest(
  request: NextRequest,
): Promise<NextResponse | null> {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  return null;
}

export async function fetchExternalJson(
  label: string,
  url: string,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, status: 502, message: `${label} 요청 실패` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    console.error(`[vat] ${label} 호출 실패:`, err);
    return {
      ok: false,
      status: 503,
      message: `${label} 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.`,
    };
  }
}
