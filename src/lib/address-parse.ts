/**
 * 경매 물건 주소 문자열에서 VWorld 주소 검색용 도로명/지번 주소와
 * 동·호수를 추출한다. 전체 등록 물건 3872건 전수 점검(2026-07-23)으로
 * 발견한 형식을 모두 반영했다(2026-07-21, 2026-07-23):
 *
 * 1) "...아파트 104동 22층2202호 (산곡동,한신휴아파트)" — 도로명주소가
 *    없으면 지번주소 앞부분(동/층/호 이전)을 그대로 검색 주소로 쓴다.
 * 2) "...4405호 (도로명주소:경기 고양시 일산서구 일현로 97-11)" —
 *    괄호 안 "도로명주소:" 뒤의 값이 있으면 검색 주소는 그걸 우선
 *    사용한다(VWorld는 도로명주소 검색(type=ROAD)이 더 정확하게
 *    매칭됨). 단, 동/호는 원본 지번 부분에서 추출한다 — 예전엔 이
 *    경로에서 조기 return해 dong/ho가 항상 null이 되는 버그가 있었다
 *    (실측: "간석동 235-27 2층202호 (도로명주소:...)"에서 ho가 유실돼
 *    building-register API에 호수가 전달되지 않았음).
 * 3) "인천광역시 미추홀구 용현동 630-70 모던하우스 3층301호" — 동 표기
 *    없이 "N층M호"만 있는 단일 건물(오피스텔 등). "동" 문자가 아예
 *    없어 1)의 "NNN동" 패턴이 매칭되지 않고 건물명+층+호까지 통째로
 *    검색 주소에 남아 VWorld가 NOT_FOUND를 반환하는 버그가 있었다
 *    (실측, 2026-07-23) — 지번(숫자-숫자 또는 하이픈 없는 단일 지번)
 *    뒤에 남은 건물명/층/호 텍스트를 전부 잘라낸다.
 * 4) "삼안파크맨션 제101동 제11층 제1106호", "제2층 제203호" — 동/층/호
 *    앞에 "제" 접두사가 붙는 표기. 기존 정규식은 "제"가 있으면 동/호
 *    추출 자체가 실패했다.
 * 5) "도무스힐르 제1동 제지층 제102호", "성은주택 2동 지층1호" — "지층"/
 *    "지하층"은 숫자가 없어 "\d+층" 패턴에 안 걸린다.
 * 6) "청라가림스위트오피스텔 3층비303호", "라움빌 제지1층 제비101호",
 *    "인천소래논현...에이동 26층오2602호" — 호수 숫자 앞에 "비/에이/디/
 *    오" 같은 한글 접두문자가 붙는 표기(지하·별동 구분용으로 추정).
 *    호수 자체(숫자)만 추출하고 접두문자는 버린다.
 * 7) "송파아이파크 13층디-1313호", "메트로캐슬 5층1-601호", "더갤러리
 *    14층102-1402호" — "N층" 뒤에 (동/블록 코드)-(호수) 형태로 하이픈
 *    연결된 표기. 하이픈 뒤쪽 숫자를 호수로 쓴다.
 * 8) "현대로얄빌라 제501호", "광백오피스텔 502호" — 층 표기 자체가 아예
 *    없이 건물명 바로 뒤에 "N호"만 오는 경우.
 * 9) "민락임대주택 가동 112호" — 동이 숫자가 아니라 한글(가/나/다동 등).
 */
export type ParsedAuctionAddress = {
  searchAddress: string;
  dong: string | null;
  ho: string | null;
};

/** "제N층"/"제지층"/"제지하층" 등 층 표기 — 동과 호 사이에 0개 이상
 * 올 수 있다. */
const FLOOR = /제?\s*(?:\d+|지하?)\s*층/;
/** 호수 숫자 앞에 붙는 한글 접두문자(지하·별동 구분용, "비/에이/디/오"
 * 등) 또는 하이픈 연결된 동/블록 코드 — 둘 다 버리고 마지막 숫자만
 * 호수로 쓴다. */
const HO_PREFIX = /(?:제?\s*[가-힣]{1,2}-?|제?\s*\d+\s*-\s*)?/;

