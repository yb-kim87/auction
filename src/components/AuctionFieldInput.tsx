"use client";

import type { FieldDef } from "@/lib/auction-form";

const fieldInputClassName =
  "w-full px-3 py-2 text-sm bg-input-background border border-border rounded-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function AuctionFieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string | number | boolean | null;
  onChange: (v: string) => void;
}) {
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 h-[38px]">
        <input
          type="checkbox"
          checked={value === true || value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          className="w-4 h-4"
        />
        <span className="text-sm text-muted-foreground">{field.checkboxHint ?? "체크 시 활성화"}</span>
      </label>
    );
  }

  const textValue = value == null ? "" : String(value);

  if (field.type === "textarea" || field.full) {
    return (
      <textarea
        rows={field.full ? 3 : 2}
        value={textValue}
        onChange={(e) => onChange(e.target.value)}
        className={fieldInputClassName}
      />
    );
  }

  return (
    <input
      type="text"
      inputMode={field.type === "number" ? "numeric" : "text"}
      value={textValue}
      onChange={(e) => onChange(e.target.value)}
      className={fieldInputClassName}
    />
  );
}
