"use client";

import { useEffect, useRef, useState } from "react";
import { STAGE_FILTER_TREE, TYPE_FILTER_TREE, type FilterGroup } from "@/lib/zone-stage-style";

/** 재개발닷컴식 "사업종류 / 진행단계" 필터 — 드롭다운 안에 전체 · 그룹 체크박스 · 하위 칩. 비어 있으면 전체. */
function FilterDropdown({
  title,
  tree,
  selected,
  onChange,
  withDot,
  compact,
}: {
  title: string;
  tree: FilterGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
  withDot?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const sel = new Set(selected);
  const toggleChild = (v: string) => onChange(sel.has(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const toggleGroup = (g: FilterGroup) => {
    const all = g.children.every((c) => sel.has(c.value));
    const values = new Set(g.children.map((c) => c.value));
    onChange(all ? selected.filter((x) => !values.has(x)) : [...new Set([...selected, ...values])]);
  };
  const active = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-md border px-3 py-1.5 font-semibold ${compact ? "text-xs" : "text-sm shadow"} ${active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border bg-card text-foreground hover:bg-muted/40"}`}
      >
        {title}
        {active ? ` ${selected.length}` : ""} {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-[60vh] w-[340px] overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-xl">
          <label className="flex cursor-pointer items-center gap-2 border-b border-border pb-2 text-sm font-bold text-blue-600">
            <input type="checkbox" checked={!active} onChange={() => onChange([])} /> 전체
          </label>
          {tree.map((g) => {
            const allOn = g.children.every((c) => sel.has(c.value));
            return (
              <div key={g.value} className="border-b border-border/60 py-2 last:border-b-0">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-foreground">
                  <input type="checkbox" checked={allOn} onChange={() => toggleGroup(g)} /> {g.label}
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
                  {g.children.map((c) => {
                    const on = sel.has(c.value);
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => toggleChild(c.value)}
                        className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${on ? "border-blue-500 bg-blue-50 font-semibold text-blue-700" : "border-border bg-card text-foreground hover:bg-muted"}`}
                      >
                        {withDot && c.color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />}
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RedevelopmentEditZoneFilters({
  types,
  stages,
  onTypesChange,
  onStagesChange,
  compact,
}: {
  types: string[];
  stages: string[];
  onTypesChange: (v: string[]) => void;
  onStagesChange: (v: string[]) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <FilterDropdown title="사업종류" tree={TYPE_FILTER_TREE} selected={types} onChange={onTypesChange} withDot compact={compact} />
      <FilterDropdown title="진행단계" tree={STAGE_FILTER_TREE} selected={stages} onChange={onStagesChange} compact={compact} />
    </div>
  );
}
