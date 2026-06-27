const START_YEAR = 2000;

export function getAuctionCaseYears(): string[] {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: currentYear - START_YEAR + 1 }, (_, i) =>
    String(currentYear - i),
  );
}
