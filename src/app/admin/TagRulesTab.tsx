"use client";

import { useEffect, useState } from "react";
import {
  fetchTagRules,
  fetchTagRuleFields,
  createTagRule,
  updateTagRule,
  removeTagRule,
  backfillTagRules,
  type TagRule,
  type TagRuleFieldDef,
  type TagRuleOperatorDef,
} from "@/lib/api";

const EMPTY_FORM = { tagName: "", field: "", operator: "", value: "" };

export function TagRulesTab() {
  const [rules, setRules] = useState<TagRule[]>([]);
  const [fields, setFields] = useState<TagRuleFieldDef[]>([]);
  const [operators, setOperators] = useState<TagRuleOperatorDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([fetchTagRules(), fetchTagRuleFields()])
      .then(([ruleList, fieldData]) => {
        setRules(ruleList);
        setFields(fieldData.fields);
        setOperators(fieldData.operators);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const selectedFieldType = fields.find((f) => f.key === form.field)?.type;
  const availableOperators = selectedFieldType
    ? operators.filter((op) => op.types.includes(selectedFieldType))
    : operators;

  async function handleCreate() {
    if (!form.tagName.trim() || !form.field || !form.operator || !form.value.trim()) {
      setMessage("태그명, 필드, 연산자, 값을 모두 입력해 주세요.");
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      await createTagRule(form);
      setForm(EMPTY_FORM);
      load();
      setMessage("태그 규칙이 추가되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(rule: TagRule) {
    try {
      await updateTagRule(rule.id, { active: !rule.active });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r)));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장 실패");
    }
  }

  async function handleDelete(rule: TagRule) {
    try {
      await removeTagRule(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
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

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-foreground">태그 관리 (Fact Tag)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          물건 데이터를 기준으로 내부 판단용 사실(Fact)을 자동 계산하는 규칙입니다. 여기서
          만든 Fact 태그는 <b className="text-foreground">사용자에게 직접 노출되지 않습니다</b> —
          "Strategy 태그 관리" 탭에서 이 Fact들을 조합해 사용자에게 보여줄 투자 전략 문구를
          만드세요. 각 규칙의 회색 코드값(예: AREA_OVER_85)을 Strategy 규칙에서 참조합니다.
        </p>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <div className="border border-border rounded-sm p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">새 태그 규칙 추가</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input
            type="text"
            placeholder="태그명 (예: 85㎡ 초과)"
            value={form.tagName}
            onChange={(e) => setForm((f) => ({ ...f, tagName: e.target.value }))}
            className="px-2 py-2 text-sm border border-border rounded-sm bg-card col-span-2 sm:col-span-1"
          />
          <select
            value={form.field}
            onChange={(e) => setForm((f) => ({ ...f, field: e.target.value, operator: "" }))}
            className="px-2 py-2 text-sm border border-border rounded-sm bg-card"
          >
            <option value="">필드 선택</option>
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            value={form.operator}
            onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}
            disabled={!form.field}
            className="px-2 py-2 text-sm border border-border rounded-sm bg-card disabled:opacity-50"
          >
            <option value="">연산자 선택</option>
            {availableOperators.map((op) => (
              <option key={op.key} value={op.key}>
                {op.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="조건 값 (예: 85)"
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            className="px-2 py-2 text-sm border border-border rounded-sm bg-card"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating}
          className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {creating ? "추가 중..." : "규칙 추가"}
        </button>
      </div>

      <div className="border border-border rounded-sm overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">태그명</th>
              <th className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap">조건</th>
              <th className="px-3 py-2.5 font-semibold text-foreground text-center whitespace-nowrap w-20">
                활성
              </th>
              <th className="px-4 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  등록된 태그 규칙이 없습니다.
                </td>
              </tr>
            ) : (
              rules.map((rule) => {
                const fieldLabel = fields.find((f) => f.key === rule.field)?.label ?? rule.field;
                const operatorLabel =
                  operators.find((op) => op.key === rule.operator)?.label ?? rule.operator;
                return (
                  <tr key={rule.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <p className="font-semibold text-foreground">{rule.tagName}</p>
                      <p className="text-[0.68rem] text-muted-foreground mt-0.5">{rule.tagCode}</p>
                    </td>
                    <td className="px-3 py-3 align-middle text-muted-foreground whitespace-nowrap">
                      {fieldLabel} {operatorLabel} {rule.value}
                    </td>
                    <td className="px-3 py-3 align-middle text-center">
                      <input
                        type="checkbox"
                        checked={rule.active}
                        onChange={() => void handleToggleActive(rule)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3 align-middle text-right">
                      <button
                        type="button"
                        onClick={() => void handleDelete(rule)}
                        className="text-xs text-destructive hover:underline"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })
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
          규칙을 추가·수정·삭제한 뒤 이미 등록된 물건들에도 반영하려면 눌러주세요. 새로
          등록되는 물건은 저장 시 자동으로 반영됩니다.
        </p>
      </div>
    </div>
  );
}
