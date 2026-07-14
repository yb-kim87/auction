"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { X, ExternalLink, MapPin, Calendar, Building2, History, Save, Trash2, Heart, StickyNote, Brain, Clock, FileText, Home, ChevronLeft, ChevronRight } from "lucide-react";
import type { AuctionItem, UpdateAuctionPayload } from "@/types/auction";
import {
  AUCTION_FIELD_GROUPS,
  toFormState,
  toPayload,
} from "@/lib/auction-form";
import { AuctionFieldInput } from "@/components/AuctionFieldInput";
import { deleteAuction, updateAuction } from "@/lib/api";
import { UpdatedBadge } from "@/components/UpdatedBadge";
import { NaverComplexLink } from "@/components/NaverComplexLink";
import { hasNaverPrice } from "@/lib/naver-price";
import { AuctionAnalysisPanel } from "@/components/AuctionAnalysisPanel";
import { TenantStatusPanel } from "@/components/TenantStatusPanel";
import { displayTenantDetail } from "@/lib/tenant-status";
import { getFailureRateRatio } from "@/lib/failure-rate";
import { formatWonShort } from "@/lib/investment-money";
import { housingLoanLabel } from "@/lib/loan-policy-label";

const LIST_TEXT = "text-[15px] leading-snug";
const LABEL_TEXT = "text-[14px] leading-snug";
const SECTION_TEXT = "text-[16px] leading-snug";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const fmtEok = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 100000000) {
    const body = `${(abs / 100000000).toFixed(2)}억`;
    return n < 0 ? `-${body}` : body;
  }
  if (abs >= 10000) {
    const body = `${(abs / 10000).toFixed(0)}만`;
    return n < 0 ? `-${body}` : body;
  }
  return fmt(n);
};

const fmtDiffAmount = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 100000000) {
    const body = `${(abs / 100000000).toFixed(1)}억`;
    return n < 0 ? `-${body}` : `+${body}`;
  }
  if (abs >= 10000) {
    const body = `${(abs / 10000).toFixed(0)}만`;
    return n < 0 ? `-${body}` : `+${body}`;
  }
  const sign = n >= 0 ? "+" : "";
  return `${sign}${fmt(n)}`;
};

const diff = (a: number, b: number) => {
  const d = a - b;
  return { val: fmtDiffAmount(d), positive: d >= 0, amount: d };
};

const DETAIL_HIDDEN_FIELDS = new Set<keyof UpdateAuctionPayload>([
  "memo",
  "views",
  "link",
  "auctionNo",
  "address",
  "usage",
  "area",
  "builtYear",
  "bidDate",
  "totalUnits",
  "appraisedValue",
  "minPrice",
  "naverPrice",
  "officialLandPrice",
  "salePrice",
  "tradingCount",
  "specialNote",
]);

function detailVisibleFields(group: (typeof AUCTION_FIELD_GROUPS)[number]) {
  return group.fields.filter((field) => !DETAIL_HIDDEN_FIELDS.has(field.key));
}

const EXPANDABLE_DETAIL_KEYS = new Set<keyof UpdateAuctionPayload>([
  "buildingRegistry",
  "education",
  "priceDetail",
  "tradingDetail",
]);

function isExpandableDetailField(key: keyof UpdateAuctionPayload) {
  return EXPANDABLE_DETAIL_KEYS.has(key);
}

function buildingRegistryClassName(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed !== "이상없음" ? "text-red-500 font-semibold" : "text-emerald-600";
}

type HeaderEditKey =
  | "auctionNo"
  | "address"
  | "area"
  | "builtYear"
  | "totalUnits"
  | "officialLandPrice"
  | "bidDate"
  | "specialNote";

type PriceEditKey =
  | "appraisedValue"
  | "minPrice"
  | "naverPrice"
  | "salePrice"
  | "tradingCount";

const priceEditableButtonClass =
  "text-left w-full min-w-0 rounded-sm -mx-0.5 px-0.5 hover:bg-black/5 transition-colors cursor-text";

function formatTotalUnitsLabel(value: string | number | null | undefined): string {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return "-";
  return `${n.toLocaleString("ko-KR")}세대`;
}

function formatOfficialLandPriceLabel(value: string | number | null | undefined): string {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return "공시가 -";
  return `공시가 ${fmtEok(n)}`;
}

function parseAreaNumber(area: string | null | undefined): string {
  const raw = String(area ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/[\d.]+/);
  return match?.[0] ?? raw;
}

function AreaLabel({ area }: { area: string | null | undefined }) {
  const num = parseAreaNumber(area);
  if (!num) return <>-</>;
  return (
    <>
      {num}m<sup className="text-[0.75em] align-super">2</sup>
    </>
  );
}

function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[0.68rem] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-[0.82rem] font-medium text-foreground">{value}</p>
    </div>
  );
}

function HeaderSpecialNote({
  value,
  editable,
  active,
  onActivate,
  onDeactivate,
  onChange,
  onDark = true,
}: {
  value: string;
  editable: boolean;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onChange: (value: string) => void;
  onDark?: boolean;
}) {
  const rawText = String(value ?? "").trim();
  const text = rawText === "없음" ? "" : rawText;
  if (!editable && !text) return null;

  const textColor = onDark ? "text-red-200" : "text-red-600";
  const placeholderColor = onDark ? "text-white/50" : "text-muted-foreground/60";

  if (active) {
    return (
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onDeactivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            onDeactivate();
          }
        }}
        placeholder="특이사항"
        className={`${headerFieldCompactClass} ${onDark ? "text-red-100" : "text-red-600"} max-w-[14rem]`}
      />
    );
  }

  if (editable) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className={`${headerEditableButtonClass} ${LABEL_TEXT} font-medium truncate max-w-[14rem] ${
          text ? textColor : placeholderColor
        }`}
        title={text ? text : "클릭하여 특이사항 입력"}
      >
        {text || "특이사항"}
      </button>
    );
  }

  return (
    <span
      className={`${LABEL_TEXT} font-medium ${textColor} truncate max-w-[14rem]`}
      title={text}
    >
      {text}
    </span>
  );
}

function TenantInfoField({
  value,
  editable,
  onChange,
}: {
  value: string;
  editable: boolean;
  onChange?: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = String(value ?? "").trim();
  const display = text || "-";
  const isLong = text.length > 28 || text.includes("\n");

  const collapse = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setExpanded(false);
  };

  const expand = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setExpanded(true);
  };

  if (expanded) {
    return (
      <div
        className="min-w-0 rounded-sm border border-border/60 bg-secondary/15 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end mb-1.5">
          <button
            type="button"
            onClick={collapse}
            className={`${LABEL_TEXT} font-medium text-primary hover:underline`}
          >
            접기
          </button>
        </div>
        {editable ? (
          <textarea
            rows={4}
            autoFocus
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${LIST_TEXT} bg-input-background border border-border rounded-sm px-3 py-2 text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/20`}
          />
        ) : (
          <p className={`${LIST_TEXT} text-foreground whitespace-pre-wrap break-words m-0`}>
            {display}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 min-w-0 ${editable ? "cursor-pointer hover:bg-secondary/40 rounded-sm px-1 -mx-1" : ""}`}
      onClick={
        editable || isLong
          ? (e) => {
              e.stopPropagation();
              setExpanded(true);
            }
          : undefined
      }
      role={editable || isLong ? "button" : undefined}
      tabIndex={editable || isLong ? 0 : undefined}
      onKeyDown={
        editable || isLong
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setExpanded(true);
              }
            }
          : undefined
      }
    >
      <p
        className={`${LIST_TEXT} truncate flex-1 min-w-0 m-0 ${
          text ? "text-foreground" : "text-muted-foreground"
        }`}
        title={text || undefined}
      >
        {display}
      </p>
      {(editable || isLong) && (
        <button
          type="button"
          onClick={expand}
          className={`${LABEL_TEXT} shrink-0 font-medium text-primary hover:underline`}
        >
          더보기
        </button>
      )}
    </div>
  );
}

