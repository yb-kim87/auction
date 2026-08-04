import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/vat-server";

/** 서울 열린데이터광장 "서울시 도시계획 정비사업 현황"(upisRebuild) API
 * 프록시. Vercel 서울 리전(icn1)에서 호출 — Railway(해외 리전)가 한국
 * 공공 API에 직접 연결 못 하는 문제(2026-08-04, VWorld에서 먼저 확인된
 * 것과 동일 이슈)를 피하기 위해 백엔드가 아닌 프론트 Route Handler로
 * 처리한다. 인증키는 서버 전용 env로 보관해 클라이언트에 노출하지 않는다. */
export const preferredRegion = "icn1";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await requireAdminFromRequest(request);
  if (authError) return authError;

  const key = process.env.SEOUL_OPENDATA_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ message: "SEOUL_OPENDATA_API_KEY가 설정되어 있지 않습니다." }, { status: 503 });
  }

  const start = request.nextUrl.searchParams.get("start") ?? "1";
  const end = request.nextUrl.searchParams.get("end") ?? "1000";

  const url = `http://openapi.seoul.go.kr:8088/${key}/json/upisRebuild/${start}/${end}/`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ message: "서울 열린데이터광장 API 요청 실패" }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[redevelopment] upisRebuild 호출 실패:", err);
    return NextResponse.json({ message: "서울 열린데이터광장 API 연결에 실패했습니다." }, { status: 502 });
  }
}
