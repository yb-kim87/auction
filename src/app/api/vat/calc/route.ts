import { NextRequest, NextResponse } from "next/server";
import { requireAuthFromRequest } from "@/lib/vat-server";
import {
  DEP_GROUP_USEFUL_LIFE,
  RC_DEP_GROUP,
  STRUCTURE_INDEX_RC,
  calcBuildingStandardPricePerM2,
  calcResidualRate,
  calcVat,
  getLocationIndex,
} from "@/lib/vat-calc";

const APARTMENT_USAGE_INDEX = 110;

/** 부가세 계산 공식(국세청 고시 지수표·잔가율 산식 등)을 클라이언트
 * 번들에서 완전히 제거하기 위해 서버 전용으로 옮긴 라우트. 클라이언트는
 * 조회된 원자재 값(토지면적·공시지가·건물면적·신축연도·매도가)만 보내고
 * 최종 금액만 돌려받는다(사용자 요청 — 계산식 노출 방지, 2026-07-21). */
export async function POST(request: NextRequest) {
  const authError = await requireAuthFromRequest(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as {
    salePrice?: unknown;
    landArea?: unknown;
    landPricePerM2?: unknown;
    buildingArea?: unknown;
    builtYear?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ message: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const salePrice = Number(body.salePrice);
  const landArea = Number(body.landArea);
  const landPricePerM2 = Number(body.landPricePerM2);
  const buildingArea = Number(body.buildingArea);
  const builtYear = Number(body.builtYear);
  if (
    !Number.isFinite(salePrice) ||
    !Number.isFinite(landArea) ||
    !Number.isFinite(landPricePerM2) ||
    !Number.isFinite(buildingArea) ||
    !Number.isFinite(builtYear) ||
    landArea <= 0 ||
    landPricePerM2 <= 0 ||
    buildingArea <= 0 ||
    builtYear <= 0
  ) {
    return NextResponse.json({ message: "계산에 필요한 값이 올바르지 않습니다." }, { status: 400 });
  }

  const baseYear = new Date().getFullYear();
  const residualRate = calcResidualRate(builtYear, DEP_GROUP_USEFUL_LIFE[RC_DEP_GROUP], baseYear);
  const locationIndex = getLocationIndex(landPricePerM2);
  const perM2 = calcBuildingStandardPricePerM2({
    structureIndex: STRUCTURE_INDEX_RC,
    usageIndex: APARTMENT_USAGE_INDEX,
    locationIndex,
    residualRate,
  });
  const buildingStandardPrice = Math.round(perM2 * buildingArea);

  const result = calcVat({ salePrice, landArea, landPricePerM2, buildingStandardPrice });

  return NextResponse.json({ ...result, buildingStandardPrice });
}
