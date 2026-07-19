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
  refineStrategyDescription,
  backfillTagRules,
  type TagRule,
  type StrategyRule,
  type StrategyLabel,
} from "@/lib/api";

type StrategyForm = {
  strategyCode: string;
  requiredFactCodes: string[];
  labelIds: string[];
  description: string;
};

const EMPTY_FORM: StrategyForm = {
  strategyCode: "",
  requiredFactCodes: [],
  labelIds: [],
  description: "",
};
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
  const [refiningDescription, setRefiningDescription] = useState(false);
  const [refiningEditDescription, setRefiningEditDescription] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

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

  const labelById = new Map(labels.map((l) => [l.id, l]));

  function toggleFactCode(code: string) {
    setForm((f) => ({
      ...f,
      requiredFactCodes: f.requiredFactCodes.includes(code)
        ? f.requiredFactCodes.filter((c) => c !== code)
        : [...f.requiredFactCodes, code],
    }));
  }

  function toggleFormLabel(labelId: string) {
    setForm((f) => ({
      ...f,
      labelIds: f.labelIds.includes(labelId)
        ? f.labelIds.filter((id) => id !== labelId)
        : [...f.labelIds, labelId],
    }));
  }

  function toggleEditLabel(labelId: string) {
    setEditForm((f) => ({
      ...f,
      labelIds: f.labelIds.includes(labelId)
        ? f.labelIds.filter((id) => id !== labelId)
        : [...f.labelIds, labelId],
    }));
  }

  async function handleCreate() {
    if (!form.strategyCode.trim() || form.requiredFactCodes.length === 0 || form.labelIds.length === 0) {
      setMessage("전략 코드, 조건, 노출 라벨을 하나 이상 선택해 주세요.");
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      await createStrategyRule({
        strategyCode: form.strategyCode,
        requiredFactCodes: form.requiredFactCodes,
        labelIds: form.labelIds,
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

  /** 입력한 설명 초안을 AI가 다듬어 즉시 textarea에 채운다(저장은 안 함 —
   * 결과를 확인·수정한 뒤 기존 "전략 추가" 버튼으로 승인). */
  async function handleRefineDescription() {
    if (!form.description.trim()) {
      setMessage("먼저 설명 초안을 입력해 주세요.");
      return;
    }
    const label = form.labelIds.map((id) => labelById.get(id)?.label).filter(Boolean).join(", ");
    setRefiningDescription(true);
    setMessage(null);
    try {
      const { description } = await refineStrategyDescription({
        label,
        rawText: form.description,
      });
      setForm((f) => ({ ...f, description }));
      setMessage("AI가 설명을 다듬었습니다. 확인 후 「전략 추가」를 눌러 승인해 주세요.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "AI 정리 실패");
    } finally {
      setRefiningDescription(false);
    }
  }

  async function handleRefineEditDescription() {
    if (!editForm.description.trim()) {
      setMessage("먼저 설명 초안을 입력해 주세요.");
      return;
    }
    const label = editForm.labelIds.map((id) => labelById.get(id)?.label).filter(Boolean).join(", ");
    setRefiningEditDescription(true);
    setMessage(null);
    try {
      const { description } = await refineStrategyDescription({
        label,
        rawText: editForm.description,
      });
      setEditForm((f) => ({ ...f, description }));
      setMessage("AI가 설명을 다듬었습니다. 확인 후 「저장」을 눌러 승인해 주세요.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "AI 정리 실패");
    } finally {
      setRefiningEditDescription(false);
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
    setEditingId(rule.id);
    setEditForm({
      strategyCode: rule.strategyCode,
      requiredFactCodes: [...rule.requiredFactCodes],
      labelIds: [...rule.labelIds],
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
    if (
      !editForm.strategyCode.trim() ||
      editForm.requiredFactCodes.length === 0 ||
      editForm.labelIds.length === 0
    ) {
      setMessage("전략 코드, 조건, 노출 라벨을 하나 이상 선택해 주세요.");
      return;
    }
    setSavingEdit(true);
    setMessage(null);
    try {
      await updateStrategyRule(id, {
        strategyCode: editForm.strategyCode,
        requiredFactCodes: editForm.requiredFactCodes,
        labelIds: editForm.labelIds,
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
        await removeStrategyRule(id);
      }
      setStrategyRules((prev) => prev.filter((r) => !pendingDeleteIds.has(r.id)));
      setMessage(`${pendingDeleteIds.size}개 전략이 삭제되었습니다.`);
      setPendingDeleteIds(new Set());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setDeleting(false);
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
          보여줄 라벨(여러 개 선택 가능)과 연결합니다. 물건 상세페이지에는 여기서 만든{" "}
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
          "전략 추가"에서 여러 개를 동시에 선택해 쓸 수 있습니다. 설명은 전략을
          추가할 때 그때그때 작성합니다.
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
                  <th className="px-3 py-2 font-semibold text-foreground">
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
                  const linkedRules = strategyRules.filter((r) => r.labelIds.includes(label.id));
                  return (
                    <tr key={label.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 align-middle font-medium text-foreground whitespace-nowrap">
                        {label.label}
                      </td>
                      <td className="px-3 py-2 align-middle text-muted-foreground">
                        {linkedRules.length > 0
                          ? linkedRules.map((r) => r.strategyCode).join(", ")
                          : "-"}
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
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">
            노출 라벨(여러 개 선택 가능 — 물건 상세에 배지로 모두 표시됩니다).
          </p>
          <div className="flex flex-wrap gap-1.5">
            {labels.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                먼저 위에서 라벨을 하나 이상 등록해 주세요.
              </span>
            ) : (
              labels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => toggleFormLabel(label.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    form.labelIds.includes(label.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-secondary/50"
                  }`}
                >
                  {label.label}
                </button>
              ))
            )}
          </div>
        </div>
        <textarea
          placeholder="설명 (예: 세금 계산을 어려워하는 입찰자가 적어 경쟁이 낮아질 수 있습니다.)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card resize-y"
        />
        <button
          type="button"
          onClick={() => void handleRefineDescription()}
          disabled={refiningDescription}
          className="px-3 py-1.5 text-xs font-medium rounded-sm border border-border bg-card disabled:opacity-50"
        >
          {refiningDescription ? "AI가 다듬는 중..." : "AI로 설명 다듬기"}
        </button>
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
        <table className="w-full text-sm border-collapse table-fixed">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[28%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-3 py-2.5 font-semibold text-foreground">전략 코드</th>
              <th className="px-3 py-2.5 font-semibold text-foreground">라벨</th>
              <th className="px-3 py-2.5 font-semibold text-foreground">필요한 조건</th>
              <th className="px-3 py-2.5 font-semibold text-foreground">설명</th>
              <th className="px-3 py-2.5 font-semibold text-foreground text-center">활성</th>
              <th className="px-3 py-2.5 text-center">수정</th>
              <th className="px-3 py-2.5 text-center">삭제</th>
            </tr>
          </thead>
          <tbody>
            {strategyRules.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  등록된 전략이 없습니다.
                </td>
              </tr>
            ) : (
              strategyRules.map((rule) => {
                if (editingId === rule.id) {
                  return (
                    <tr key={rule.id} className="border-b border-border last:border-b-0 bg-secondary/20">
                      <td className="px-3 py-3 align-top" colSpan={7}>
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
                          <div>
                            <p className="text-xs text-muted-foreground mb-1.5">
                              노출 라벨(여러 개 선택 가능).
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {labels.map((label) => (
                                <button
                                  key={label.id}
                                  type="button"
                                  onClick={() => toggleEditLabel(label.id)}
                                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                    editForm.labelIds.includes(label.id)
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-card text-muted-foreground border-border hover:bg-secondary/50"
                                  }`}
                                >
                                  {label.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <textarea
                            placeholder="설명"
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, description: e.target.value }))
                            }
                            rows={2}
                            className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card resize-y"
                          />
                          <button
                            type="button"
                            onClick={() => void handleRefineEditDescription()}
                            disabled={refiningEditDescription}
                            className="px-3 py-1.5 text-xs font-medium rounded-sm border border-border bg-card disabled:opacity-50"
                          >
                            {refiningEditDescription ? "AI가 다듬는 중..." : "AI로 설명 다듬기"}
                          </button>
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

                const ruleLabels = rule.labelIds
                  .map((id) => labelById.get(id))
                  .filter((l): l is StrategyLabel => Boolean(l));
                return (
                  <tr key={rule.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-3 align-top">
                      <p className="font-semibold text-foreground break-words">{rule.strategyCode}</p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      {ruleLabels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {ruleLabels.map((label) => (
                            <span
                              key={label.id}
                              className="inline-flex px-2 py-0.5 text-[0.7rem] font-medium rounded-full bg-secondary/60 text-foreground/80"
                            >
                              {label.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-muted-foreground break-words">
                      {rule.requiredFactCodes.join(" + ")}
                    </td>
                    <td className="px-3 py-3 align-top text-muted-foreground break-words">
                      {rule.description || "-"}
                    </td>
                    <td className="px-3 py-3 align-top text-center">
                      <input
                        type="checkbox"
                        checked={rule.active}
                        onChange={() => void handleToggleActive(rule)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-3 py-3 align-top text-center">
                      <button
                        type="button"
                        onClick={() => startEdit(rule)}
                        className="text-xs text-primary hover:underline"
                      >
                        수정
                      </button>
                    </td>
                    <td className="px-3 py-3 align-top text-center">
                      <input
                        type="checkbox"
                        checked={pendingDeleteIds.has(rule.id)}
                        onChange={() => togglePendingDelete(rule.id)}
                        className="w-4 h-4 accent-destructive"
                        aria-label="삭제할 전략으로 표시"
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
            {pendingDeleteIds.size}개 전략을 삭제 대상으로 선택했습니다.
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
          {backfilling ? "재계산 중..." : "기존 물건 태그 일괄 재계산"}
        </button>
        <p className="text-xs text-muted-foreground mt-1.5">
          조건/전략 규칙이나 문구를 바꾼 뒤 이미 등록된 물건들에도 반영하려면 눌러주세요.
        </p>
      </div>
    </div>
  );
}
