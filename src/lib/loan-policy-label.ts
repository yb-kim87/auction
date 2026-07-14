export function shortLoanPolicyLabel(label: string): string {
  const withoutAreaPrefix = label.replace(/^(규제지역|비규제지역)\s*·\s*/, "");
  const withoutBiz = withoutAreaPrefix.replace(/\(사업자대출\)/, "");
  const withoutFirstTimeIncluded = withoutBiz.replace(/\(생애최초\s*포함\)/, "");
  const withoutGeneral = withoutFirstTimeIncluded.replace(/무주택\s*일반/, "무주택");
  return withoutGeneral.replace(/\s*\+\s*/g, "+").replace(/\s+/g, "");
}

/** 무주택(0채) 케이스의 카드 표시용 라벨. 규제지역은 정책상 생애최초 여부를
 *  구분하지 않지만, 화면 표시는 회원의 실제 생애최초 체크 여부를 따른다. */
export function housingLoanLabel(
  loanPolicyLabel: string | null | undefined,
  firstTimeBuyer: boolean,
): string {
  const label = loanPolicyLabel ?? "";
  if (/1주택/.test(label)) return shortLoanPolicyLabel(label);
  return firstTimeBuyer ? "무주택생애최초" : "무주택";
}
