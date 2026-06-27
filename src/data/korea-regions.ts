import { getLawdBySido, getSidoList } from "cronozen-region-codes/lawd";

/** cronozen LAWD short name → official full name */
const SIDO_SHORT_TO_FULL: Record<string, string> = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
};

/** Legacy names used in existing data */
const SIDO_ALIASES: Record<string, string> = {
  강원도: "강원특별자치도",
  전라북도: "전북특별자치도",
};

const CITY_ORDER = [
  "서울특별시", "경기도", "인천광역시", "대구광역시", "대전광역시", "부산광역시",
  "광주광역시", "울산광역시", "세종특별자치시",
  "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

interface DistrictEntry {
  label: string;
  code: string;
}

function buildDistrictMap(): Map<string, DistrictEntry[]> {
  const map = new Map<string, DistrictEntry[]>();
  for (const short of getSidoList()) {
    const full = SIDO_SHORT_TO_FULL[short];
    if (!full) continue;
    map.set(
      full,
      getLawdBySido(short).map((lawd) => ({ label: lawd.sigungu, code: lawd.code })),
    );
  }
  return map;
}

const DISTRICT_MAP = buildDistrictMap();

export const CITIES = CITY_ORDER.filter((city) => DISTRICT_MAP.has(city));

export function normalizeCity(city: string): string {
  return SIDO_ALIASES[city] ?? city;
}

export function getDistricts(city: string): string[] {
  return (DISTRICT_MAP.get(normalizeCity(city)) ?? []).map((d) => d.label);
}

export function getSigunguCode(city: string, district: string): string | undefined {
  return DISTRICT_MAP.get(normalizeCity(city))?.find((d) => d.label === district)?.code;
}

/** 법정동 데이터(약 20MB)는 군/구 선택 시에만 동적 로드 */
export async function getWards(city: string, district: string): Promise<string[]> {
  const code = getSigunguCode(city, district);
  if (!code) return [];

  const { getLegalDongsBySigungu } = await import("cronozen-region-codes/legal-dong");
  const seen = new Set<string>();
  const wards: string[] = [];

  for (const dong of getLegalDongsBySigungu(code)) {
    if (!dong.isActive || seen.has(dong.umd)) continue;
    seen.add(dong.umd);
    wards.push(dong.umd);
  }

  return wards.sort((a, b) => a.localeCompare(b, "ko"));
}

export function matchDistrict(itemDistrict: string, selectedDistrict: string): boolean {
  if (itemDistrict === selectedDistrict) return true;
  if (selectedDistrict.startsWith(`${itemDistrict} `)) return true;
  if (itemDistrict.startsWith(`${selectedDistrict} `)) return true;
  return false;
}
