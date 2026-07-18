"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { AuctionKnowledgeItem } from "@/types/auction";
import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  fetchKnowledgeItems,
  updateKnowledgeItem,
} from "@/lib/api";

const CATEGORIES = ["권리분석", "물건추천", "공통"];

const emptyForm = {
  title: "",
  category: "권리분석",
  tags: "",
  content: "",
  active: true,
};

export function KnowledgeListPanel() {
  const [items, setItems] = useState<AuctionKnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchKnowledgeItems());
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "목록을 불러오지 못했습니다.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(item: AuctionKnowledgeItem) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      category: item.category || "공통",
      tags: item.tags,
      content: item.content,
      active: item.active,
    });
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editingId) {
        await updateKnowledgeItem(editingId, form);
        setMessage({ type: "success", text: "경매지식이 수정되었습니다." });
      } else {
        await createKnowledgeItem(form);
        setMessage({ type: "success", text: "경매지식이 등록되었습니다." });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "저장에 실패했습니다.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 경매지식을 삭제할까요?")) return;
    try {
      await deleteKnowledgeItem(id);
      setMessage({ type: "success", text: "삭제되었습니다." });
      await load();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "삭제에 실패했습니다.",
      });
    }
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-foreground">경매지식 관리</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            경매코치 AI 분석 시 참고할 내부 지식을 등록합니다. 물건 분석 시 관련 지식이 자동 검색되어 반영됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground"
        >
          <Plus size={15} />
          지식 추가
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-sm border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 border border-border rounded-sm bg-card p-5 space-y-4 max-w-3xl"
        >
          <h3 className="text-sm font-bold">{editingId ? "지식 수정" : "지식 등록"}</h3>
          <label className="block text-sm space-y-1">
            <span className="text-muted-foreground">제목</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-sm bg-background"
              required
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm space-y-1">
              <span className="text-muted-foreground">분류</span>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-sm bg-background"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm space-y-1">
              <span className="text-muted-foreground">태그 (쉼표 구분)</span>
              <input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="대항력, 갭투자, LTV"
                className="w-full px-3 py-2 border border-border rounded-sm bg-background"
              />
            </label>
          </div>
          <label className="block text-sm space-y-1">
            <span className="text-muted-foreground">내용</span>
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={10}
              className="w-full px-3 py-2 border border-border rounded-sm bg-background resize-y"
              required
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            활성 (AI RAG 참조 대상)
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-sm rounded-sm border border-border"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-sm">
          등록된 경매지식이 없습니다. 「지식 추가」로 분석 노하우를 쌓아 두세요.
        </p>
      ) : (
        <div className="border border-border rounded-sm overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-secondary/80">
              <tr className="border-b border-border">
                <th className="px-3 py-2.5 text-left font-semibold">제목</th>
                <th className="px-3 py-2.5 text-left font-semibold">분류</th>
                <th className="px-3 py-2.5 text-left font-semibold">태그</th>
                <th className="px-3 py-2.5 text-left font-semibold">상태</th>
                <th className="px-3 py-2.5 text-left font-semibold">관리</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border hover:bg-secondary/20">
                  <td className="px-3 py-2.5 font-medium max-w-[200px] truncate">{item.title}</td>
                  <td className="px-3 py-2.5">{item.category || "-"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground max-w-[160px] truncate">
                    {item.tags || "-"}
                  </td>
                  <td className="px-3 py-2.5">
                    {item.active ? (
                      <span className="text-emerald-700">활성</span>
                    ) : (
                      <span className="text-muted-foreground">비활성</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="p-1 rounded-sm hover:bg-secondary"
                        aria-label="수정"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id)}
                        className="p-1 rounded-sm hover:bg-destructive/10 text-destructive"
                        aria-label="삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
