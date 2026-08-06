"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteRedevelopmentTraceFailure,
  fetchRedevelopmentTraceFailures,
  resolveRedevelopmentTraceFailure,
  type RedevelopmentTraceFailure,
} from "@/lib/api";

/** 경계 자동 추출이 실패한 도면 목록.
 *
 * 실패를 화면에서 그냥 흘려보내면 어떤 도면이 왜 안 되는지 알 수 없어
 * 알고리즘을 고칠 근거가 남지 않는다(사용자 요청, 2026-08-06: "추출
 * 실패하는 부분이 발생하면 저장되는 로그를 만들고 이유를 보고해달라").
 * 실제로 2026-08-06 개선도 실패 17장을 유형별로 나눈 뒤에야 고칠 수 있었다.
 */

const REASON_LABEL: Record<RedevelopmentTraceFailure["reason"], string> = {
  NO_RED: "빨간 경계선 없음",
  NOT_ENCLOSED: "경계가 닫히지 않음",
  TOO_SMALL: "찾은 영역이 너무 작음",
  TOO_LARGE: "찾은 영역이 너무 큼",
};

/** 유형별로 대응이 정해져 있어, 관리자가 바로 판단할 수 있게 같이 보여준다. */
const REASON_ACTION: Record<RedevelopmentTraceFailure["reason"], string> = {
  NO_RED: "경계가 빨강이 아닌 도면(파란 점선 등)일 수 있습니다. 직접 그려야 합니다.",
  NOT_ENCLOSED: "점선 간격이 넓거나 선이 잘린 도면입니다. 알고리즘 조정 대상입니다.",
  TOO_SMALL: "구역이 아주 작은 도면일 수 있습니다. 최소 면적 기준 조정 대상입니다.",
  TOO_LARGE: "옆 구역·도로와 붙었습니다. 알고리즘 조정 대상입니다.",
};

const REASON_TONE: Record<RedevelopmentTraceFailure["reason"], string> = {
  NO_RED: "bg-muted text-muted-foreground",
  NOT_ENCLOSED: "bg-amber-100 text-amber-800",
  TOO_SMALL: "bg-amber-100 text-amber-800",
  TOO_LARGE: "bg-amber-100 text-amber-800",
};

export function RedevelopmentTraceFailurePanel() {
  const [rows, setRows] = useState<RedevelopmentTraceFailure[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchRedevelopmentTraceFailures());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = rows.filter((r) => showResolved || !r.resolvedAt);
  const unresolved = rows.filter((r) => !r.resolvedAt).length;

  if (!rows.length && !loading && !error) return null;

  return (
    <div className="rounded-sm border border-amber-300 bg-amber-50/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold text-foreground">
          경계 자동 추출 실패 기록 {unresolved > 0 && `(미처리 ${unresolved}건)`}
        </p>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          처리 완료도 보기
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto text-xs text-muted-foreground hover:underline"
        >
          새로고침
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="space-y-2">
        {visible.map((r) => (
          <div key={r.id} className="rounded-sm border border-border bg-card px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded-sm font-semibold ${REASON_TONE[r.reason]}`}>
                {REASON_LABEL[r.reason]}
              </span>
              <span className="font-medium text-foreground">{r.zoneName || "(구역 미지정)"}</span>
              <span className="text-muted-foreground">
                {r.imageWidth}×{r.imageHeight}
                {r.occurrences > 1 && ` · ${r.occurrences}회 실패`}
              </span>
              {r.resolvedAt && <span className="text-emerald-600">처리 완료</span>}
              <div className="ml-auto flex items-center gap-2">
                <a
                  href={r.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  이미지 보기
                </a>
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="text-muted-foreground hover:underline"
                >
                  {expanded === r.id ? "진단 닫기" : "진단 보기"}
                </button>
                {!r.resolvedAt && (
                  <button
                    type="button"
                    onClick={async () => {
                      await resolveRedevelopmentTraceFailure(r.id);
                      void load();
                    }}
                    className="text-emerald-700 hover:underline"
                  >
                    처리 완료
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    await deleteRedevelopmentTraceFailure(r.id);
                    void load();
                  }}
                  className="text-destructive hover:underline"
                >
                  삭제
                </button>
              </div>
            </div>
            <p className="mt-1 text-muted-foreground">{r.summary}</p>
            <p className="mt-0.5 text-foreground/70">→ {REASON_ACTION[r.reason]}</p>
            {expanded === r.id && (
              <pre className="mt-2 overflow-x-auto rounded-sm bg-muted p-2 text-[11px] leading-relaxed">
                {JSON.stringify(r.detail, null, 2)}
              </pre>
            )}
          </div>
        ))}
        {!visible.length && !loading && (
          <p className="text-xs text-muted-foreground">표시할 실패 기록이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
