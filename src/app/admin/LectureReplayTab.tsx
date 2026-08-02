"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createLectureCourse,
  createLectureLink,
  createLectureSection,
  createLectureVideo,
  deleteLectureCourse,
  deleteLectureLink,
  deleteLectureSection,
  deleteLectureVideo,
  fetchLectureCourses,
  fetchLectureLinks,
  fetchLectureSections,
  fetchLectureVideos,
  updateLectureCourse,
  updateLectureLink,
  updateLectureSection,
  updateLectureVideo,
  type LectureAccessLink,
  type LectureCourse,
  type LectureSection,
  type LectureVideo,
} from "@/lib/api";

function formatDate(value: string | null): string {
  if (!value) return "무제한";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR");
}

export function LectureReplayTab() {
  const [courses, setCourses] = useState<LectureCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const [newCourseTitle, setNewCourseTitle] = useState("");

  const loadCourses = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchLectureCourses()
      .then((data) => {
        setCourses(data);
        setSelectedCourseId((prev) => prev ?? data[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadCourses, [loadCourses]);

  async function handleCreateCourse() {
    const title = newCourseTitle.trim();
    if (!title) return;
    try {
      const course = await createLectureCourse({ title });
      setNewCourseTitle("");
      setCourses((prev) => [course, ...prev]);
      setSelectedCourseId(course.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "강의 생성 실패");
    }
  }

  async function handleTogglePublish(course: LectureCourse) {
    try {
      const updated = await updateLectureCourse(course.id, { isPublished: !course.isPublished });
      setCourses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "강의 수정 실패");
    }
  }

  async function handleDeleteCourse(course: LectureCourse) {
    if (!confirm(`"${course.title}" 강의를 삭제할까요? 섹션/영상/링크가 모두 함께 삭제됩니다.`)) return;
    try {
      await deleteLectureCourse(course.id);
      setCourses((prev) => prev.filter((c) => c.id !== course.id));
      setSelectedCourseId((prev) => (prev === course.id ? null : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "강의 삭제 실패");
    }
  }

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) ?? null;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h2 className="text-lg font-bold text-foreground">강의 다시보기 (Bunny Stream)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          강의 → 섹션 → 영상 순으로 만들고, 영상마다 Bunny Stream의 video ID를 입력하면
          접근 링크를 받은 사람이 /lecture/[token] 페이지에서 시청할 수 있습니다.
        </p>
      </div>

      {error && (
        <div className="text-sm px-3 py-2 rounded-sm border border-destructive/40 bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-sm border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <input
            value={newCourseTitle}
            onChange={(e) => setNewCourseTitle(e.target.value)}
            placeholder="새 강의 제목"
            className="flex-1 px-3 py-2 text-sm border border-border rounded-sm bg-background"
          />
          <button
            type="button"
            onClick={() => void handleCreateCourse()}
            disabled={!newCourseTitle.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            강의 생성
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">등록된 강의가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border">
            {courses.map((course) => (
              <li
                key={course.id}
                className={`flex items-center justify-between gap-3 py-2 px-2 rounded-sm cursor-pointer ${
                  selectedCourseId === course.id ? "bg-secondary/60" : "hover:bg-secondary/30"
                }`}
                onClick={() => setSelectedCourseId(course.id)}
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">{course.title}</div>
                  {course.description && (
                    <div className="text-xs text-muted-foreground">{course.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-sm border ${
                      course.isPublished
                        ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                        : "border-border bg-secondary/50 text-muted-foreground"
                    }`}
                  >
                    {course.isPublished ? "공개" : "비공개"}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleTogglePublish(course);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    {course.isPublished ? "비공개로" : "공개로"}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteCourse(course);
                    }}
                    className="text-xs text-destructive hover:underline"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedCourse && <CourseDetail course={selectedCourse} onError={setError} />}
    </div>
  );
}

function CourseDetail({
  course,
  onError,
}: {
  course: LectureCourse;
  onError: (message: string) => void;
}) {
  const [sections, setSections] = useState<LectureSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSectionTitle, setNewSectionTitle] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetchLectureSections(course.id)
      .then(setSections)
      .catch((err) => onError(err instanceof Error ? err.message : "섹션 조회 실패"))
      .finally(() => setLoading(false));
  }, [course.id, onError]);

  useEffect(load, [load]);

  async function handleCreateSection() {
    const title = newSectionTitle.trim();
    if (!title) return;
    try {
      const section = await createLectureSection(course.id, title);
      setNewSectionTitle("");
      setSections((prev) => [...prev, section]);
    } catch (err) {
      onError(err instanceof Error ? err.message : "섹션 생성 실패");
    }
  }

  async function handleDeleteSection(section: LectureSection) {
    if (!confirm(`"${section.title}" 섹션을 삭제할까요? 안의 영상도 함께 삭제됩니다.`)) return;
    try {
      await deleteLectureSection(section.id);
      setSections((prev) => prev.filter((s) => s.id !== section.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : "섹션 삭제 실패");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground">섹션 — {course.title}</h3>
        <div className="flex items-center gap-2">
          <input
            value={newSectionTitle}
            onChange={(e) => setNewSectionTitle(e.target.value)}
            placeholder="새 섹션 제목"
            className="flex-1 px-3 py-2 text-sm border border-border rounded-sm bg-background"
          />
          <button
            type="button"
            onClick={() => void handleCreateSection()}
            disabled={!newSectionTitle.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            섹션 추가
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">섹션이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {sections.map((section) => (
              <SectionBlock
                key={section.id}
                section={section}
                onDelete={() => void handleDeleteSection(section)}
                onError={onError}
              />
            ))}
          </div>
        )}
      </div>

      <LinksBlock course={course} onError={onError} />
    </div>
  );
}

function SectionBlock({
  section,
  onDelete,
  onError,
}: {
  section: LectureSection;
  onDelete: () => void;
  onError: (message: string) => void;
}) {
  const [videos, setVideos] = useState<LectureVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", bunnyVideoId: "", description: "", durationSeconds: "" });

  const load = useCallback(() => {
    setLoading(true);
    fetchLectureVideos(section.id)
      .then(setVideos)
      .catch((err) => onError(err instanceof Error ? err.message : "영상 조회 실패"))
      .finally(() => setLoading(false));
  }, [section.id, onError]);

  useEffect(load, [load]);

  async function handleCreateVideo() {
    const title = form.title.trim();
    const bunnyVideoId = form.bunnyVideoId.trim();
    if (!title || !bunnyVideoId) return;
    try {
      const video = await createLectureVideo({
        sectionId: section.id,
        title,
        bunnyVideoId,
        description: form.description.trim() || undefined,
        durationSeconds: form.durationSeconds ? Number(form.durationSeconds) : undefined,
      });
      setVideos((prev) => [...prev, video]);
      setForm({ title: "", bunnyVideoId: "", description: "", durationSeconds: "" });
    } catch (err) {
      onError(err instanceof Error ? err.message : "영상 생성 실패");
    }
  }

  async function handleTogglePublish(video: LectureVideo) {
    try {
      const updated = await updateLectureVideo(video.id, { isPublished: !video.isPublished });
      setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    } catch (err) {
      onError(err instanceof Error ? err.message : "영상 수정 실패");
    }
  }

  async function handleMove(video: LectureVideo, direction: -1 | 1) {
    const sorted = [...videos].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((v) => v.id === video.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    try {
      const [a, b] = await Promise.all([
        updateLectureVideo(video.id, { sortOrder: other.sortOrder }),
        updateLectureVideo(other.id, { sortOrder: video.sortOrder }),
      ]);
      setVideos((prev) => prev.map((v) => (v.id === a.id ? a : v.id === b.id ? b : v)));
    } catch (err) {
      onError(err instanceof Error ? err.message : "순서 변경 실패");
    }
  }

  async function handleDeleteVideo(video: LectureVideo) {
    if (!confirm(`"${video.title}" 영상을 삭제할까요?`)) return;
    try {
      await deleteLectureVideo(video.id);
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : "영상 삭제 실패");
    }
  }

  return (
    <div className="rounded-sm border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
        <button type="button" onClick={onDelete} className="text-xs text-destructive hover:underline">
          섹션 삭제
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">불러오는 중...</p>
      ) : (
        <ul className="divide-y divide-border">
          {videos
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((video, idx, arr) => (
              <li key={video.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">{video.title}</span>
                  <span className="ml-2 text-muted-foreground">bunny: {video.bunnyVideoId}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => void handleMove(video, -1)}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={idx === arr.length - 1}
                    onClick={() => void handleMove(video, 1)}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleTogglePublish(video)}
                    className={video.isPublished ? "text-emerald-700" : "text-muted-foreground"}
                  >
                    {video.isPublished ? "공개됨" : "비공개"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteVideo(video)}
                    className="text-destructive hover:underline"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          {videos.length === 0 && <li className="py-1.5 text-xs text-muted-foreground">영상 없음</li>}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="영상 제목"
          className="px-2 py-1.5 text-xs border border-border rounded-sm bg-background"
        />
        <input
          value={form.bunnyVideoId}
          onChange={(e) => setForm((f) => ({ ...f, bunnyVideoId: e.target.value }))}
          placeholder="Bunny video ID"
          className="px-2 py-1.5 text-xs border border-border rounded-sm bg-background"
        />
        <input
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="설명(선택)"
          className="px-2 py-1.5 text-xs border border-border rounded-sm bg-background"
        />
        <input
          value={form.durationSeconds}
          onChange={(e) => setForm((f) => ({ ...f, durationSeconds: e.target.value }))}
          placeholder="재생시간(초, 선택)"
          type="number"
          className="px-2 py-1.5 text-xs border border-border rounded-sm bg-background"
        />
        <button
          type="button"
          onClick={() => void handleCreateVideo()}
          disabled={!form.title.trim() || !form.bunnyVideoId.trim()}
          className="col-span-2 px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          영상 추가
        </button>
      </div>
    </div>
  );
}

function LinksBlock({
  course,
  onError,
}: {
  course: LectureCourse;
  onError: (message: string) => void;
}) {
  const [links, setLinks] = useState<LectureAccessLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchLectureLinks(course.id)
      .then(setLinks)
      .catch((err) => onError(err instanceof Error ? err.message : "링크 조회 실패"))
      .finally(() => setLoading(false));
  }, [course.id, onError]);

  useEffect(load, [load]);

  async function handleCreate() {
    const t = title.trim();
    if (!t) return;
    try {
      const link = await createLectureLink({
        courseId: course.id,
        title: t,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setLinks((prev) => [link, ...prev]);
      setTitle("");
      setExpiresAt("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "링크 생성 실패");
    }
  }

  async function handleToggleActive(link: LectureAccessLink) {
    try {
      const updated = await updateLectureLink(link.id, { isActive: !link.isActive });
      setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch (err) {
      onError(err instanceof Error ? err.message : "링크 수정 실패");
    }
  }

  async function handleDelete(link: LectureAccessLink) {
    if (!confirm("이 링크를 삭제할까요?")) return;
    try {
      await deleteLectureLink(link.id);
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : "링크 삭제 실패");
    }
  }

  function handleCopy(link: LectureAccessLink) {
    const url = `${window.location.origin}/lecture/${link.token}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  return (
    <div className="rounded-sm border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-bold text-foreground">접근 링크</h3>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="링크 제목(예: 8월 신규 수강생)"
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-border rounded-sm bg-background"
        />
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-sm bg-background"
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={!title.trim()}
          className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          링크 생성
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-muted-foreground">생성된 링크가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border">
          {links.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <div className="font-medium text-foreground">{link.title}</div>
                <div className="text-xs text-muted-foreground">
                  만료: {formatDate(link.expiresAt)} · /lecture/{link.token}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`text-xs px-2 py-0.5 rounded-sm border ${
                    link.isActive
                      ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                      : "border-border bg-secondary/50 text-muted-foreground"
                  }`}
                >
                  {link.isActive ? "활성" : "비활성"}
                </span>
                <button type="button" onClick={() => handleCopy(link)} className="text-xs text-primary hover:underline">
                  {copiedId === link.id ? "복사됨" : "링크 복사"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleActive(link)}
                  className="text-xs text-primary hover:underline"
                >
                  {link.isActive ? "비활성화" : "활성화"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(link)}
                  className="text-xs text-destructive hover:underline"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
