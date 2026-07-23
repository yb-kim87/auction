/**
 * 경매 물건 주소 문자열에서 VWorld 주소 검색용 도로명/지번 주소와
 * 동·호수를 추출한다. 실제 DB 주소 샘플 다수를 확인해 세 가지 형식을
 * 반영했다(2026-07-21, 2026-07-23):
 *
 * 1) "...아파트 104동 22층2202호 (산곡동,한신휴아파트)" — 도로명주소가
 *    없으면 지번주소 앞부분(동/층/호 이전)을 그대로 검색 주소로 쓴다.
 * 2) "...4405호 (도로명주소:경기 고양시 일산서구 일현로 97-11)" —
 *    괄호 안 "도로명주소:" 뒤의 값이 있으면 그걸 우선 사용한다(VWorld는
 *    도로명주소 검색(type=ROAD)이 더 정확하게 매칭됨).
 * 3) "인천광역시 미추홀구 용현동 630-70 모던하우스 3층301호" — 동 표기
 *    없이 "N층M호"만 있는 단일 건물(오피스텔 등). 이 경우 "동" 문자가
 *    아예 없어 1)의 "NNN동" 패턴이 매칭되지 않고 건물명+층+호까지
 *    통째로 검색 주소에 남아 VWorld가 NOT_FOUND를 반환하는 버그가
 *    있었다(실측: "...630-70 모던하우스 3층301호"를 그대로 넘기면
 *    NOT_FOUND, "...630-70"까지만 자르면 OK, 2026-07-23) — 지번(숫자-숫자
 *    또는 하이픈 없는 단일 지번, 예: "구월동 1128 탑클래스 9층906호")
 *    뒤에 남은 건물명/층/호 텍스트를 전부 잘라낸다.
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
  let ho = dongHoMatch ? dongHoMatch[2] : null;

  if (roadNameMatch) {
    return { searchAddress: roadNameMatch[1].trim(), dong, ho };
  }

  // 도로명주소가 없으면 "NNN동" 앞부분까지를 지번주소로 간주한다.
  const beforeDongMatch = trimmed.match(/^(.*?)\s+\d+동(?:\s|$)/);
  let searchAddress = (beforeDongMatch ? beforeDongMatch[1] : trimmed)
    .replace(/,\s*$/, "")
    .trim();

  // "동" 표기가 없는 단일 건물(오피스텔 등) — 지번(하이픈 있는 "630-70"
  // 형태 또는 하이픈 없는 "1128" 단일 지번) 뒤에 남은 건물명/층/호
  // 텍스트를 잘라내고, 호수만 별도로 추출한다. 지번 뒤에 공백+한글
  // (건물명)이나 "N층"이 이어지는 지점을 지번의 끝으로 간주한다.
  if (!dongHoMatch) {
    const jibunMatch = searchAddress.match(/^(.*?\d+(?:-\d+)?)(?=\s|,)/);
    if (jibunMatch) {
      const hoOnlyMatch = searchAddress
        .slice(jibunMatch[1].length)
        .match(/(?:\d+\s*층)?\s*(\d+)\s*호/);
      if (hoOnlyMatch) ho = hoOnlyMatch[1];
      searchAddress = jibunMatch[1].trim();
    }
  }

  return { searchAddress, dong, ho };
}
