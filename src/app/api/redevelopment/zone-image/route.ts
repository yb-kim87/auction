import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/vat-server";

/** 지자체 구역도 이미지를 같은 오리진으로 중계한다.
 *
 * 경계 자동 추출은 브라우저 canvas에서 픽셀을 읽어야 하는데, 외부 도메인
 * 이미지를 그대로 그리면 canvas가 오염(tainted)돼 getImageData가 막힌다.
 * 이미지를 우리 서버가 받아 되돌려주면 same-origin이 되어 읽을 수 있다.
 *
 * SSRF 방지를 위해 대상 호스트를 정부/지자체 도메인(*.go.kr)으로만 제한한다
 * — 내부망 주소나 임의 URL을 넣어 우리 서버를 경유시키지 못하게 한다. */
export const preferredRegion = "icn1";
export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

function isAllowedTarget(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "go.kr" && !host.endsWith(".go.kr")) return null;
  return url;
}

export async function GET(request: NextRequest) {
  const authError = await requireAdminFromRequest(request);
  if (authError) return authError;

  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ message: "url 파라미터가 필요합니다." }, { status: 400 });
  }
  const target = isAllowedTarget(raw);
  if (!target) {
    return NextResponse.json(
      { message: "지자체(go.kr) 도메인 이미지만 불러올 수 있습니다." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AuctionCoachBot/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json({ message: "이미지를 불러오지 못했습니다." }, { status: 502 });
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ message: "이미지가 아닙니다." }, { status: 415 });
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ message: "이미지가 너무 큽니다." }, { status: 413 });
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[redevelopment] 구역도 이미지 중계 실패:", err);
    return NextResponse.json({ message: "이미지 중계에 실패했습니다." }, { status: 502 });
  }
}
