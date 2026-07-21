import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/vat-server";

export const preferredRegion = "icn1";
export const runtime = "nodejs";

type PnuParams = { sigunguCd: string; bjdongCd: string; bun: string; ji: string };

async function fetchExternal(label: string, url: string): Promise<Response | null> {
  try {
    return await fetch(url);
  } catch (err) {
    console.error(`[vat] ${label} 호출 실패:`, err);
    return null;
  }
}

async function fetchExposedOnce(
  key: string,
  params: PnuParams,
  platGbCd: "0" | "1",
  dongNm: string,
  hoNm: string,
): Promise<{ ok: boolean; rows: Record<string, unknown>[] }> {
  const url = new URL(
    "https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo",
  );
  url.searchParams.set("sigunguCd", params.sigunguCd);
  url.searchParams.set("bjdongCd", params.bjdongCd);
  url.searchParams.set("platGbCd", platGbCd);
  url.searchParams.set("bun", params.bun);
  url.searchParams.set("ji", params.ji);
  url.searchParams.set("dongNm", dongNm);
  url.searchParams.set("hoNm", hoNm);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("numOfRows", "50");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("_type", "json");

  const res = await fetchExternal("건축물대장(전유부) 조회", url.toString());
  if (!res || !res.ok) return { ok: false, rows: [] };
  try {
    const data = (await res.json()) as {
      response?: {
        header?: { resultCode?: string };
        body?: { items?: { item?: Record<string, unknown>[] } | "" };
      };
    };
    if (data.response?.header?.resultCode !== "00") return { ok: false, rows: [] };
    const items = data.response?.body?.items;
    const rows =
      items && typeof items === "object" && Array.isArray(items.item) ? items.item : [];
    return { ok: true, rows };
  } catch {
    return { ok: false, rows: [] };
  }
}

/** 공공데이터포털 건축물대장 API는 정상 요청에도 간헐적으로 빈 결과를
 * 준다(실측: 같은 요청을 5회 반복 중 1~2회 빈 응답, 2026-07-21) —
 * "진짜 매칭 없음"과 "일시적 실패"를 구분하기 위해 재시도한다. */
async function fetchExposedWithRetry(
  key: string,
  params: PnuParams,
  platGbCd: "0" | "1",
  dongNm: string,
  hoNm: string,
): Promise<Record<string, unknown>[] | null> {
  let sawEmptySuccess = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await fetchExposedOnce(key, params, platGbCd, dongNm, hoNm);
    if (result.ok && result.rows.length > 0) return result.rows;
    if (result.ok) sawEmptySuccess = true;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
  }
  return sawEmptySuccess ? [] : null;
}

async function fetchTitleInfoList(
  key: string,
  params: PnuParams,
  platGbCd: "0" | "1",
): Promise<Record<string, unknown>[]> {
  const url = new URL("https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo");
  url.searchParams.set("sigunguCd", params.sigunguCd);
  url.searchParams.set("bjdongCd", params.bjdongCd);
  url.searchParams.set("platGbCd", platGbCd);
  url.searchParams.set("bun", params.bun);
  url.searchParams.set("ji", params.ji);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("numOfRows", "50");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("_type", "json");

  const res = await fetchExternal("건축물대장 목록 조회", url.toString());
  if (!res || !res.ok) return [];
  try {
    const data = (await res.json()) as {
      response?: { body?: { items?: { item?: Record<string, unknown>[] } | "" } };
    };
    const items = data.response?.body?.items;
    return items && typeof items === "object" && Array.isArray(items.item) ? items.item : [];
  } catch {
    return [];
  }
}

async function fetchTitleInfo(
  key: string,
  params: PnuParams,
  platGbCd: "0" | "1",
): Promise<Record<string, unknown> | null> {
  const rows = await fetchTitleInfoList(key, params, platGbCd);
  return rows[0] ?? null;
}

async function findUseAprDayByDong(
  key: string,
  params: PnuParams,
  dong: string,
): Promise<string | undefined> {
  const dongNm = dong.endsWith("동") ? dong : `${dong}동`;
  const rows = await fetchTitleInfoList(key, params, "0");
  const match = rows.find((r) => r.dongNm === dongNm);
  return typeof match?.useAprDay === "string" && match.useAprDay.trim()
    ? match.useAprDay
    : undefined;
}

export async function GET(request: NextRequest) {
  const authError = await requireAdminFromRequest(request);
  if (authError) return authError;

  const pnu = request.nextUrl.searchParams.get("pnu")?.trim();
  const dong = request.nextUrl.searchParams.get("dong")?.trim();
  const ho = request.nextUrl.searchParams.get("ho")?.trim();
  if (!pnu || pnu.length !== 19) {
    return NextResponse.json({ message: "올바른 PNU(19자리)가 필요합니다." }, { status: 400 });
  }
  const key = process.env.BUILDING_REGISTER_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { message: "건축물대장 API 키가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const params: PnuParams = {
    sigunguCd: pnu.slice(0, 5),
    bjdongCd: pnu.slice(5, 10),
    bun: pnu.slice(11, 15),
    ji: pnu.slice(15, 19),
  };

  if (dong && ho) {
    const dongNm = dong.endsWith("동") ? dong : `${dong}동`;
    const hoNm = ho.endsWith("호") ? ho : `${ho}호`;

    const [rows0, rows1] = await Promise.all([
      fetchExposedWithRetry(key, params, "0", dongNm, hoNm),
      fetchExposedWithRetry(key, params, "1", dongNm, hoNm),
    ]);
    if (rows0 === null && rows1 === null) {
      return NextResponse.json(
        { message: "건축물대장(전유부) 조회에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 },
      );
    }
    const rows = [...(rows0 ?? []), ...(rows1 ?? [])];
    if (rows.length > 0) {
      const sum = (gb: string) =>
        rows
          .filter((r) => String(r.exposPubuseGbCd) === gb)
          .reduce((acc, r) => acc + (Number(r.area) || 0), 0);
      // 반올림 없이 원래 정밀도를 그대로 유지 — 반올림하면 최종 부가세
      // 계산이 원본 사이트 결과와 어긋난다(실측, 2026-07-21).
      const totArea = sum("1") + sum("2");
      const first = rows[0];
      const titleUseAprDay = await findUseAprDayByDong(key, params, dong);
      return NextResponse.json({
        totArea,
        useAprDay: titleUseAprDay,
        strctCdNm: typeof first.strctCdNm === "string" ? first.strctCdNm : undefined,
        mainPurpsCdNm: typeof first.mainPurpsCdNm === "string" ? first.mainPurpsCdNm : undefined,
      });
    }
    // 동/호로 못 찾으면 표제부로 폴백(오타 또는 API 표기 형식 차이).
  }

  const item =
    (await fetchTitleInfo(key, params, "0")) ?? (await fetchTitleInfo(key, params, "1"));
  if (!item) {
    return NextResponse.json(
      { message: "이 위치의 건축물대장 정보를 찾지 못했습니다." },
      { status: 503 },
    );
  }
  return NextResponse.json(item);
}
