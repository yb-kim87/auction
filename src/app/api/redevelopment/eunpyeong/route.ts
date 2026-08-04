import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { requireAdminFromRequest } from "@/lib/vat-server";

/** 은평구청 홈페이지(ep.go.kr) "재개발/재건축 구역현황" 게시물을 스크레이핑
 * 한다 — 설계 문서의 NOTICE_PDF(구청 홈페이지) 소스에 해당(사용자 요청,
 * 2026-08-04: "은평구 구청 한번 해보자"). Vercel(icn1)에서 실행 — 직접
 * curl로는 정상 응답했지만(2026-08-04 실측), 다른 공공 API와 동일하게
 * 서버 리전 이슈를 피하려 프론트 라우트로 처리한다. */
export const preferredRegion = "icn1";
export const runtime = "nodejs";

const BASE = "https://www.ep.go.kr/www/contents.do";
const FETCH_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; AuctionCoachBot/1.0)" };

type EunpyeongListItem = { key: string; title: string; category: "재개발" | "재건축" };

type EunpyeongDetail = {
  key: string;
  title: string;
  location: string | null;
  areaSqMeters: number | null;
  fields: Record<string, string>;
  stages: Array<{ label: string; value: string }>;
  imageUrl: string | null;
};

async function fetchHtml(key: string): Promise<string> {
  const res = await fetch(`${BASE}?key=${encodeURIComponent(key)}`, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`은평구청 페이지 요청 실패(key=${key})`);
  return res.text();
}

/** 사이드바 메뉴에서 "재개발 구역현황"/"재건축 구역현황" 아래 depth3
 * 항목(개별 사업 페이지)을 전부 추출한다. 메뉴는 모든 페이지에 동일하게
 * 실려 있어 아무 페이지나 한 번 받으면 된다. */
function parseList(html: string): EunpyeongListItem[] {
  const $ = cheerio.load(html);
  const items: EunpyeongListItem[] = [];

  $(".depth2_item").each((_, el) => {
    const label = $(el).find("> a.depth2_text span").first().text().trim();
    const category = label.includes("재개발 구역현황") ? "재개발" : label.includes("재건축 구역현황") ? "재건축" : null;
    if (!category) return;
    $(el)
      .find(".depth3_ite a.depth3_text")
      .each((_, a) => {
        const href = $(a).attr("href") ?? "";
        const match = href.match(/key=(\d+)/);
        const title = $(a).find("span").first().text().trim();
        // depth3 목록 첫 항목이 섹션 헤더 자기 자신을 다시 가리키는
        // 경우가 있어(예: title이 "재개발 구역현황" 그대로) 제외한다.
        if (match && title && title !== "재개발 구역현황" && title !== "재건축 구역현황") {
          items.push({ key: match[1], title, category });
        }
      });
  });

  return items;
}

function parseAreaSqMeters(text: string): number | null {
  const match = text.replace(/,/g, "").match(/([\d.]+)\s*㎡/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanLocation(text: string): string | null {
  const withoutParens = text.replace(/\([^)]*\)/g, "");
  const cleaned = withoutParens.replace(/일대|일원/g, "").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

/** 사업 상세 페이지의 "구역위치, 사업규모, 추진현황" 표를 파싱한다.
 * 표 구조가 페이지마다 조금씩 다를 수 있어(재개발/재건축, 필드 유무),
 * 위치 지정 대신 th/td 텍스트를 일반적으로 순회하며 파악한다(실측 구조:
 * 2026-08-04, key=1152 "불광1주택재건축정비사업" 기준). */
function parseDetail(html: string, key: string): EunpyeongDetail {
  const $ = cheerio.load(html);
  const table = $("table.table")
    .filter((_, el) => $(el).find("caption").text().includes("구역위치"))
    .first();

  const titleFull = table.find("caption").text().split(" - ")[0].trim();

  let location: string | null = null;
  const fields: Record<string, string> = {};
  const stages: Array<{ label: string; value: string }> = [];
  let pendingLabels: string[] = [];

  table.find("tbody > tr").each((_, tr) => {
    const $tr = $(tr);
    const ths = $tr.find("th");
    const tds = $tr.find("td");

    const firstThText = ths.first().text().trim();
    if (firstThText.includes("구역위치")) {
      location = tds.first().text().trim();
      return;
    }
    if (firstThText.includes("추진현황")) {
      // 이 행 자체가 라벨 행(추진현황 th + 5개 th scope=col)인 경우
      pendingLabels = ths
        .slice(1)
        .map((_, th) => $(th).text().replace(/\s+/g, ""))
        .get()
        .filter((t) => t.length > 0);
      return;
    }
    // 라벨만 있는 행(모두 th)
    if (tds.length === 0 && ths.length > 0) {
      pendingLabels = ths
        .map((_, th) => $(th).text().replace(/\s+/g, ""))
        .get()
        .filter((t) => t.length > 0);
      return;
    }
    // 값만 있는 행(모두 td) — 직전 라벨 행과 짝지어 stages에 반영
    if (ths.length === 0 && tds.length > 0 && pendingLabels.length > 0) {
      tds.each((i, td) => {
        const label = pendingLabels[i];
        const value = $(td).text().replace(/\s+/g, " ").trim();
        if (label) stages.push({ label, value: value || "-" });
      });
      pendingLabels = [];
      return;
    }
    // 그 외 일반 key-value 행(th 1개 + td 1개, 면적/총필지수/세대수 등)
    if (ths.length >= 1 && tds.length >= 1) {
      const label = ths.last().text().trim();
      const value = tds.first().text().replace(/\s+/g, " ").trim();
      if (label && value) fields[label] = value;
    }
  });

  const imageUrl = table
    .parent()
    .parent()
    .find("img")
    .filter((_, img) => ($(img).attr("src") ?? "").includes("/images/contents/"))
    .first()
    .attr("src");

  const areaField = Object.entries(fields).find(([k]) => k.includes("면적"));

  return {
    key,
    title: titleFull,
    location: location ? cleanLocation(location) : null,
    areaSqMeters: areaField ? parseAreaSqMeters(areaField[1]) : null,
    fields,
    stages,
    imageUrl: imageUrl ? new URL(imageUrl, "https://www.ep.go.kr").toString() : null,
  };
}

export async function GET(request: NextRequest) {
  const authError = await requireAdminFromRequest(request);
  if (authError) return authError;

  const mode = request.nextUrl.searchParams.get("mode");
  try {
    if (mode === "list") {
      const html = await fetchHtml("1150");
      return NextResponse.json({ items: parseList(html) });
    }
    if (mode === "detail") {
      const key = request.nextUrl.searchParams.get("key");
      if (!key) return NextResponse.json({ message: "key가 필요합니다." }, { status: 400 });
      const html = await fetchHtml(key);
      return NextResponse.json(parseDetail(html, key));
    }
    return NextResponse.json({ message: "mode는 list 또는 detail이어야 합니다." }, { status: 400 });
  } catch (err) {
    console.error("[redevelopment] 은평구청 스크레이핑 실패:", err);
    return NextResponse.json({ message: "은평구청 페이지 조회에 실패했습니다." }, { status: 502 });
  }
}
