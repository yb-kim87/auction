import { NextRequest, NextResponse } from "next/server";
import { fetchExternalJson, requireAdminFromRequest } from "@/lib/vat-server";

/** Vercel 서울 리전(icn1)에서 실행 — Railway(해외 리전)가 VWorld API에
 * 연결하지 못하는 문제를 우회한다(실측, 2026-07-21 VAT 계산기에서
 * 확인된 것과 동일 이슈, 2026-08-04 매도분석 지도에서도 재확인:
 * Railway에서 GeocodeService가 항상 SocketError/UND_ERR_SOCKET으로
 * 실패). 매도분석 주소는 city+district+umdNm+jibun 조합의 지번
 * 주소뿐이라 ROAD/PARCEL 자동판별 없이 항상 PARCEL을 먼저 시도한다. */
export const preferredRegion = "icn1";
export const runtime = "nodejs";

function vworldKey(): string | null {
  return process.env.VWORLD_API_KEY?.trim() || null;
}

export async function GET(request: NextRequest) {
  const authError = await requireAdminFromRequest(request);
  if (authError) return authError;

  const address = request.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ message: "주소가 필요합니다." }, { status: 400 });
  }
  const key = vworldKey();
  if (!key) {
    return NextResponse.json({ message: "VWorld API 키가 설정되지 않았습니다." }, { status: 503 });
  }

  async function tryGetCoord(addr: string, type: "ROAD" | "PARCEL") {
    const url = new URL("https://api.vworld.kr/req/address");
    url.searchParams.set("service", "address");
    url.searchParams.set("request", "getCoord");
    url.searchParams.set("version", "2.0");
    url.searchParams.set("crs", "EPSG:4326");
    url.searchParams.set("type", type);
    url.searchParams.set("address", addr);
    url.searchParams.set("format", "json");
    url.searchParams.set("key", key as string);
    return fetchExternalJson("VWorld 주소 변환", url.toString());
  }

  function extractPoint(data: unknown): { x: string; y: string } | null {
    const d = data as { response?: { status?: string; result?: { point?: { x?: string; y?: string } } } };
    const p = d.response?.result?.point;
    return d.response?.status === "OK" && p?.x && p?.y ? { x: p.x, y: p.y } : null;
  }

  let result = await tryGetCoord(address, "PARCEL");
  let point = result.ok ? extractPoint(result.data) : null;

  // 행정구역 개편 등으로 PARCEL이 NOT_FOUND면 VWorld search API로 도로명주소를
  // 찾아 ROAD로 재시도한다(auction-api/VatController와 동일 이유, 2026-07-21).
  if (!point) {
    const searchUrl = new URL("https://api.vworld.kr/req/search");
    searchUrl.searchParams.set("service", "search");
    searchUrl.searchParams.set("request", "search");
    searchUrl.searchParams.set("version", "2.0");
    searchUrl.searchParams.set("crs", "EPSG:4326");
    searchUrl.searchParams.set("size", "1");
    searchUrl.searchParams.set("query", address);
    searchUrl.searchParams.set("type", "ADDRESS");
    searchUrl.searchParams.set("category", "ROAD");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("errorFormat", "json");
    searchUrl.searchParams.set("key", key);

    const searchResult = await fetchExternalJson("VWorld 주소 검색", searchUrl.toString());
    if (searchResult.ok) {
      const searchData = searchResult.data as {
        response?: { status?: string; result?: { items?: { address?: { road?: string } }[] } };
      };
      const roadAddress = searchData.response?.result?.items?.[0]?.address?.road;
      if (searchData.response?.status === "OK" && roadAddress) {
        result = await tryGetCoord(roadAddress, "ROAD");
        point = result.ok ? extractPoint(result.data) : null;
      }
    }
  }

  if (!point) {
    return NextResponse.json({ latitude: null, longitude: null });
  }
  return NextResponse.json({ latitude: Number(point.y), longitude: Number(point.x) });
}