/** 건물동 표기로 실제 쓰이는 한글/로마자 계열 값(전체 등록 물건
 * 3872건 실측으로 확정, 2026-07-23) — 임의의 한글 1글자를 전부
 * "동"으로 허용하면 법정동명 마지막 글자(예: "정릉동"의 "릉", "치평동"
 * 의 "평")를 오탐한다(실측: 최초 구현은 " 촌/평/월/항/잔/열" 등 법정동
 * 조각을 건물동으로 잘못 추출). "가나다라마바사아자차카타파하"(순번
 * 표기)와 "에이비씨디" 계열(알파벳 음차)만 화이트리스트로 허용한다. */
const HANGUL_DONG = /가|나|다|라|마|바|사|아|자|차|카|타|파|하|에이|비|씨|디/;

function extractHo(text: string): string | null {
  const m = text.match(new RegExp(`${HO_PREFIX.source}(\\d+)\\s*호`));
  return m ? m[1] : null;
}

export function parseAuctionAddress(raw: string): ParsedAuctionAddress {
  const trimmed = raw.trim();

  // "제"는 동/층/호 앞에 선택적으로 올 수 있다(예: "제101동", "제1106호").
  // 동은 숫자(예: "104동") 또는 순번/알파벳 음차 한글(예: "가동",
  // "에이동")일 수 있다.
  const dongHoMatch = trimmed.match(
    new RegExp(
      `제?\\s*(\\d+|${HANGUL_DONG.source})\\s*동\\s*(?:${FLOOR.source}\\s*)?${HO_PREFIX.source}(\\d+)\\s*호`,
    ),
  );
  // "동" 없이 "N층M호"(또는 "지층M호", 접두문자 포함)만 있는 경우 —
  // 오피스텔 등 단일 건물에서 호수만 추출한다.
  const floorHoMatch = !dongHoMatch
    ? trimmed.match(new RegExp(`${FLOOR.source}\\s*${HO_PREFIX.source}(\\d+)\\s*호`))
    : null;
  // 동/층 표기 자체가 전혀 없이 건물명 뒤에 "N호"만 오는 경우 — 위
  // 두 패턴이 모두 실패했을 때만 시도한다(오탐 방지, 지번의 "-70" 같은
  // 숫자를 호수로 잘못 잡지 않도록 반드시 "호" 글자가 있어야 매칭).
  const hoOnlyMatch =
    !dongHoMatch && !floorHoMatch ? extractHo(trimmed) : null;

  const dong = dongHoMatch ? dongHoMatch[1] : null;
  const ho = dongHoMatch
    ? dongHoMatch[2]
    : floorHoMatch
      ? floorHoMatch[1]
      : hoOnlyMatch;

  const roadNameMatch = trimmed.match(/도로명주소\s*[:：]\s*([^)]+)\)/);
  if (roadNameMatch) {
    return { searchAddress: roadNameMatch[1].trim(), dong, ho };
  }

  // 도로명주소가 없으면 "NNN동"(숫자 동) 앞부분까지를 지번주소로
  // 간주한다. 한글동("가동" 등)은 이 패턴에 안 걸리므로 아래 지번
  // 자르기 폴백이 대신 처리한다.
  const beforeDongMatch = trimmed.match(/^(.*?)\s+제?\d+동(?:\s|$)/);
  let searchAddress = (beforeDongMatch ? beforeDongMatch[1] : trimmed)
    .replace(/,\s*$/, "")
    .trim();

  // 위에서 지번주소를 못 잘라냈으면(숫자 동 패턴이 없었거나, 한글동/
  // 접두문자 호수 등 다른 형식) 지번(하이픈 있는 "630-70" 형태 또는
  // 하이픈 없는 "1128" 단일 지번) 뒤에 남은 건물명/동/층/호 텍스트를
  // 잘라낸다(dong/ho는 위에서 이미 추출됨). 지번 뒤에 공백+한글
  // (건물명)이나 콤마·괄호가 이어지는 지점을 지번의 끝으로 간주한다.
  if (!beforeDongMatch) {
    const jibunMatch = searchAddress.match(/^(.*?\d+(?:-\d+)?)(?=\s|,|\()/);
    if (jibunMatch) {
      searchAddress = jibunMatch[1].trim();
    }
  }

  return { searchAddress, dong, ho };
}
