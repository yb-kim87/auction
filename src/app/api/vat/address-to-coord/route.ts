import { NextRequest, NextResponse } from "next/server";
import { fetchExternalJson, requireAuthFromRequest } from "@/lib/vat-server";

/** Vercel 서울 리전(icn1)에서 실행 — Railway(해외 리전)가 VWorld API에
 * 연결하지 못하는 문제를 우회한다(실측, 2026-07-21). */
export const preferredRegion = "icn1";
export const runtime = "nodejs";

function vworldKey(): string | null {
  return process.env.VWORLD_API_KEY?.trim() || null;
}

export async function GET(request: NextRequest) {
  const authError = await requireAuthFromRequest(request);
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

  // 도로명주소 → 좌표(ROAD)와 지번주소 → 좌표(PARCEL) 둘 다 시도한다.
  // 카카오 우편번호가 도로명주소를 주는 케이스가 많아 기존엔 ROAD를
  // 항상 먼저 시도했는데, "번지 숫자"로 끝나는 지번주소를 ROAD로 조회
  // 하면 VWorld가 그 숫자를 "도로명+건물번호"로 잘못 해석해 완전히
  // 엉뚱한 위치의 status:OK를 반환하는 사고가 있었다(실측: "경기도
  // 안양시 만안구 안양동 16-2"를 ROAD로 조회 → "냉천로172번길 16-2"로
  // 오매칭되어 실제 안양동 16-2(디아망)가 아닌 안양동 627-236 좌표가
  // 나옴 — 결과적으로 PNU가 틀려 존재하는 호실(1102호)의 전유부를
  // "찾지 못함" 오류로 처리, 2026-07-23). 주소가 지번 형태(끝이
  // "숫자" 또는 "숫자-숫자")로 끝나면 PARCEL을 먼저 시도해 이런 오매칭을
  // 피하고, 그 외(도로명 형태)는 기존대로 ROAD를 먼저 시도한다.
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

  function isOk(data: unknown): boolean {
    const d = data as { response?: { status?: string; result?: { point?: { x?: string; y?: string } } } };
    return d.response?.status === "OK" && !!d.response.result?.point?.x && !!d.response.result?.point?.y;
  }

  // 도로명("...로"/"...길" + 건물번호)과 지번("...동"/"...읍"/"...면" +
  // 번지)은 둘 다 "숫자" 또는 "숫자-숫자"로 끝나 그 패턴만으로는 구분이
  // 안 된다(실측: "경인로653번길 69-1"도, "안양동 16-2"도 둘 다
  // \d+(-\d+)?$ 에 매칭됨) — 숫자 바로 앞 단어가 "로"/"길"로 끝나는지로
  // 구분한다.
  const looksLikeRoad = /(로|길)\d*번?길?\s+\d+(-\d+)?$/.test(address);
  const looksLikeJibun = !looksLikeRoad && /\d+(-\d+)?$/.test(address);
  const primaryType = looksLikeJibun ? "PARCEL" : "ROAD";
  const secondaryType = looksLikeJibun ? "ROAD" : "PARCEL";

  let coordResult = await tryGetCoord(address, primaryType);
  if (!coordResult.ok) {
    return NextResponse.json({ message: coordResult.message }, { status: coordResult.status });
  }
  let coordData = coordResult.data as {
    response?: {
      status?: string;
      result?: { point?: { x?: string; y?: string } };
      refined?: { text?: string };
    };
  };
  let point = coordData.response?.result?.point;

  if (!isOk(coordData)) {
    const secondaryResult = await tryGetCoord(address, secondaryType);
    if (secondaryResult.ok && isOk(secondaryResult.data)) {
      coordResult = secondaryResult;
      coordData = secondaryResult.data as typeof coordData;
      point = coordData.response?.result?.point;
    }
  }

  // 행정구역 개편(예: 인천 서구 → 검단구 분리 신설)으로 DB에 저장된
  // 옛 구주소가 VWorld getCoord에서 NOT_FOUND가 나는 경우가 있다(실측:
  // "인천 서구 서로4로 89"는 NOT_FOUND, VWorld 최신 행정구역명
  // "인천광역시 검단구 서로4로 89"로는 정상 매칭, 2026-07-21). VWorld
  // 자체 검색(search) API로 유사 주소를 찾아 재시도한다.
  if (coordData.response?.status !== "OK" || !point?.x || !point?.y) {
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
        response?: {
          status?: string;
          result?: { items?: { address?: { road?: string } }[] };
        };
      };
      const roadAddress = searchData.response?.result?.items?.[0]?.address?.road;
      if (searchData.response?.status === "OK" && roadAddress) {
        coordResult = await tryGetCoord(roadAddress, "ROAD");
        if (coordResult.ok) {
          coordData = coordResult.data as typeof coordData;
          point = coordData.response?.result?.point;
        }
      }
    }
  }

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
