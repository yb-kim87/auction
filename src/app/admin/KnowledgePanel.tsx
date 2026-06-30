"use client";

import { useState } from "react";
import { CafeKnowledgePanel } from "./CafeKnowledgePanel";
import { KnowledgeListPanel } from "./KnowledgeListPanel";

type KnowledgeSubTab = "registered" | "cafe";

export function KnowledgePanel() {
  const [subTab, setSubTab] = useState<KnowledgeSubTab>("registered");

  return (
    <div>
      <div className="flex border-b border-border px-6 pt-4 gap-1">
        <button
          type="button"
          onClick={() => setSubTab("registered")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
            subTab === "registered"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground"
          }`}
        >
          등록된 지식
        </button>
        <button
          type="button"
          onClick={() => setSubTab("cafe")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
            subTab === "cafe"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground"
          }`}
        >
          카페 수집 · 초안
        </button>
      </div>
      {subTab === "registered" ? <KnowledgeListPanel /> : <CafeKnowledgePanel />}
    </div>
  );
}
