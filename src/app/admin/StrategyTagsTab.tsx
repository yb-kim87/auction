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

type StrategyForm = {
  strategyCode: string;
  requiredFactCodes: string[];
  label: string;
  description: string;
};

const EMPTY_FORM: StrategyForm = {
  strategyCode: "",
  requiredFactCodes: [],
  label: "",
  description: "",
};

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

  const labelMap = new Map(labels.map((l) => [l.strategyCode, l]));

  function toggleFactCode(code: string) {
    setForm((f) => ({
      ...f,
      requiredFactCodes: f.requiredFactCodes.includes(code)
        ? f.requiredFactCodes.filter((c) => c !== code)
        : [...f.requiredFactCodes, code],
    }));
  }

  async function handleCreate() {
    if (!form.strategyCode.trim() || form.requiredFactCodes.length === 0 || !form.label.trim()) {
      setMessage("전략 코드, 조건, 사용자 노출 라벨을 모두 입력해 주세요.");
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      await createStrategyRule({
        strategyCode: form.strategyCode,
        requiredFactCodes: form.requiredFactCodes,
      });
      await upsertStrategyLabel({
        strategyCode: form.strategyCode,
        label: form.label,
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
    const label = labelMap.get(rule.strategyCode);
    setEditingId(rule.id);
    setEditForm({
      strategyCode: rule.strategyCode,
      requiredFactCodes: [...rule.requiredFactCodes],
      label: label?.label ?? "",
      description: label?.description ?? "",
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
    if (!editForm.strategyCode.trim() || editForm.requiredFactCodes.length === 0 || !editForm.label.trim()) {
      setMessage("전략 코드, 조건, 사용자 노출 라벨을 모두 입력해 주세요.");
      return;
    }
    setSavingEdit(true);
    setMessage(null);
    try {
      await updateStrategyRule(id, {
        strategyCode: editForm.strategyCode,
        requiredFactCodes: editForm.requiredFactCodes,
      });
      await upsertStrategyLabel({
        strategyCode: editForm.strategyCode,
        label: editForm.label,
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
      const label = labelMap.get(rule.strategyCode);
      if (label) {
        await removeStrategyLabel(label.id);
      }
      setStrategyRules((prev) => prev.filter((r) => r.id !== rule.id));
      setLabels((prev) => prev.filter((l) => l.strategyCode !== rule.strategyCode));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "삭제 실패");
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
          보여줄 실제 문구로 연결합니다. 물건 상세페이지에는 여기서 만든{" "}
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
        <input
          type="text"
          placeholder="사용자에게 보일 라벨 (예: 경쟁이 적은 투자)"
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card"
        />
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
                          <input
                            type="text"
                            placeholder="사용자에게 보일 라벨"
                            value={editForm.label}
                            onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                            className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card"
                          />
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

                const label = labelMap.get(rule.strategyCode);
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
                      {label?.description || "-"}
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
