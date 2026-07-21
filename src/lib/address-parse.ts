/**
 * 경매 물건 주소 문자열에서 VWorld 주소 검색용 도로명/지번 주소와
 * 동·호수를 추출한다. 실제 DB 주소 샘플 다수를 확인해 두 가지 형식을
 * 반영했다(2026-07-21):
 *
 * 1) "...아파트 104동 22층2202호 (산곡동,한신휴아파트)" — 도로명주소가
 *    없으면 지번주소 앞부분(동/층/호 이전)을 그대로 검색 주소로 쓴다.
 * 2) "...4405호 (도로명주소:경기 고양시 일산서구 일현로 97-11)" —
 *    괄호 안 "도로명주소:" 뒤의 값이 있으면 그걸 우선 사용한다(VWorld는
 *    도로명주소 검색(type=ROAD)이 더 정확하게 매칭됨).
 */
export type ParsedAuctionAddress = {
  searchAddress: string;
  dong: string | null;
  ho: string | null;
};

export function parseAuctionAddress(raw: string): ParsedAuctionAddress {
  const trimmed = raw.trim();

  const roadNameMatch = trimmed.match(/도로명주소\s*[:：]\s*([^)]+)\)/);
  const dongHoMatch = trimmed.match(/(\d+)\s*동\s*(?:\d+\s*층)?\s*(\d+)\s*호/);
  const dong = dongHoMatch ? dongHoMatch[1] : null;
  const ho = dongHoMatch ? dongHoMatch[2] : null;

  if (roadNameMatch) {
    return { searchAddress: roadNameMatch[1].trim(), dong, ho };
  }

  // 도로명주소가 없으면 "NNN동" 앞부분까지를 지번주소로 간주한다.
  const beforeDongMatch = trimmed.match(/^(.*?)\s+\d+동(?:\s|$)/);
  const searchAddress = (beforeDongMatch ? beforeDongMatch[1] : trimmed)
    .replace(/,\s*$/, "")
    .trim();
  return { searchAddress, dong, ho };
}
