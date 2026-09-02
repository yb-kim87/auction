import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:3001";
export const runtime = "nodejs";

function firstForwardedIp(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

function forwardSetCookieHeaders(source: Response, target: Headers) {
  const getSetCookie = (
    source.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie?.bind(source.headers);

  const cookies = getSetCookie?.() ?? [];
  if (cookies.length > 0) {
    for (const cookie of cookies) {
      target.append("set-cookie", cookie);
    }
    return;
  }

  const single = source.headers.get("set-cookie");
  if (single) {
    target.append("set-cookie", single);
  }
}

async function proxyRequest(request: NextRequest, path: string[]) {
  const targetPath = path.join("/");
  const url = `${API_ORIGIN}/${targetPath}${request.nextUrl.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const cookie = request.headers.get("cookie");
  if (cookie) {
    headers.set("cookie", cookie);
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  if (userAgent) headers.set("user-agent", userAgent);

  const proxySecret = process.env.SECURITY_PROXY_SECRET?.trim() ?? "";
  const clientIp = firstForwardedIp(
    request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for"),
  );
  if (proxySecret && clientIp) {
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", proxySecret)
      .update(`${timestamp}.${clientIp}.${userAgent}`)
      .digest("hex");
    headers.set("x-auction-client-ip", clientIp);
    headers.set("x-auction-client-ua", userAgent);
    headers.set("x-auction-proxy-ts", timestamp);
    headers.set("x-auction-proxy-signature", signature);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(url, init);
    const responseHeaders = new Headers();
    const responseType = response.headers.get("content-type");
    const disposition = response.headers.get("content-disposition");

    if (responseType) responseHeaders.set("content-type", responseType);
    if (disposition) responseHeaders.set("content-disposition", disposition);
    forwardSetCookieHeaders(response, responseHeaders);

    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        message:
          "API 서버에 연결할 수 없습니다. auction-api 폴더에서 npm run start:dev 를 실행해 주세요.",
      },
      { status: 503 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(request, params.path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(request, params.path);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(request, params.path);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(request, params.path);
}
