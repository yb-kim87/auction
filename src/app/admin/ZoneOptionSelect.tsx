"use client";

import { useState } from "react";
import { STAGE_FILTER_TREE, TYPE_FILTER_TREE } from "@/lib/zone-stage-style";

const CUSTOM = "__custom__";

export type ZoneOptionGroup = { label: string; options: string[] };

/** 지도 필터와 같은 진행단계 목록(추진중/진행중/완료). 값은 단계 이름 그대로 저장한다. */
export const STAGE_OPTION_GROUPS: ZoneOptionGroup[] = STAGE_FILTER_TREE.map((g) => ({ label: g.label, options: g.children.map((c) => c.label) }));

/** 지도 필터와 같은 사업종류 목록(민간주도/공공주도/소규모 등). */
export const TYPE_OPTION_GROUPS: ZoneOptionGroup[] = TYPE_FILTER_TREE.map((g) => ({ label: g.label, options: g.children.map((c) => c.label) }));

/** 기존 목록에서 고르거나 "직접 입력"으로 수동 입력한다. 이미 저장된 값이 목록에 없으면 직접 입력 상태로 시작한다. */
export function ZoneOptionSelect({
  value,
  onChange,
  groups,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  groups: ZoneOptionGroup[];
  placeholder: string;
  className?: string;
}) {
  const known = value === "" || groups.some((g) => g.options.includes(value));
  const [custom, setCustom] = useState(!known);
  return (
    <div className={`flex min-w-0 gap-1 ${className}`}>
      <select
        value={custom ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        className="min-w-0 flex-1 rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
      >
        <option value="">{placeholder}</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>직접 입력</option>
      </select>
      {custom && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="직접 입력"
          className="min-w-0 flex-1 rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
        />
      )}
    </div>
  );
}
