import { NextRequest, NextResponse } from "next/server";
import { requireAuthFromRequest } from "@/lib/vat-server";

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

/** 공공데이터포털은 numOfRows를 크게 넣어도 한 페이지에 최대 100건만
 * 준다(실측 확인, 2026-07-23) — 세대수가 많은 건물(예: 247건인 물건)은
 * 첫 페이지(기존 numOfRows=50)에 찾는 호실이 없으면 조회 실패로 오판해
 * 표제부(건물 전체 합산 면적)로 잘못 폴백했다(예: 86.09㎡짜리 403호가
 * 3434.88㎡ 건물 전체 면적으로 잘못 표시됨). totalCount를 보고 남은
 * 페이지를 전부 가져온다. */
async function fetchExposedAll(
  key: string,
  params: PnuParams,
  platGbCd: "0" | "1",
  dongNm: string,
  hoNm: string,
): Promise<{ ok: boolean; rows: Record<string, unknown>[] }> {
  const pageSize = 100;
  let pageNo = 1;
  let totalCount = Infinity;
  const rows: Record<string, unknown>[] = [];

  while ((pageNo - 1) * pageSize < totalCount) {
    const url = new URL(
      "https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo",
    );
    url.searchParams.set("sigunguCd", params.sigunguCd);
    url.searchParams.set("bjdongCd", params.bjdongCd);
    url.searchParams.set("platGbCd", platGbCd);
    url.searchParams.set("bun", params.bun);
    url.searchParams.set("ji", params.ji);
    if (dongNm) url.searchParams.set("dongNm", dongNm);
    if (hoNm) url.searchParams.set("hoNm", hoNm);
    url.searchParams.set("serviceKey", key);
    url.searchParams.set("numOfRows", String(pageSize));
    url.searchParams.set("pageNo", String(pageNo));
    url.searchParams.set("_type", "json");

    const res = await fetchExternal("건축물대장(전유부) 조회", url.toString());
    if (!res || !res.ok) return { ok: rows.length > 0, rows };
    try {
      const data = (await res.json()) as {
        response?: {
          header?: { resultCode?: string };
          body?: {
            totalCount?: number | string;
            items?: { item?: Record<string, unknown>[] } | "";
          };
        };
      };
      if (data.response?.header?.resultCode !== "00") return { ok: rows.length > 0, rows };
      totalCount = Number(data.response?.body?.totalCount) || 0;
      const items = data.response?.body?.items;
      const pageRows =
        items && typeof items === "object" && Array.isArray(items.item) ? items.item : [];
      rows.push(...pageRows);
      if (pageRows.length === 0) break;
    } catch {
      return { ok: rows.length > 0, rows };
    }
    pageNo += 1;
  }
  return { ok: true, rows };
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
    const result = await fetchExposedAll(key, params, platGbCd, dongNm, hoNm);
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

/** 동이 없는 건물(오피스텔·상가 등 단일 건물)은 표제부에도 동 구분이 없어
 * dongNm 매칭이 애초에 불가능하다 — 이 경우 표제부 목록의 첫 항목을 그대로
 * 쓴다(실측: 동 없는 건물은 표제부 자체가 1건뿐인 경우가 대부분,
 * 2026-07-23).
 *
 * mainPurpsCdNm은 반드시 표제부(getBrTitleInfo) 값을 써야 한다 — 전유부
 * (getBrExposPubuseAreaInfo)의 mainPurpsCdNm은 건축법상 세부 용도명
 * ("오피스텔")이라 국세청 용도지수표 매칭 기준과 다르다. 표제부 값
 * ("업무시설")을 써야 atomtax-app과 동일하게 "사무소·금융업소·출판사 등
 * (115)"로 매칭된다(실측, 2026-07-23 — 전유부 값을 쓰면 "오피스텔(140)"로
 * 잘못 매칭되던 버그). */
async function findTitleInfoByDong(
  key: string,
  params: PnuParams,
  dong: string,
): Promise<Record<string, unknown> | undefined> {
  const rows = await fetchTitleInfoList(key, params, "0");
  if (!dong) return rows[0];
  const dongNm = dong.endsWith("동") ? dong : `${dong}동`;
  return rows.find((r) => r.dongNm === dongNm) ?? rows[0];
}

export async function GET(request: NextRequest) {
  const authError = await requireAuthFromRequest(request);
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

  if (ho) {
    // dongNm/hoNm을 API 파라미터로 넘기지 않고 항상 전체 목록을 받아 직접
    // 필터링한다 — 물건마다 API 내부에 hoNm이 "201"(숫자만) 또는
    // "201호"(접미사 포함)로 제각각 저장돼 있어(실측, 2026-07-23) 서버
    // 파라미터 매칭에 의존하면 절반의 경우 0건이 나온다. dongNm도 빈
    // 문자열을 명시하면 0건이 되므로(실측) 아예 생략해야 한다.
    const dongNm = dong ? (dong.endsWith("동") ? dong : `${dong}동`) : "";
    const hoDigits = ho.replace(/호\s*$/, "").trim();

    const [rows0, rows1] = await Promise.all([
      fetchExposedWithRetry(key, params, "0", "", ""),
      fetchExposedWithRetry(key, params, "1", "", ""),
    ]);
    if (rows0 === null && rows1 === null) {
      return NextResponse.json(
        { message: "건축물대장(전유부) 조회에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 },
      );
    }
    const allRows = [...(rows0 ?? []), ...(rows1 ?? [])];
    const rows = allRows.filter((r) => {
      const rHo = String(r.hoNm ?? "").replace(/호\s*$/, "").trim();
      if (rHo !== hoDigits) return false;
      if (!dongNm) return true;
      const rDong = String(r.dongNm ?? "").trim();
      return !rDong || rDong === dongNm;
    });
    if (rows.length > 0) {
      const sum = (gb: string) =>
        rows
          .filter((r) => String(r.exposPubuseGbCd) === gb)
          .reduce((acc, r) => acc + (Number(r.area) || 0), 0);
      // 반올림 없이 원래 정밀도를 그대로 유지 — 반올림하면 최종 부가세
      // 계산이 원본 사이트 결과와 어긋난다(실측, 2026-07-21).
      const totArea = sum("1") + sum("2");
      const first = rows[0];
      const title = await findTitleInfoByDong(key, params, dong ?? "");
      const titleUseAprDay =
        typeof title?.useAprDay === "string" && title.useAprDay.trim()
          ? title.useAprDay
          : undefined;
      const titleMainPurpsCdNm =
        typeof title?.mainPurpsCdNm === "string" && title.mainPurpsCdNm.trim()
          ? title.mainPurpsCdNm
          : undefined;
      const grndFlrCnt =
        typeof title?.grndFlrCnt === "number"
          ? title.grndFlrCnt
          : Number(title?.grndFlrCnt) || undefined;
      return NextResponse.json({
        totArea,
        useAprDay: titleUseAprDay,
        strctCdNm: typeof first.strctCdNm === "string" ? first.strctCdNm : undefined,
        mainPurpsCdNm: titleMainPurpsCdNm,
        grndFlrCnt,
      });
    }
    // 호수가 지정됐는데 전유부에서 못 찾은 경우 표제부(건물 전체 합산
    // 면적)로 조용히 폴백하지 않는다 — 전유부 면적(호실 단위, 수십~
    // 백여 ㎡)과 표제부 면적(건물 전체, 수천 ㎡)은 자릿수가 완전히
    // 달라 폴백 시 "자동조회 완료"로 표시되면서 명백히 잘못된 큰 값이
    // 그대로 부가세 계산에 쓰이는 사고로 이어진다(실측: 86.09㎡짜리
    // 호실이 3434.88㎡ 건물 전체 면적으로 잘못 표시됨, 2026-07-23) —
    // 조용한 오답보다 명시적 실패가 안전하다.
    return NextResponse.json(
      {
        message: `이 호실(${ho}${dong ? `, ${dong}동` : ""})의 전유부 정보를 건축물대장에서 찾지 못했습니다. 동/호수를 다시 확인하거나 매도예상가·건물기준시가를 직접 입력해 주세요.`,
      },
      { status: 404 },
    );
  }

  const item =
    (await fetchTitleInfo(key, params, "0")) ?? (await fetchTitleInfo(key, params, "1"));
  if (!item) {
    // 최근 행정구역 개편(예: 2026-07-01 인천 서구→검단구/서해구 분리
    // 신설)으로 VWorld는 새 구역을 반영했지만 건축물대장(공공데이터
    // 포털) DB가 아직 못 따라가 조회가 0건이 되는 경우가 있다(실측,
    // 2026-07-21) — 코드로 우회할 수 없는 외부 데이터 정합성 문제라
    // 사용자에게 그대로 안내한다.
    return NextResponse.json(
      {
        message:
          "이 위치의 건축물대장 정보를 찾지 못했습니다. 최근 행정구역이 개편된 지역이면 공공데이터가 아직 반영되지 않았을 수 있습니다 — 매도예상가·건물기준시가를 직접 입력해 주세요.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json(item);
}
