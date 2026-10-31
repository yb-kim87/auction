"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchJaegebalSyncRun,
  fetchJaegebalSyncRuns,
  fetchJaegebalZoneHistory,
  type JaegebalSyncRun,
  type JaegebalZoneChange,
  type ZoneChangeType,
} from "@/lib/api";

const TYPE_LABEL: Record<ZoneChangeType, string> = {
  stage: "단계 변경",
  new: "신규 구역",
  missing: "사라진 구역",
  restored: "복구",
  projectType: "사업유형 변경",
  stats: "주요 지표 변경",
};
const TYPE_ORDER: ZoneChangeType[] = ["stage", "new", "missing", "restored", "projectType", "stats"];
const TYPE_BADGE: Record<ZoneChangeType, string> = {
  stage: "border-blue-200 bg-blue-50 text-blue-700",
  new: "border-emerald-200 bg-emerald-50 text-emerald-700",
  missing: "border-gray-300 bg-gray-100 text-gray-700",
  restored: "border-amber-200 bg-amber-50 text-amber-800",
  projectType: "border-purple-200 bg-purple-50 text-purple-700",
  stats: "border-cyan-200 bg-cyan-50 text-cyan-700",
};
const STATE_LABEL: Record<string, string> = { running: "진행 중", done: "완료", blocked: "보안 확인으로 중단", failed: "일부 오류", interrupted: "서버 재시작으로 중단" };

const dateKey = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(iso));
const timeText = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const dateTimeText = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const countOf = (run: JaegebalSyncRun, t: ZoneChangeType) =>
  ({ stage: run.stageCount, new: run.newCount, missing: run.missingCount, restored: run.restoredCount, projectType: run.typeCount, stats: run.statsCount ?? 0 })[t];

function runDistricts(run: JaegebalSyncRun): string {
  const names = run.results.map((r) => r.name || r.code).filter(Boolean);
  return (names.length ? names : run.codes).join(", ");
}

function CountChips({ run }: { run: JaegebalSyncRun }) {
  const chips = TYPE_ORDER.filter((t) => countOf(run, t) > 0);
  if (!chips.length) return <span className="text-xs text-muted-foreground">변경 없음</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((t) => (
        <span key={t} className={`rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold ${TYPE_BADGE[t]}`}>
          {TYPE_LABEL[t]} {countOf(run, t)}
        </span>
      ))}
    </span>
  );
}

function ChangeLine({ c }: { c: JaegebalZoneChange }) {
  const detail =
    c.changeType === "stage" || c.changeType === "projectType" || c.changeType === "stats"
      ? `${c.fromValue || "-"} → ${c.toValue || "-"}`
      : c.changeType === "new"
        ? c.toValue || ""
        : c.changeType === "missing"
          ? `마지막 단계: ${c.fromValue || "-"}`
          : "";
  return (
    <>
      <span className="font-semibold text-foreground">{c.zoneName}</span>
      {c.region && <span className="text-muted-foreground"> · {c.region}</span>}
      {detail && <span className="text-muted-foreground"> — {detail}</span>}
    </>
  );
}

