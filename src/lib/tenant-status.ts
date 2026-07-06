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

function parsePlainTenantBlock(block: string): TenantStatusRow | null {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0 || !lines[0].startsWith("임차인:")) return null;

  const fields: Record<string, string> = {
    tenant: lines[0].replace(/^임차인:\s*/, ""),
    occupancy: "",
    dates: "",
    deposit: "",
    opposability: "",
    analysis: "",
    other: "",
  };
  let current = "tenant";

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("점유:")) {
      current = "occupancy";
      fields.occupancy = line.replace(/^점유:\s*/, "");
    } else if (line.startsWith("전입/확정/배당:")) {
      current = "dates";
      fields.dates = line.replace(/^전입\/확정\/배당:\s*/, "");
    } else if (line.startsWith("보증금/차임:")) {
      current = "deposit";
      fields.deposit = line.replace(/^보증금\/차임:\s*/, "");
    } else if (line.startsWith("대항력:")) {
      current = "opposability";
      fields.opposability = line.replace(/^대항력:\s*/, "");
    } else if (line.startsWith("분석:")) {
      current = "analysis";
      fields.analysis = line.replace(/^분석:\s*/, "");
    } else if (line.startsWith("기타:")) {
      current = "other";
      fields.other = line.replace(/^기타:\s*/, "");
    } else {
      fields[current] = fields[current] ? `${fields[current]} ${line}` : line;
    }
  }

  const tenantMatch = fields.tenant.match(/^(\S+)\s*(.*)$/);
  const occupancyNo = tenantMatch?.[1] ?? "";
  const tenantName = tenantMatch?.[2]?.trim() ?? fields.tenant;

  return normalizeRow({
    occupancyNo,
    tenantName,
    occupancy: fields.occupancy,
    dates: fields.dates,
    depositRent: fields.deposit,
    opposability: fields.opposability,
    analysis: fields.analysis ? fields.analysis.split(" / ").map((s) => s.trim()) : [],
    other: fields.other,
  });
}

const TENANT_ROLE_WORDS = ["임차인", "경매신청인", "채권자", "임차권자", "임차권등기자"];

function extractTrailingRole(text: string): { remainder: string; role: string } {
  const rolePattern = new RegExp(`\\s*(${TENANT_ROLE_WORDS.join("|")})\\s*$`);
  const match = text.match(rolePattern);
  if (!match) return { remainder: text, role: "" };
  return { remainder: text.slice(0, match.index).trim(), role: match[1] };
}

/**
 * Handles freeform crawl text where multiple tenants appear as
 * "{no} {name}\n{occupancy/period lines}\n전입:.. 확정:.. 배당:.. 보:.. {free text}" blocks,
 * with occupancy/period sometimes wrapping across several lines before "전입:" appears.
 */
function parseFreeformTenants(mainPart: string): TenantStatusRow[] {
  const lines = mainPart
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: TenantStatusRow[] = [];
  let i = 0;

  while (i < lines.length) {
    const headerMatch = lines[i].match(/^(\d+)\s+(.+)$/);
    if (!headerMatch) {
      i++;
      continue;
    }

    const occupancyNo = headerMatch[1];
    const headerLines = [headerMatch[2]];
    i++;

    while (i < lines.length && !headerLines.join(" ").includes("전입:")) {
      if (/^\d+\s+\S/.test(lines[i])) break;
      headerLines.push(lines[i]);
      i++;
    }

    let headerText = headerLines.join(" ").replace(/\s+/g, " ").trim();
    const moveInMatch = headerText.match(/전입:(\S+)/);
    if (!moveInMatch) continue;

    const moveInIndex = moveInMatch.index ?? 0;
    const beforeMoveIn = headerText.slice(0, moveInIndex).trim();
    const afterMoveIn = headerText.slice(moveInIndex + moveInMatch[0].length).trim();

    const nameMatch = beforeMoveIn.match(/^(\S+)\s*(.*)$/);
    const tenantName = nameMatch ? nameMatch[1] : beforeMoveIn;
    const occupancy = nameMatch ? nameMatch[2].trim() : "";

    const tailLines = [afterMoveIn];
    while (i < lines.length && !/^\d+\s+\S/.test(lines[i])) {
      tailLines.push(lines[i]);
      i++;
    }

    let tailText = tailLines.join(" ").replace(/\s+/g, " ").trim();
    const confirmMatch = tailText.match(/확정:(\S+)/);
    const dividendMatch = tailText.match(/배당:(\S+)/);
    const depositMatch = tailText.match(/보:(\S+)/);
    const rentMatch = tailText.match(/월:(\S+)/);

    let remainder = tailText;
    for (const m of [confirmMatch, dividendMatch, depositMatch, rentMatch]) {
      if (m) remainder = remainder.replace(m[0], "");
    }
    remainder = remainder.replace(/\s+/g, " ").trim();

    const { remainder: withoutRole, role } = extractTrailingRole(remainder);
    remainder = withoutRole;

    const oppMatch = remainder.match(
      /(대항력\s*여지\s*있음(?:\([^)]*\))?|미배당\s*보증금\s*매수인\s*인수|매수인\s*인수|^인수$|^있음$|^없음$)/,
    );
    let opposability = "";
    if (oppMatch) {
      opposability = oppMatch[1];
      remainder = (
        remainder.slice(0, oppMatch.index) +
        remainder.slice((oppMatch.index ?? 0) + oppMatch[0].length)
      )
        .replace(/\s+/g, " ")
        .trim();
    }

    rows.push(
      normalizeRow({
        occupancyNo,
        tenantName,
        occupancy,
        dates: [
          `전입:${moveInMatch[1]}`,
          confirmMatch ? `확정:${confirmMatch[1]}` : "",
          dividendMatch ? `배당:${dividendMatch[1]}` : "",
        ]
          .filter(Boolean)
          .join(" / "),
        depositRent: [depositMatch ? `보:${depositMatch[1]}` : "", rentMatch ? `월:${rentMatch[1]}` : ""]
          .filter(Boolean)
          .join(" "),
        opposability: opposability || "-",
        analysis: remainder ? [remainder] : [],
        other: role,
      }),
    );
  }

  return rows;
}

export type ParsedTenantStatus = {
  rows: TenantStatusRow[];
  miscNotes: string;
};

export function parseAnyTenantStatus(raw: string | null | undefined): ParsedTenantStatus | null {
  const structured = parseTenantStatus(raw);
  if (structured && !tenantStatusIsEmpty(structured)) {
    return { rows: structured.rows, miscNotes: structured.miscNotes };
  }

  const text = String(raw ?? "").trim();
  if (!text || text === "값없음" || text === "없음") return null;
  if (text.startsWith(TENANT_STATUS_PREFIX)) return null;

  const [mainPart, ...miscParts] = text.split(/\n\[기타사항\]\n?/);
  const miscNotes = miscParts.join("\n").trim();

  const blocks = mainPart.split(/\n\n+/).map((b) => b.trim());
  const labeledRows = blocks
    .map((block) => parsePlainTenantBlock(block))
    .filter((row): row is TenantStatusRow => row != null && !row.sectionHeader);

  if (labeledRows.length > 0) {
    return { rows: labeledRows, miscNotes };
  }

  const freeformRows = parseFreeformTenants(mainPart);

  if (freeformRows.length === 0 && !miscNotes) return null;

  return { rows: freeformRows, miscNotes };
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
