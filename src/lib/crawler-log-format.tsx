import type { ReactNode } from "react";

/** "[관심조건] 이름" 형태의 로그 메시지에서 태그와 나머지 텍스트를 분리해,
 * 태그 부분만 강조 색상으로 렌더링한다. 작업창/매일 작업 로그 패널이
 * 공통으로 사용한다. */
export function renderLogMessage(message: string): ReactNode {
  const match = message.match(/^(\[관심조건\])(.*)$/);
  if (!match) return message;
  return (
    <>
      <span className="text-primary font-semibold">{match[1]}</span>
      {match[2]}
    </>
  );
}
