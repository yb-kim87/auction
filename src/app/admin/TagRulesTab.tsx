"use client";

import { useEffect, useState } from "react";
import {
  fetchTagRules,
  fetchTagRuleFields,
  fetchTagRuleFieldValueOptions,
  createTagRule,
  updateTagRule,
  removeTagRule,
  backfillTagRules,
  type TagRule,
  type TagRuleFieldDef,
  type TagRuleOperatorDef,
} from "@/lib/api";

const EMPTY_FORM = { tagName: "", field: "", operator: "", value: "" };

type EditForm = { tagName: string; field: string; operator: string; value: string };

/** 필드/연산자에 맞춰 값 입력을 텍스트/드롭박스(예·아니오)/다중선택 체크박스로 바꿔 보여준다. */
function ValueInput({
  fieldType,
  operator,
  hasValueOptions,
  fieldKey,
  value,
  onChange,
}: {
  fieldType: string | undefined;
  operator: string;
  hasValueOptions: boolean | undefined;
  fieldKey: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const useMultiSelect = hasValueOptions && operator === "in";

  useEffect(() => {
    if (!useMultiSelect || !fieldKey) return;
    setLoadingOptions(true);
    fetchTagRuleFieldValueOptions(fieldKey)
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setLoadingOptions(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useMultiSelect, fieldKey]);

  if (useMultiSelect) {
    const selected = new Set(
      value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    );
    function toggle(opt: string) {
      const next = new Set(selected);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      onChange([...next].join(","));
    }
    return (
      <div className="col-span-2 sm:col-span-4 flex flex-wrap gap-1.5 px-1 py-1">
        {loadingOptions ? (
          <span className="text-xs text-muted-foreground">값 목록 불러오는 중...</span>
        ) : options.length === 0 ? (
          <span className="text-xs text-muted-foreground">선택 가능한 값이 없습니다.</span>
        ) : (
          options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                selected.has(opt)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:bg-secondary/50"
              }`}
            >
              {opt}
            </button>
          ))
        )}
      </div>
    );
  }

  if (fieldType === "boolean") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-2 text-sm border border-border rounded-sm bg-card"
      >
        <option value="">값 선택</option>
        <option value="true">예</option>
        <option value="false">아니오</option>
      </select>
    );
  }

  return (
    <input
      type="text"
      placeholder="조건 값 (예: 85)"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-2 text-sm border border-border rounded-sm bg-card"
    />
  );
}

export function TagRulesTab() {
  const [rules, setRules] = useState<TagRule[]>([]);
  const [fields, setFields] = useState<TagRuleFieldDef[]>([]);
  const [operators, setOperators] = useState<TagRuleOperatorDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);

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
      setMessage("조건명, 필드, 연산자, 값을 모두 입력해 주세요.");
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      await createTagRule(form);
      setForm(EMPTY_FORM);
      load();
      setMessage("조건이 추가되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(rule: TagRule) {
    setEditingId(rule.id);
    setEditForm({ tagName: rule.tagName, field: rule.field, operator: rule.operator, value: rule.value });
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.tagName.trim() || !editForm.field || !editForm.operator || !editForm.value.trim()) {
      setMessage("조건명, 필드, 연산자, 값을 모두 입력해 주세요.");
      return;
    }
    setSavingEdit(true);
    setMessage(null);
    try {
      const updated = await updateTagRule(id, editForm);
      setRules((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setMessage("조건이 수정되었습니다.");
      cancelEdit();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setSavingEdit(false);
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

  function togglePendingDelete(ruleId: string) {
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  }

  async function handleConfirmDelete() {
    if (pendingDeleteIds.size === 0) return;
    setDeleting(true);
    setMessage(null);
    try {
      for (const id of pendingDeleteIds) {
        await removeTagRule(id);
      }
      setRules((prev) => prev.filter((r) => !pendingDeleteIds.has(r.id)));
      setMessage(`${pendingDeleteIds.size}개 조건이 삭제되었습니다.`);
      setPendingDeleteIds(new Set());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setDeleting(false);
    }
  }

  async function handleBackfill() {
    setBackfilling(true);
    setMessage(null);
    try {
      const result = await backfillTagRules();
      setMessage(`전체 ${result.total}건 중 ${result.updated}건의 조건이 갱신되었습니다.`);
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
        <h2 className="text-lg font-bold text-foreground">조건 관리</h2>
        <p className="text-sm text-muted-foreground mt-1">
          물건 데이터를 기준으로 내부 판단용 조건을 자동 계산하는 규칙입니다. 여기서 만든
          조건은 <b className="text-foreground">사용자에게 직접 노출되지 않습니다</b> —
          "추천 전략" 탭에서 이 조건들을 조합해 사용자에게 보여줄 투자 전략 문구를 만드세요.
          각 규칙의 회색 코드값(예: AREA_OVER_85)을 전략 규칙에서 참조합니다.
        </p>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <div className="border border-border rounded-sm p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">새 조건 추가</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input
            type="text"
            placeholder="조건명 (예: 85㎡ 초과)"
            value={form.tagName}
            onChange={(e) => setForm((f) => ({ ...f, tagName: e.target.value }))}
            className="px-2 py-2 text-sm border border-border rounded-sm bg-card col-span-2 sm:col-span-1"
          />
          <select
            value={form.field}
            onChange={(e) => setForm((f) => ({ ...f, field: e.target.value, operator: "", value: "" }))}
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
          <ValueInput
            fieldType={selectedFieldType}
            operator={form.operator}
            hasValueOptions={fields.find((f) => f.key === form.field)?.hasValueOptions}
            fieldKey={form.field}
            value={form.value}
            onChange={(v) => setForm((f) => ({ ...f, value: v }))}
          />
        </div>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating}
          className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {creating ? "추가 중..." : "조건 추가"}
        </button>
      </div>

      <div className="border border-border rounded-sm overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">조건명</th>
              <th className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap">조건식</th>
              <th className="px-3 py-2.5 font-semibold text-foreground text-center whitespace-nowrap w-20">
                활성
              </th>
              <th className="px-4 py-2.5 text-center whitespace-nowrap w-16">수정</th>
              <th className="px-4 py-2.5 text-center whitespace-nowrap w-16">삭제</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  등록된 조건이 없습니다.
                </td>
              </tr>
            ) : (
              rules.map((rule) => {
                const fieldLabel = fields.find((f) => f.key === rule.field)?.label ?? rule.field;
                const operatorLabel =
                  operators.find((op) => op.key === rule.operator)?.label ?? rule.operator;

                if (editingId === rule.id) {
                  const editFieldType = fields.find((f) => f.key === editForm.field)?.type;
                  const editOperators = editFieldType
                    ? operators.filter((op) => op.types.includes(editFieldType))
                    : operators;
                  return (
                    <tr key={rule.id} className="border-b border-border last:border-b-0 bg-secondary/20">
                      <td className="px-4 py-3 align-middle" colSpan={5}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <input
                            type="text"
                            value={editForm.tagName}
                            onChange={(e) => setEditForm((f) => ({ ...f, tagName: e.target.value }))}
                            className="px-2 py-2 text-sm border border-border rounded-sm bg-card"
                          />
                          <select
                            value={editForm.field}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, field: e.target.value, operator: "", value: "" }))
                            }
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
                            value={editForm.operator}
                            onChange={(e) => setEditForm((f) => ({ ...f, operator: e.target.value }))}
                            disabled={!editForm.field}
                            className="px-2 py-2 text-sm border border-border rounded-sm bg-card disabled:opacity-50"
                          >
                            <option value="">연산자 선택</option>
                            {editOperators.map((op) => (
                              <option key={op.key} value={op.key}>
                                {op.label}
                              </option>
                            ))}
                          </select>
                          <ValueInput
                            fieldType={editFieldType}
                            operator={editForm.operator}
                            hasValueOptions={fields.find((f) => f.key === editForm.field)?.hasValueOptions}
                            fieldKey={editForm.field}
                            value={editForm.value}
                            onChange={(v) => setEditForm((f) => ({ ...f, value: v }))}
                          />
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit(rule.id)}
                            disabled={savingEdit}
                            className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
                          >
                            {savingEdit ? "저장 중..." : "저장"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-3 py-1.5 text-xs font-medium rounded-sm border border-border bg-card"
                          >
                            취소
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

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
                    <td className="px-4 py-3 align-middle text-center">
                      <button
                        type="button"
                        onClick={() => startEdit(rule)}
                        className="text-xs text-primary hover:underline"
                      >
                        수정
                      </button>
                    </td>
                    <td className="px-4 py-3 align-middle text-center">
                      <input
                        type="checkbox"
                        checked={pendingDeleteIds.has(rule.id)}
                        onChange={() => togglePendingDelete(rule.id)}
                        className="w-4 h-4 accent-destructive"
                        aria-label="삭제할 조건으로 표시"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pendingDeleteIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 border border-destructive/30 bg-destructive/5 rounded-sm">
          <p className="text-sm text-destructive">
            {pendingDeleteIds.size}개 조건을 삭제 대상으로 선택했습니다.
          </p>
          <button
            type="button"
            onClick={() => void handleConfirmDelete()}
            disabled={deleting}
            className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-destructive text-destructive-foreground disabled:opacity-50"
          >
            {deleting ? "삭제 중..." : "선택 삭제 적용"}
          </button>
          <button
            type="button"
            onClick={() => setPendingDeleteIds(new Set())}
            className="px-3 py-1.5 text-xs font-medium rounded-sm border border-border bg-card"
          >
            선택 취소
          </button>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => void handleBackfill()}
          disabled={backfilling}
          className="px-4 py-2 text-sm font-semibold rounded-sm border border-border bg-card disabled:opacity-50"
        >
          {backfilling ? "재계산 중..." : "기존 물건 조건 일괄 재계산"}
        </button>
        <p className="text-xs text-muted-foreground mt-1.5">
          규칙을 추가·수정·삭제한 뒤 이미 등록된 물건들에도 반영하려면 눌러주세요. 새로
          등록되는 물건은 저장 시 자동으로 반영됩니다.
        </p>
      </div>
    </div>
  );
}
