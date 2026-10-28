import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { requireAdminFromRequest } from "@/lib/vat-server";

/** 금천구청 홈페이지(geumcheon.go.kr) "정비사업 현황"(rebuildWebList.do) 스크레이핑.
 * 은평구청 수집기와 같은 방식 — 목록(사업구분/사업명/위치/진행상태)과 상세(구역면적,
 * 추진 이력)를 가져온다. 구역도 경계/이미지는 이 페이지 HTML에 들어 있지 않다
 * (지도는 화면에서 따로 그려진다). */
export const preferredRegion = "icn1";
export const runtime = "nodejs";

const BASE = "https://www.geumcheon.go.kr/portal";
const KEY = "4266";
const FETCH_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; AuctionCoachBot/1.0)" };
const MAX_PAGES = 15;

type GeumcheonListItem = { id: string; title: string; category: string; location: string; status: string };

type GeumcheonDetail = {
  id: string;
  title: string;
  category: string;
  location: string | null;
  areaSqMeters: number | null;
  status: string;
  history: string;
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`금천구청 페이지 요청 실패(${res.status})`);
  return res.text();
}

function parseListPage(html: string): GeumcheonListItem[] {
  const $ = cheerio.load(html);
  const items: GeumcheonListItem[] = [];
  $("table tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    const href = $(tr).find("a[href*='rebuildId=']").attr("href") ?? "";
    const id = href.match(/rebuildId=(\d+)/)?.[1];
    if (!id || tds.length < 5) return;
    const clean = (i: number) => $(tds[i]).text().replace(/\s+/g, " ").trim();
    items.push({ id, category: clean(1), title: clean(2), location: clean(3), status: clean(4) });
  });
  return items;
}

async function fetchList(): Promise<GeumcheonListItem[]> {
  const all = new Map<string, GeumcheonListItem>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchHtml(`${BASE}/rebuildWebList.do?key=${KEY}&pageIndex=${page}`);
    const items = parseListPage(html);
    const before = all.size;
    for (const it of items) all.set(it.id, it);
    if (items.length === 0 || all.size === before) break;
  }
  return Array.from(all.values());
}

function parseAreaSqMeters(text: string): number | null {
  const match = text.replace(/,/g, "").match(/([\d.]+)\s*㎡/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDetail(html: string, id: string): GeumcheonDetail {
  const $ = cheerio.load(html);
  const fields: Record<string, string> = {};
  $("table tr").each((_, tr) => {
    const cells = $(tr).children("th,td").toArray();
    for (let i = 0; i < cells.length - 1; i++) {
      if (cells[i].tagName === "th" && cells[i + 1].tagName === "td") {
        const label = $(cells[i]).text().replace(/\s+/g, "");
        const value = $(cells[i + 1]).text().replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
        if (label && !(label in fields)) fields[label] = value;
      }
    }
  });
  return {
    id,
    title: fields["사업명"] ?? "",
    category: fields["사업구분"] ?? "",
    location: fields["사업위치"] || null,
    areaSqMeters: fields["구역면적"] ? parseAreaSqMeters(fields["구역면적"]) : null,
    status: fields["진행상태"] ?? "",
    history: (fields["추진현황"] ?? "").replace(/\n\s*/g, " / ").slice(0, 500),
  };
}

export async function GET(request: NextRequest) {
  const authError = await requireAdminFromRequest(request);
  if (authError) return authError;

  const mode = request.nextUrl.searchParams.get("mode");
  try {
    if (mode === "list") {
      return NextResponse.json({ items: await fetchList() });
    }
    if (mode === "detail") {
      const id = request.nextUrl.searchParams.get("id");
      if (!id || !/^\d+$/.test(id)) return NextResponse.json({ message: "id가 필요합니다." }, { status: 400 });
      const html = await fetchHtml(`${BASE}/rebuildWebView.do?key=${KEY}&rebuildId=${id}`);
      return NextResponse.json(parseDetail(html, id));
    }
    return NextResponse.json({ message: "mode는 list 또는 detail이어야 합니다." }, { status: 400 });
  } catch (err) {
    console.error("[redevelopment] 금천구청 스크레이핑 실패:", err);
    return NextResponse.json({ message: "금천구청 페이지 조회에 실패했습니다." }, { status: 502 });
  }
}
