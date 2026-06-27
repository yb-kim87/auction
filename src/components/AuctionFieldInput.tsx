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
  value: string | number | null;
  onChange: (v: string) => void;
}) {
  if (field.type === "textarea" || field.full) {
    return (
      <textarea
        rows={field.full ? 3 : 2}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={fieldInputClassName}
      />
    );
  }

  return (
    <input
      type="text"
      inputMode={field.type === "number" ? "numeric" : "text"}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={fieldInputClassName}
    />
  );
}
