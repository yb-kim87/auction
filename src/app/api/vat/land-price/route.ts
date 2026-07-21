import { NextRequest, NextResponse } from "next/server";
import { fetchExternalJson, requireAuthFromRequest } from "@/lib/vat-server";

export const preferredRegion = "icn1";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await requireAuthFromRequest(request);
  if (authError) return authError;

  const x = request.nextUrl.searchParams.get("x");
  const y = request.nextUrl.searchParams.get("y");
  if (!x || !y) {
    return NextResponse.json({ message: "좌표(x, y)가 필요합니다." }, { status: 400 });
  }
  const key = process.env.VWORLD_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { message: "VWorld API 키가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const url = new URL("https://api.vworld.kr/req/data");
  url.searchParams.set("service", "data");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("version", "2.0");
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("data", "LP_PA_CBND_BUBUN");
  // 이 키는 서비스URL로 등록돼 있어 domain 파라미터가 없으면
  // INCORRECT_KEY로 거부된다(실측, 2026-07-21).
  url.searchParams.set(
    "domain",
    process.env.VWORLD_REGISTERED_DOMAIN ?? "https://auction-seven-tan.vercel.app",
  );
  url.searchParams.set("geomFilter", `POINT(${x} ${y})`);
  url.searchParams.set("format", "json");
  url.searchParams.set("key", key);

  const result = await fetchExternalJson("VWorld 공시지가 조회", url.toString());
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
