"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchMyCourses, type LectureMyCourse } from "@/lib/api";

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR");
}

const STATUS_LABEL: Record<LectureMyCourse["effectiveStatus"], string> = {
  ACTIVE: "수강 중",
  NOT_STARTED: "시작 전",
  EXPIRED: "만료됨",
  REVOKED: "접근 종료",
};

const STATUS_STYLE: Record<LectureMyCourse["effectiveStatus"], string> = {
  ACTIVE: "border-emerald-200 bg-emerald-100 text-emerald-800",
  NOT_STARTED: "border-amber-200 bg-amber-100 text-amber-800",
  EXPIRED: "border-border bg-secondary/50 text-muted-foreground",
  REVOKED: "border-border bg-secondary/50 text-muted-foreground",
};

export default function MyCoursesPage() {
  const [courses, setCourses] = useState<LectureMyCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyCourses()
      .then(setCourses)
      .catch((err) => setError(err instanceof Error ? err.message : "불러오지 못했습니다."));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-5 sm:px-8">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">내 강의</h1>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8">
        {error && (
          <div className="mb-4 text-sm px-3 py-2 rounded-sm border border-destructive/40 bg-destructive/10 text-destructive">
            {error}
          </div>
        )}

        {courses === null ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">현재 수강 가능한 강의가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {courses.map((c) => (
              <div key={c.enrollmentId} className="rounded-sm border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-foreground">{c.courseTitle}</h2>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-sm border ${STATUS_STYLE[c.effectiveStatus]}`}
                  >
                    {STATUS_LABEL[c.effectiveStatus]}
                  </span>
                </div>
                {c.courseDescription && (
                  <p className="text-sm text-muted-foreground">{c.courseDescription}</p>
                )}
                {!c.isAuto && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>
                      수강 기간: {formatDate(c.startsAt)} ~ {formatDate(c.expiresAt)}
                    </div>
                    {c.effectiveStatus === "ACTIVE" && <div>남은 일수: {c.remainingDays}일</div>}
                  </div>
                )}
                {c.effectiveStatus === "ACTIVE" ? (
                  <Link
                    href={`/courses/${c.courseId}`}
                    className="inline-block px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground"
                  >
                    강의 보기
                  </Link>
                ) : (
                  <span className="inline-block px-4 py-2 text-sm font-semibold rounded-sm bg-secondary/50 text-muted-foreground cursor-not-allowed">
                    강의 보기
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
