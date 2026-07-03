/** "3억 5,000만원", "350000000" 등 → 원 단위 정수 */
export function parseMoneyToWon(raw: string): number | null {
  const text = raw.replace(/\s+/g, " ").trim().replace(/,/g, "");
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    const n = Number.parseInt(text, 10);
    return n > 0 ? n : null;
  }

  let total = 0;
  const eok = text.match(/(\d+(?:\.\d+)?)\s*억/);
  const man = text.match(/(\d+(?:\.\d+)?)\s*만/);
  if (eok) total += parseFloat(eok[1]) * 100_000_000;
  if (man) total += parseFloat(man[1]) * 10_000;
  if (total > 0) return Math.round(total);

  const digits = text.replace(/[^\d]/g, "");
  if (digits) {
    const n = Number.parseInt(digits, 10);
    return n > 0 ? n : null;
  }
  return null;
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
