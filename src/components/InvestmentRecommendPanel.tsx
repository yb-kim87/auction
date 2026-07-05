"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, RotateCcw, Sparkles, Save } from "lucide-react";
import type { UserProfile } from "@/types/auction";
import { InvestmentInfoSection } from "@/components/InvestmentInfoSection";
import { CheckboxField, SelectField, TextAreaField } from "@/components/InvestmentFormFields";
import {
  EXISTING_LOAN_OPTIONS,
  HOUSING_COUNT_OPTIONS,
  INVESTABLE_FUNDS_OPTIONS,
  TARGET_RETURN_OPTIONS,
} from "@/data/investment-options";
import { updateMyProfile, type LoanPolicy } from "@/lib/api";
import {
  buildRecommendSummary,
  criteriaFieldsChanged,
  criteriaFromProfile,
  normalizeCriteriaInput,
  selectLoanPolicy,
  type InvestmentCriteria,
  validateCriteriaForRecommend,
  type InvestmentCriteriaInput,
} from "@/lib/investment-criteria";

export type RecommendApplyMode = "session" | "save";

type InvestmentRecommendPanelProps = {
  profile: UserProfile | null;
  profileLoading: boolean;
  loanPolicies: LoanPolicy[];
  recommendEnabled: boolean;
  onRecommendEnabledChange: (enabled: boolean) => void;
  appliedCriteria: InvestmentCriteria | null;
  appliedInvestableWon: number | null;
  matchCount: number;
  filteredCount: number;
  onApply: (criteria: InvestmentCriteria, investableWon: number, mode: RecommendApplyMode) => void;
  onReloadProfile: () => Promise<UserProfile | null>;
};