function ExpandableDetailField({
  label,
  value,
  editable = false,
  onChange,
  valueClassName = "",
}: {
  label: string;
  value: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  valueClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const text = String(value ?? "").trim();
  const display = text || "-";
  const canExpand = Boolean(text) || editable;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const openPanel = (e: MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
  };

  const inlineFieldClass =
    "w-full bg-input-background border border-border rounded-sm px-3 py-2 text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <>
      <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
        {editable ? (
          <textarea
            rows={4}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className={`${inlineFieldClass} ${LIST_TEXT} leading-relaxed resize-y min-h-[6rem] max-h-40 overflow-y-auto`}
          />
        ) : (
          <div
            className={`text-[0.82rem] leading-relaxed max-h-40 overflow-y-auto rounded-xl border border-border bg-card px-4 py-3 whitespace-pre-wrap break-words ${valueClassName} ${
              text ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {display}
          </div>
        )}
        {canExpand && (
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={openPanel}
              className={`${LABEL_TEXT} font-medium text-primary hover:underline`}
            >
              더 크게 보기
            </button>
          </div>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-8 bg-black/60"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            className="relative flex flex-col w-full max-w-3xl max-h-[min(85vh,720px)] bg-background border border-border rounded-lg shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-secondary/20">
              <h4 className={`${SECTION_TEXT} font-semibold text-foreground`}>{label}</h4>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-sm hover:bg-secondary transition-colors"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {editable ? (
                <textarea
                  autoFocus
                  rows={16}
                  value={value}
                  onChange={(e) => onChange?.(e.target.value)}
                  className={`w-full min-h-[280px] ${LIST_TEXT} leading-relaxed bg-input-background border border-border rounded-sm px-4 py-3 text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/20`}
                />
              ) : (
                <p
                  className={`${SECTION_TEXT} leading-relaxed text-foreground whitespace-pre-wrap break-words m-0 ${valueClassName}`}
                >
                  {display}
                </p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border bg-secondary/20 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`px-4 py-2 ${LIST_TEXT} font-medium border border-border rounded-sm hover:bg-secondary transition-colors`}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function detailTableShellClass() {
  return "rounded-xl border border-border bg-card overflow-hidden";
}

const detailTableHeadCellClass =
  "px-3 py-2 text-left text-[0.68rem] font-medium text-muted-foreground whitespace-nowrap";
const detailTableBodyCellClass =
  "px-3 py-2 text-[0.78rem] text-foreground whitespace-nowrap";

type ListingPriceRow = {
  dong: string;
  priceText: string;
  area: string;
  floorText: string;
  date: string;
  note: string;
};

const IGNORED_LISTING_LINES = new Set([
  "관심매물",
  "매물목록 펼치기",
  "매물 보러가기",
]);

function parseSingleLineListingRow(line: string): ListingPriceRow | null {
  const match = line.match(
    /^(\S+동)\s+(매매\S*)\s+(([\d.]+㎡)?\s*\([^)]*\))\s+(\S+\/\S+)\s+([\d.]{8,10})\s*(.*)$/,
  );
  if (!match) return null;
  const [, dong, priceText, area, , floorText, date, note] = match;
  return { dong, priceText, area: area.trim(), floorText, date, note: note.trim() };
}

function parseListingCardBlock(blockLines: string[]): ListingPriceRow | null {
  const lines = blockLines.filter((l) => !IGNORED_LISTING_LINES.has(l));
  if (lines.length === 0) return null;

  const dongLine = lines.find((l) => /\S+동$/.test(l));
  const priceLine = lines.find((l) => l.startsWith("매매"));
  const specLine = lines.find((l) => /층/.test(l) && /㎡/.test(l));
  if (!dongLine || !priceLine || !specLine) return null;

  const dongMatch = dongLine.match(/(\S+동)$/);
  const dong = dongMatch ? dongMatch[1] : dongLine;
  const priceText = priceLine.replace(/\s+/g, "");

  const specMatch = specLine.match(/([\d.]+㎡\s*\([^)]*\))(\S+)층(\S*)/);
  const area = specMatch ? specMatch[1].trim() : specLine;
  const floorText = specMatch ? specMatch[2] : "-";
  const direction = specMatch ? specMatch[3] : "";

  const quoteIdx = lines.indexOf('"');
  let note = "";
  if (quoteIdx !== -1) {
    const closeIdx = lines.indexOf('"', quoteIdx + 1);
    if (closeIdx !== -1) {
      note = lines.slice(quoteIdx + 1, closeIdx).join(" ");
    }
  }
  if (!note && direction) note = direction;

  const dateLine = lines.find((l) => /^(집주인)?확인매물\s/.test(l));
  const dateMatch = dateLine?.match(/([\d.]{8,10})/);
  const date = dateMatch ? dateMatch[1] : "";

  return { dong, priceText, area, floorText, date, note };
}

function parseListingPriceDetail(raw: string): ListingPriceRow[] {
  const allLines = raw.split("\n").map((l) => l.trim());

  const looksLikeCardFormat = allLines.some((l) => l.startsWith("매매 "));
  if (looksLikeCardFormat) {
    const nonEmpty = allLines.filter(Boolean);
    const rows: ListingPriceRow[] = [];
    let block: string[] = [];

    for (const line of nonEmpty) {
      const isNewDongHeader = /\S+동$/.test(line) && !line.startsWith('"');
      if (isNewDongHeader && block.some((l) => l.startsWith("매매"))) {
        const row = parseListingCardBlock(block);
        if (row) rows.push(row);
        block = [];
      }
      block.push(line);
    }
    if (block.length > 0) {
      const row = parseListingCardBlock(block);
      if (row) rows.push(row);
    }

    return rows;
  }

  const lines = allLines.filter(Boolean);
  const rows: ListingPriceRow[] = [];
  let lastRow: ListingPriceRow | null = null;
  let inQuoteBlock = false;

  for (const line of lines) {
    if (line === '"') {
      inQuoteBlock = !inQuoteBlock;
      continue;
    }

    const row = parseSingleLineListingRow(line);
    if (row) {
      inQuoteBlock = false;
      lastRow = row;
      rows.push(lastRow);
      continue;
    }

    if (inQuoteBlock && lastRow) {
      const prev: ListingPriceRow = lastRow;
      lastRow = { ...prev, note: prev.note ? `${prev.note} ${line}` : line };
      rows[rows.length - 1] = lastRow;
    }
  }

  return rows;
}

function ListingPriceTable({ value }: { value: string }) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-[0.82rem] text-muted-foreground">
        -
      </div>
    );
  }

  const rows = parseListingPriceDetail(text);
  if (rows.length === 0) {
    return (
      <div className="text-[0.82rem] leading-relaxed max-h-40 overflow-y-auto rounded-xl border border-border bg-card px-4 py-3 whitespace-pre-wrap break-words text-foreground">
        {text}
      </div>
    );
  }

  return (
    <div className={detailTableShellClass()}>
      <div className="overflow-x-auto max-h-48 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-card border-b border-border shadow-[0_1px_0_0_var(--border)]">
            <tr>
              <th className={detailTableHeadCellClass}>동</th>
              <th className={detailTableHeadCellClass}>호가</th>
              <th className={detailTableHeadCellClass}>면적</th>
              <th className={detailTableHeadCellClass}>층</th>
              <th className={detailTableHeadCellClass}>등록일</th>
              <th className={detailTableHeadCellClass}>비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className={detailTableBodyCellClass}>{row.dong}</td>
                <td className={`${detailTableBodyCellClass} font-semibold`}>{row.priceText}</td>
                <td className={detailTableBodyCellClass}>{row.area}</td>
                <td className={detailTableBodyCellClass}>{row.floorText}</td>
                <td className={detailTableBodyCellClass}>{row.date}</td>
                <td className={`${detailTableBodyCellClass} whitespace-normal text-muted-foreground`}>
                  {row.note || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type TransactionRow = {
  year: string;
  contractDate: string;
  registryDate: string;
  floorText: string;
  priceText: string;
};

type TransactionGroup = { areaLabel: string; rows: TransactionRow[] };

function parseTransactionGroup(raw: string): TransactionGroup {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let areaLabel = "";
  let currentYear = "";
  const rows: TransactionRow[] = [];

  for (const line of lines) {
    const areaMatch = line.match(/^\[(.+)\]$/);
    if (areaMatch) {
      areaLabel = areaMatch[1];
      continue;
    }
    const yearMatch = line.match(/^(\d{4})년\s*계약(\s*매매\s*실거래가\s*표)?$/);
    if (yearMatch) {
      currentYear = yearMatch[1];
      continue;
    }
    if (line.startsWith("계약일") || line.includes("등기일")) continue;

    const rowMatch = line.match(
      /^([\d.]{4,6})\.?\s+(\S+)\s+(\S+층)\s+(.+)$/,
    );
    if (rowMatch) {
      const [, contractDate, registryDate, floorText, priceText] = rowMatch;
      if (registryDate === "계약취소") continue;
      rows.push({
        year: currentYear,
        contractDate,
        registryDate,
        floorText,
        priceText: priceText.trim(),
      });
    }
  }

  const seen = new Set<string>();
  const dedupedRows = rows.filter((row) => {
    const key = `${row.year}|${row.contractDate}|${row.registryDate}|${row.floorText}|${row.priceText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sortedRows = dedupedRows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const yearDiff = Number(b.row.year) - Number(a.row.year);
      if (yearDiff !== 0) return yearDiff;
      return a.index - b.index;
    })
    .map(({ row }) => row);

  return { areaLabel, rows: sortedRows };
}

function parseTransactionDetail(raw: string): TransactionGroup[] {
  return raw
    .split(/\n-{2,}\n/)
    .map((chunk) => parseTransactionGroup(chunk))
    .filter((group) => group.rows.length > 0);
}

function TransactionDetailTable({ value }: { value: string }) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-[0.82rem] text-muted-foreground">
        -
      </div>
    );
  }

  const groups = parseTransactionDetail(text);
  if (groups.length === 0) {
    return (
      <div className="text-[0.82rem] leading-relaxed max-h-40 overflow-y-auto rounded-xl border border-border bg-card px-4 py-3 whitespace-pre-wrap break-words text-foreground">
        {text}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group, gi) => (
        <div key={gi} className={detailTableShellClass()}>
          {group.areaLabel && (
            <div className="px-3 py-1.5 text-[0.68rem] text-muted-foreground bg-secondary/20 border-b border-border/60">
              {group.areaLabel}
            </div>
          )}
          <div className="overflow-x-auto max-h-48 overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-card border-b border-border shadow-[0_1px_0_0_var(--border)]">
                <tr>
                  <th className={detailTableHeadCellClass}>계약연도</th>
                  <th className={detailTableHeadCellClass}>계약일</th>
                  <th className={detailTableHeadCellClass}>등기일</th>
                  <th className={detailTableHeadCellClass}>층</th>
                  <th className={detailTableHeadCellClass}>가격</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className={detailTableBodyCellClass}>{row.year}</td>
                    <td className={detailTableBodyCellClass}>{row.contractDate}</td>
                    <td className={detailTableBodyCellClass}>{row.registryDate}</td>
                    <td className={detailTableBodyCellClass}>{row.floorText}</td>
                    <td className={`${detailTableBodyCellClass} font-semibold`}>{row.priceText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

type EducationRow = {
  level: string;
  name: string;
  distance: string;
};

const EDUCATION_LEVELS = ["유치원", "초등학교", "중학교", "고등학교", "대학교"];
const EDUCATION_LEVEL_PATTERN = EDUCATION_LEVELS.join("|");

function parseEducationDetail(raw: string): EducationRow[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const parseSchoolItem = (item: string, level: string): EducationRow => {
    const match = item.match(/^(.+?)\s*\(([^)]+)\)$/);
    return match
      ? { level, name: match[1].trim(), distance: match[2].trim() }
      : { level, name: item, distance: "" };
  };

  const isLabeledFormat = lines.some((l) =>
    new RegExp(`^(${EDUCATION_LEVEL_PATTERN}):`).test(l),
  );
  if (isLabeledFormat) {
    const rows: EducationRow[] = [];
    for (const line of lines) {
      const match = line.match(new RegExp(`^(${EDUCATION_LEVEL_PATTERN}):\\s*(.+)$`));
      if (!match) continue;
      const [, level, rest] = match;
      rest
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((item) => rows.push(parseSchoolItem(item, level)));
    }
    return rows;
  }

  const countMatches = [
    ...lines[0].matchAll(new RegExp(`(${EDUCATION_LEVEL_PATTERN})\\s*\\((\\d+)\\)`, "g")),
  ];
  if (countMatches.length === 0) return [];

  const schoolLines = lines.slice(1);
  const rows: EducationRow[] = [];
  let cursor = 0;
  for (const m of countMatches) {
    const level = m[1];
    const count = Number(m[2]);
    for (let i = 0; i < count; i++) {
      const line = schoolLines[cursor];
      if (!line) break;
      rows.push(parseSchoolItem(line, level));
      cursor++;
    }
  }
  return rows;
}

function EducationTable({ value }: { value: string }) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-[0.82rem] text-muted-foreground">
        -
      </div>
    );
  }

  const rows = parseEducationDetail(text);
  if (rows.length === 0) {
    return (
      <div className="text-[0.82rem] leading-relaxed max-h-40 overflow-y-auto rounded-xl border border-border bg-card px-4 py-3 whitespace-pre-wrap break-words text-foreground">
        {text}
      </div>
    );
  }

  return (
    <div className={detailTableShellClass()}>
      <div className="overflow-x-auto max-h-48 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-card border-b border-border shadow-[0_1px_0_0_var(--border)]">
            <tr>
              <th className={detailTableHeadCellClass}>구분</th>
              <th className={detailTableHeadCellClass}>학교명</th>
              <th className={detailTableHeadCellClass}>거리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className={detailTableBodyCellClass}>{row.level}</td>
                <td className={detailTableBodyCellClass}>{row.name}</td>
                <td className={`${detailTableBodyCellClass} text-muted-foreground`}>
                  {row.distance || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RegistryRow = {
  section: string;
  seq: string;
  date: string;
  rightType: string;
  holder: string;
  amount: string;
  isClaimAmount: boolean;
  note: string;
  cancelled: boolean;
};

const REGISTRY_HEADER_RE = /^([갑을])\((\d+)\)\s+(\d{4}-\d{2}-\d{2})$/;

function parseRegistryDetail(raw: string): RegistryRow[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: RegistryRow[] = [];
  let block: string[] = [];

  const flush = () => {
    if (block.length === 0) return;
    const headerMatch = block[0].match(REGISTRY_HEADER_RE);
    if (!headerMatch) {
      block = [];
      return;
    }
    const [, section, seq, date] = headerMatch;
    const bodyText = block
      .slice(1)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const cancelled = /(^|\s)소멸(\s|$)/.test(bodyText);
    const bodyNoCancel = bodyText.replace(/(^|\s)소멸(\s|$)/, " ").trim();

    const rightTypeMatch = bodyNoCancel.match(/^(\S+)\s*/);
    const rightType = rightTypeMatch ? rightTypeMatch[1] : bodyNoCancel;
    let rest = bodyNoCancel.slice(rightType.length).trim();

    let holder = "";
    let amount = "";
    let note = "";
    let isClaimAmount = false;

    const isTransferType = rightType === "소유권이전" || rightType.includes("지분전부이전");
    if (isTransferType) {
      const dealMatch = rest.match(/(거래가액:[\d,]+원)/);
      if (dealMatch) {
        holder = rest.slice(0, dealMatch.index).trim();
        note = dealMatch[1];
      } else {
        holder = rest;
      }
    } else {
      isClaimAmount = /청구금액/.test(rest);
      rest = rest.replace(/청구금액\s*/, "");
      const amountMatch = rest.match(/([\d,]{4,})/);
      amount = amountMatch ? amountMatch[1] : "";
      if (amountMatch && amountMatch.index != null) {
        holder = rest.slice(0, amountMatch.index).trim();
        note = rest.slice(amountMatch.index + amountMatch[0].length).trim();
      } else {
        holder = rest;
        note = "";
      }
    }

    rows.push({ section, seq, date, rightType, holder, amount, isClaimAmount, note, cancelled });
    block = [];
  };

  for (const line of lines) {
    if (REGISTRY_HEADER_RE.test(line) && block.length > 0) flush();
    block.push(line);
  }
  flush();

  return rows;
}

function RegistryTable({ value }: { value: string }) {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text === "이상없음") {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-[0.82rem] text-emerald-600">
        이상없음
      </div>
    );
  }

  const rows = parseRegistryDetail(text);
  if (rows.length === 0) {
    return (
      <div className="text-[0.82rem] leading-relaxed max-h-40 overflow-y-auto rounded-xl border border-border bg-card px-4 py-3 whitespace-pre-wrap break-words text-red-500 font-semibold">
        {text}
      </div>
    );
  }

  const totalAmount = rows.reduce((sum, row) => {
    if (row.isClaimAmount) return sum;
    const n = Number(row.amount.replace(/,/g, ""));
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);

  return (
    <div className={detailTableShellClass()}>
      {totalAmount > 0 && (
        <div className="px-3 py-1.5 text-[0.68rem] text-muted-foreground bg-secondary/20 border-b border-border/60">
          채권합계금액: {totalAmount.toLocaleString("ko-KR")}원
        </div>
      )}
      <div className="overflow-x-auto max-h-56 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-card border-b border-border shadow-[0_1px_0_0_var(--border)]">
            <tr>
              <th className={detailTableHeadCellClass}>순서</th>
              <th className={detailTableHeadCellClass}>접수일</th>
              <th className={detailTableHeadCellClass}>권리종류</th>
              <th className={detailTableHeadCellClass}>권리자</th>
              <th className={`${detailTableHeadCellClass} text-right`}>채권금액</th>
              <th className={detailTableHeadCellClass}>비고</th>
              <th className={detailTableHeadCellClass}>소멸</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className={detailTableBodyCellClass}>
                  {row.section}({row.seq})
                </td>
                <td className={detailTableBodyCellClass}>{row.date}</td>
                <td className={detailTableBodyCellClass}>{row.rightType}</td>
                <td className={detailTableBodyCellClass}>{row.holder || "-"}</td>
                <td className={`${detailTableBodyCellClass} text-right font-semibold`}>
                  {row.isClaimAmount ? (
                    <span className="inline-flex flex-col items-end leading-tight">
                      <span className="text-[0.6rem] font-normal text-muted-foreground">청구금액</span>
                      <span>{row.amount}</span>
                    </span>
                  ) : (
                    row.amount || ""
                  )}
                </td>
                <td className={`${detailTableBodyCellClass} whitespace-normal text-muted-foreground`}>
                  {row.note || ""}
                </td>
                <td className={detailTableBodyCellClass}>
                  {row.cancelled && <span className="text-primary">소멸</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const headerFieldClass =
  "w-full bg-white/10 border border-white/25 rounded-sm px-3 py-1.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/30";

const headerFieldCompactClass =
  "bg-white/10 border border-white/25 rounded-sm px-2 py-0.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 min-w-[4rem]";

const headerEditableButtonClass =
  "text-left rounded-sm px-1 -mx-1 hover:bg-white/10 transition-colors cursor-text";

function HeaderInlineInput({
  active,
  onActivate,
  onDeactivate,
  value,
  onChange,
  display,
  placeholder,
  title,
  className = "",
  compact = false,
}: {
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  value: string;
  onChange: (value: string) => void;
  display: ReactNode;
  placeholder: string;
  title: string;
  className?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!active) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [active]);

  if (active) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onDeactivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            onDeactivate();
          }
        }}
        placeholder={placeholder}
        className={compact ? `${headerFieldCompactClass} ${className}` : `${headerFieldClass} ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      className={`${headerEditableButtonClass} ${className}`}
      title={title}
    >
      {display}
    </button>
  );
}

const BID_THRESHOLD = 20_000_000;

function newCaseAppraisedSuffix(amount: number): string {
  return amount >= BID_THRESHOLD ? "(신건입찰가능)" : "(신건입찰불가)";
}

function minPriceBidSuffix(amount: number): string {
  return amount >= BID_THRESHOLD ? "(입찰가능)" : "(입찰불가)";
}

function parsePreviewNumber(value: string | number | null | undefined): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function formatFieldValue(
  key: keyof UpdateAuctionPayload,
  item: AuctionItem,
): string {
  if (key === "naverPrice") {
    return hasNaverPrice(item.naverPrice) ? fmtEok(item.naverPrice) : "-";
  }
  if (key === "priceDetail") {
    if (!hasNaverPrice(item.naverPrice)) return "-";
    const detail = String(item.priceDetail ?? "").trim();
    return detail || "-";
  }

  const value = item[key as keyof AuctionItem];
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    if (
      key === "views" ||
      key === "totalUnits" ||
      key === "builtYear"
    ) {
      return fmt(value);
    }
    return fmtEok(value);
  }
  return String(value);
}

const PRICE_SUMMARY_ROW_HEIGHT = "h-[4.5rem]";

const PRICE_CARD_SHELL =
  `bg-secondary/40 border border-border rounded-sm px-4 py-3 w-full ${PRICE_SUMMARY_ROW_HEIGHT} flex flex-col justify-between overflow-hidden`;

function priceValueClass(
  value: string,
  accent?: "orange" | "green" | "primary",
): string {
  if (value === "-") return `${SECTION_TEXT} font-bold font-mono leading-snug text-muted-foreground/40`;
  const accentClass =
    accent === "orange"
      ? "text-orange-600"
      : accent === "green"
        ? "text-emerald-600"
        : accent === "primary"
          ? "text-primary"
          : "text-foreground";
  return `${SECTION_TEXT} font-bold font-mono leading-snug ${accentClass}`;
}

function PriceCard({
  label,
  value,
  accent,
  className = "",
  labelAction,
  valueAction,
  valueSlot,
}: {
  label: string;
  value: string;
  accent?: "orange" | "green" | "primary";
  className?: string;
  labelAction?: ReactNode;
  valueAction?: ReactNode;
  valueSlot?: ReactNode;
}) {
  const valueClass = priceValueClass(value, accent);

  return (
    <div className={`${PRICE_CARD_SHELL} ${className}`}>
      {labelAction ? (
        <div
          className={`${LABEL_TEXT} text-muted-foreground flex items-center justify-between gap-2 min-h-[22px]`}
        >
          <span className="truncate">{label}</span>
          <span className="shrink-0">{labelAction}</span>
        </div>
      ) : (
        <p className={`${LABEL_TEXT} text-muted-foreground min-h-[22px]`}>{label}</p>
      )}
      {valueSlot ?? (valueAction ? (
        <div className="flex items-center justify-between gap-2 min-w-0">
          <p className={`${valueClass} truncate`}>{value}</p>
          <span className="shrink-0">{valueAction}</span>
        </div>
      ) : (
        <p className={valueClass}>{value}</p>
      ))}
    </div>
  );
}

const SECONDARY_CARD_SHELL =
  `bg-card border border-border rounded-sm px-4 py-3 w-full ${PRICE_SUMMARY_ROW_HEIGHT} flex flex-col justify-between overflow-hidden`;

function DiffBadge({
  label,
  value,
  positive,
  suffix,
  suffixEligible,
  className = "",
}: {
  label: string;
  value: string;
  positive: boolean;
  suffix?: string;
  suffixEligible?: boolean;
  className?: string;
}) {
  return (
    <div className={`${SECONDARY_CARD_SHELL} ${className}`}>
      <p className={`${LABEL_TEXT} text-muted-foreground truncate`}>{label}</p>
      <div className="flex items-baseline min-w-0">
        <span
          className={`${LIST_TEXT} font-mono font-semibold truncate min-w-0 ${
            value === "-"
              ? "text-muted-foreground/40"
              : positive
                ? "text-emerald-600"
                : "text-red-500"
          }`}
        >
          {value}
        </span>
        {suffix ? (
          <span
            className={`shrink-0 text-[13px] font-medium ${
              suffixEligible ? "text-emerald-600" : "text-orange-600"
            }`}
          >
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const TRADING_COUNT_VALUE = "text-[13px] leading-tight font-mono font-semibold";

function PriceInlineInput({
  active,
  onActivate,
  onDeactivate,
  value,
  onChange,
  display,
  title,
  accent,
  variant = "price",
}: {
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  value: string;
  onChange: (value: string) => void;
  display: string;
  title: string;
  accent?: "orange" | "green" | "primary";
  variant?: "price" | "trading";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const valueClass =
    variant === "trading"
      ? `${TRADING_COUNT_VALUE} ${display === "-" ? "text-muted-foreground/40" : "text-primary"}`
      : priceValueClass(display, accent);

  useEffect(() => {
    if (!active) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [active]);

  if (active) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode={variant === "price" ? "numeric" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onDeactivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            onDeactivate();
          }
        }}
        className={`w-full min-w-0 bg-input-background border border-border rounded-sm px-1.5 py-0.5 shadow-none focus:outline-none focus:ring-2 focus:ring-primary/20 ${valueClass}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      className={`${priceEditableButtonClass} ${valueClass} truncate block`}
      title={title}
    >
      {display}
    </button>
  );
}

function formatTradingCountDisplay(value: string): string {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => {
      const match = part.match(/(\d+)\s*건$/);
      return !match || Number(match[1]) > 0;
    });
  return parts.length > 0 ? parts.join(", ") : "-";
}

