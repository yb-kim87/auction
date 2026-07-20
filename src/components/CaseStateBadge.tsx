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
      className={`shrink-0 px-1.5 py-0.5 rounded-sm text-[11px] font-semibold ${
        isWithdrawn || isSold
          ? "bg-destructive/10 text-destructive"
          : "bg-blue-100 text-blue-700"
      }`}
    >
      {isSold ? "낙찰" : trimmed}
    </span>
  );
}
