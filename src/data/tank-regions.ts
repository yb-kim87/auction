import raw from "./tank-regions.json";

interface DongEntry {
  code: string;
  label: string;
}

interface GuEntry {
  label: string;
  dong: DongEntry[];
}

interface SiEntry {
  label: string;
  gu: Record<string, GuEntry>;
}

// 탱크옥션 /res/search/getAddressData.php(mode=addressData)를 실측(2026-07-17)한
// 시/도 -> 구/군 -> 동/읍/면 전체 데이터. presets_httpx.py 의 siCd/guCd/dnCd 값과
// 동일한 코드 체계를 쓴다. siCd=12는 탱크옥션에서 광주광역시+전남을 통합한 코드.
const TANK_REGIONS = raw as unknown as Record<string, SiEntry>;

export function getTankGuOptions(siCd: string): { value: string; label: string }[] {
  const si = TANK_REGIONS[siCd];
  if (!si) return [];
  return Object.entries(si.gu)
    .map(([guCd, gu]) => ({ value: guCd, label: gu.label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

export function getTankDongOptions(siCd: string, guCd: string): { value: string; label: string }[] {
  const gu = TANK_REGIONS[siCd]?.gu[guCd];
  if (!gu) return [];
  return gu.dong
    .map((d) => ({ value: d.code, label: d.label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

export function getTankSiLabel(siCd: string): string {
  return TANK_REGIONS[siCd]?.label ?? siCd;
}

/** 즐겨찾기의 adrPlural(콤마 구분 법정동 코드, 예: "1100000000,4100000000")을
 * 앞 2자리(siCd)만 뽑아 사람이 읽는 시/도 라벨 목록으로 바꾼다. */
export function labelsFromAdrPlural(adrPlural: string): string[] {
  return adrPlural
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => getTankSiLabel(code.slice(0, 2)));
}