function TradingCountBadge({
  label,
  value,
  valueSlot,
}: {
  label: string;
  value: string;
  valueSlot?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={SECONDARY_CARD_SHELL}>
      <p className={`${LABEL_TEXT} text-muted-foreground truncate`}>{label}</p>
      {valueSlot ?? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          disabled={value === "-"}
          className={`${TRADING_COUNT_VALUE} text-left w-full ${
            expanded ? "whitespace-normal break-words" : "truncate"
          } ${value === "-" ? "text-muted-foreground/40 cursor-default" : "text-primary cursor-pointer"}`}
          title={value === "-" ? undefined : value}
        >
          {value}
        </button>
      )}
    </div>
  );
}

type DiffDisplay = {
  label: string;
  value: string;
  positive: boolean;
  suffix?: string;
  suffixEligible?: boolean;
};

function PriceColumn({
  priceLabel,
  priceValue,
  accent,
  diff,
  labelAction,
  valueAction,
  valueSlot,
  secondary,
}: {
  priceLabel: string;
  priceValue: string;
  accent?: "orange" | "green" | "primary";
  diff?: DiffDisplay | null;
  labelAction?: ReactNode;
  valueAction?: ReactNode;
  valueSlot?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0 w-full">
      <PriceCard
        label={priceLabel}
        value={priceValue}
        accent={accent}
        labelAction={labelAction}
        valueAction={valueAction}
        valueSlot={valueSlot}
      />
      {secondary}
      {diff ? (
        <DiffBadge
          label={diff.label}
          value={diff.value}
          positive={diff.positive}
          suffix={diff.suffix}
          suffixEligible={diff.suffixEligible}
        />
      ) : null}
    </div>
  );
}

