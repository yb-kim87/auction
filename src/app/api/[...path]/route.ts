import { NextRequest, NextResponse } from "next/server";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:3001";

async function proxyRequest(request: NextRequest, path: string[]) {
  const targetPath = path.join("/");
  const url = `${API_ORIGIN}/${targetPath}${request.nextUrl.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const authUser = request.headers.get("x-auction-user");
  const authRole = request.headers.get("x-auction-role");
  if (authUser) headers.set("x-auction-user", authUser);
  if (authRole) headers.set("x-auction-role", authRole);

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
