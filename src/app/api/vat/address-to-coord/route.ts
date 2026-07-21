import { NextRequest, NextResponse } from "next/server";
import { fetchExternalJson, requireAdminFromRequest } from "@/lib/vat-server";

/** Vercel 서울 리전(icn1)에서 실행 — Railway(해외 리전)가 VWorld API에
 * 연결하지 못하는 문제를 우회한다(실측, 2026-07-21). */
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
    return NextResponse.json(
      { message: "VWorld API 키가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  // 1) 도로명주소 → 좌표(ROAD). 카카오 우편번호가 도로명주소를 주므로
  // PARCEL(지번)로 조회하면 대부분 NOT_FOUND가 난다(실측, 2026-07-21).
  const coordUrl = new URL("https://api.vworld.kr/req/address");
  coordUrl.searchParams.set("service", "address");
  coordUrl.searchParams.set("request", "getCoord");
  coordUrl.searchParams.set("version", "2.0");
  coordUrl.searchParams.set("crs", "EPSG:4326");
  coordUrl.searchParams.set("type", "ROAD");
  coordUrl.searchParams.set("address", address);
  coordUrl.searchParams.set("format", "json");
  coordUrl.searchParams.set("key", key);

  const coordResult = await fetchExternalJson("VWorld 주소 변환", coordUrl.toString());
  if (!coordResult.ok) {
    return NextResponse.json({ message: coordResult.message }, { status: coordResult.status });
  }
  const coordData = coordResult.data as {
    response?: {
      status?: string;
      result?: { point?: { x?: string; y?: string } };
      refined?: { text?: string };
    };
  };
  const point = coordData.response?.result?.point;
  if (coordData.response?.status !== "OK" || !point?.x || !point?.y) {
    return NextResponse.json(coordData);
  }

  // 2) 좌표 → 지번(PARCEL) 역지오코딩. ROAD 응답엔 PNU가 없어 다시
  // 조회해야 법정동코드+본번+부번을 얻는다(실측, 2026-07-21).
  const reverseUrl = new URL("https://api.vworld.kr/req/address");
  reverseUrl.searchParams.set("service", "address");
  reverseUrl.searchParams.set("request", "getAddress");
  reverseUrl.searchParams.set("version", "2.0");
  reverseUrl.searchParams.set("crs", "EPSG:4326");
  reverseUrl.searchParams.set("point", `${point.x},${point.y}`);
  reverseUrl.searchParams.set("type", "PARCEL");
  reverseUrl.searchParams.set("format", "json");
  reverseUrl.searchParams.set("key", key);

  const reverseResult = await fetchExternalJson("VWorld 역지오코딩", reverseUrl.toString());
  let pnu: string | null = null;
  if (reverseResult.ok) {
    const reverseData = reverseResult.data as {
      response?: {
        status?: string;
        result?: { structure?: { level4LC?: string; level5?: string } }[];
      };
    };
    const structure = reverseData.response?.result?.[0]?.structure;
    const dongCode = structure?.level4LC?.trim();
    const [bunRaw, jiRaw] = (structure?.level5 ?? "").split("-");
    if (dongCode && bunRaw) {
      const bun = bunRaw.padStart(4, "0").slice(-4);
      const ji = (jiRaw ?? "0").padStart(4, "0").slice(-4);
      // PNU 11번째 자리(산여부)는 이 API만으로 확정할 수 없어 대지(1)로
      // 고정한다 — 건축물대장 조회 쪽에서 0/1 모두 재시도한다.
      pnu = `${dongCode}1${bun}${ji}`;
    }
  }

  return NextResponse.json({
    ...coordData,
    response: {
      ...coordData.response,
      refined: {
        ...coordData.response?.refined,
        structure: { level4LC: pnu ?? "" },
      },
    },
  });
}
