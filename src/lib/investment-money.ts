/** "3억 5,000만원", "5천만원", "1억 5천만원", "350000000" 등 → 원 단위 정수 */
export function parseMoneyToWon(raw: string): number | null {
  const text = raw.replace(/\s+/g, " ").trim().replace(/,/g, "");
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    const n = Number.parseInt(text, 10);
    return n > 0 ? n : null;
  }

  let total = 0;
  let matched = false;

  const eok = text.match(/(\d+(?:\.\d+)?)\s*억/);
  if (eok) {
    total += parseFloat(eok[1]) * 100_000_000;
    matched = true;
  }

  // "5천만원"처럼 숫자와 "만" 사이에 "천"이 끼는 복합 단위를 먼저 처리
  const cheonMan = text.match(/(\d+(?:\.\d+)?)\s*천\s*만/);
  if (cheonMan) {
    total += parseFloat(cheonMan[1]) * 10_000_000;
    matched = true;
  }

  const man = text.match(/(\d+(?:\.\d+)?)\s*만/);
  if (man) {
    total += parseFloat(man[1]) * 10_000;
    matched = true;
  }

  if (!cheonMan) {
    const cheon = text.match(/(\d+(?:\.\d+)?)\s*천(?!\s*만)/);
    if (cheon) {
      total += parseFloat(cheon[1]) * 1_000;
      matched = true;
    }
  }

  if (matched && total > 0) return Math.round(total);

  const digits = text.replace(/[^\d]/g, "");
  if (digits) {
    const n = Number.parseInt(digits, 10);
    return n > 0 ? n : null;
  }
  return null;
}

/**
 * 연소득 전용 파싱. parseMoneyToWon과 달리 "0"(소득없음)을 유효한 값으로
 * 인정한다 — 소득은 0원이 실제로 "대출 전혀 불가"를 뜻하는 유의미한
 * 입력이기 때문이다.
 */
export function parseIncomeToWon(raw: string | undefined): number | null {
  const trimmed = raw?.trim();
  if (trimmed === "0") return 0;
  return parseMoneyToWon(raw ?? "");
}

export function formatWonShort(won: number): string {
  const abs = Math.abs(won);
  if (abs >= 100_000_000) {
    const eok = abs / 100_000_000;
    const body = Number.isInteger(eok) ? `${eok}억` : `${eok.toFixed(1)}억`;
    return won < 0 ? `-${body}` : body;
  }
  if (abs >= 10_000) {
    const man = Math.round(abs / 10_000);
    const body = `${man.toLocaleString("ko-KR")}만`;
    return won < 0 ? `-${body}` : body;
  }
  return `${won.toLocaleString("ko-KR")}원`;
}

/** 드롭다운·DB 저장용 금액 문자열 (parseMoneyToWon 호환) */
export function formatMoneyOptionLabel(won: number): string {
  if (won <= 0) return "0";
  const eok = Math.floor(won / 100_000_000);
  const man = Math.round((won % 100_000_000) / 10_000);
  if (eok === 0) {
    return `${man.toLocaleString("ko-KR")}만원`;
  }
  if (man === 0) {
    return `${eok}억`;
  }
  return `${eok}억 ${man.toLocaleString("ko-KR")}만원`;
}
