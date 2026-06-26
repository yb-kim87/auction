'use client';

import { useState, useRef, useCallback, useEffect } from "react";
import { Search, RotateCcw, ChevronDown, ExternalLink, StickyNote, ChevronUp, ChevronsUpDown } from "lucide-react";
import { MOCK_DATA, type AuctionItem } from "@/mocks/items";
import { CITIES, getDistricts, getWards, matchDistrict, normalizeCity } from "@/data/korea-regions";

// ─── Column Definitions ───────────────────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  defaultWidth: number;
  align?: "left" | "right" | "center";
  sticky?: boolean;
  render: (row: AuctionItem) => React.ReactNode;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const fmtEok = (n: number) => {
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return fmt(n);
};
const diff = (a: number, b: number) => {
  const d = a - b;
  const sign = d >= 0 ? "+" : "";
  return { val: `${sign}${fmtEok(d)}`, positive: d >= 0 };
};

const COLUMNS: ColDef[] = [
  { key: "memo", label: "메모", defaultWidth: 80, sticky: true, render: (r) => r.memo ? <span className="text-amber-600"><StickyNote size={13} className="inline mr-1" />{r.memo}</span> : <span className="text-muted-foreground/40">-</span> },
  { key: "link", label: "링크", defaultWidth: 56, align: "center", render: (r) => <a href={r.link} target="_blank" rel="noreferrer" className="text-primary hover:text-accent"><ExternalLink size={13} /></a> },
  { key: "views", label: "조회수", defaultWidth: 68, align: "right", render: (r) => <span className="font-mono text-xs">{fmt(r.views)}</span> },
  { key: "auctionNo", label: "경매번호", defaultWidth: 140, render: (r) => <span className="font-mono text-xs text-primary font-semibold">{r.auctionNo}</span> },
  { key: "address", label: "물건주소", defaultWidth: 280, render: (r) => <span className="text-xs">{r.address}</span> },
  { key: "totalUnits", label: "총 세대수", defaultWidth: 80, align: "right", render: (r) => <span className="font-mono text-xs">{fmt(r.totalUnits)}</span> },
  { key: "usage", label: "용도", defaultWidth: 72, align: "center", render: (r) => <span className="text-xs">{r.usage}</span> },
  { key: "area", label: "평형", defaultWidth: 64, align: "center", render: (r) => <span className="text-xs font-medium">{r.area}</span> },
  { key: "builtYear", label: "연식", defaultWidth: 64, align: "center", render: (r) => <span className="font-mono text-xs">{r.builtYear}년</span> },
  { key: "bidDate", label: "입찰기일", defaultWidth: 96, align: "center", render: (r) => <span className="font-mono text-xs">{r.bidDate}</span> },
  { key: "appraisedValue", label: "감정가", defaultWidth: 96, align: "right", render: (r) => <span className="font-mono text-xs">{fmtEok(r.appraisedValue)}</span> },
  { key: "minPrice", label: "최저가", defaultWidth: 96, align: "right", render: (r) => <span className="font-mono text-xs text-orange-600 font-semibold">{fmtEok(r.minPrice)}</span> },
  { key: "salePrice", label: "매각가", defaultWidth: 96, align: "right", render: (r) => r.salePrice ? <span className="font-mono text-xs text-emerald-600 font-semibold">{fmtEok(r.salePrice)}</span> : <span className="text-muted-foreground/40 text-xs">-</span> },
  { key: "naverPrice", label: "네이버 호가", defaultWidth: 100, align: "right", render: (r) => <span className="font-mono text-xs">{fmtEok(r.naverPrice)}</span> },
  { key: "diff1", label: "호가-매각가", defaultWidth: 100, align: "right", render: (r) => { if (!r.salePrice) return <span className="text-muted-foreground/40 text-xs">-</span>; const d = diff(r.naverPrice, r.salePrice); return <span className={`font-mono text-xs font-semibold ${d.positive ? "text-emerald-600" : "text-red-500"}`}>{d.val}</span>; } },
  { key: "diff2", label: "호가-최저가", defaultWidth: 100, align: "right", render: (r) => { const d = diff(r.naverPrice, r.minPrice); return <span className={`font-mono text-xs font-semibold ${d.positive ? "text-emerald-600" : "text-red-500"}`}>{d.val}</span>; } },
  { key: "diff3", label: "호가-감정가", defaultWidth: 100, align: "right", render: (r) => { const d = diff(r.naverPrice, r.appraisedValue); return <span className={`font-mono text-xs font-semibold ${d.positive ? "text-emerald-600" : "text-red-500"}`}>{d.val}</span>; } },
  { key: "tradingCount", label: "실거래건수", defaultWidth: 80, align: "right", render: (r) => <span className="font-mono text-xs">{r.tradingCount}</span> },
  { key: "bidInfo", label: "입찰정보", defaultWidth: 96, align: "center", render: (r) => <span className="text-xs">{r.bidInfo}</span> },
  { key: "owner", label: "소유자", defaultWidth: 72, align: "center", render: (r) => <span className="text-xs">{r.owner}</span> },
  { key: "appraiser", label: "감정원", defaultWidth: 120, render: (r) => <span className="text-xs">{r.appraiser}</span> },
  { key: "officialLandPrice", label: "공시지가", defaultWidth: 96, align: "right", render: (r) => <span className="font-mono text-xs">{fmtEok(r.officialLandPrice)}</span> },
  { key: "tenantInfo", label: "임차정보", defaultWidth: 160, render: (r) => <span className="text-xs">{r.tenantInfo}</span> },
  { key: "specialNote", label: "특이사항", defaultWidth: 160, render: (r) => <span className="text-xs text-red-600">{r.specialNote}</span> },
  { key: "elevator", label: "승강기", defaultWidth: 96, align: "center", render: (r) => <span className="text-xs">{r.elevator}</span> },
  { key: "parking", label: "주차장", defaultWidth: 120, render: (r) => <span className="text-xs">{r.parking}</span> },
  { key: "landShare", label: "토지지분", defaultWidth: 80, align: "right", render: (r) => <span className="font-mono text-xs">{r.landShare}</span> },
  { key: "buildingRegistry", label: "건물등기", defaultWidth: 100, render: (r) => <span className={`text-xs ${r.buildingRegistry !== "이상없음" ? "text-red-500 font-semibold" : "text-emerald-600"}`}>{r.buildingRegistry}</span> },
  { key: "education", label: "교육환경", defaultWidth: 140, render: (r) => <span className="text-xs">{r.education}</span> },
  { key: "tenantDetail", label: "임차상세", defaultWidth: 180, render: (r) => <span className="text-xs text-muted-foreground">{r.tenantDetail}</span> },
  { key: "priceDetail", label: "호가 상세", defaultWidth: 160, render: (r) => <span className="text-xs text-muted-foreground">{r.priceDetail}</span> },
  { key: "tradingDetail", label: "실거래 상세", defaultWidth: 100, render: (r) => <span className="text-xs text-muted-foreground">{r.tradingDetail}</span> },
  { key: "recordTime", label: "기록시간", defaultWidth: 136, align: "center", render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.recordTime}</span> },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SelectEl({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className={`w-full appearance-none bg-card border border-border rounded-sm px-3 py-2.5 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors ${disabled ? "opacity-40 cursor-not-allowed bg-muted" : "hover:border-primary/50 cursor-pointer"} ${!value ? "text-muted-foreground" : ""}`}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={13} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${disabled ? "opacity-30" : "opacity-50"}`} />
    </div>
  );
}

function NumberInput({ value, onChange, placeholder, unit }: {
  value: string; onChange: (v: string) => void; placeholder: string; unit?: string;
}) {
  const formatted = value ? Number(value).toLocaleString("ko-KR") : "";
  return (
    <div className="relative">
      <input type="text" inputMode="numeric" value={formatted} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        className="w-full bg-card border border-border rounded-sm px-3 py-2.5 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary hover:border-primary/50 transition-colors placeholder:text-muted-foreground placeholder:font-sans" />
      {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{unit}</span>}
    </div>
  );
}

// ─── Resizable Table ──────────────────────────────────────────────────────────

type SortDir = "asc" | "desc" | null;

function getSortValue(row: AuctionItem, key: string): string | number | null {
  switch (key) {
    case "diff1":
      return row.salePrice != null ? row.naverPrice - row.salePrice : null;
    case "diff2":
      return row.naverPrice - row.minPrice;
    case "diff3":
      return row.naverPrice - row.appraisedValue;
    default: {
      const value = row[key as keyof AuctionItem];
      return typeof value === "string" || typeof value === "number" ? value : null;
    }
  }
}

function AuctionTable({ data }: { data: AuctionItem[] }) {
  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(COLUMNS.map((c) => [c.key, c.defaultWidth]))
  );
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const resizing = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const onMouseDown = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = { key, startX: e.clientX, startW: colWidths[key] };
  }, [colWidths]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const { key: rKey, startX, startW } = resizing.current;
      const delta = e.clientX - startX;
      const newW = Math.max(48, startW + delta);
      setColWidths((prev) => ({ ...prev, [rKey]: newW }));
    };
    const onUp = () => { resizing.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const handleSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey(null); setSortDir(null); }
  };

  const sorted = [...data].sort((a, b) => {
    if (!sortKey || !sortDir) return 0;
    const col = COLUMNS.find((c) => c.key === sortKey);
    if (!col) return 0;
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const SortIcon = ({ k }: { k: string }) => {
    if (sortKey !== k) return <ChevronsUpDown size={10} className="opacity-30 ml-0.5 inline" />;
    return sortDir === "asc" ? <ChevronUp size={10} className="ml-0.5 inline text-primary" /> : <ChevronDown size={10} className="ml-0.5 inline text-primary" />;
  };

  return (
    <div className="relative overflow-auto border border-border rounded-sm bg-card shadow-sm" style={{ maxHeight: "calc(100vh - 420px)" }}>
      <table className="border-collapse" style={{ width: "max-content", minWidth: "100%" }}>
        <thead className="sticky top-0 z-20 bg-secondary/80 backdrop-blur-sm">
          <tr>
            <th className="sticky left-0 z-30 bg-secondary/80 backdrop-blur-sm w-8 text-center border-b border-r border-border px-2 py-2 text-xs font-semibold text-muted-foreground select-none">
              #
            </th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className="relative border-b border-r border-border px-2 py-2 text-xs font-semibold text-foreground select-none whitespace-nowrap group"
                style={{ width: colWidths[col.key], minWidth: colWidths[col.key], textAlign: col.align ?? "left" }}
              >
                <span
                  className="cursor-pointer hover:text-primary flex items-center gap-0.5 justify-between"
                  onClick={() => handleSort(col.key)}
                >
                  <span className="truncate">{col.label}</span>
                  <SortIcon k={col.key} />
                </span>
                {/* Resize handle */}
                <span
                  onMouseDown={(e) => onMouseDown(col.key, e)}
                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-primary/30 transition-opacity"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="text-center py-16 text-sm text-muted-foreground">
                조건에 맞는 물건이 없습니다
              </td>
            </tr>
          ) : sorted.map((row, idx) => (
            <tr key={row.id} className="hover:bg-secondary/30 transition-colors">
              <td className="sticky left-0 z-10 bg-card text-center border-b border-r border-border px-2 py-2 text-xs text-muted-foreground font-mono">
                {idx + 1}
              </td>
              {COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className="border-b border-r border-border px-2 py-2 whitespace-nowrap overflow-hidden"
                  style={{ maxWidth: colWidths[col.key], textAlign: col.align ?? "left" }}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [ward, setWard] = useState("");
  const [availableWards, setAvailableWards] = useState<string[]>([]);
  const [wardsLoading, setWardsLoading] = useState(false);
  const [propType, setPropType] = useState<"아파트" | "빌라" | "">("");
  const [minPriceInput, setMinPriceInput] = useState("");
  const [appraisedValueInput, setAppraisedValueInput] = useState("");
  const [filterOpen, setFilterOpen] = useState(true);

  const availableDistricts = city ? getDistricts(city) : [];

  useEffect(() => {
    if (!city || !district) {
      setAvailableWards([]);
      setWardsLoading(false);
      return;
    }

    let cancelled = false;
    setWardsLoading(true);
    setAvailableWards([]);

    getWards(city, district)
      .then((wards) => {
        if (!cancelled) setAvailableWards(wards);
      })
      .finally(() => {
        if (!cancelled) setWardsLoading(false);
      });

    return () => { cancelled = true; };
  }, [city, district]);

  const handleCityChange = (v: string) => { setCity(v); setDistrict(""); setWard(""); };
  const handleDistrictChange = (v: string) => { setDistrict(v); setWard(""); };

  const handleReset = () => {
    setCity(""); setDistrict(""); setWard("");
    setPropType(""); setMinPriceInput(""); setAppraisedValueInput("");
  };

  // Apply filters
  
  const filtered = MOCK_DATA.filter((item) => {
    if (city && normalizeCity(item.city) !== normalizeCity(city)) return false;
    if (district && !matchDistrict(item.district, district)) return false;
    if (ward && !item.address.includes(ward)) return false;
    if (propType && item.propType !== propType) return false;
    if (minPriceInput && item.minPrice < Number(minPriceInput)) return false;
    if (appraisedValueInput && item.appraisedValue > Number(appraisedValueInput)) return false;
    return true;
  });

  const activeFilters = [
    city, district, ward, propType,
    minPriceInput && `최저가 ${fmtEok(Number(minPriceInput))} 이상`,
    appraisedValueInput && `감정가 ${fmtEok(Number(appraisedValueInput))} 이하`,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* Header */}
      <header className="bg-primary border-b border-primary/20 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 bg-white/60 rounded-full" />
            <span className="text-white/90 text-sm font-semibold tracking-wide">법원 경매 물건 검색</span>
          </div>
          <span className="text-white/50 text-xs font-mono">{filtered.length}건 조회</span>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-5">
        {/* Filter Panel */}
        <div className="bg-card border border-border rounded-sm shadow-sm overflow-hidden">
          {/* Filter toggle header */}
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Search size={14} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">검색 필터</span>
              {activeFilters.length > 0 && (
                <span className="bg-primary text-primary-foreground text-xs font-mono px-1.5 py-0.5 rounded-sm">
                  {activeFilters.length}
                </span>
              )}
            </div>
            <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-200 ${filterOpen ? "rotate-180" : ""}`} />
          </button>

          {filterOpen && (
            <div className="border-t border-border">
              {/* Row 1: Address */}
              <div className="px-5 py-4 border-b border-border grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 items-start">
                <div className="flex items-center gap-1.5 pt-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/70 inline-block" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">주소 선택</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">시 / 도</label>
                    <SelectEl value={city} onChange={handleCityChange} options={CITIES} placeholder="시/도 선택" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">군 / 구</label>
                    <SelectEl value={district} onChange={handleDistrictChange} options={availableDistricts} placeholder={city ? "군/구 선택" : "시/도 먼저"} disabled={!city} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">동 / 읍 / 면</label>
                    <SelectEl value={ward} onChange={setWard} options={availableWards} placeholder={district ? (wardsLoading ? "불러오는 중..." : availableWards.length ? "동/읍/면 선택" : "해당 없음") : "군/구 먼저"} disabled={!district || wardsLoading || !availableWards.length} />
                  </div>
                </div>
              </div>

              {/* Row 2: Type + Price */}
              <div className="px-5 py-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 items-start">
                <div className="pt-1 space-y-5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/70 inline-block" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">조건 선택</span>
                  </div>
                </div>
                <div className="grid grid-cols-[200px_1fr_1fr] gap-4 items-start">
                  {/* Property type */}
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">물건 종류</label>
                    <div className="flex gap-2">
                      {(["아파트", "빌라"] as const).map((t) => (
                        <button key={t} onClick={() => setPropType(propType === t ? "" : t)}
                          className={`flex-1 py-2 text-sm font-semibold rounded-sm border transition-all duration-150 ${propType === t ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/60"}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Min price */}
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">최저가 (이상)</label>
                    <NumberInput value={minPriceInput} onChange={setMinPriceInput} placeholder="예: 300,000,000" unit="원" />
                    {minPriceInput && <p className="mt-1 text-[11px] text-primary font-medium">{fmtEok(Number(minPriceInput))}</p>}
                  </div>
                  {/* Appraised value */}
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">감정가 (이하)</label>
                    <NumberInput value={appraisedValueInput} onChange={setAppraisedValueInput} placeholder="예: 5,000,000,000" unit="원" />
                    {appraisedValueInput && <p className="mt-1 text-[11px] text-primary font-medium">{fmtEok(Number(appraisedValueInput))}</p>}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 py-3 bg-secondary/30 border-t border-border flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {activeFilters.map((f, i) => (
                    <span key={i} className="inline-flex items-center px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-sm border border-primary/20">
                      {f as string}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 shrink-0 ml-4">
                  <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-sm hover:text-foreground hover:border-foreground/30 transition-colors">
                    <RotateCcw size={12} />초기화
                  </button>
                  <button className="flex items-center gap-1.5 px-5 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-sm hover:bg-accent transition-colors shadow-sm">
                    <Search size={12} />검색
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Result Summary */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">검색 결과</span>
            <span className="font-mono text-sm text-primary font-bold">{filtered.length}</span>
            <span className="text-sm text-muted-foreground">건</span>
            <span className="text-xs text-muted-foreground ml-1">/ 전체 {MOCK_DATA.length}건</span>
          </div>
          <span className="text-xs text-muted-foreground">컬럼 헤더를 드래그하여 너비 조절 · 헤더 클릭으로 정렬</span>
        </div>

        {/* Table */}
        <AuctionTable data={filtered} />
      </main>
    </div>
  );
}
