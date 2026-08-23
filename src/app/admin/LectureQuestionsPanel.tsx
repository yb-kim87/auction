"use client";

import { useEffect, useState } from "react";
import {
  answerLectureQuestion,
  fetchAllLectureQuestions,
  type LectureQuestionAdminView,
} from "@/lib/api";

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 수강생이 강의 시청 페이지 Q&A 탭에 남긴 질문을 강의를 통틀어 모아
 * 보여주고, 그 자리에서 답변을 달 수 있게 한다(2026-08-23, 지금까지는
 * 질문이 저장만 되고 볼 화면이 없어 방치되고 있었음). */
export function LectureQuestionsPanel() {
  const [items, setItems] = useState<LectureQuestionAdminView[] | null>(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);

  function load() {
    fetchAllLectureQuestions()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "질문 목록을 불러오지 못했습니다."));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAnswer(id: string) {
    const answer = drafts[id]?.trim();
    if (!answer) return;
    setSavingId(id);
    setError("");
    try {
      const updated = await answerLectureQuestion(id, answer);
      setItems((prev) => prev?.map((q) => (q.id === id ? updated : q)) ?? null);
      setDrafts((prev) => ({ ...prev, [id]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "답변 등록에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  }

  if (items === null) return <p className="text-sm text-muted-foreground p-4">불러오는 중...</p>;

  const unansweredCount = items.filter((q) => !q.answer).length;
  const visibleItems = onlyUnanswered ? items.filter((q) => !q.answer) : items;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-foreground">강의 Q&amp;A 관리</h3>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={onlyUnanswered}
            onChange={(e) => setOnlyUnanswered(e.target.checked)}
          />
          미답변만 보기 ({unansweredCount})
        </label>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        수강생이 강의 시청 페이지 Q&amp;A 탭에 남긴 질문입니다. 답변을 등록하면 학생 화면에 바로 표시됩니다.
      </p>
      {error && <p className="text-xs text-destructive mb-3">{error}</p>}

      <div className="flex flex-col gap-2">
        {visibleItems.length === 0 && (
          <p className="text-xs text-muted-foreground">{onlyUnanswered ? "미답변 질문이 없습니다." : "등록된 질문이 없습니다."}</p>
        )}
        {visibleItems.map((q) => (
          <div key={q.id} className="rounded-sm border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-semibold text-foreground truncate">
                {q.courseTitle} · {q.videoTitle}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(q.createdAt)}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-1">
              {q.username}
              {!q.answer && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-sm bg-amber-100 text-amber-800 border border-amber-200">
                  미답변
                </span>
              )}
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap mb-2">{q.question}</p>

            {q.answer ? (
              <div className="rounded-sm bg-muted/50 border border-border p-2">
                <p className="text-[11px] text-muted-foreground mb-1">답변 · {q.answeredAt ? formatDateTime(q.answeredAt) : ""}</p>
                <p className="text-xs text-foreground whitespace-pre-wrap">{q.answer}</p>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <textarea
                  value={drafts[q.id] ?? ""}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="답변 입력"
                  rows={2}
                  className="flex-1 text-xs px-2 py-1.5 rounded-sm border border-border bg-background"
                />
                <button
                  type="button"
                  onClick={() => void handleAnswer(q.id)}
                  disabled={savingId === q.id || !(drafts[q.id]?.trim())}
                  className="text-xs px-3 py-1.5 rounded-sm bg-primary text-primary-foreground font-semibold disabled:opacity-50 self-start"
                >
                  답변 등록
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
