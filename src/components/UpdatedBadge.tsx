export function UpdatedBadge({
  className = "",
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "onDark";
}) {
  const variantClass =
    variant === "onDark"
      ? "bg-amber-300 text-amber-950 border-amber-200 shadow-sm"
      : "bg-sky-100 text-sky-700 border-sky-200";

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded-sm border shrink-0 ${variantClass} ${className}`}
    >
      갱신
    </span>
  );
}

export function formatAuctionImportMessage(result: {
  created?: number;
  updated?: number;
  imported?: number;
  total?: number;
}) {
  const created = result.created ?? 0;
  const updated = result.updated ?? 0;
  const parts: string[] = [];
  if (created > 0) parts.push(`신규 ${created}건`);
  if (updated > 0) parts.push(`갱신 ${updated}건`);
  const summary = parts.length > 0 ? parts.join(", ") : `${result.imported ?? 0}건 처리`;
  return result.total != null ? `${summary} (DB 전체 ${result.total}건)` : summary;
}
