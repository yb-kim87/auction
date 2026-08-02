"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { InvestmentSelectOption } from "@/data/investment-options";
import { INVESTMENT_GOAL_ETC, INVESTMENT_GOAL_OPTIONS } from "@/data/investment-options";
import { formatMoneyOptionLabel, parseMoneyToWon } from "@/lib/investment-money";

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: InvestmentSelectOption[];
  placeholder: string;
  hint?: string;
  /** true면 라벨과 테두리를 빨간색으로 표시(필수 항목 미입력 등). */
  invalid?: boolean;
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
      <label
        className={`block text-[0.82rem] font-medium mb-1.5 ${
          invalid ? "text-destructive" : "text-foreground/70"
        }`}
      >
        {label}
        {invalid && <span className="ml-1 text-destructive">*필수</span>}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`w-full h-11 flex items-center px-4 pr-10 rounded-xl bg-input-background border text-[0.9rem] text-left focus:outline-none focus:ring-2 transition-all cursor-pointer ${
            invalid
              ? "border-destructive focus:border-destructive focus:ring-destructive/30"
              : "border-border focus:border-primary focus:ring-ring/30"
          } ${selected ? "text-foreground" : "text-muted-foreground/60"}`}
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
      {hint && (
        <p className="mt-1 text-[0.75rem] text-muted-foreground/80">{hint}</p>
      )}
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

const MONEY_CUSTOM_INPUT = "직접입력";

/**
 * 금액류(투자가능자금/연순소득/기존대출금액) 프리셋 드롭다운 + "직접 입력".
 * 프리셋 목록에 없는 금액(만원 단위)을 정확히 입력하고 싶을 때 사용한다.
 * 저장 형식은 기존 프리셋과 동일한 "N,NNN만원"/"N억" 문자열이라
 * parseMoneyToWon 등 기존 파싱 로직을 그대로 재사용할 수 있다.
 */
export function MoneyInputField({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: InvestmentSelectOption[];
  placeholder: string;
  hint?: string;
  invalid?: boolean;
}) {
  const isPreset = options.some((o) => o.value === value);
  const [customMode, setCustomMode] = useState(value !== "" && !isPreset);
  const selectValue = customMode ? MONEY_CUSTOM_INPUT : isPreset ? value : "";
  const showCustomInput = selectValue === MONEY_CUSTOM_INPUT;

  const initialManwon = !isPreset && value ? Math.round((parseMoneyToWon(value) ?? 0) / 10_000) : 0;
  const [manwonText, setManwonText] = useState(initialManwon > 0 ? String(initialManwon) : "");

  const selectOptions = [...options, { value: MONEY_CUSTOM_INPUT, label: "직접 입력" }];

  return (
    <div className="space-y-2">
      <SelectField
        label={label}
        placeholder={placeholder}
        value={selectValue}
        onChange={(next) => {
          if (next === MONEY_CUSTOM_INPUT) {
            setCustomMode(true);
            if (isPreset) onChange("");
          } else {
            setCustomMode(false);
            onChange(next);
          }
        }}
        options={selectOptions}
        hint={hint}
        invalid={invalid}
      />
      {showCustomInput && (
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            placeholder="숫자만 입력 (예: 1234 → 1,234만원)"
            value={manwonText}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "");
              setManwonText(digits);
              const manwon = digits ? Number.parseInt(digits, 10) : 0;
              onChange(manwon > 0 ? formatMoneyOptionLabel(manwon * 10_000) : "");
            }}
            className="w-full h-11 px-4 pr-14 rounded-xl bg-input-background border border-border text-[0.9rem] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 transition-all"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[0.85rem] text-muted-foreground">
            만원
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * 투자목표: 프리셋 드롭다운 + "기타" 선택 시 직접 입력.
 * value가 프리셋 목록에 없는 기존 자유입력 값이면 "기타"로 간주해 그 텍스트를 보여준다.
 */
export function InvestmentGoalField({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const isPreset = INVESTMENT_GOAL_OPTIONS.some(
    (o) => o.value === value && o.value !== INVESTMENT_GOAL_ETC,
  );
  const [etcMode, setEtcMode] = useState(value !== "" && !isPreset);
  const selectValue = etcMode ? INVESTMENT_GOAL_ETC : isPreset ? value : "";
  const showCustomInput = selectValue === INVESTMENT_GOAL_ETC;

  return (
    <div className="space-y-2">
      <SelectField
        label="투자목표"
        placeholder="투자목표 선택"
        value={selectValue}
        onChange={(next) => {
          if (next === INVESTMENT_GOAL_ETC) {
            setEtcMode(true);
            if (isPreset) onChange("");
          } else {
            setEtcMode(false);
            onChange(next);
          }
        }}
        options={INVESTMENT_GOAL_OPTIONS}
        invalid={invalid}
      />
      {showCustomInput && (
        <input
          type="text"
          placeholder="투자목표를 직접 입력해 주세요"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-11 px-4 rounded-xl bg-input-background border border-border text-[0.9rem] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 transition-all"
        />
      )}
    </div>
  );
}
