const SOLD_CASE_STATES = new Set([
  "허가",
  "매각결정기일",
  "지급기한",
  "배당기일",
  "배당종결",
]);

export function CaseStateBadge({ caseState }: { caseState?: string }) {
  const trimmed = (caseState ?? "").trim();
  const isWithdrawn = trimmed === "취하";
  const isChanged = trimmed === "변경";
  const isSold = SOLD_CASE_STATES.has(trimmed);
  if (!isWithdrawn && !isChanged && !isSold) return null;
  return (
    <span
      className={`shrink-0 px-1.5 py-0.5 rounded-md text-[0.65rem] font-bold border shadow-sm ${
        isWithdrawn || isSold
          ? "bg-destructive text-white border-destructive"
          : "bg-blue-600 text-white border-blue-600"
      }`}
    >
      {isSold ? "낙찰" : trimmed}
    </span>
  );
}
