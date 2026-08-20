"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PRICE_FILTER_OPTIONS } from "@/data/price-filter-options";
import type { FailureRateFilterOption } from "@/data/failure-rate-filter-options";
import { PROGRESS_STATUS_LABELS, PROGRESS_STATUS_OPTIONS } from "@/lib/progress-status-filter";
import { LIST_TEXT, FILTER_SELECT_PRICE } from "@/lib/search-format";

export function SelectEl({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className={`w-full appearance-none bg-card border border-border rounded-sm px-3 py-2.5 pr-8 ${LIST_TEXT} text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors ${disabled ? "opacity-40 cursor-not-allowed bg-muted" : "hover:border-primary/50 cursor-pointer"} ${!value ? "text-muted-foreground" : ""}`}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={16} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${disabled ? "opacity-30" : "opacity-50"}`} />
    </div>
  );
}

export function FilterTextInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      placeholder={placeholder}
      maxLength={5}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
      className={`w-full bg-card border border-border rounded-sm px-3 py-2.5 ${LIST_TEXT} text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary hover:border-primary/50 transition-colors placeholder:text-muted-foreground placeholder:font-sans`}
    />
  );
}

export function PriceSelectEl({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none bg-card border border-border rounded-sm px-3 py-2.5 pr-8 ${LIST_TEXT} text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors hover:border-primary/50 cursor-pointer ${!value ? "text-muted-foreground" : ""}`}
      >
        <option value="">{placeholder}</option>
        {PRICE_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
    </div>
  );
}

export function FailureRateSelectEl({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: FailureRateFilterOption[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none bg-card border border-border rounded-sm px-3 py-2.5 pr-8 ${LIST_TEXT} text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors hover:border-primary/50 cursor-pointer ${!value ? "text-muted-foreground" : ""}`}
      >
        <option value="">전체</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
    </div>
  );
}

export function PriceRangeSelect({
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: {
  minValue: string;
  maxValue: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 w-fit">
      <div className={`${FILTER_SELECT_PRICE} shrink-0`}>
        <PriceSelectEl value={minValue} onChange={onMinChange} placeholder="이상" />
      </div>
      <span className={`${LIST_TEXT} text-muted-foreground shrink-0 select-none`}>~</span>
      <div className={`${FILTER_SELECT_PRICE} shrink-0`}>
        <PriceSelectEl value={maxValue} onChange={onMaxChange} placeholder="이하" />
      </div>
    </div>
  );
}

export function MultiCheckboxSelect({
  options,
  selected,
  onChange,
  placeholder,
  disabled,
  className = "",
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length}개 선택`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`w-full text-left bg-card border border-border rounded-sm px-3 py-2.5 pr-8 ${LIST_TEXT} whitespace-nowrap truncate focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors ${
          disabled
            ? "opacity-40 cursor-not-allowed bg-muted"
            : "hover:border-primary/50 cursor-pointer"
        } ${selected.length === 0 ? "text-muted-foreground" : "text-foreground"}`}
      >
        {summary}
      </button>
      <ChevronDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
      {open && !disabled && (
        <ul className="absolute z-[100] top-full left-0 mt-1 min-w-full max-h-60 overflow-y-auto rounded-sm border border-border bg-card shadow-md">
          {options.map((option) => (
            <li key={option}>
              <label className={`flex items-center gap-2 px-3 py-2.5 ${LIST_TEXT} hover:bg-secondary/50 cursor-pointer`}>
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => toggle(option)}
                  className="accent-primary"
                />
                <span>{option}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProgressStatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isEnded = value === PROGRESS_STATUS_LABELS.ended;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full text-left bg-card border border-border rounded-sm px-3 py-2.5 pr-8 ${LIST_TEXT} hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors ${isEnded ? "text-red-600 font-semibold" : "text-foreground"}`}
      >
        {value}
      </button>
      <ChevronDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
      {open && (
        <ul className="absolute z-[100] top-full left-0 mt-1 w-full overflow-hidden rounded-sm border border-border bg-card shadow-md">
          {PROGRESS_STATUS_OPTIONS.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2.5 text-left ${LIST_TEXT} hover:bg-secondary/50 transition-colors ${
                  option === PROGRESS_STATUS_LABELS.ended ? "text-red-600 font-semibold" : "text-foreground"
                } ${value === option ? "bg-secondary/30" : ""}`}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
