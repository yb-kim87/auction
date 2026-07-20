"use client";

import { useMemo, useState } from "react";

function parseNum(value: string): number {
  const cleaned = value.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatWon(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

export function CrawlerVatTab() {
  const [salePriceIncludingVat, setSalePriceIncludingVat] = useState("0");
  const [landPrice, setLandPrice] = useState("0");
  const [buildingStandardPrice, setBuildingStandardPrice] = useState("0");

  const result = useMemo(() => {
    const totalPrice = parseNum(salePriceIncludingVat);
    const land = parseNum(landPrice);
    const building = parseNum(buildingStandardPrice);
    const base = land + building;

    // 안분계산: 토지공시지가·건물기준시가 비율로 부가세 포함 매도가를
    // 토지분/건물분으로 나눈다. 토지 공급은 부가세 면제(국세법상 토지의
    // 재화 공급 자체는 면세)이므로, 건물분에만 10% 부가세가 포함된다.
    // 건물분(부가세 포함) = 총액 × 건물기준시가 / (토지공시지가 + 건물기준시가)
    // 건물분(공급가액) = 건물분(부가세 포함) / 1.1
    // 부가세 = 건물분(부가세 포함) - 건물분(공급가액)
    const buildingPriceIncludingVat = base > 0 ? (totalPrice * building) / base : 0;
    const landPriceAllocated = base > 0 ? totalPrice - buildingPriceIncludingVat : 0;
    const buildingSupplyPrice = buildingPriceIncludingVat / 1.1;
    const vat = buildingPriceIncludingVat - buildingSupplyPrice;

    return {
      landPriceAllocated,
      buildingPriceIncludingVat,
      buildingSupplyPrice,
      vat,
    };
  }, [salePriceIncludingVat, landPrice, buildingStandardPrice]);

  const fieldClass =
    "w-full px-2 py-1.5 text-sm border border-border rounded-sm bg-card";

  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-base font-bold">부가세계산</h3>
        <p className="text-sm text-muted-foreground mt-1">
          토지공시지가·건물기준시가 비율로 안분해 건물분 부가가치세를
          계산합니다. 토지 공급은 부가세 면제 대상이라 건물분에만 10% 세율이
          적용됩니다.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">
            매도예상가(부가세 포함, 원)
          </span>
          <input
            value={salePriceIncludingVat}
            onChange={(e) => setSalePriceIncludingVat(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">
            토지공시지가(원)
          </span>
          <input
            value={landPrice}
            onChange={(e) => setLandPrice(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">
            건물기준시가(원)
          </span>
          <input
            value={buildingStandardPrice}
            onChange={(e) => setBuildingStandardPrice(e.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border border-border rounded-sm p-4 bg-secondary/20">
        <div>
          <p className="text-xs text-muted-foreground">토지분(안분)</p>
          <p className="font-mono">{formatWon(result.landPriceAllocated)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            건물분(부가세 포함)
          </p>
          <p className="font-mono">
            {formatWon(result.buildingPriceIncludingVat)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">건물분 공급가액</p>
          <p className="font-mono font-semibold">
            {formatWon(result.buildingSupplyPrice)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">부가가치세</p>
          <p className="font-mono text-primary font-semibold">
            {formatWon(result.vat)}
          </p>
        </div>
      </div>
    </div>
  );
}
