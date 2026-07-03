"use client";

import { displayTenantDetail } from "@/lib/tenant-status";

export function TenantStatusPanel({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
}) {
  const text = displayTenantDetail(value);
  if (!text) {
    return <span className="text-muted-foreground/50">-</span>;
  }

  return (
    <div
      className={
        compact
          ? "min-w-0"
          : "min-w-0 rounded-sm border border-border/70 bg-secondary/5 px-3 py-2.5"
      }
    >
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
        {text}
      </div>
    </div>
  );
}