/** 재개발닷컴 구역 업데이트 이력 — 업데이트한 날짜별로 실행 목록을 보고, 그때 바뀐 구역(단계 변경·신규·사라짐·복구)을 확인한다. */
export function RedevelopmentUpdateHistory() {
  const [runs, setRuns] = useState<JaegebalSyncRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ run: JaegebalSyncRun; changes: JaegebalZoneChange[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<ZoneChangeType | "all">("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [zoneHistory, setZoneHistory] = useState<Record<string, JaegebalZoneChange[] | "loading" | "error">>({});

  const loadRuns = useCallback(() => {
    setError(null);
    fetchJaegebalSyncRuns()
      .then((list) => {
        setRuns(list);
        setSelectedId((cur) => (cur && list.some((r) => r.id === cur) ? cur : (list[0]?.id ?? null)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "이력을 불러오지 못했습니다."));
  }, []);

  useEffect(loadRuns, [loadRuns]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setFilter("all");
    setOpenKey(null);
    fetchJaegebalSyncRun(selectedId)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "변경 내역을 불러오지 못했습니다."))
      .finally(() => !cancelled && setDetailLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const grouped = useMemo(() => {
    const map = new Map<string, JaegebalSyncRun[]>();
    for (const r of runs ?? []) {
      const k = dateKey(r.startedAt);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return Array.from(map.entries());
  }, [runs]);

  const shown = useMemo(() => (detail?.changes ?? []).filter((c) => filter === "all" || c.changeType === filter), [detail, filter]);

  function toggleZoneHistory(key: string) {
    setOpenKey((cur) => (cur === key ? null : key));
    if (zoneHistory[key]) return;
    setZoneHistory((h) => ({ ...h, [key]: "loading" }));
    fetchJaegebalZoneHistory(key)
      .then((list) => setZoneHistory((h) => ({ ...h, [key]: list })))
      .catch(() => setZoneHistory((h) => ({ ...h, [key]: "error" })));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-4">
        <h2 className="text-lg font-bold text-foreground">구역 업데이트 이력</h2>
        <span className="text-xs text-muted-foreground">재개발닷컴 구역을 업데이트한 날짜별로, 그때 바뀐 구역을 모아 봅니다. 이력은 삭제되지 않고 계속 쌓입니다.</span>
        <button type="button" onClick={loadRuns} className="ml-auto rounded-sm border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
          새로고침
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {runs == null && !error && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {runs != null && runs.length === 0 && (
        <div className="rounded-sm border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          아직 기록된 구역 업데이트가 없습니다. <b className="text-foreground">구역도 업데이트</b> 탭에서 업데이트를 실행하면 이곳에 날짜별로 쌓입니다.
        </div>
      )}

      {runs != null && runs.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="max-h-[70vh] space-y-3 overflow-auto rounded-sm border border-border bg-card p-2">
            {grouped.map(([date, list]) => (
              <section key={date}>
                <h3 className="px-2 pb-1 text-xs font-bold text-muted-foreground">{date}</h3>
                <ul className="space-y-1">
                  {list.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        className={`w-full space-y-1 rounded-sm border px-3 py-2 text-left text-xs ${selectedId === r.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <b className="text-foreground">
                            {timeText(r.startedAt)}
                            {r.triggeredBy === "auto" && <span className="ml-1.5 rounded-sm border border-emerald-200 bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-700">자동</span>}
                          </b>
                          <span className={r.state === "done" ? "text-muted-foreground" : "font-semibold text-amber-700"}>{STATE_LABEL[r.state] ?? r.state}</span>
                        </span>
                        <span className="block text-foreground">{runDistricts(r)}</span>
                        <CountChips run={r} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="min-h-[200px] rounded-sm border border-border bg-card p-4">
            {detailLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
            {!detailLoading && detail && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {dateTimeText(detail.run.startedAt)} {detail.run.triggeredBy === "auto" ? "자동 " : ""}업데이트 <span className="font-normal text-muted-foreground">— {runDistricts(detail.run)}</span>
                  </p>
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {detail.run.results.map((r) => (
                      <p key={r.code}>
                        <b className="text-foreground">{r.name ?? r.code}</b>
                        {r.fetched != null && ` — 가져옴 ${r.fetched} · 신규 ${r.created ?? 0} · 변경 ${r.updated ?? 0} · 사라짐 표시 ${r.markedMissing ?? 0} · 복구 ${r.restored ?? 0}`}
                        {r.warning && <span className="text-amber-600"> · {r.warning}</span>}
                        {r.error && <span className="text-destructive"> · {r.error}</span>}
                      </p>
                    ))}
                    {detail.run.blocked && <p className="text-destructive">보안 확인에 걸려 중단됨: {detail.run.blocked}</p>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(["all", ...TYPE_ORDER] as const).map((t) => {
                    const n = t === "all" ? detail.changes.length : detail.changes.filter((c) => c.changeType === t).length;
                    if (t !== "all" && n === 0) return null;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFilter(t)}
                        className={`rounded-sm border px-2 py-1 text-xs ${filter === t ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-foreground hover:bg-muted"}`}
                      >
                        {t === "all" ? "전체" : TYPE_LABEL[t]} {n}
                      </button>
                    );
                  })}
                </div>

                {detail.changes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">이 업데이트에서는 바뀐 구역이 없었습니다.</p>
                ) : (
                  <div className="space-y-3">
                    {TYPE_ORDER.map((t) => {
                      const rows = shown.filter((c) => c.changeType === t);
                      if (!rows.length) return null;
                      return (
                        <section key={t}>
                          <h4 className="mb-1 flex items-center gap-2 text-xs font-bold text-foreground">
                            <span className={`rounded-sm border px-1.5 py-0.5 ${TYPE_BADGE[t]}`}>{TYPE_LABEL[t]}</span>
                            {rows.length}건
                          </h4>
                          <ul className="divide-y divide-border rounded-sm border border-border text-xs">
                            {rows.map((c) => {
                              const hist = zoneHistory[c.zoneKey];
                              return (
                                <li key={c.id} className="px-3 py-1.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <span>
                                      <ChangeLine c={c} />
                                    </span>
                                    <button type="button" onClick={() => toggleZoneHistory(c.zoneKey)} className="shrink-0 text-muted-foreground hover:text-foreground hover:underline">
                                      {openKey === c.zoneKey ? "이력 닫기" : "구역 이력"}
                                    </button>
                                  </div>
                                  {openKey === c.zoneKey && (
                                    <div className="mt-1.5 rounded-sm bg-muted/50 px-2 py-1.5 text-muted-foreground">
                                      {hist === "loading" || hist == null ? (
                                        "불러오는 중…"
                                      ) : hist === "error" ? (
                                        "이력을 불러오지 못했습니다."
                                      ) : (
                                        <ul className="space-y-0.5">
                                          {hist.map((h) => (
                                            <li key={h.id}>
                                              {dateTimeText(h.changedAt)} · <b className="text-foreground">{TYPE_LABEL[h.changeType]}</b>
                                              {(h.changeType === "stage" || h.changeType === "projectType" || h.changeType === "stats") && ` — ${h.fromValue || "-"} → ${h.toValue || "-"}`}
                                              {h.changeType === "new" && h.toValue ? ` — ${h.toValue}` : ""}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
