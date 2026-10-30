"use client";

import { useState } from "react";
import { RedevelopmentEditTab } from "./RedevelopmentEditTab";
import { RedevelopmentUpdateHistory } from "./RedevelopmentUpdateHistory";

type SubTab = "map" | "history";

const SUB_TABS: Array<{ id: SubTab; label: string }> = [
  { id: "map", label: "구역·지도" },
  { id: "history", label: "구역 업데이트 이력" },
];

/** 재개발물건 탭 — 하위 탭: 구역·지도(기존 화면) / 구역 업데이트 이력(날짜별 변경 내역). */
export function RedevelopmentSection() {
  const [sub, setSub] = useState<SubTab>("map");
  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-border">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className={`-mb-px px-4 py-2 text-sm font-semibold transition-colors ${
              sub === t.id ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "map" ? <RedevelopmentEditTab /> : <RedevelopmentUpdateHistory />}
    </div>
  );
}
