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
  matchStructureIndex,
} from "@/lib/vat-calc";

const APARTMENT_USAGE_INDEX = 110;
/** 오피스텔은 atomtax-app 실측 대조 결과 주거용/상업용 카테고리 어느 쪽으로
 * 분류하든 용도지수가 동일하게 140(시행령상 업무시설이나 주거용 임대 편의를
 * 위해 주거 카테고리에도 동일 지수로 중복 등재됨, 2026-07-23 실측). */
const OFFICETEL_USAGE_INDEX = 140;

function isOfficetelUsage(usage: string): boolean {
  return usage.trim().startsWith("오피스텔");
}

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
    usage?: unknown;
    structureName?: unknown;
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

  const usage = String(body.usage ?? "");
  const usageIndex = isOfficetelUsage(usage) ? OFFICETEL_USAGE_INDEX : APARTMENT_USAGE_INDEX;

  // 건축물대장 API의 구조명(strctCdNm)을 국세청 구조지수표에 매칭한다.
  // 매칭 실패(정보 없음/미등재 구조)면 아파트 대다수가 해당하는 RC(100,
  // 내용연수 50년)로 폴백한다(2026-07-23).
  const matchedStructure = matchStructureIndex(
    typeof body.structureName === "string" ? body.structureName : null,
  );
  const structureIndex = matchedStructure?.index ?? STRUCTURE_INDEX_RC;
  const usefulLife = matchedStructure
    ? DEP_GROUP_USEFUL_LIFE[matchedStructure.depGroup]
    : DEP_GROUP_USEFUL_LIFE[RC_DEP_GROUP];

  const baseYear = new Date().getFullYear();
  const residualRate = calcResidualRate(builtYear, usefulLife, baseYear);
  const locationIndex = getLocationIndex(landPricePerM2);
  const perM2 = calcBuildingStandardPricePerM2({
    structureIndex,
    usageIndex,
    locationIndex,
    residualRate,
  });
  const buildingStandardPrice = Math.round(perM2 * buildingArea);

  const result = calcVat({ salePrice, landArea, landPricePerM2, buildingStandardPrice });

  return NextResponse.json({ ...result, buildingStandardPrice });
}
