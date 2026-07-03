export const TENANT_STATUS_PREFIX = "__TENANT_STATUS_V1__";

export type TenantStatusRow = {
  occupancyNo: string;
  tenantName: string;
  occupancy: string;
  dates: string;
  depositRent: string;
  opposability: string;
  analysis: string[];
  other: string;
  sectionHeader?: boolean;
};

export type TenantStatusData = {
  version: number;
  rows: TenantStatusRow[];
  miscNotes: string;
};

function normalizeRow(row: Partial<TenantStatusRow>): TenantStatusRow {
  return {
    occupancyNo: String(row.occupancyNo ?? "").trim(),
    tenantName: String(row.tenantName ?? "").trim(),
    occupancy: String(row.occupancy ?? "").trim(),
    dates: String(row.dates ?? "").trim(),
    depositRent: String(row.depositRent ?? "").trim(),
    opposability: String(row.opposability ?? "").trim(),
    analysis: Array.isArray(row.analysis)
      ? row.analysis.map((line) => String(line ?? "").trim()).filter(Boolean)
      : [],
    other: String(row.other ?? "").trim(),
    sectionHeader: Boolean(row.sectionHeader),
  };
}

export function parseTenantStatus(raw: string | null | undefined): TenantStatusData | null {
  let text = String(raw ?? "").trim();
  const prefixAt = text.indexOf(TENANT_STATUS_PREFIX);
  if (prefixAt >= 0) {
    text = text.slice(prefixAt);
  }
  if (!text.startsWith(TENANT_STATUS_PREFIX)) return null;
  try {
    const data = JSON.parse(text.slice(TENANT_STATUS_PREFIX.length)) as TenantStatusData;
    if (!data || typeof data !== "object") return null;
    return {
      version: Number(data.version) || 1,
      rows: Array.isArray(data.rows) ? data.rows.map((row) => normalizeRow(row)) : [],
      miscNotes: String(data.miscNotes ?? "").trim(),
    };
  } catch {
    return null;
  }
}

export function tenantStatusIsEmpty(data: TenantStatusData | null): boolean {
  if (!data) return true;
  if (data.miscNotes?.trim()) return false;
  if (!Array.isArray(data.rows) || data.rows.length === 0) return true;
  return !data.rows.some((row) => {
    if (row.sectionHeader) {
      return Boolean((row.occupancy || row.tenantName || "").trim());
    }
    return Boolean(
      row.tenantName?.trim() ||
        row.depositRent?.trim() ||
        row.occupancy?.trim() ||
        row.dates?.trim() ||
        row.opposability?.trim(),
    );
  });
}

function normalizeLeaseBannerText(text: string): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^=+\s*|\s*=+$/g, "");
}

function formatTenantStatusPayload(data: TenantStatusData): string {
  const blocks: string[] = [];

  for (const row of data.rows) {
    if (row.sectionHeader) {
      const status = normalizeLeaseBannerText(row.occupancy || row.tenantName || "");
      if (status) blocks.push(status);
      continue;
    }

    const lines: string[] = [];
    const label = [row.occupancyNo, row.tenantName].filter(Boolean).join(" ");
    if (label) lines.push(`임차인: ${label}`);
    if (row.occupancy) lines.push(`점유: ${row.occupancy.replace(/\n+/g, " / ")}`);
    if (row.dates) lines.push(`전입/확정/배당: ${row.dates.replace(/\n+/g, " / ")}`);
    if (row.depositRent) lines.push(`보증금/차임: ${row.depositRent.replace(/\n+/g, " / ")}`);
    if (row.opposability) lines.push(`대항력: ${row.opposability}`);
    if (row.analysis.length > 0) lines.push(`분석: ${row.analysis.join(" / ")}`);
    if (row.other) lines.push(`기타: ${row.other}`);
    if (lines.length > 0) blocks.push(lines.join("\n"));
  }

  if (data.miscNotes) {
    blocks.push(`[기타사항]\n${data.miscNotes}`);
  }

  return blocks.join("\n\n");
}

export function formatTenantStatusText(raw: string | null | undefined): string {
  const data = parseTenantStatus(raw);
  if (data && !tenantStatusIsEmpty(data)) {
    return formatTenantStatusPayload(data);
  }

  const plain = String(raw ?? "").trim();
  if (!plain || plain === "값없음" || plain === "없음") return "";
  if (plain.startsWith(TENANT_STATUS_PREFIX)) return "";
  return plain;
}

/** 화면/API 표시용 — JSON 접두사 없이 읽기 좋은 텍스트만 반환 */
export function displayTenantDetail(raw: string | null | undefined): string {
  return formatTenantStatusText(raw);
}

export function formatTenantStatusSummary(raw: string | null | undefined): string {
  const formatted = formatTenantStatusText(raw);
  if (!formatted) return "-";

  const lines = formatted.split("\n").map((line) => line.trim()).filter(Boolean);
  const tenantLine = lines.find((line) => line.startsWith("임차인:"));
  const depositLine = lines.find((line) => line.startsWith("보증금/차임:"));

  if (tenantLine) {
    const name = tenantLine.replace(/^임차인:\s*/, "").replace(/^#\d+\s*/, "").trim();
    const deposit = depositLine?.replace(/^보증금\/차임:\s*/, "").split(" / ")[0]?.trim();
    if (name && deposit) return `${name} · ${deposit}`;
    if (name) return name;
  }

  const first = lines[0] ?? "";
  return first.length > 42 ? `${first.slice(0, 40)}…` : first || "-";
}

export function analysisTone(text: string): "danger" | "warning" | "info" | "default" {
  const normalized = text.replace(/\s+/g, "");
  if (/미배당|매수인\s*인수|인수|주의/.test(normalized)) return "danger";
  if (/순위배당|대항력|확정/.test(normalized)) return "warning";
  if (/없음|해당없음/.test(normalized)) return "default";
  return "info";
}

export function opposabilityTone(text: string): "danger" | "default" {
  const normalized = text.replace(/\s+/g, "");
  return normalized.includes("있음") ? "danger" : "default";
}
