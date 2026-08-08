"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLectureCourse,
  createLectureLink,
  createLectureSection,
  createLectureVideo,
  deleteLectureCourse,
  deleteLectureLink,
  deleteLectureMaterial,
  deleteLectureSection,
  deleteLectureVideo,
  fetchLectureCourses,
  fetchLectureEnrollments,
  fetchLectureLinks,
  fetchLectureMaterials,
  fetchLectureSections,
  fetchLectureVideos,
  grantLectureEnrollment,
  grantLectureEnrollmentQuick90,
  revokeLectureEnrollment,
  searchLectureUsers,
  updateLectureCourse,
  updateLectureLink,
  updateLectureSection,
  updateLectureVideo,
  uploadLectureMaterial,
  type LectureAccessLink,
  type LectureCourse,
  type LectureEnrollmentAdminItem,
  type LectureSection,
  type LectureSectionMaterial,
  type LectureUserSearchResult,
  type LectureVideo,
  type LectureVideoChapter,
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
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseTitleDraft, setCourseTitleDraft] = useState("");

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

  async function handleSaveCourseTitle(course: LectureCourse) {
    const title = courseTitleDraft.trim();
    if (!title || title === course.title) {
      setEditingCourseId(null);
      return;
    }
    try {
      const updated = await updateLectureCourse(course.id, { title });
      setCourses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditingCourseId(null);
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
          등록과 동시에 바로 공개됩니다(따로 "공개로" 누를 필요 없음, 숨기고 싶으면
          목록에서 직접 "비공개로" 전환). 아래 "회원 수강권"에서 회원을 검색해 수강권을
          부여하면 그 회원이 로그인 후 /courses 에서 시청할 수 있습니다. 영상을
          "OT영상"으로 지정하면, 회원권한 관리에서 "OT수강생" 등급으로 바꾼 회원은 별도
          수강권 없이 그 영상만 자동으로 볼 수 있습니다.
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
                {editingCourseId === course.id ? (
                  <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={courseTitleDraft}
                      onChange={(e) => setCourseTitleDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handleSaveCourseTitle(course)}
                      autoFocus
                      className="flex-1 px-2 py-1 text-sm border border-border rounded-sm bg-background"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveCourseTitle(course)}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCourseId(null)}
                      className="text-xs text-muted-foreground hover:underline shrink-0"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm font-semibold text-foreground">{course.title}</div>
                    {course.description && (
                      <div className="text-xs text-muted-foreground">{course.description}</div>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 shrink-0">
                  {editingCourseId !== course.id && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCourseTitleDraft(course.title);
                        setEditingCourseId(course.id);
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      이름 수정
                    </button>
                  )}
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

  const sortedSections = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);

  /** 섹션(강의) 자체의 노출 순서를 바꾼다 — 기존 화살표는 같은 섹션 안
   * 영상끼리만 순서를 바꿔서, 섹션당 영상이 1개뿐이면 아무 효과가
   * 없었다(사용자 지적, 2026-08-04: "위아래 저 화살표가 그 기능
   * 같기는한데 동작을 안하네" — 실제로는 섹션 순서를 바꾸고 싶었던 것). */
  async function handleMoveSection(section: LectureSection, direction: -1 | 1) {
    const idx = sortedSections.findIndex((s) => s.id === section.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sortedSections.length) return;
    const other = sortedSections[swapIdx];
    try {
      const [a, b] = await Promise.all([
        updateLectureSection(section.id, { sortOrder: other.sortOrder }),
        updateLectureSection(other.id, { sortOrder: section.sortOrder }),
      ]);
      setSections((prev) => prev.map((s) => (s.id === a.id ? a : s.id === b.id ? b : s)));
    } catch (err) {
      onError(err instanceof Error ? err.message : "섹션 순서 변경 실패");
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
            {sortedSections.map((section, idx) => (
              <SectionBlock
                key={section.id}
                section={section}
                onDelete={() => void handleDeleteSection(section)}
                onUpdated={(updated) =>
                  setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
                }
                onError={onError}
                onMoveUp={idx > 0 ? () => void handleMoveSection(section, -1) : undefined}
                onMoveDown={idx < sortedSections.length - 1 ? () => void handleMoveSection(section, 1) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <EnrollmentsBlock course={course} onError={onError} />

      <details className="rounded-sm border border-border">
        <summary className="cursor-pointer px-4 py-2.5 text-xs text-muted-foreground select-none">
          예전 링크 방식(사용 중단) — 필요할 때만 펼쳐서 사용
        </summary>
        <div className="p-4 pt-0">
          <LinksBlock course={course} onError={onError} />
        </div>
      </details>
    </div>
  );
}

function EnrollmentsBlock({
  course,
  onError,
}: {
  course: LectureCourse;
  onError: (message: string) => void;
}) {
  const [enrollments, setEnrollments] = useState<LectureEnrollmentAdminItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LectureUserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<LectureUserSearchResult | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetchLectureEnrollments(course.id)
      .then(setEnrollments)
      .catch((err) => onError(err instanceof Error ? err.message : "수강권 조회 실패"))
      .finally(() => setLoading(false));
  }, [course.id, onError]);

  useEffect(load, [load]);

  async function handleSearch() {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchLectureUsers(q);
      setSearchResults(results);
    } catch (err) {
      onError(err instanceof Error ? err.message : "회원 검색 실패");
    } finally {
      setSearching(false);
    }
  }

  async function handleGrant() {
    if (!selectedUser) return;
    try {
      await grantLectureEnrollment({
        username: selectedUser.username,
        courseId: course.id,
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      setSelectedUser(null);
      setQuery("");
      setSearchResults([]);
      setStartsAt("");
      setExpiresAt("");
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "수강권 부여 실패");
    }
  }

  async function handleQuick90() {
    if (!selectedUser) return;
    try {
      await grantLectureEnrollmentQuick90({ username: selectedUser.username, courseId: course.id });
      setSelectedUser(null);
      setQuery("");
      setSearchResults([]);
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "수강권 부여 실패");
    }
  }

  async function handleRevoke(enrollment: LectureEnrollmentAdminItem) {
    if (!confirm(`${enrollment.userName ?? enrollment.username}님의 수강권을 회수할까요?`)) return;
    try {
      await revokeLectureEnrollment(enrollment.id);
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "수강권 회수 실패");
    }
  }

  return (
    <div className="rounded-sm border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-bold text-foreground">회원 수강권 — {course.title}</h3>
      <p className="text-xs text-muted-foreground">
        회원가입은 기존 사이트에서 진행되고, 여기서는 이미 가입한 회원을 검색해 이 강의에 대한
        수강권(시작일~만료일)을 부여합니다. 기본 만료일은 시작일로부터 90일입니다.
      </p>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
            placeholder="이름 / 아이디 / 전화번호로 회원 검색"
            className="flex-1 px-3 py-2 text-sm border border-border rounded-sm bg-background"
          />
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={searching || !query.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-sm bg-secondary text-foreground disabled:opacity-50"
          >
            검색
          </button>
        </div>

        {searchResults.length > 0 && !selectedUser && (
          <ul className="rounded-sm border border-border divide-y divide-border max-h-48 overflow-y-auto">
            {searchResults.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(u);
                    setSearchResults([]);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/50"
                >
                  <span className="font-medium text-foreground">{u.name}</span>
                  <span className="ml-2 text-muted-foreground">
                    {u.username}
                    {u.phone ? ` · ${u.phone}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedUser && (
          <div className="rounded-sm border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>
                선택된 회원: <span className="font-semibold text-foreground">{selectedUser.name}</span>{" "}
                <span className="text-muted-foreground">({selectedUser.username})</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="text-xs text-muted-foreground hover:underline"
              >
                선택 취소
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground">
                시작일
                <input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="ml-1 px-2 py-1.5 text-sm border border-border rounded-sm bg-background"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                만료일
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="ml-1 px-2 py-1.5 text-sm border border-border rounded-sm bg-background"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleGrant()}
                className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground"
              >
                수강권 부여
              </button>
              <button
                type="button"
                onClick={() => void handleQuick90()}
                className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-emerald-600 text-white"
              >
                90일 권한 부여
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : enrollments.length === 0 ? (
        <p className="text-sm text-muted-foreground">부여된 수강권이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border">
          {enrollments.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <div className="font-medium text-foreground">
                  {e.userName ?? e.username} <span className="text-muted-foreground">({e.username})</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(e.startsAt)} ~ {formatDate(e.expiresAt)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`text-xs px-2 py-0.5 rounded-sm border ${
                    e.effectiveStatus === "ACTIVE"
                      ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                      : e.effectiveStatus === "NOT_STARTED"
                        ? "border-amber-200 bg-amber-100 text-amber-800"
                        : "border-border bg-secondary/50 text-muted-foreground"
                  }`}
                >
                  {e.effectiveStatus === "ACTIVE"
                    ? "수강 중"
                    : e.effectiveStatus === "NOT_STARTED"
                      ? "시작 전"
                      : e.effectiveStatus === "EXPIRED"
                        ? "만료됨"
                        : "회수됨"}
                </span>
                {e.effectiveStatus !== "REVOKED" && (
                  <button
                    type="button"
                    onClick={() => void handleRevoke(e)}
                    className="text-xs text-destructive hover:underline"
                  >
                    회수
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function parseClockToSeconds(token: string): number | null {
  const parts = token.split(":").map((p) => Number(p));
  if (parts.length === 0 || parts.some((p) => !Number.isFinite(p))) return null;
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : null;
}

/** "1:23:45 제목" / "12:34 제목" / "90 제목" 같은 줄들을 챕터 배열로
 * 파싱한다. 각 줄의 맨 앞 토큰이 시간, 나머지가 제목. 시작~종료를 함께
 * 지정하려면 "13:43-19:10 제목"처럼 하이픈으로 시작-종료를 붙여
 * 쓴다(종료를 안 쓰면 다음 챕터 시작 시각에서 자동으로 끊긴다 —
 * 사용자 요청, 2026-08-04: "종료시간을 입력해도 되고"). 시간 형식이
 * 아니거나 제목이 비어있는 줄은 무시한다. */
function parseChaptersText(text: string): LectureVideoChapter[] {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const [timeToken, ...rest] = trimmed.split(/\s+/);
      const title = rest.join(" ").trim();
      if (!title) return null;
      const [startToken, endToken] = timeToken.split("-");
      const startSeconds = parseClockToSeconds(startToken);
      if (startSeconds === null) return null;
      const endSeconds = endToken ? parseClockToSeconds(endToken) ?? undefined : undefined;
      return endSeconds !== undefined && endSeconds > startSeconds
        ? { title, startSeconds, endSeconds }
        : { title, startSeconds };
    })
    .filter((c): c is LectureVideoChapter => c !== null);
}

function formatSecondsToClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function chaptersToText(chapters: LectureVideoChapter[] | null): string {
  if (!chapters || chapters.length === 0) return "";
  return chapters
    .map((c) => {
      const time =
        c.endSeconds != null
          ? `${formatSecondsToClock(c.startSeconds)}-${formatSecondsToClock(c.endSeconds)}`
          : formatSecondsToClock(c.startSeconds);
      return `${time} ${c.title}`;
    })
    .join("\n");
}

function SectionBlock({
  section,
  onDelete,
  onUpdated,
  onError,
  onMoveUp,
  onMoveDown,
}: {
  section: LectureSection;
  onDelete: () => void;
  onUpdated: (section: LectureSection) => void;
  onError: (message: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [videos, setVideos] = useState<LectureVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: "",
    bunnyVideoId: "",
    description: "",
    durationSeconds: "",
    chaptersText: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", bunnyVideoId: "" });
  const [chapterEditId, setChapterEditId] = useState<string | null>(null);
  const [chapterDraft, setChapterDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.title);

  async function handleSaveTitle() {
    const title = titleDraft.trim();
    if (!title || title === section.title) {
      setEditingTitle(false);
      return;
    }
    try {
      const updated = await updateLectureSection(section.id, { title });
      onUpdated(updated);
      setEditingTitle(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "섹션 수정 실패");
    }
  }

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
      const chapters = parseChaptersText(form.chaptersText);
      const video = await createLectureVideo({
        sectionId: section.id,
        title,
        bunnyVideoId,
        description: form.description.trim() || undefined,
        durationSeconds: form.durationSeconds ? Number(form.durationSeconds) : undefined,
        chapters: chapters.length > 0 ? chapters : undefined,
      });
      setVideos((prev) => [...prev, video]);
      setForm({ title: "", bunnyVideoId: "", description: "", durationSeconds: "", chaptersText: "" });
    } catch (err) {
      onError(err instanceof Error ? err.message : "영상 생성 실패");
    }
  }

  function startEditChapters(video: LectureVideo) {
    setChapterEditId(video.id);
    setChapterDraft(chaptersToText(video.chapters));
  }

  async function handleSaveChapters(video: LectureVideo) {
    try {
      const chapters = parseChaptersText(chapterDraft);
      const updated = await updateLectureVideo(video.id, {
        chapters: chapters.length > 0 ? chapters : null,
      });
      setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      setChapterEditId(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "챕터 저장 실패");
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

  async function handleToggleOtVideo(video: LectureVideo) {
    try {
      const updated = await updateLectureVideo(video.id, { isOtVideo: !video.isOtVideo });
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

  function startEdit(video: LectureVideo) {
    setEditingId(video.id);
    setEditForm({ title: video.title, bunnyVideoId: video.bunnyVideoId });
  }

  async function handleSaveEdit(video: LectureVideo) {
    const title = editForm.title.trim();
    const bunnyVideoId = editForm.bunnyVideoId.trim();
    if (!title || !bunnyVideoId) return;
    try {
      const updated = await updateLectureVideo(video.id, { title, bunnyVideoId });
      setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      setEditingId(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "영상 수정 실패");
    }
  }

  return (
    <div className="rounded-sm border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        {editingTitle ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSaveTitle()}
              autoFocus
              className="flex-1 px-2 py-1 text-sm border border-border rounded-sm bg-background"
            />
            <button type="button" onClick={() => void handleSaveTitle()} className="text-xs text-primary hover:underline">
              저장
            </button>
            <button
              type="button"
              onClick={() => {
                setTitleDraft(section.title);
                setEditingTitle(false);
              }}
              className="text-xs text-muted-foreground hover:underline"
            >
              취소
            </button>
          </div>
        ) : (
          <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
        )}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={!onMoveUp}
            onClick={onMoveUp}
            title="섹션을 위로 이동"
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={!onMoveDown}
            onClick={onMoveDown}
            title="섹션을 아래로 이동"
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            ▼
          </button>
          {!editingTitle && (
            <button
              type="button"
              onClick={() => {
                setTitleDraft(section.title);
                setEditingTitle(true);
              }}
              className="text-xs text-primary hover:underline"
            >
              수정
            </button>
          )}
          <button type="button" onClick={onDelete} className="text-xs text-destructive hover:underline">
            섹션 삭제
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">불러오는 중...</p>
      ) : (
        <ul className="divide-y divide-border">
          {videos
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((video, idx, arr) => (
              <li key={video.id} className="py-1.5 text-xs">
                {editingId === video.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="영상 제목"
                      className="flex-1 min-w-[120px] px-2 py-1 border border-border rounded-sm bg-background"
                    />
                    <input
                      value={editForm.bunnyVideoId}
                      onChange={(e) => setEditForm((f) => ({ ...f, bunnyVideoId: e.target.value }))}
                      placeholder="Bunny video ID"
                      className="flex-1 min-w-[160px] px-2 py-1 border border-border rounded-sm bg-background"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveEdit(video)}
                      disabled={!editForm.title.trim() || !editForm.bunnyVideoId.trim()}
                      className="text-primary hover:underline disabled:opacity-40"
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-muted-foreground hover:underline"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">{video.title}</span>
                      <span className="ml-2 text-muted-foreground">bunny: {video.bunnyVideoId}</span>
                      {video.chapters && video.chapters.length > 0 && (
                        <span className="ml-2 text-sky-700">챕터 {video.chapters.length}개</span>
                      )}
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
                        onClick={() => void handleToggleOtVideo(video)}
                        className={video.isOtVideo ? "text-sky-700" : "text-muted-foreground"}
                        title="켜면 이 영상만 OT수강생에게 자동 공개됩니다"
                      >
                        {video.isOtVideo ? "OT영상" : "일반영상"}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditChapters(video)}
                        className="text-sky-700 hover:underline"
                      >
                        챕터
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(video)}
                        className="text-primary hover:underline"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteVideo(video)}
                        className="text-destructive hover:underline"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
                {chapterEditId === video.id && (
                  <div className="mt-2 space-y-1.5 rounded-sm border border-border bg-secondary/20 p-2">
                    <p className="text-[11px] text-muted-foreground">
                      한 줄에 하나씩, "시작시간 제목" 형식으로 입력하세요(예: 15:20 2강 실전 사례).
                      종료시간은 생략하면 다음 챕터 시작 시각에서 자동으로 재생이 멈추고,
                      직접 지정하려면 "시작시간-종료시간 제목"처럼 하이픈으로 붙여 쓰세요
                      (예: 15:20-38:00 2강 실전 사례). 영상 하나를 이 시간 구간대로 나눠서
                      강의 화면에 여러 섹션처럼 보여줍니다.
                    </p>
                    <textarea
                      value={chapterDraft}
                      onChange={(e) => setChapterDraft(e.target.value)}
                      rows={4}
                      placeholder={"0:00 1강 개요\n15:20-38:00 2강 실전 사례\n40:00 3강 정리"}
                      className="w-full px-2 py-1.5 text-xs border border-border rounded-sm bg-background font-mono"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveChapters(video)}
                        className="text-primary hover:underline"
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setChapterEditId(null)}
                        className="text-muted-foreground hover:underline"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
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
        <textarea
          value={form.chaptersText}
          onChange={(e) => setForm((f) => ({ ...f, chaptersText: e.target.value }))}
          rows={3}
          placeholder={"챕터(선택) — 한 줄에 하나씩 \"시작시간 제목\"(종료시간 생략 시 다음 챕터에서 자동 정지)\n예) 0:00 1강 개요\n15:20-38:00 2강 실전 사례"}
          className="col-span-2 px-2 py-1.5 text-xs border border-border rounded-sm bg-background font-mono"
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

      <MaterialsBlock sectionId={section.id} />
    </div>
  );
}

/** 이 주차(섹션)의 강의자료 파일 업로드/목록/삭제(사용자 요청,
 * 2026-08-08: "강의실에서 해당 주차에 대한 강의자료 올릴 수 있는
 * 기능을 넣어줘"). */
function MaterialsBlock({ sectionId }: { sectionId: string }) {
  const [materials, setMaterials] = useState<LectureSectionMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchLectureMaterials(sectionId)
      .then(setMaterials)
      .catch((err) => setError(err instanceof Error ? err.message : "강의자료 조회 실패"))
      .finally(() => setLoading(false));
  }, [sectionId]);

  useEffect(load, [load]);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const material = await uploadLectureMaterial(sectionId, title.trim(), file);
      setMaterials((prev) => [...prev, material]);
      setTitle("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "강의자료 업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 강의자료를 삭제할까요?")) return;
    try {
      await deleteLectureMaterial(id);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "강의자료 삭제 실패");
    }
  }

  return (
    <div className="mt-2 pt-2 border-t border-border/60 space-y-2">
      <p className="text-xs font-semibold text-foreground">강의자료</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {loading ? (
        <p className="text-xs text-muted-foreground">불러오는 중...</p>
      ) : (
        <ul className="divide-y divide-border">
          {materials.map((m) => (
            <li key={m.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
              <span className="truncate">
                {m.title}{" "}
                <span className="text-muted-foreground">({(m.fileSize / 1024 / 1024).toFixed(1)}MB)</span>
              </span>
              <button
                type="button"
                onClick={() => void handleDelete(m.id)}
                className="text-destructive hover:underline shrink-0"
              >
                삭제
              </button>
            </li>
          ))}
          {materials.length === 0 && <li className="py-1.5 text-xs text-muted-foreground">등록된 자료 없음</li>}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="자료 이름(비우면 파일명)"
          className="flex-1 min-w-[140px] px-2 py-1.5 text-xs border border-border rounded-sm bg-background"
        />
        <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs"
        />
        <button
          type="button"
          onClick={() => void handleUpload()}
          disabled={!file || uploading}
          className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {uploading ? "업로드 중..." : "업로드"}
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
