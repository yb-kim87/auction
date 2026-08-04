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

/** 즐겨찾기의 adrPlural(콤마 구분 10자리 법정동 코드, 예:
 * "1100000000,4117100000")을 시/도 라벨만 뽑아 반환한다(구/동은 버림). */
export function labelsFromAdrPlural(adrPlural: string): string[] {
  return adrPlural
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => getTankSiLabel(code.slice(0, 2)));
}

/** adrPlural 코드 하나(10자리)를 시/도+구/군+동까지 최대한 풀어서 사람이
 * 읽는 전체 주소 라벨로 바꾼다(예: "4117100000" → "경기 안양시 만안구").
 * 자릿수 구성: 시도(2) + 구/군(3) + 동(3) + 나머지(2, 미사용). 코드 형식은
 * 탱크옥션 실측 기준(2026-07-17) — siCd/guCd/dnCd 코드 체계와 동일한 자리
 * 배치를 쓴다(예: 안양시 만안구 = "171" = 41171의 뒤 3자리). 구/동이
 * "000"(선택 안 함)이거나 TANK_REGIONS에 없는 코드면 그 단계에서 멈춘다
 * (사용자 요청, 2026-08-05: "인천 경기 경기 경기 경기 이렇게만 보이고
 * 정확히 어떤 주소가 추가되었는지 알수가 없는데"). */
export function fullLabelFromAdrCode(code: string): string {
  const trimmed = code.trim();
  const siCd = trimmed.slice(0, 2);
  const guCd = trimmed.slice(2, 5);
  const dnCd = trimmed.slice(5, 8);

  const si = TANK_REGIONS[siCd];
  if (!si) return trimmed || "(알 수 없음)";
  if (guCd === "000") return si.label;

  const gu = si.gu[guCd];
  if (!gu) return si.label;
  const guLabel = `${si.label} ${gu.label}`;
  if (dnCd === "000") return guLabel;

  const dong = gu.dong.find((d) => d.code === dnCd);
  if (!dong) return guLabel;
  return `${guLabel} ${dong.label}`;
}

/** 즐겨찾기의 adrPlural(콤마 구분 코드 목록)을 전체 주소 라벨 목록으로
 * 바꾼다 — 시/도만 나오던 labelsFromAdrPlural과 달리 구/동까지 표시한다. */
export function fullLabelsFromAdrPlural(adrPlural: string): string[] {
  return adrPlural
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)
    .map(fullLabelFromAdrCode);
}
