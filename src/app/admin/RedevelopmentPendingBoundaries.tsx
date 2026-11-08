"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchJaegebalBoundaryFetchStatus,
  fetchJaegebalPendingBoundaries,
  startJaegebalBoundaryFetch,
  type JaegebalBoundaryFetchStatus,
  type JaegebalPendingBoundary,
} from "@/lib/api";

const POLL_MS = 5000;
const MAX_ZONES = 5;
const dateTime = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** 구역도 업데이트 탭 — 새 구역 경계 대기 목록. 큰 범위 1회 요청으로 등록돼 거친 경계로 표시 중인 새 구역을 골라 정밀 경계를 직접 받는다(simplify는 관리자가 선택). */
export function RedevelopmentPendingBoundaries({ onFinished }: { onFinished?: () => void }) {
  const [rows, setRows] = useState<JaegebalPendingBoundary[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [simplify, setSimplify] = useState("0.0001");
  const [status, setStatus] = useState<JaegebalBoundaryFetchStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = !!status?.running;

  const load = useCallback(() => {
    fetchJaegebalPendingBoundaries()
      .then((r) => {
        setRows(r);
        setPicked((prev) => new Set([...prev].filter((k) => r.some((x) => x.sourceKey === k))));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    load();
    fetchJaegebalBoundaryFetchStatus().then(setStatus).catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      fetchJaegebalBoundaryFetchStatus()
        .then((s) => {
          setStatus(s);
          if (!s.running) {
            load();
            onFinished?.();
          }
        })
        .catch((e) => setError(e instanceof Error ? e.message : "상태 확인 실패"));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, load, onFinished]);

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function start() {
    setError(null);
    if (!picked.size) return setError("경계를 받을 구역을 선택하세요.");
    if (picked.size > MAX_ZONES) return setError(`한 번에 최대 ${MAX_ZONES}개 구역까지 요청할 수 있습니다.`);
    setStarting(true);
    try {
      setStatus(await startJaegebalBoundaryFetch([...picked], simplify));
    } catch (e) {
      setError(e instanceof Error ? e.message : "시작하지 못했습니다.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="rounded-sm border border-border bg-card px-4 py-3 text-xs space-y-2">
      <p className="font-semibold text-foreground">
        새 구역 경계 대기 목록{" "}
        <span className="font-normal text-muted-foreground">
          — 업데이트에서 새로 발견된 구역은 큰 범위 응답의 거친 경계로 지도에 먼저 표시되고, 여기에 "경계 보완 필요"로 남습니다. 구역을 골라 정밀 경계를 직접 받으세요(한 번에 최대 {MAX_ZONES}개, 요청 사이 10~30초 랜덤, 막히면 즉시 중단).
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground">simplify</span>
        {["0.0001", "0.000005"].map((v) => (
          <label key={v} className="flex items-center gap-1">
            <input type="radio" name="boundary-simplify" value={v} checked={simplify === v} onChange={() => setSimplify(v)} disabled={running || starting} />
            {v}
            <span className="text-muted-foreground">{v === "0.0001" ? "(브라우저 기본값, 경계 거침)" : "(촘촘함, 막힐 수 있음)"}</span>
          </label>
        ))}
        <button
          type="button"
          disabled={running || starting || !picked.size}
          onClick={() => void start()}
          className="rounded-sm border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {running ? "경계 받는 중…" : starting ? "시작 중…" : `선택한 ${picked.size}개 경계 받기`}
        </button>
        <button type="button" onClick={load} disabled={running} className="rounded-sm border border-border px-2 py-1 text-xs disabled:opacity-40">
          새로고침
        </button>
      </div>

      {error && <p className="text-destructive">{error}</p>}
      {status?.blocked && <p className="text-destructive">중단됨: {status.blocked} — 재시도하지 않았습니다. 시간을 두고 다시 하세요.</p>}

      {rows == null ? (
        <p className="text-muted-foreground">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">경계 보완이 필요한 새 구역이 없습니다.</p>
      ) : (
        <table className="w-full max-w-3xl border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="w-8 py-1" />
              <th className="py-1 pr-3">구역</th>
              <th className="py-1 pr-3">지역</th>
              <th className="py-1 pr-3">단계</th>
              <th className="py-1 pr-3">발견 시각</th>
              <th className="py-1">현재 경계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sourceKey} className="border-b border-border/50">
                <td className="py-1">
                  <input type="checkbox" checked={picked.has(r.sourceKey)} onChange={() => toggle(r.sourceKey)} disabled={running || starting} />
                </td>
                <td className="py-1 pr-3 font-semibold">{r.name}</td>
                <td className="py-1 pr-3">{r.region}</td>
                <td className="py-1 pr-3">{r.stage || "-"}</td>
                <td className="py-1 pr-3 text-muted-foreground">{dateTime(r.pendingAt)}</td>
                <td className="py-1 text-amber-700">거친 경계({r.points}점) · 경계 보완 필요</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {status && status.results.length > 0 && (
        <div className="rounded-sm border border-border bg-background p-2">
          <b>
            최근 경계 받기 결과{status.simplify ? ` (simplify ${status.simplify})` : ""}
            {running ? " — 진행 중" : ""}
          </b>
          <ul className="mt-1 space-y-0.5">
            {status.results.map((r, i) => (
              <li key={`${r.name}-${i}`} className={r.error ? "text-destructive" : "text-muted-foreground"}>
                {r.name} — {r.error ?? `경계 ${r.points ?? 0}점으로 갱신(${r.updated ?? 0}개 구역)`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
