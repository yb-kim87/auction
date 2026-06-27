export function matchesAuctionNoFilter(
  auctionNo: string,
  year: string,
  caseNo: string,
) {
  const digits = caseNo.replace(/[^0-9]/g, "");
  if (!year && !digits) return true;

  const normalized = auctionNo.replace(/\s/g, "");
  if (!normalized) return false;

  if (year && digits) {
    const prefix = `${year}타경${digits}`;
    return normalized.startsWith(prefix) || normalized.includes(prefix);
  }
  if (year) {
    return normalized.startsWith(`${year}타경`) || normalized.startsWith(year);
  }
  return normalized.includes(`타경${digits}`) || normalized.includes(digits);
}

export function formatAuctionNoFilterLabel(year: string, caseNo: string) {
  const digits = caseNo.replace(/[^0-9]/g, "");
  if (!year && !digits) return null;
  if (year && digits) return `${year}타경${digits}`;
  if (year) return `${year}타경`;
  return digits;
}
