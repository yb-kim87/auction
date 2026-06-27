export type ProgressStatus = "all" | "active" | "ended";

export const PROGRESS_STATUS_LABELS = {
  all: "전체",
  active: "진행중",
  ended: "진행종료",
} as const;

export const PROGRESS_STATUS_OPTIONS = [
  PROGRESS_STATUS_LABELS.all,
  PROGRESS_STATUS_LABELS.active,
  PROGRESS_STATUS_LABELS.ended,
];

export function progressLabelToStatus(label: string): ProgressStatus {
  if (label === PROGRESS_STATUS_LABELS.ended) return "ended";
  if (label === PROGRESS_STATUS_LABELS.all) return "all";
  return "active";
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function parseBidDate(value: string) {
  if (!value.trim()) return null;

  const normalized = value.trim().replace(/\./g, "-").replace(/\//g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isBidDateEnded(bidDate: string) {
  return matchesProgressStatus(bidDate, "ended");
}

export function matchesProgressStatus(bidDate: string, status: ProgressStatus) {
  if (status === "all") return true;

  const parsed = parseBidDate(bidDate);
  if (!parsed) return false;

  const today = startOfToday();
  const bidDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());

  if (status === "active") return bidDay >= today;
  return bidDay < today;
}
