"use client";

import { useEffect, useState } from "react";
import {
  createCourseAnnouncement,
  deleteCourseAnnouncement,
  fetchCourseAnnouncements,
  updateCourseAnnouncement,
  type CourseAnnouncement,
} from "@/lib/api";

/** 강의실(/courses/my) 대시보드 "공지사항" 영역에 노출되는 글을 관리한다.
 * 대출 문의 양식처럼 수강생에게 반복적으로 안내해야 하는 내용을 매번
 * 개별 전달하지 않고 여기 등록해두면 로그인한 모든 수강생이 보게 된다. */
export function CourseAnnouncementsPanel() {
  const [items, setItems] = useState<CourseAnnouncement[] | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    fetchCourseAnnouncements()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "공지사항을 불러오지 못했습니다."));
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(item: CourseAnnouncement) {
    setEditingId(item.id);
    setTitle(item.title);
    setBody(item.body);
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
  }

  async function handleSave() {
    if (!title.trim() || !body.trim()) {
      setError("제목과 내용을 모두 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await updateCourseAnnouncement(editingId, title, body);
      } else {
        await createCourseAnnouncement(title, body);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    setError("");
    try {
      await deleteCourseAnnouncement(id);
      if (editingId === id) resetForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (items === null) return <p className="text-sm text-muted-foreground p-4">불러오는 중...</p>;

  return (
    <div className="p-4">
      <h3 className="text-sm font-bold text-foreground mb-1">강의실 공지사항</h3>
      <p className="text-xs text-muted-foreground mb-4">
        /courses/my(내 강의실) 대시보드에 노출됩니다. 로그인한 모든 수강생이 볼 수 있습니다.
      </p>
      {error && <p className="text-xs text-destructive mb-3">{error}</p>}

      <div className="rounded-sm border border-border bg-card p-3 mb-4">
        <p className="text-xs font-semibold text-foreground mb-2">
          {editingId ? "공지사항 수정" : "새 공지사항 작성"}
        </p>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목 (예: 대출 문의 시 확인해 주세요)"
          className="w-full text-sm px-2.5 py-1.5 rounded-sm border border-border bg-background mb-2"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="내용"
          rows={8}
          className="w-full text-sm px-2.5 py-1.5 rounded-sm border border-border bg-background mb-2 whitespace-pre-wrap"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-sm bg-primary text-primary-foreground font-semibold disabled:opacity-50"
          >
            {editingId ? "수정 저장" : "등록"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-sm border border-border font-semibold disabled:opacity-50"
            >
              취소
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 && <p className="text-xs text-muted-foreground">등록된 공지사항이 없습니다.</p>}
        {items.map((item) => (
          <div key={item.id} className="rounded-sm border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{item.body}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  disabled={saving}
                  className="text-xs px-2.5 py-1 rounded-sm border border-border font-semibold disabled:opacity-50"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(item.id)}
                  disabled={saving}
                  className="text-xs px-2.5 py-1 rounded-sm border border-border text-destructive font-semibold disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
