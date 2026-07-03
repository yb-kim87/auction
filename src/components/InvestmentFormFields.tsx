"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { InvestmentSelectOption } from "@/data/investment-options";

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: InvestmentSelectOption[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={rootRef}>
      <label className="block text-[0.82rem] font-medium text-foreground/70 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`w-full h-11 flex items-center px-4 pr-10 rounded-xl bg-input-background border border-border text-[0.9rem] text-left focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 transition-all cursor-pointer ${
            selected ? "text-foreground" : "text-muted-foreground/60"
          }`}
        >
          {selected ? selected.label : placeholder}
        </button>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />

        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-card shadow-lg z-50">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="w-full px-4 py-2.5 text-left text-[0.9rem] text-muted-foreground/60 hover:bg-secondary/60 transition-colors"
            >
              {placeholder}
            </button>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left text-[0.9rem] hover:bg-secondary/60 transition-colors ${
                  option.value === value ? "text-primary font-medium" : "text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[0.9rem] text-foreground cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary w-4 h-4"
      />
      {label}
    </label>
  );
}

export function TextAreaField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[0.82rem] font-medium text-foreground/70 mb-1.5">
        {label}
      </label>
      <textarea
        placeholder={placeholder}
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-[0.9rem] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 transition-all resize-none"
      />
    </div>
  );
}