export function AuctionDetailModal({
  item,
  onClose,
  onViewHistory,
  editable = false,
  onSaved,
  onDeleted,
  isFavorite = false,
  favoriteBusy = false,
  onToggleFavorite,
  onAiAnalysisClick,
  onDislike,
  onReviewed,
  loanRatio = null,
  appraisalRatio = null,
  loanPolicyLabel = null,
  requiredEquity: requiredEquityOverride = null,
  regulatedArea = null,
  incomeLoanLimit = null,
  existingLoanWon = null,
  firstTimeBuyer = false,
  annualNetIncome = null,
  creditScore = null,
  isAdmin = false,
  aiAnalysisLimit,
  aiAnalysisUsed,
  onAiAnalysisUsed,
}: {
  item: AuctionItem | null;
  onClose: () => void;
  onViewHistory?: (item: AuctionItem) => void;
  editable?: boolean;
  onSaved?: (item: AuctionItem) => void;
  onDeleted?: (id: string) => void;
  isFavorite?: boolean;
  favoriteBusy?: boolean;
  onToggleFavorite?: (next: boolean) => Promise<void>;
  onAiAnalysisClick?: (item: AuctionItem) => void;
  onDislike?: (item: AuctionItem) => void;
  onReviewed?: (item: AuctionItem) => void;
  loanRatio?: number | null;
  appraisalRatio?: number | null;
  loanPolicyLabel?: string | null;
  requiredEquity?: number | null;
  regulatedArea?: boolean | null;
  incomeLoanLimit?: number | null;
  existingLoanWon?: number | null;
  firstTimeBuyer?: boolean;
  annualNetIncome?: string | null;
  creditScore?: string | null;
  isAdmin?: boolean;
  aiAnalysisLimit?: number;
  aiAnalysisUsed?: number;
  onAiAnalysisUsed?: () => void;
}) {
  const [form, setForm] = useState<UpdateAuctionPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingHeader, setEditingHeader] = useState<HeaderEditKey | null>(null);
  const [editingPrice, setEditingPrice] = useState<PriceEditKey | null>(null);
  const [showMemo, setShowMemo] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "ai">("info");
  const [editingViews, setEditingViews] = useState(false);
  const auctionNoInputRef = useRef<HTMLInputElement>(null);
  const addressInputRef = useRef<HTMLTextAreaElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const stopEditingHeader = () => setEditingHeader(null);
  const stopEditingPrice = () => setEditingPrice(null);

  const activateHeaderEdit = (key: HeaderEditKey) => {
    setEditingPrice(null);
    setEditingHeader(key);
  };

  const activatePriceEdit = (key: PriceEditKey) => {
    setEditingHeader(null);
    setEditingPrice(key);
  };

  useEffect(() => {
    if (!item) return;
    setForm(toFormState(item));
    setError("");
    setEditingHeader(null);
    setEditingPrice(null);
    setShowMemo(false);
    setActiveTab("info");
    setEditingViews(false);
  }, [item]);

  // Push a history entry when the modal opens so mobile "back" closes the
  // modal instead of navigating past the list page that opened it.
  useEffect(() => {
    if (!item) return;
    window.history.pushState({ auctionDetailModal: true }, "");

    const onPopState = () => {
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      if (window.history.state?.auctionDetailModal) {
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  useEffect(() => {
    if (editingHeader === "auctionNo") {
      auctionNoInputRef.current?.focus();
      auctionNoInputRef.current?.select();
    }
    if (editingHeader === "address") {
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
    }
  }, [editingHeader]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [item, onClose]);

  const preview = useMemo(() => {
    if (!item || !form) return null;
    return { ...item, ...toPayload(form) };
  }, [item, form]);

  if (!item || !form || !preview) return null;

  const naverPrice = parsePreviewNumber(form.naverPrice);
  const minPrice = parsePreviewNumber(form.minPrice);
  const appraisedValue = parsePreviewNumber(form.appraisedValue);
  const failureRate = getFailureRateRatio(minPrice, appraisedValue);
  const isNewCase = failureRate === 100;
  const requiredEquity =
    requiredEquityOverride ??
    (loanRatio != null ? Math.ceil(minPrice * (1 - loanRatio)) : null);
  const salePriceRaw = form.salePrice;
  const salePrice =
    salePriceRaw == null || String(salePriceRaw).trim() === ""
      ? null
      : parsePreviewNumber(salePriceRaw);
  const naverId = String(form.naverId ?? item.naverId ?? "").trim();
  const hasNaver = hasNaverPrice(naverPrice);
  const naverPriceFloorLabel =
    item.naverPriceFloorLabel ?? (item.naverPriceFloor != null ? `${item.naverPriceFloor}층` : null);
  const naverPriceDisplay = hasNaver
    ? `${fmtEok(naverPrice)}${naverPriceFloorLabel ? ` (${naverPriceFloorLabel})` : ""}`
    : "-";

  const d1 =
    hasNaver && salePrice != null ? diff(naverPrice, salePrice) : null;
  const d2 = hasNaver ? diff(naverPrice, minPrice) : null;
  const d3 = hasNaver ? diff(naverPrice, appraisedValue) : null;
  const missingDiff = {
    value: "-",
    positive: true,
    suffixEligible: false as const,
  };

  const setField = (key: keyof UpdateAuctionPayload, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const rawPriceFormValue = (key: PriceEditKey): string => {
    const v = form[key];
    if (v == null) return "";
    return String(v);
  };

  const renderPriceField = (
    key: PriceEditKey,
    display: string,
    options?: {
      accent?: "orange" | "green" | "primary";
      title?: string;
      variant?: "price" | "trading";
    },
  ) => (
    <PriceInlineInput
      active={editingPrice === key}
      onActivate={() => activatePriceEdit(key)}
      onDeactivate={stopEditingPrice}
      value={rawPriceFormValue(key)}
      onChange={(v) => setField(key, v)}
      display={display}
      title={options?.title ?? "클릭하여 수정"}
      accent={options?.accent}
      variant={options?.variant}
    />
  );

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await updateAuction(item.id, toPayload(form));
      setForm(toFormState(saved));
      onSaved?.(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const label = item.auctionNo || item.address || "이 물건";
    if (!window.confirm(`${label}을(를) 삭제할까요?`)) return;

    setDeleting(true);
    setError("");
    try {
      await deleteAuction(item.id);
      onDeleted?.(item.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!onToggleFavorite) return;
    setFavoriteSaving(true);
    setError("");
    try {
      await onToggleFavorite(!isFavorite);
    } catch (err) {
      setError(err instanceof Error ? err.message : "관심물건 처리에 실패했습니다.");
    } finally {
      setFavoriteSaving(false);
    }
  };

  const favoriteDisabled = favoriteBusy || favoriteSaving;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-0 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

      <div
        className={`relative w-full ${editable ? "max-w-4xl" : "max-w-7xl"} sm:my-4 min-h-screen sm:min-h-0 bg-card border-0 sm:border border-border rounded-none sm:rounded-sm shadow-xl`}
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
      >
        <div className="hidden sm:flex sm:sticky sm:top-0 z-10 h-14 bg-white border-b border-border px-4 sm:px-5 items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ChevronLeft size={16} />
            <span>목록으로</span>
          </button>
          <div className="w-px h-5 bg-border shrink-0" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0 flex-1">
            <span className="hover:text-foreground cursor-pointer shrink-0">물건검색</span>
            <ChevronRight size={12} className="shrink-0" />
            <span className="font-mono font-medium text-foreground truncate">
              {(editable ? form.auctionNo : preview.auctionNo) || "경매번호 없음"}
            </span>
            {preview.isUpdated && <UpdatedBadge />}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!editable && onToggleFavorite && (
              <button
                type="button"
                onClick={handleToggleFavorite}
                disabled={favoriteDisabled}
                className={`h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50 ${
                  isFavorite
                    ? "bg-red-50 text-red-500 border-red-100"
                    : "text-muted-foreground hover:bg-secondary border-border"
                }`}
              >
                <Heart size={14} className={isFavorite ? "fill-current" : ""} />
                <span>{isFavorite ? "관심물건 해제" : "관심등록"}</span>
              </button>
            )}
            {!editable && preview.link && (
              <a
                href={preview.link}
                target="_blank"
                rel="noreferrer"
                className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary border border-border transition-colors"
              >
                <ExternalLink size={14} />
                <span>경매지정보</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-sm hover:bg-secondary transition-colors shrink-0"
              aria-label="닫기"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        <div
          className={`max-h-[100vh] sm:max-h-[calc(100vh-6rem)] overflow-y-auto ${editable ? "" : "sm:flex sm:items-start"}`}
          style={{ backgroundColor: "#f4f6f9" }}
        >
        <div className="flex-1 min-w-0">
          <div className="sm:pt-5 sm:px-5">
          <div className="relative h-40 sm:h-56 overflow-hidden bg-secondary rounded-none sm:rounded-xl">
            <img
              src={
                preview.usage === "아파트"
                  ? "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&h=500&fit=crop&auto=format"
                  : "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&h=500&fit=crop&auto=format"
              }
              alt={preview.usage || "물건"}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-white/90 backdrop-blur text-primary border border-white/60">
                {preview.propType}
              </span>
              {isNewCase && (
                <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-blue-500/90 backdrop-blur text-white">
                  신건
                </span>
              )}
            </div>
          </div>
          </div>

          <div className="flex sm:hidden items-center justify-between gap-2 bg-primary text-primary-foreground px-4 py-3">
            <p className="flex items-center gap-2 min-w-0 flex-1">
              <span className={`${LABEL_TEXT} bg-white/15 px-2 py-0.5 rounded-sm shrink-0`}>
                {preview.propType}
              </span>
              <span className={`font-mono font-bold ${SECTION_TEXT} truncate`}>
                {(editable ? form.auctionNo : preview.auctionNo) || "경매번호 없음"}
              </span>
              {preview.isUpdated && <UpdatedBadge variant="onDark" />}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  disabled={favoriteDisabled}
                  aria-label={isFavorite ? "관심물건 해제" : "관심물건 추가"}
                  className={`p-1.5 rounded-sm transition-colors disabled:opacity-50 ${
                    isFavorite ? "bg-rose-500/25 hover:bg-rose-500/35" : "hover:bg-white/15"
                  }`}
                >
                  <Heart size={16} className={isFavorite ? "fill-current text-rose-200" : ""} />
                </button>
              )}
              {preview.link && (
                <a
                  href={preview.link}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="경매지정보"
                  className="p-1.5 rounded-sm hover:bg-white/15 transition-colors"
                >
                  <ExternalLink size={16} />
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="p-1.5 rounded-sm hover:bg-white/15 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {editable && (
          <div className="hidden sm:block px-5 py-4 border-b border-border bg-secondary/10">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
              <div className="min-w-0 flex-1">
                <span className={`inline-block mb-2 ${LABEL_TEXT} bg-secondary px-2 py-0.5 rounded-sm text-foreground/70`}>
                  수정 가능
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <HeaderSpecialNote
                    value={String(form.specialNote ?? "")}
                    editable
                    active={editingHeader === "specialNote"}
                    onActivate={() => activateHeaderEdit("specialNote")}
                    onDeactivate={stopEditingHeader}
                    onChange={(v) => setField("specialNote", v)}
                    onDark={false}
                  />
                </div>
                {preview.isUpdated && preview.updatedAt && (
                  <p className={`mt-1 ${LABEL_TEXT} text-muted-foreground`}>
                    최근 갱신 {new Date(preview.updatedAt).toLocaleString("ko-KR")}
                    {preview.updatedBy ? ` · ${preview.updatedBy}` : ""}
                  </p>
                )}
                <div className="mt-2 flex items-start gap-2">
                  <MapPin size={16} className="shrink-0 mt-0.5 opacity-60" />
                  {editingHeader === "address" ? (
                    <textarea
                      ref={addressInputRef}
                      rows={2}
                      value={form.address}
                      onChange={(e) => setField("address", e.target.value)}
                      onBlur={() => setEditingHeader(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setEditingHeader(null);
                        }
                      }}
                      placeholder="물건주소"
                      className={`${headerFieldClass} ${LIST_TEXT} leading-relaxed resize-y min-h-[2.75rem] flex-1`}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => activateHeaderEdit("address")}
                      className={`${headerEditableButtonClass} ${LIST_TEXT} text-foreground leading-relaxed flex-1 min-w-0 text-left`}
                      title="클릭하여 물건주소 수정"
                    >
                      {form.address || "-"}
                    </button>
                  )}
                </div>
                <div className={`mt-2 flex flex-col gap-y-1 ${LABEL_TEXT} text-muted-foreground`}>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={14} />
                      {preview.city} {preview.district}
                    </span>
                    <HeaderInlineInput
                      active={editingHeader === "area"}
                      onActivate={() => activateHeaderEdit("area")}
                      onDeactivate={stopEditingHeader}
                      value={parseAreaNumber(form.area)}
                      onChange={(v) => setField("area", v)}
                      display={<AreaLabel area={form.area} />}
                      placeholder="면적"
                      title="클릭하여 면적 수정"
                      compact
                    />
                    <HeaderInlineInput
                      active={editingHeader === "builtYear"}
                      onActivate={() => activateHeaderEdit("builtYear")}
                      onDeactivate={stopEditingHeader}
                      value={String(form.builtYear ?? "")}
                      onChange={(v) => setField("builtYear", v)}
                      display={form.builtYear ? `${form.builtYear}년` : "-"}
                      placeholder="연식"
                      title="클릭하여 연식 수정"
                      compact
                    />
                    <HeaderInlineInput
                      active={editingHeader === "totalUnits"}
                      onActivate={() => activateHeaderEdit("totalUnits")}
                      onDeactivate={stopEditingHeader}
                      value={String(form.totalUnits ?? "")}
                      onChange={(v) => setField("totalUnits", v)}
                      display={formatTotalUnitsLabel(form.totalUnits)}
                      placeholder="세대수"
                      title="클릭하여 총 세대수 수정"
                      compact
                    />
                    <HeaderInlineInput
                      active={editingHeader === "officialLandPrice"}
                      onActivate={() => activateHeaderEdit("officialLandPrice")}
                      onDeactivate={stopEditingHeader}
                      value={String(form.officialLandPrice ?? "")}
                      onChange={(v) => setField("officialLandPrice", v)}
                      display={formatOfficialLandPriceLabel(form.officialLandPrice)}
                      placeholder="공시가"
                      title="클릭하여 공시가 수정"
                      compact
                    />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={14} />
                      입찰{" "}
                      <HeaderInlineInput
                        active={editingHeader === "bidDate"}
                        onActivate={() => activateHeaderEdit("bidDate")}
                        onDeactivate={stopEditingHeader}
                        value={String(form.bidDate ?? "")}
                        onChange={(v) => setField("bidDate", v)}
                        display={form.bidDate || "-"}
                        placeholder="입찰기일"
                        title="클릭하여 입찰기일 수정"
                        compact
                      />
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto sm:shrink-0">
                {onToggleFavorite && (
                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    disabled={favoriteDisabled}
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} border rounded-sm transition-colors disabled:opacity-50 ${
                      isFavorite
                        ? "bg-rose-500/10 border-rose-300 text-rose-600 hover:bg-rose-500/15"
                        : "bg-card border-border hover:bg-secondary"
                    }`}
                  >
                    <Heart size={14} className={isFavorite ? "fill-current text-rose-500" : ""} />
                    {isFavorite ? "관심물건 해제" : "관심물건 추가"}
                  </button>
                )}
                {onDislike && (
                  <button
                    type="button"
                    onClick={() => onDislike(item)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} bg-card border border-border rounded-sm hover:bg-secondary transition-colors`}
                  >
                    관심없음
                  </button>
                )}
                {onReviewed && (
                  <button
                    type="button"
                    onClick={() => onReviewed(item)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} bg-card border border-border rounded-sm hover:bg-secondary transition-colors`}
                  >
                    검토완료
                  </button>
                )}
                {onViewHistory && (
                  <button
                    type="button"
                    onClick={() => onViewHistory(item)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} bg-card border border-border rounded-sm hover:bg-secondary transition-colors`}
                  >
                    <History size={14} />
                    변경 이력
                  </button>
                )}
                {preview.link && (
                  <a
                    href={preview.link}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} bg-card border border-border rounded-sm hover:bg-secondary transition-colors`}
                  >
                    <ExternalLink size={14} />
                    경매지정보
                  </a>
                )}
              </div>
            </div>
          </div>
          )}

          <div className="sticky top-0 z-10 bg-card border-b border-border flex items-center sm:px-5">
            <button
              type="button"
              onClick={() => setActiveTab("info")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-semibold border-b-2 -mb-px transition-all ${
                activeTab === "info"
                  ? "border-primary text-primary bg-primary/[0.02]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              <Home size={14} />
              기본정보
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("ai");
                onAiAnalysisClick?.(item);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-semibold border-b-2 -mb-px transition-all ${
                activeTab === "ai"
                  ? "border-primary text-primary bg-primary/[0.02]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              <Brain size={14} />
              AI에게 물어보기
            </button>
          </div>

          <div className="bg-card px-5 py-5 space-y-6">
          {activeTab === "ai" ? (
            item && (
              <AuctionAnalysisPanel
                auctionId={item.id}
                isAdmin={isAdmin}
                aiAnalysisLimit={aiAnalysisLimit}
                aiAnalysisUsed={aiAnalysisUsed}
                onAnalysisUsed={onAiAnalysisUsed}
              />
            )
          ) : (
          <>
          {!editable && (
            <div className="rounded-2xl bg-card border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
                <Home size={16} className="text-muted-foreground" />
                <h3 className="text-sm font-bold text-foreground">기본 물건 정보</h3>
              </div>
              <div className="px-5 py-4">
                {(() => {
                  const noteText = String(preview.specialNote ?? "").trim();
                  const hasNote = noteText && noteText !== "없음";
                  return (
                    <>
                      {hasNote && (
                        <p className="text-[0.82rem] font-semibold text-red-600 mb-3">{noteText}</p>
                      )}
                      <p className="text-sm font-medium text-foreground mb-4 flex items-start gap-2">
                        <MapPin size={15} className="shrink-0 mt-0.5 text-muted-foreground" />
                        <span>{preview.address || "-"}</span>
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                        <DataRow label="소유자" value={preview.owner || "-"} />
                        <DataRow label="전용면적" value={<AreaLabel area={preview.area} />} />
                        <DataRow label="사용승인일" value={preview.builtYear ? `${preview.builtYear}년` : "-"} />
                        <DataRow label="총 세대수" value={formatTotalUnitsLabel(preview.totalUnits)} />
                        <DataRow label="공시가격" value={formatOfficialLandPriceLabel(preview.officialLandPrice)} />
                        <DataRow label="입찰기일" value={preview.bidDate || "-"} />
                      </div>
                    </>
                  );
                })()}
              </div>

              {(onDislike || onReviewed || onViewHistory) && (
                <div className="flex items-center flex-wrap gap-2 px-5 py-4 border-t border-border/50">
                  {onDislike && (
                    <button
                      type="button"
                      onClick={() => onDislike(item)}
                      className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs text-muted-foreground border border-border hover:bg-secondary transition-colors"
                    >
                      관심없음
                    </button>
                  )}
                  {onReviewed && (
                    <button
                      type="button"
                      onClick={() => onReviewed(item)}
                      className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs text-muted-foreground border border-border hover:bg-secondary transition-colors"
                    >
                      검토완료
                    </button>
                  )}
                  {onViewHistory && (
                    <button
                      type="button"
                      onClick={() => onViewHistory(item)}
                      className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs text-muted-foreground border border-border hover:bg-secondary transition-colors"
                    >
                      <History size={14} />
                      변경 이력
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Home size={16} className="text-muted-foreground" />
                <h3 className="text-sm font-bold text-foreground">물건 요약</h3>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowMemo((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 ${LABEL_TEXT} font-medium rounded-sm border transition-colors ${
                    showMemo
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : preview.memo
                        ? "border-amber-200/80 bg-amber-50/80 text-amber-700 hover:bg-amber-50"
                        : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  <StickyNote size={14} />
                  {showMemo ? "메모닫기" : "메모보기"}
                </button>
                <span className={`${LABEL_TEXT} text-muted-foreground inline-flex items-center gap-1`}>
                  조회수{" "}
                  {editable && editingViews ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      value={String(form.views ?? "")}
                      onChange={(e) => setField("views", e.target.value)}
                      onBlur={() => setEditingViews(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") {
                          e.preventDefault();
                          setEditingViews(false);
                        }
                      }}
                      className="w-16 px-1.5 py-0.5 text-foreground bg-input-background border border-border rounded-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                    />
                  ) : editable ? (
                    <button
                      type="button"
                      onClick={() => setEditingViews(true)}
                      className="font-mono text-foreground hover:bg-secondary/60 rounded-sm px-1 -mx-1 transition-colors"
                      title="클릭하여 조회수 수정"
                    >
                      {fmt(Number(form.views) || 0)}
                    </button>
                  ) : (
                    <span className="font-mono text-foreground">{fmt(preview.views)}</span>
                  )}
                </span>
              </div>
            </div>
            <div className="px-5 py-4">
            {showMemo && (
              <div className="mb-3 rounded-sm border border-amber-200/80 bg-amber-50/50 px-4 py-3">
                {editable ? (
                  <textarea
                    rows={3}
                    value={String(form.memo ?? "")}
                    onChange={(e) => setField("memo", e.target.value)}
                    placeholder="메모 입력"
                    className={`w-full ${LIST_TEXT} bg-input-background border border-border rounded-sm px-3 py-2 text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/20`}
                  />
                ) : (
                  <p className={`${LIST_TEXT} text-foreground whitespace-pre-wrap break-words`}>
                    {preview.memo?.trim() ? preview.memo : "메모 없음"}
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <PriceColumn
                priceLabel="감정가"
                priceValue={appraisedValue ? fmtEok(appraisedValue) : "-"}
                valueSlot={
                  editable
                    ? renderPriceField(
                        "appraisedValue",
                        appraisedValue ? fmtEok(appraisedValue) : "-",
                        { title: "클릭하여 감정가 수정" },
                      )
                    : undefined
                }
                diff={
                  d3
                    ? {
                        label: "호가 - 감정가",
                        value: d3.val,
                        positive: d3.positive,
                        suffix: newCaseAppraisedSuffix(d3.amount),
                        suffixEligible: d3.amount >= BID_THRESHOLD,
                      }
                    : {
                        label: "호가 - 감정가",
                        ...missingDiff,
                      }
                }
              />
              <PriceColumn
                priceLabel="최저가"
                priceValue={minPrice ? fmtEok(minPrice) : "-"}
                accent="orange"
                valueSlot={
                  editable
                    ? renderPriceField(
                        "minPrice",
                        minPrice ? fmtEok(minPrice) : "-",
                        { accent: "orange", title: "클릭하여 최저가 수정" },
                      )
                    : undefined
                }
                diff={
                  d2
                    ? {
                        label: "호가 - 최저가",
                        value: d2.val,
                        positive: d2.positive,
                        suffix: minPriceBidSuffix(d2.amount),
                        suffixEligible: d2.amount >= BID_THRESHOLD,
                      }
                    : {
                        label: "호가 - 최저가",
                        ...missingDiff,
                      }
                }
              />
              <PriceColumn
                priceLabel="네이버 호가"
                priceValue={naverPriceDisplay}
                accent="primary"
                labelAction={<NaverComplexLink naverId={naverId} inLabelRow />}
                valueSlot={
                  editable
                    ? renderPriceField("naverPrice", naverPriceDisplay, {
                        accent: "primary",
                        title: "클릭하여 네이버 호가 수정",
                      })
                    : undefined
                }
                secondary={
                  <TradingCountBadge
                    label="실거래 건수"
                    value={
                      editable
                        ? preview.tradingCount || "-"
                        : formatTradingCountDisplay(preview.tradingCount || "-")
                    }
                    valueSlot={
                      editable
                        ? renderPriceField(
                            "tradingCount",
                            preview.tradingCount || "-",
                            { variant: "trading", title: "클릭하여 실거래 건수 수정" },
                          )
                        : undefined
                    }
                  />
                }
              />
              <PriceColumn
                priceLabel="낙찰가"
                priceValue={salePrice ? fmtEok(salePrice) : "-"}
                accent="green"
                valueSlot={
                  editable
                    ? renderPriceField(
                        "salePrice",
                        salePrice ? fmtEok(salePrice) : "-",
                        { accent: "green", title: "클릭하여 낙찰가 수정" },
                      )
                    : undefined
                }
                diff={
                  d1
                    ? { label: "호가 - 낙찰가", value: d1.val, positive: d1.positive }
                    : hasNaver
                      ? { label: "호가 - 낙찰가", value: "-", positive: true }
                      : { label: "호가 - 낙찰가", ...missingDiff }
                }
              />
            </div>
            </div>
          </div>

          {!editable && (
            <div className="rounded-2xl bg-card border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
                <MapPin size={16} className="text-muted-foreground" />
                <h3 className="text-sm font-bold text-foreground">소재지</h3>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div>
                  <p className="text-[0.72rem] text-muted-foreground mb-0.5">지번 주소</p>
                  <p className="text-sm font-medium text-foreground">{preview.address || "-"}</p>
                </div>
                {preview.address ? (
                  <a
                    href={`https://map.naver.com/p/search/${encodeURIComponent(preview.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 h-40 rounded-xl bg-[#EEF1F6] border border-border flex items-center justify-center overflow-hidden relative group hover:border-primary/40 transition-colors"
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage:
                          "linear-gradient(rgba(30,58,95,0.04) 1px, transparent 1px), linear-gradient(90deg,rgba(30,58,95,0.04) 1px, transparent 1px)",
                        backgroundSize: "20px 20px",
                      }}
                    />
                    <div className="relative z-10 flex flex-col items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
                      <MapPin size={28} className="text-primary/40 group-hover:text-primary" />
                      <span className="text-xs font-medium">네이버 지도에서 보기</span>
                    </div>
                  </a>
                ) : (
                  <div className="mt-2 h-40 rounded-xl bg-[#EEF1F6] border border-border flex items-center justify-center overflow-hidden relative">
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage:
                          "linear-gradient(rgba(30,58,95,0.04) 1px, transparent 1px), linear-gradient(90deg,rgba(30,58,95,0.04) 1px, transparent 1px)",
                        backgroundSize: "20px 20px",
                      }}
                    />
                    <div className="relative z-10 flex flex-col items-center gap-2 text-muted-foreground">
                      <MapPin size={28} className="text-primary/40" />
                      <span className="text-xs">주소 정보 없음</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {editable ? (
            <>
              {AUCTION_FIELD_GROUPS.map((group) => {
                const fields = detailVisibleFields(group);
                if (fields.length === 0) return null;

                return (
                <section key={group.title}>
                  <h3 className={`${SECTION_TEXT} font-semibold text-foreground mb-3 pb-2 border-b border-border`}>
                    {group.title}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    {fields.map((field) => (
                      <div key={field.key} className={field.full ? "sm:col-span-2" : ""}>
                        <label className={`block ${LABEL_TEXT} text-muted-foreground mb-1.5 flex items-center gap-1.5`}>
                          <span>{field.label}</span>
                          {field.key === "priceDetail" && (
                            <NaverComplexLink naverId={naverId} compact />
                          )}
                        </label>
                        {field.key === "tenantInfo" ? (
                          <TenantInfoField
                            value={String(form.tenantInfo ?? "")}
                            editable
                            onChange={(v) => setField("tenantInfo", v)}
                          />
                        ) : field.key === "tenantDetail" ? (
                          <textarea
                            rows={10}
                            value={
                              displayTenantDetail(String(form.tenantDetail ?? "")) ||
                              String(form.tenantDetail ?? "")
                            }
                            onChange={(e) => setField("tenantDetail", e.target.value)}
                            className="w-full bg-input-background border border-border rounded-sm px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y min-h-[10rem]"
                          />
                        ) : isExpandableDetailField(field.key) ? (
                          <ExpandableDetailField
                            label={field.label}
                            value={String(form[field.key] ?? "")}
                            editable
                            onChange={(v) => setField(field.key, v)}
                            valueClassName={
                              field.key === "buildingRegistry"
                                ? buildingRegistryClassName(String(form.buildingRegistry ?? ""))
                                : ""
                            }
                          />
                        ) : (
                          <AuctionFieldInput
                            field={field}
                            value={form[field.key] as string | number | null}
                            onChange={(v) => setField(field.key, v)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
                );
              })}

              {error && (
                <p className={`${LIST_TEXT} text-destructive border border-destructive/30 bg-destructive/5 rounded-sm px-3 py-2`}>
                  {error}
                </p>
              )}
            </>
          ) : (
            AUCTION_FIELD_GROUPS.map((group) => {
              const fields = detailVisibleFields(group).filter((field) => {
                if (field.key === "owner" || field.key === "tenantInfo") return false;
                if (field.key === "recordTime" && !isAdmin) return false;
                if (field.key === "bidInfo") {
                  const bidInfoValue = String(item.bidInfo ?? "").trim();
                  return bidInfoValue && bidInfoValue !== "없음";
                }
                return true;
              });
              if (fields.length === 0) return null;

              return (
                <div key={group.title} className="rounded-2xl bg-card border border-border overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
                    <FileText size={16} className="text-muted-foreground" />
                    <h3 className="text-sm font-bold text-foreground">{group.title}</h3>
                  </div>
                  <div className="px-5 py-4">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                      {fields.map((field) => {
                        const value = formatFieldValue(field.key, item);
                        const isFull = field.full;

                        return (
                          <div key={field.key} className={isFull ? "col-span-2 min-w-0" : "min-w-0"}>
                            <p className="text-[0.68rem] text-muted-foreground mb-1 flex items-center gap-1.5">
                              <span>{field.label}</span>
                              {field.key === "priceDetail" && (
                                <NaverComplexLink naverId={naverId} compact />
                              )}
                            </p>
                            <div className="text-[0.82rem] font-medium text-foreground break-words min-w-0">
                              {field.key === "tenantInfo" ? (
                                <TenantInfoField
                                  value={String(item.tenantInfo ?? "")}
                                  editable={false}
                                />
                              ) : field.key === "tenantDetail" ? (
                                <TenantStatusPanel value={String(item.tenantDetail ?? "")} />
                              ) : field.key === "priceDetail" ? (
                                <ListingPriceTable
                                  value={
                                    hasNaverPrice(item.naverPrice)
                                      ? String(item.priceDetail ?? "")
                                      : "-"
                                  }
                                />
                              ) : field.key === "tradingDetail" ? (
                                <TransactionDetailTable value={String(item.tradingDetail ?? "")} />
                              ) : field.key === "education" ? (
                                <EducationTable value={String(item.education ?? "")} />
                              ) : field.key === "buildingRegistry" ? (
                                <RegistryTable value={String(item.buildingRegistry ?? "")} />
                              ) : isExpandableDetailField(field.key) ? (
                                <ExpandableDetailField
                                  label={field.label}
                                  value={String(item[field.key as keyof AuctionItem] ?? "")}
                                />
                              ) : (
                                value
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          </>
          )}
          </div>
        </div>

        {!editable && (
          <div className="hidden sm:block w-[280px] shrink-0 bg-secondary/10 px-5 py-5 space-y-4">
            {requiredEquity != null && (
              <div
                className="rounded-xl p-4"
                style={{ background: "linear-gradient(135deg,#EEF4FF,#F0F5FF)", border: "1px solid rgba(42,82,152,0.15)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[0.68rem] font-bold text-primary/60 uppercase tracking-wider" style={{ fontFamily: "'Inter', sans-serif" }}>
                    최소 투자금
                  </span>
                  {regulatedArea != null && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[0.6rem] font-semibold ${
                        regulatedArea ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {regulatedArea ? "규제지역" : "비규제지역"}
                    </span>
                  )}
                </div>
                <p className="text-[1.5rem] font-bold text-primary leading-none mt-1 mb-0.5" style={{ fontFamily: "'Inter', sans-serif" }}>
                  {formatWonShort(requiredEquity)}
                </p>
                {loanPolicyLabel && (
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                    <span className="text-[0.68rem] text-primary/50">
                      {housingLoanLabel(loanPolicyLabel, firstTimeBuyer)}
                    </span>
                    {annualNetIncome && (
                      <span className="text-[0.68rem] text-primary/35">· 소득 {annualNetIncome}</span>
                    )}
                    {existingLoanWon != null && (
                      <span className="text-[0.68rem] text-primary/35">
                        · 기존대출 {existingLoanWon > 0 ? formatWonShort(existingLoanWon) : "0원"}
                      </span>
                    )}
                    {creditScore && (
                      <span className="text-[0.68rem] text-primary/35">· 신용 {creditScore}</span>
                    )}
                  </div>
                )}
                {(() => {
                  const byAppraisal =
                    appraisalRatio != null ? Math.floor(appraisedValue * appraisalRatio) : null;
                  const byMinPrice = loanRatio != null ? Math.floor(minPrice * loanRatio) : null;
                  const limits = [byAppraisal, byMinPrice, incomeLoanLimit].filter(
                    (v): v is number => v != null,
                  );
                  const lowestLimit = limits.length > 0 ? Math.min(...limits) : null;
                  const finalLoanAmount = Math.max(0, minPrice - requiredEquity);

                  const LimitRow = ({
                    label,
                    value,
                  }: {
                    label: string;
                    value: number;
                  }) => {
                    const isLowest = lowestLimit != null && value === lowestLimit;
                    return (
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[0.7rem] ${isLowest ? "font-semibold text-primary" : "text-primary/55"}`}
                        >
                          {label}
                        </span>
                        <span
                          className={`text-[0.8rem] font-semibold ${isLowest ? "text-primary" : "text-primary/55"}`}
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          {formatWonShort(value)}
                          {isLowest && (
                            <span className="ml-1 text-[0.58rem] font-bold text-blue-500 align-middle">
                              최저
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  };

                  return (
                    <div className="mt-3 pt-3 border-t border-primary/10 space-y-3">
                      {limits.length > 0 && (
                        <div className="rounded-lg bg-white/60 border border-primary/10 px-3 py-2.5 space-y-1.5">
                          <p className="text-[0.62rem] font-bold text-primary/40 uppercase tracking-wider mb-1.5">
                            대출 기준액 비교
                          </p>
                          {byAppraisal != null && appraisalRatio != null && (
                            <LimitRow
                              label={`감정가 ${Math.round(appraisalRatio * 100)}%`}
                              value={byAppraisal}
                            />
                          )}
                          {byMinPrice != null && loanRatio != null && (
                            <LimitRow
                              label={`낙찰가 ${Math.round(loanRatio * 100)}%`}
                              value={byMinPrice}
                            />
                          )}
                          {incomeLoanLimit != null && (
                            <LimitRow label="소득적용대출" value={incomeLoanLimit} />
                          )}
                        </div>
                      )}

                      {existingLoanWon != null && existingLoanWon > 0 && (
                        <div className="flex items-center justify-center gap-1.5 text-[0.68rem] text-red-500">
                          <span>기존대출 차감</span>
                          <span className="font-semibold">-{formatWonShort(existingLoanWon)}</span>
                        </div>
                      )}

                      <div className="rounded-lg px-3 py-2.5 space-y-1.5" style={{ background: "rgba(42,82,152,0.08)" }}>
                        <div className="flex items-center justify-between">
                          <span className="text-[0.72rem] font-semibold text-primary/70">최종대출금</span>
                          <span className="text-[0.95rem] font-bold text-primary" style={{ fontFamily: "'Inter', sans-serif" }}>
                            {formatWonShort(finalLoanAmount)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[0.72rem] font-semibold text-primary/70">최소투자금</span>
                          <span className="text-[0.95rem] font-bold text-primary" style={{ fontFamily: "'Inter', sans-serif" }}>
                            {formatWonShort(requiredEquity)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[0.72rem] text-primary/60 flex items-center gap-1">
                          최저입찰가
                          {failureRate != null && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-600 text-[0.6rem] font-bold border border-blue-200">
                              {failureRate}%
                            </span>
                          )}
                        </span>
                        <span className="text-[0.8rem] font-semibold text-primary" style={{ fontFamily: "'Inter', sans-serif" }}>
                          {fmtEok(minPrice)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[0.72rem] text-primary/60">감정가</span>
                        <span className="text-[0.8rem] font-semibold text-primary/70" style={{ fontFamily: "'Inter', sans-serif" }}>
                          {fmtEok(appraisedValue)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="rounded-xl bg-card border border-border p-4 space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
                <Clock size={16} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-[0.72rem] font-semibold text-amber-700">다음 기일</p>
                  <p className="text-[0.82rem] font-bold text-amber-800" style={{ fontFamily: "'Inter', sans-serif" }}>
                    {preview.bidDate || "-"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("ai");
                  onAiAnalysisClick?.(item);
                }}
                className="w-full h-10 rounded-xl text-sm font-medium text-primary border border-primary/20 bg-primary/4 hover:bg-primary/8 transition-all"
              >
                AI 권리분석 요청
              </button>
            </div>

            <div className="rounded-xl bg-card border border-border p-4 space-y-3">
              {[
                { icon: <Building2 size={14} />, label: "소재지", value: `${preview.city} ${preview.district}` },
                { icon: <Calendar size={14} />, label: "입찰기일", value: preview.bidDate || "-" },
              ].map(({ icon, label, value }, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-4 h-4 flex items-center justify-center text-muted-foreground flex-shrink-0 mt-0.5">{icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.65rem] text-muted-foreground">{label}</p>
                    <p className="text-[0.78rem] font-medium text-foreground truncate">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>

        {activeTab === "info" && editable && (
          <div className="px-5 py-3 border-t border-border bg-secondary/20 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={saving || deleting}
              className={`flex items-center gap-1.5 px-4 py-2 ${LIST_TEXT} font-medium text-destructive border border-destructive/30 rounded-sm hover:bg-destructive/5 transition-colors disabled:opacity-50`}
            >
              <Trash2 size={16} />
              {deleting ? "삭제 중..." : "삭제"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || deleting}
                className={`flex items-center gap-1.5 px-5 py-2 ${LIST_TEXT} font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent transition-colors disabled:opacity-50`}
              >
                <Save size={16} />
                {saving ? "저장 중..." : "저장"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={deleting}
                className={`px-5 py-2 ${LIST_TEXT} font-medium border border-border rounded-sm hover:bg-secondary transition-colors disabled:opacity-50`}
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