export function InvestmentRecommendPanel({
  profile,
  profileLoading,
  loanPolicies,
  recommendEnabled,
  onRecommendEnabledChange,
  appliedCriteria,
  appliedInvestableWon,
  matchCount,
  filteredCount,
  onApply,
  onReloadProfile,
}: InvestmentRecommendPanelProps) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<InvestmentCriteria>({
    investableFunds: "",
    existingLoanAmount: "",
    housingCount: 0,
    investmentGoal: "",
    firstTimeBuyer: false,
  });
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [busy, setBusy] = useState<RecommendApplyMode | "reload" | null>(null);

  const syncDraftFromProfile = useCallback((p: UserProfile | null) => {
    if (!p) return;
    setDraft(criteriaFromProfile(p));
  }, []);

  useEffect(() => {
    syncDraftFromProfile(profile);
  }, [profile, syncDraftFromProfile]);

  const draftDirty =
    appliedCriteria != null && criteriaFieldsChanged(draft, appliedCriteria);

  async function handleApply(mode: RecommendApplyMode) {
    setError("");
    setSaveMessage("");
    const check = validateCriteriaForRecommend(draft);
    if (!check.ok) {
      setError(check.message);
      return;
    }

    setBusy(mode);
    try {
      if (mode === "save") {
        await updateMyProfile({
          investableFunds: check.criteria.investableFunds,
          existingLoanAmount: check.criteria.existingLoanAmount,
          housingCount: check.criteria.housingCount,
          investmentGoal: check.criteria.investmentGoal,
          firstTimeBuyer: check.criteria.firstTimeBuyer,
        });
        const next = await onReloadProfile();
        syncDraftFromProfile(next);
        setSaveMessage("투자 조건이 회원정보에 저장되었습니다.");
      } else {
        onApply(check.criteria, check.investableWon, mode);
        onRecommendEnabledChange(true);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === "save"
            ? "조건 저장에 실패했습니다."
            : "물건 추천에 실패했습니다.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleReloadProfile() {
    setError("");
    setBusy("reload");
    try {
      const next = await onReloadProfile();
      syncDraftFromProfile(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원정보를 불러오지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  function patchDraft(partial: Partial<InvestmentCriteriaInput>) {
    setDraft((prev) => normalizeCriteriaInput({ ...prev, ...partial }));
    setError("");
    setSaveMessage("");
  }

  const appliedPolicy =
    appliedCriteria != null ? selectLoanPolicy(appliedCriteria, loanPolicies) : null;

  const summary =
    recommendEnabled && appliedInvestableWon != null && appliedPolicy != null
      ? buildRecommendSummary(appliedInvestableWon, matchCount, appliedPolicy)
      : null;

  return (
    <div className="bg-card border border-border rounded-sm shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <span className="text-base font-semibold text-foreground">투자 조건 · 물건 추천</span>
          {recommendEnabled && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary border border-primary/20">
              추천 ON
            </span>
          )}
          {draftDirty && (
            <span className="text-xs text-amber-700">입력값 변경됨</span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            회원정보(주택수·생애최초 여부)에 따라 자동 적용되는 대출 비율로 감당 가능한 물건을 추천합니다.
            「물건 추천」은 회원정보를 바꾸지 않고 이 조건으로 바로 조회하며, 「조건 저장」은 물건을 조회하지 않고 회원정보에 투자정보만 저장합니다.
          </p>

          {profileLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              회원 투자정보 불러오는 중...
            </p>
          ) : (
            <InvestmentInfoSection className="rounded-sm">
              <SelectField
                label="투자가능자금"
                placeholder="투자가능자금 선택"
                value={draft.investableFunds}
                onChange={(v) => patchDraft({ investableFunds: v })}
                options={INVESTABLE_FUNDS_OPTIONS}
              />

              <SelectField
                label="기존대출금액"
                placeholder="기존대출금액 선택"
                value={draft.existingLoanAmount}
                onChange={(v) => patchDraft({ existingLoanAmount: v })}
                options={EXISTING_LOAN_OPTIONS}
              />

              <div className="space-y-2">
                <SelectField
                  label="주택수"
                  placeholder="보유 주택수 선택"
                  value={String(draft.housingCount)}
                  onChange={(v) => patchDraft(v !== "0" ? { housingCount: v, firstTimeBuyer: false } : { housingCount: v })}
                  options={HOUSING_COUNT_OPTIONS}
                />
                <div className={String(draft.housingCount) !== "0" ? "opacity-40 pointer-events-none" : ""}>
                  <CheckboxField
                    label="생애최초 주택구입"
                    checked={draft.firstTimeBuyer}
                    onChange={(v) => patchDraft({ firstTimeBuyer: v })}
                  />
                </div>
              </div>

              <TextAreaField
                label="투자목표"
                placeholder="예: 갭투자, 임대수익, 실거주 등 목표를 입력해 주세요"
                value={draft.investmentGoal}
                onChange={(v) => patchDraft({ investmentGoal: v })}
              />
            </InvestmentInfoSection>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-sm px-3 py-2">
              {error}
            </p>
          )}

          {saveMessage && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-sm px-3 py-2">
              {saveMessage}
            </p>
          )}

          {summary && (
            <div className="space-y-1.5">
              <p className="text-sm text-primary bg-primary/5 border border-primary/20 rounded-sm px-3 py-2">
                {summary}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed px-1">
                실제 대출 가능금액은 개인 신용, 소득, 기존 대출, 금융기관 심사 등에 따라 달라질 수 있습니다.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none mr-2">
              <input
                type="checkbox"
                checked={recommendEnabled}
                onChange={(e) => onRecommendEnabledChange(e.target.checked)}
                disabled={!appliedCriteria}
                className="accent-primary"
              />
              추천 물건만 보기
            </label>

            <button
              type="button"
              disabled={busy != null || profileLoading}
              onClick={() => void handleApply("session")}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
            >
              {busy === "session" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              물건 추천
            </button>

            <button
              type="button"
              disabled={busy != null || profileLoading}
              onClick={() => void handleApply("save")}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-sm border border-border bg-card hover:bg-secondary/40 disabled:opacity-50"
            >
              {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              조건 저장
            </button>

            <button
              type="button"
              disabled={busy != null || profileLoading}
              onClick={() => void handleReloadProfile()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground border border-border rounded-sm hover:text-foreground disabled:opacity-50"
            >
              {busy === "reload" ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              회원정보 불러오기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
