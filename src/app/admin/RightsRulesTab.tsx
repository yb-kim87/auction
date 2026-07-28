"use client";

import { useEffect, useState } from "react";
import {
  fetchRightsAnalysisRules,
  updateRightsAnalysisRule,
  type RightsAnalysisRule,
} from "@/lib/api";

function formatUpdatedAt(value: string | null) {
  if (!value) return "기본 규칙 사용 중";
  return new Date(value).toLocaleString("ko-KR");
}

export function RightsRulesTab() {
  const [rules, setRules] = useState<RightsAnalysisRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchRightsAnalysisRules()
      .then(setRules)
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "규칙을 불러오지 못했습니다."),
      )
      .finally(() => setLoading(false));
  }, []);

  async function changeRule(rule: RightsAnalysisRule, value: string) {
    const selected = rule.options.find((option) => option.value === value);
    if (!selected || value === rule.value) return;
    if (
      !window.confirm(
        `"${rule.title}" 규칙을 "${selected.label}"(으)로 변경할까요?\n변경 후 새로 생성되는 권리분석부터 적용됩니다.`,
      )
    ) {
      return;
    }

    setSavingCode(rule.code);
    setMessage("");
    try {
      const saved = await updateRightsAnalysisRule(rule.code, value);
      setRules((current) =>
        current.map((item) => (item.code === saved.code ? saved : item)),
      );
      setMessage("권리분석 규칙을 저장했습니다. 기존 분석은 관리자 재분석 시 갱신됩니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "규칙 저장에 실패했습니다.");
    } finally {
      setSavingCode("");
    }
  }

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">권리분석 규칙을 불러오는 중...</p>;
  }

  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">권리분석 코드 규칙</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          AI가 설명을 작성하기 전에 서버가 확정하는 핵심 판정 기준입니다.
          법령이 개정되면 수정 가능한 규칙의 값을 변경하세요.
        </p>
        <p className="mt-1 text-xs text-amber-700">
          변경값은 이후 새 분석부터 적용됩니다. 기존 결과는 물건에서 관리자가 다시 분석해야 갱신됩니다.
        </p>
      </div>

      {message && (
        <div className="rounded-sm border border-border bg-secondary/30 px-3 py-2 text-sm">
          {message}
        </div>
      )}

      <div className="space-y-3">
        {rules.map((rule) => {
          const selected = rule.options.find((option) => option.value === rule.value);
          return (
            <section key={rule.code} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-foreground">{rule.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                      rule.editable
                        ? "bg-blue-50 text-blue-700"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {rule.editable ? "관리자 수정 가능" : "안전 고정 규칙"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                    {rule.description}
                  </p>
                  <div className="mt-3 rounded-sm bg-secondary/40 px-3 py-2.5">
                    <p className="text-xs font-semibold text-foreground">법령·판정 근거</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {rule.legalBasis}
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    코드: {rule.code} · {formatUpdatedAt(rule.updatedAt)}
                    {rule.updatedBy ? ` · 수정자 ${rule.updatedBy}` : ""}
                  </p>
                </div>

                <div className="w-full shrink-0 lg:w-72">
                  <label className="text-xs font-semibold text-muted-foreground">
                    현재 적용값
                  </label>
                  <select
                    value={rule.value}
                    disabled={!rule.editable || savingCode === rule.code}
                    onChange={(event) => void changeRule(rule, event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {rule.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {selected?.description}
                  </p>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
