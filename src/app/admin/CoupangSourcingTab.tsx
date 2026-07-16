"use client";

import { useMemo, useState } from "react";

type SourceType = "도매꾹" | "도매매" | "1688";

type SourcingRow = {
  id: string;
  productName: string;
  source: SourceType;
  url: string;
  cost: number;
  maxCost: number;
  salePrice: number;
  wingFeeRate: number;
  grossFee: number;
  margin: number;
  marginRate: number;
  eroas: number;
};

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function csvEscape(value: string | number): string {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function CoupangSourcingTab() {
  const [keyword, setKeyword] = useState("");
  const [salePriceInput, setSalePriceInput] = useState("");
  const [wingFeeInput, setWingFeeInput] = useState("");
  const [grossFeeInput, setGrossFeeInput] = useState("");
  const [domaggukCost, setDomaggukCost] = useState("");
  const [domaggukUrl, setDomaggukUrl] = useState("");
  const [domemaCost, setDomemaCost] = useState("");
  const [domemaUrl, setDomemaUrl] = useState("");
  const [u1688Cost, setU1688Cost] = useState("");
  const [u1688Url, setU1688Url] = useState("");
  const [rows, setRows] = useState<SourcingRow[]>([]);
  const [message, setMessage] = useState<string>("");

  const salePrice = toNumber(salePriceInput);
  const wingFee = toNumber(wingFeeInput);
  const grossFee = toNumber(grossFeeInput);

  const maxCost = useMemo(() => {
    if (!salePrice) return 0;
    return Math.floor(
      salePrice -
        salePrice * (wingFee * 0.01) * 1.1 -
        grossFee * 1.1 -
        salePrice * 1.1 / 2.5,
    );
  }, [salePrice, wingFee, grossFee]);

  function buildRow(source: SourceType, costText: string, url: string): SourcingRow | null {
    const cost = toNumber(costText);
    if (!cost || !salePrice) return null;
    const wingFeeRate = wingFee / 100;
    const margin = salePrice - cost - salePrice * wingFeeRate * 1.1 - grossFee * 1.1;
    const marginRate = salePrice === 0 ? 0 : margin / salePrice;
    const eroas = margin === 0 ? 0 : (salePrice * 110) / margin;
    return {
      id: `${Date.now()}-${Math.random()}`,
      productName: keyword.trim(),
      source,
      url: url.trim(),
      cost,
      maxCost,
      salePrice,
      wingFeeRate: wingFee,
      grossFee,
      margin: Math.floor(margin),
      marginRate,
      eroas,
    };
  }

  function handleAddRows() {
    const next: SourcingRow[] = [];
    const r1 = buildRow("도매꾹", domaggukCost, domaggukUrl);
    const r2 = buildRow("도매매", domemaCost, domemaUrl);
    const r3 = buildRow("1688", u1688Cost, u1688Url);
    if (r1) next.push(r1);
    if (r2) next.push(r2);
    if (r3) next.push(r3);
    if (next.length === 0) {
      setMessage("판매가와 원가를 입력해 주세요.");
      return;
    }
    setRows((prev) => [...next, ...prev]);
    setMessage(`${next.length}건이 추가되었습니다.`);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function clearRows() {
    setRows([]);
    setMessage("목록을 비웠습니다.");
  }

  function downloadCsv() {
    if (rows.length === 0) {
      setMessage("저장할 데이터가 없습니다.");
      return;
    }
    const headers = [
      "제품명",
      "소싱처",
      "URL",
      "원가",
      "최대원가",
      "판매가",
      "윙수수료율",
      "그로스 수수료",
      "마진",
      "마진율",
      "엔드로아스",
    ];

    const lines = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) =>
        [
          row.productName,
          row.source,
          row.url,
          row.cost,
          row.maxCost,
          row.salePrice,
          `${row.wingFeeRate}%`,
          row.grossFee,
          row.margin,
          `${(row.marginRate * 100).toFixed(1)}%`,
          `${row.eroas.toFixed(1)}%`,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ];

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `쿠팡_소싱_마진계산_${new Date().toISOString().slice(0, 19).replaceAll(":", "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("CSV 파일을 저장했습니다.");
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">쿠팡 소싱 도우미</h2>
        <p className="text-sm text-muted-foreground mt-1">
          데스크톱 마진 계산 로직을 웹 관리자 탭으로 옮긴 화면입니다.
        </p>
      </div>

      {message && (
        <div className="rounded-sm border border-border bg-secondary/30 px-4 py-2 text-sm">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="제품명/키워드"
          className="px-3 py-2 text-sm border border-border rounded-sm"
        />
        <input
          value={salePriceInput}
          onChange={(e) => setSalePriceInput(e.target.value)}
          placeholder="판매가"
          className="px-3 py-2 text-sm border border-border rounded-sm"
        />
        <input
          value={wingFeeInput}
          onChange={(e) => setWingFeeInput(e.target.value)}
          placeholder="윙수수료율(%)"
          className="px-3 py-2 text-sm border border-border rounded-sm"
        />
        <input
          value={grossFeeInput}
          onChange={(e) => setGrossFeeInput(e.target.value)}
          placeholder="그로스수수료"
          className="px-3 py-2 text-sm border border-border rounded-sm"
        />
      </div>

      <div className="text-sm text-muted-foreground">
        최대 원가: <span className="font-semibold text-foreground">{maxCost.toLocaleString()}</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div className="grid grid-cols-12 gap-2 text-sm">
          <div className="col-span-2 flex items-center">도매꾹</div>
          <input value={domaggukCost} onChange={(e) => setDomaggukCost(e.target.value)} placeholder="원가" className="col-span-3 px-3 py-2 border border-border rounded-sm" />
          <input value={domaggukUrl} onChange={(e) => setDomaggukUrl(e.target.value)} placeholder="URL" className="col-span-7 px-3 py-2 border border-border rounded-sm" />
        </div>
        <div className="grid grid-cols-12 gap-2 text-sm">
          <div className="col-span-2 flex items-center">도매매</div>
          <input value={domemaCost} onChange={(e) => setDomemaCost(e.target.value)} placeholder="원가" className="col-span-3 px-3 py-2 border border-border rounded-sm" />
          <input value={domemaUrl} onChange={(e) => setDomemaUrl(e.target.value)} placeholder="URL" className="col-span-7 px-3 py-2 border border-border rounded-sm" />
        </div>
        <div className="grid grid-cols-12 gap-2 text-sm">
          <div className="col-span-2 flex items-center">1688</div>
          <input value={u1688Cost} onChange={(e) => setU1688Cost(e.target.value)} placeholder="원가" className="col-span-3 px-3 py-2 border border-border rounded-sm" />
          <input value={u1688Url} onChange={(e) => setU1688Url(e.target.value)} placeholder="URL" className="col-span-7 px-3 py-2 border border-border rounded-sm" />
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={handleAddRows} className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground">
          행 추가
        </button>
        <button type="button" onClick={clearRows} className="px-4 py-2 text-sm border border-border rounded-sm">
          전체 삭제
        </button>
        <button type="button" onClick={downloadCsv} className="px-4 py-2 text-sm border border-border rounded-sm">
          CSV 저장
        </button>
      </div>

      <div className="border border-border rounded-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-secondary/80">
              <tr className="border-b border-border">
                <th className="px-2 py-2 text-left">제품명</th>
                <th className="px-2 py-2 text-left">소싱처</th>
                <th className="px-2 py-2 text-left">원가</th>
                <th className="px-2 py-2 text-left">최대원가</th>
                <th className="px-2 py-2 text-left">마진</th>
                <th className="px-2 py-2 text-left">마진율</th>
                <th className="px-2 py-2 text-left">엔드로아스</th>
                <th className="px-2 py-2 text-left">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    추가된 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border">
                    <td className="px-2 py-2">{row.productName || "-"}</td>
                    <td className="px-2 py-2">{row.source}</td>
                    <td className="px-2 py-2">{row.cost.toLocaleString()}</td>
                    <td className="px-2 py-2">{row.maxCost.toLocaleString()}</td>
                    <td className="px-2 py-2">{row.margin.toLocaleString()}</td>
                    <td className="px-2 py-2">{(row.marginRate * 100).toFixed(1)}%</td>
                    <td className="px-2 py-2">{row.eroas.toFixed(1)}%</td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => removeRow(row.id)} className="text-destructive">
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
