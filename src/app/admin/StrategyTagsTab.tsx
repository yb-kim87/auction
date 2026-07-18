"use client";

import { useEffect, useState } from "react";
import {
  fetchTagRules,
  fetchStrategyRules,
  createStrategyRule,
  updateStrategyRule,
  removeStrategyRule,
  fetchStrategyLabels,
  upsertStrategyLabel,
  removeStrategyLabel,
  backfillTagRules,
  type TagRule,
  type StrategyRule,
  type StrategyLabel,
} from "@/lib/api";

const EMPTY_RULE_FORM = { strategyCode: "", requiredFactCodes: [] as string[] };
const EMPTY_LABEL_FORM = { strategyCode: "", label: "", description: "", icon: "" };

export function StrategyTagsTab() {
  const [factRules, setFactRules] = useState<TagRule[]>([]);
  const [strategyRules, setStrategyRules] = useState<StrategyRule[]>([]);
  const [labels, setLabels] = useState<StrategyLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM);
  const [labelForm, setLabelForm] = useState(EMPTY_LABEL_FORM);
  const [creatingRule, setCreatingRule] = useState(false);
  const [savingLabel, setSavingLabel] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([fetchTagRules(), fetchStrategyRules(), fetchStrategyLabels()])
      .then(([f, r, l]) => {
        setFactRules(f);
        setStrategyRules(r);
        setLabels(l);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function toggleFactCode(code: string) {
    setRuleForm((f) => ({
      ...f,
      requiredFactCodes: f.requiredFactCodes.includes(code)
        ? f.requiredFactCodes.filter((c) => c !== code)
        : [...f.requiredFactCodes, code],
    }));
  }

  async function handleCreateRule() {
    if (!ruleForm.strategyCode.trim() || ruleForm.requiredFactCodes.length === 0) {
      setMessage("전략 코드와 조건이 될 Fact 태그를 하나 이상 선택해 주세요.");
      return;
    }
    setCreatingRule(true);
    setMessage(null);
    try {
      await createStrategyRule(ruleForm);
      setRuleForm(EMPTY_RULE_FORM);
      load();
      setMessage("전략 규칙이 추가되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setCreatingRule(false);
    }
  }

  async function handleToggleRuleActive(rule: StrategyRule) {
    try {
      await updateStrategyRule(rule.id, { active: !rule.active });
      setStrategyRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r)),
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장 실패");
    }
  }

  async function handleDeleteRule(rule: StrategyRule) {
    try {
      await removeStrategyRule(rule.id);
      setStrategyRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  async function handleSaveLabel() {
    if (!labelForm.strategyCode.trim() || !labelForm.label.trim()) {
      setMessage("전략 코드와 노출 문구(라벨)를 입력해 주세요.");
      return;
    }
    setSavingLabel(true);
    setMessage(null);
    try {
      await upsertStrategyLabel(labelForm);
      setLabelForm(EMPTY_LABEL_FORM);
      load();
      setMessage("전략 표시 문구가 저장되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSavingLabel(false);
    }
  }

  async function handleDeleteLabel(label: StrategyLabel) {
    try {
      await removeStrategyLabel(label.id);
      setLabels((prev) => prev.filter((l) => l.id !== label.id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  async function handleBackfill() {
    setBackfilling(true);
    setMessage(null);
    try {
      const result = await backfillTagRules();
      setMessage(`전체 ${result.total}건 중 ${result.updated}건의 태그가 갱신되었습니다.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "재계산 실패");
    } finally {
      setBackfilling(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground p-6">불러오는 중...</p>;
  }

  const labelMap = new Map(labels.map((l) => [l.strategyCode, l]));

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-foreground">전략 태그 관리</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Fact 태그 조합(모두 만족 시)으로 전략 코드를 부여하고, 그 코드를 사용자에게
          보여줄 실제 문구로 연결합니다. 물건 상세페이지에는 여기서 만든{" "}
          <b className="text-foreground">라벨·설명만</b> 노출되고 Fact 태그 자체는 보이지
          않습니다.
        </p>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <div className="border border-border rounded-sm p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">
          1단계 · 전략 규칙 추가 (Fact 조합 → 전략 코드)
        </p>
        <input
          type="text"
          placeholder="전략 코드 (예: COMPETITION_LOW_POSSIBLE)"
          value={ruleForm.strategyCode}
          onChange={(e) => setRuleForm((f) => ({ ...f, strategyCode: e.target.value }))}
          className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card"
        />
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">
            아래 Fact 태그를 모두 가진 물건에만 이 전략이 부여됩니다(AND 조건).
          </p>
          <div className="flex flex-wrap gap-1.5">
            {factRules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                onClick={() => toggleFactCode(rule.tagCode)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  ruleForm.requiredFactCodes.includes(rule.tagCode)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-secondary/50"
                }`}
              >
                {rule.tagName}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleCreateRule()}
          disabled={creatingRule}
          className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {creatingRule ? "추가 중..." : "전략 규칙 추가"}
        </button>
      </div>

      <div className="border border-border rounded-sm overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">
                전략 코드
              </th>
              <th className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap">
                필요한 Fact 태그
              </th>
              <th className="px-3 py-2.5 font-semibold text-foreground text-center whitespace-nowrap w-20">
                활성
              </th>
              <th className="px-4 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {strategyRules.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  등록된 전략 규칙이 없습니다.
                </td>
              </tr>
            ) : (
              strategyRules.map((rule) => (
                <tr key={rule.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <p className="font-semibold text-foreground">{rule.strategyCode}</p>
                    {labelMap.has(rule.strategyCode) && (
                      <p className="text-[0.68rem] text-muted-foreground mt-0.5">
                        "{labelMap.get(rule.strategyCode)?.label}"
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 align-middle text-muted-foreground">
                    {rule.requiredFactCodes.join(" + ")}
                  </td>
                  <td className="px-3 py-3 align-middle text-center">
                    <input
                      type="checkbox"
                      checked={rule.active}
                      onChange={() => void handleToggleRuleActive(rule)}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle text-right">
                    <button
                      type="button"
                      onClick={() => void handleDeleteRule(rule)}
                      className="text-xs text-destructive hover:underline"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="border border-border rounded-sm p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">
          2단계 · 사용자 노출 문구 설정 (전략 코드 → 라벨/설명)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="전략 코드 (위에서 만든 코드와 동일하게)"
            value={labelForm.strategyCode}
            onChange={(e) => setLabelForm((f) => ({ ...f, strategyCode: e.target.value }))}
            className="px-2 py-2 text-sm border border-border rounded-sm bg-card"
          />
          <input
            type="text"
            placeholder="사용자에게 보일 라벨 (예: 경쟁이 적은 투자)"
            value={labelForm.label}
            onChange={(e) => setLabelForm((f) => ({ ...f, label: e.target.value }))}
            className="px-2 py-2 text-sm border border-border rounded-sm bg-card"
          />
        </div>
        <textarea
          placeholder="설명 (예: 세금 계산을 어려워하는 입찰자가 적어 경쟁이 낮아질 수 있습니다.)"
          value={labelForm.description}
          onChange={(e) => setLabelForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card resize-y"
        />
        <button
          type="button"
          onClick={() => void handleSaveLabel()}
          disabled={savingLabel}
          className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {savingLabel ? "저장 중..." : "문구 저장"}
        </button>
      </div>

      <div className="border border-border rounded-sm overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">
                전략 코드
              </th>
              <th className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap">라벨</th>
              <th className="px-3 py-2.5 font-semibold text-foreground">설명</th>
              <th className="px-4 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {labels.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  등록된 표시 문구가 없습니다.
                </td>
              </tr>
            ) : (
              labels.map((label) => (
                <tr key={label.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 align-middle font-semibold text-foreground whitespace-nowrap">
                    {label.strategyCode}
                  </td>
                  <td className="px-3 py-3 align-middle text-foreground whitespace-nowrap">
                    {label.label}
                  </td>
                  <td className="px-3 py-3 align-middle text-muted-foreground">{label.description}</td>
                  <td className="px-4 py-3 align-middle text-right">
                    <button
                      type="button"
                      onClick={() => void handleDeleteLabel(label)}
                      className="text-xs text-destructive hover:underline"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div>
        <button
          type="button"
          onClick={() => void handleBackfill()}
          disabled={backfilling}
          className="px-4 py-2 text-sm font-semibold rounded-sm border border-border bg-card disabled:opacity-50"
        >
          {backfilling ? "재계산 중..." : "기존 물건 태그 일괄 재계산"}
        </button>
        <p className="text-xs text-muted-foreground mt-1.5">
          Fact/전략 규칙이나 문구를 바꾼 뒤 이미 등록된 물건들에도 반영하려면 눌러주세요.
        </p>
      </div>
    </div>
  );
}
