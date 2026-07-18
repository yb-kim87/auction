"use client";

import { useEffect, useState } from "react";
import {
  fetchTagRules,
  fetchStrategyRules,
  createStrategyRule,
  updateStrategyRule,
  removeStrategyRule,
  fetchStrategyLabels,
  createStrategyLabel,
  updateStrategyLabel,
  removeStrategyLabel,
  backfillTagRules,
  type TagRule,
  type StrategyRule,
  type StrategyLabel,
} from "@/lib/api";

type StrategyForm = {
  strategyCode: string;
  requiredFactCodes: string[];
  labelId: string;
  description: string;
};

const EMPTY_FORM: StrategyForm = { strategyCode: "", requiredFactCodes: [], labelId: "", description: "" };
const EMPTY_LABEL_FORM = { label: "" };

export function StrategyTagsTab() {
  const [factRules, setFactRules] = useState<TagRule[]>([]);
  const [strategyRules, setStrategyRules] = useState<StrategyRule[]>([]);
  const [labels, setLabels] = useState<StrategyLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<StrategyForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<StrategyForm>(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);

  const [labelForm, setLabelForm] = useState(EMPTY_LABEL_FORM);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editLabelForm, setEditLabelForm] = useState(EMPTY_LABEL_FORM);
  const [savingLabelEdit, setSavingLabelEdit] = useState(false);

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

  const labelByStrategyCode = new Map(labels.filter((l) => l.strategyCode).map((l) => [l.strategyCode, l]));

  function toggleFactCode(code: string) {
    setForm((f) => ({
      ...f,
      requiredFactCodes: f.requiredFactCodes.includes(code)
        ? f.requiredFactCodes.filter((c) => c !== code)
        : [...f.requiredFactCodes, code],
    }));
  }

  async function handleCreate() {
    if (!form.strategyCode.trim() || form.requiredFactCodes.length === 0 || !form.labelId) {
      setMessage("전략 코드, 조건, 노출 라벨을 모두 선택해 주세요.");
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      await createStrategyRule({
        strategyCode: form.strategyCode,
        requiredFactCodes: form.requiredFactCodes,
        labelId: form.labelId,
        description: form.description,
      });
      setForm(EMPTY_FORM);
      load();
      setMessage("전략이 추가되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(rule: StrategyRule) {
    try {
      await updateStrategyRule(rule.id, { active: !rule.active });
      setStrategyRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r)),
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장 실패");
    }
  }

  function startEdit(rule: StrategyRule) {
    const label = labelByStrategyCode.get(rule.strategyCode);
    setEditingId(rule.id);
    setEditForm({
      strategyCode: rule.strategyCode,
      requiredFactCodes: [...rule.requiredFactCodes],
      labelId: label?.id ?? "",
      description: rule.description,
    });
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  function toggleEditFactCode(code: string) {
    setEditForm((f) => ({
      ...f,
      requiredFactCodes: f.requiredFactCodes.includes(code)
        ? f.requiredFactCodes.filter((c) => c !== code)
        : [...f.requiredFactCodes, code],
    }));
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.strategyCode.trim() || editForm.requiredFactCodes.length === 0 || !editForm.labelId) {
      setMessage("전략 코드, 조건, 노출 라벨을 모두 선택해 주세요.");
      return;
    }
    setSavingEdit(true);
    setMessage(null);
    try {
      await updateStrategyRule(id, {
        strategyCode: editForm.strategyCode,
        requiredFactCodes: editForm.requiredFactCodes,
        labelId: editForm.labelId,
        description: editForm.description,
      });
      cancelEdit();
      load();
      setMessage("전략이 수정되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(rule: StrategyRule) {
    try {
      await removeStrategyRule(rule.id);
      setStrategyRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  async function handleCreateLabel() {
    if (!labelForm.label.trim()) {
      setMessage("노출 라벨을 입력해 주세요.");
      return;
    }
    setCreatingLabel(true);
    setMessage(null);
    try {
      await createStrategyLabel(labelForm);
      setLabelForm(EMPTY_LABEL_FORM);
      load();
      setMessage("라벨이 추가되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "라벨 생성 실패");
    } finally {
      setCreatingLabel(false);
    }
  }

  function startEditLabel(label: StrategyLabel) {
    setEditingLabelId(label.id);
    setEditLabelForm({ label: label.label });
    setMessage(null);
  }

  function cancelEditLabel() {
    setEditingLabelId(null);
    setEditLabelForm(EMPTY_LABEL_FORM);
  }

  async function handleSaveLabelEdit(id: string) {
    if (!editLabelForm.label.trim()) {
      setMessage("노출 라벨을 입력해 주세요.");
      return;
    }
    setSavingLabelEdit(true);
    setMessage(null);
    try {
      await updateStrategyLabel(id, editLabelForm);
      cancelEditLabel();
      load();
      setMessage("라벨이 수정되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "라벨 수정 실패");
    } finally {
      setSavingLabelEdit(false);
    }
  }

  async function handleDeleteLabel(label: StrategyLabel) {
    try {
      await removeStrategyLabel(label.id);
      setLabels((prev) => prev.filter((l) => l.id !== label.id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "라벨 삭제 실패");
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
        <h2 className="text-lg font-bold text-foreground">전략 관리</h2>
        <p className="text-sm text-muted-foreground mt-1">
          조건 조합(모두 만족 시)으로 전략 코드를 부여하고, 그 코드를 사용자에게
          보여줄 라벨과 연결합니다. 물건 상세페이지에는 여기서 만든{" "}
          <b className="text-foreground">라벨·설명만</b> 노출되고 조건 자체는 보이지
          않습니다.
        </p>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <div className="border border-border rounded-sm p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">노출 라벨 관리</p>
        <p className="text-xs text-muted-foreground">
          전략에 연결할 사용자 노출 라벨(짧은 배지 문구)을 미리 등록해두면, 아래
          "전략 추가"에서 드롭박스로 골라 쓸 수 있습니다. 설명은 전략을 추가할 때
          그때그때 작성합니다.
        </p>
        <input
          type="text"
          placeholder="라벨 (예: 경쟁이 적은 투자)"
          value={labelForm.label}
          onChange={(e) => setLabelForm({ label: e.target.value })}
          className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card"
        />
        <button
          type="button"
          onClick={() => void handleCreateLabel()}
          disabled={creatingLabel}
          className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {creatingLabel ? "추가 중..." : "라벨 추가"}
        </button>

        {labels.length > 0 && (
          <div className="border border-border rounded-sm overflow-x-auto mt-2">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-left">
                  <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">라벨</th>
                  <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">
                    연결된 전략
                  </th>
                  <th className="px-3 py-2 text-center whitespace-nowrap w-16">수정</th>
                  <th className="px-3 py-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {labels.map((label) => {
                  if (editingLabelId === label.id) {
                    return (
                      <tr key={label.id} className="border-b border-border last:border-b-0 bg-secondary/20">
                        <td className="px-3 py-2" colSpan={4}>
                          <input
                            type="text"
                            value={editLabelForm.label}
                            onChange={(e) => setEditLabelForm({ label: e.target.value })}
                            className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card"
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => void handleSaveLabelEdit(label.id)}
                              disabled={savingLabelEdit}
                              className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
                            >
                              {savingLabelEdit ? "저장 중..." : "저장"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditLabel}
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
                    <tr key={label.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 align-middle font-medium text-foreground whitespace-nowrap">
                        {label.label}
                      </td>
                      <td className="px-3 py-2 align-middle text-muted-foreground whitespace-nowrap">
                        {label.strategyCode || "-"}
                      </td>
                      <td className="px-3 py-2 align-middle text-center">
                        <button
                          type="button"
                          onClick={() => startEditLabel(label)}
                          className="text-xs text-primary hover:underline"
                        >
                          수정
                        </button>
                      </td>
                      <td className="px-3 py-2 align-middle text-right">
                        <button
                          type="button"
                          onClick={() => void handleDeleteLabel(label)}
                          className="text-xs text-destructive hover:underline"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border border-border rounded-sm p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">전략 추가</p>
        <input
          type="text"
          placeholder="전략 코드 (예: COMPETITION_LOW_POSSIBLE)"
          value={form.strategyCode}
          onChange={(e) => setForm((f) => ({ ...f, strategyCode: e.target.value }))}
          className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card"
        />
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">
            아래 조건을 모두 가진 물건에만 이 전략이 부여됩니다(AND 조건).
          </p>
          <div className="flex flex-wrap gap-1.5">
            {factRules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                onClick={() => toggleFactCode(rule.tagCode)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  form.requiredFactCodes.includes(rule.tagCode)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-secondary/50"
                }`}
              >
                {rule.tagName}
              </button>
            ))}
          </div>
        </div>
        <select
          value={form.labelId}
          onChange={(e) => setForm((f) => ({ ...f, labelId: e.target.value }))}
          className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card"
        >
          <option value="">노출 라벨 선택</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.label}
            </option>
          ))}
        </select>
        <textarea
          placeholder="설명 (예: 세금 계산을 어려워하는 입찰자가 적어 경쟁이 낮아질 수 있습니다.)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card resize-y"
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating}
          className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {creating ? "추가 중..." : "전략 추가"}
        </button>
      </div>

      <div className="border border-border rounded-sm overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">
                전략 코드 · 라벨
              </th>
              <th className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap">
                필요한 조건
              </th>
              <th className="px-3 py-2.5 font-semibold text-foreground">설명</th>
              <th className="px-3 py-2.5 font-semibold text-foreground text-center whitespace-nowrap w-20">
                활성
              </th>
              <th className="px-4 py-2.5 text-center whitespace-nowrap w-16">수정</th>
              <th className="px-4 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {strategyRules.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  등록된 전략이 없습니다.
                </td>
              </tr>
            ) : (
              strategyRules.map((rule) => {
                if (editingId === rule.id) {
                  return (
                    <tr key={rule.id} className="border-b border-border last:border-b-0 bg-secondary/20">
                      <td className="px-4 py-3 align-middle" colSpan={6}>
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="전략 코드"
                            value={editForm.strategyCode}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, strategyCode: e.target.value }))
                            }
                            className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card"
                          />
                          <div>
                            <p className="text-xs text-muted-foreground mb-1.5">
                              아래 조건을 모두 가진 물건에만 이 전략이 부여됩니다(AND 조건).
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {factRules.map((fr) => (
                                <button
                                  key={fr.id}
                                  type="button"
                                  onClick={() => toggleEditFactCode(fr.tagCode)}
                                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                    editForm.requiredFactCodes.includes(fr.tagCode)
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-card text-muted-foreground border-border hover:bg-secondary/50"
                                  }`}
                                >
                                  {fr.tagName}
                                </button>
                              ))}
                            </div>
                          </div>
                          <select
                            value={editForm.labelId}
                            onChange={(e) => setEditForm((f) => ({ ...f, labelId: e.target.value }))}
                            className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card"
                          >
                            <option value="">노출 라벨 선택</option>
                            {labels.map((label) => (
                              <option key={label.id} value={label.id}>
                                {label.label}
                              </option>
                            ))}
                          </select>
                          <textarea
                            placeholder="설명"
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, description: e.target.value }))
                            }
                            rows={2}
                            className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card resize-y"
                          />
                        </div>
                        <div className="flex gap-2 mt-3">
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

                const label = labelByStrategyCode.get(rule.strategyCode);
                return (
                  <tr key={rule.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <p className="font-semibold text-foreground">{rule.strategyCode}</p>
                      {label && (
                        <p className="text-[0.68rem] text-muted-foreground mt-0.5">"{label.label}"</p>
                      )}
                    </td>
                    <td className="px-3 py-3 align-middle text-muted-foreground">
                      {rule.requiredFactCodes.join(" + ")}
                    </td>
                    <td className="px-3 py-3 align-middle text-muted-foreground">
                      {rule.description || "-"}
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
          조건/전략 규칙이나 문구를 바꾼 뒤 이미 등록된 물건들에도 반영하려면 눌러주세요.
        </p>
      </div>
    </div>
  );
}
