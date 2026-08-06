"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchNiceCrawlerLogs,
  fetchNiceCrawlerStatus,
  niceCrawlerClearLogs,
  niceCrawlerStart,
  niceCrawlerStop,
  type NiceCrawlerLogEntry,
  type NiceCrawlerStatus,
} from "@/lib/api";

/** 나이스옥션 작업창 — 탱크옥션 작업창(CrawlerWorkPanel.tsx)과 완전히
 * 독립된 병렬 시스템(사용자 요청, 2026-08-07: "기존 탱크옥션 작업창을
 * 그대로 두고 나이스 작업창을 하나 만들어서... 문제가 안 나올 때까지
 * 점검하면서 나이스로 점점 작업을 옮겨갈꺼야"). 1차 범위는 시작/중지·
 * 진행 상태·로그만 — 매일 작업/알고리즘/부가세 등은 크롤 소스와 무관한
 * 공용 기능이라 별도로 만들지 않는다. */

const PHASE_LABELS: Record<string, string> = {
  idle: "대기",
  collecting_objids: "물건 목록 수집 중",
  matching: "우리 DB와 대조 중",
  fetching_details: "상세 조회 중",
  stopped: "중단됨",
  error: "오류",
};

const LEVEL_TONE: Record<string, string> = {
  info: "text-foreground",
  warn: "text-amber-600",
  error: "text-destructive",
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", { hour12: false });
  } catch {
    return iso;
  }
}

export function NiceCrawlerWorkPanel() {
  const [status, setStatus] = useState<NiceCrawlerStatus | null>(null);
  const [logs, setLogs] = useState<NiceCrawlerLogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([fetchNiceCrawlerStatus(), fetchNiceCrawlerLogs(200)]);
      setStatus(s);
      setLogs(l);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태를 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    pollRef.current = setInterval(() => void refresh(), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  async function handleStart() {
    setBusy("start");
    try {
      await niceCrawlerStart();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "시작에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleStop() {
    setBusy("stop");
    try {
      await niceCrawlerStop();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "중지에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleClearLogs() {
    setBusy("clear");
    try {
      await niceCrawlerClearLogs();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그 삭제에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  // 워커가 하트비트를 못 보내고 있으면(60초 이상 갱신 없음) running=true여도
  // 실제로는 죽어있을 수 있다 — 관리자가 로컬 워커를 다시 띄워야 한다는
  // 신호를 준다.
  const stale =
    status?.running && Date.now() - new Date(status.updatedAt).getTime() > 60_000;

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-foreground">나이스옥션 작업창</p>
          <span className="px-2 py-0.5 text-xs rounded-sm bg-muted text-muted-foreground">
            {PHASE_LABELS[status?.phase ?? "idle"] ?? status?.phase ?? "-"}
          </span>
          {status?.running && (
            <span className="px-2 py-0.5 text-xs rounded-sm bg-emerald-100 text-emerald-700">
              실행 중
            </span>
          )}
          {stale && (
            <span className="px-2 py-0.5 text-xs rounded-sm bg-amber-100 text-amber-800">
              워커 응답 없음 — 로컬 워커(nice_worker.py)가 켜져 있는지 확인하세요
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={busy !== null || status?.running}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
            >
              시작
            </button>
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={busy !== null || !status?.running}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm border border-border disabled:opacity-50"
            >
              중지
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {status?.error && (
          <p className="text-xs text-destructive">워커 오류: {status.error}</p>
        )}
        {status?.lastMessage && (
          <p className="text-xs text-muted-foreground">{status.lastMessage}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-center">
          {[
            ["목록 수집", status?.totalObjIds],
            ["매칭", status?.matched],
            ["처리", status?.completed],
            ["신규", status?.created],
            ["갱신", status?.updated],
            ["스킵", status?.skipped],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-sm border border-border bg-background p-2">
              <p className="text-[0.65rem] text-muted-foreground">{label}</p>
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {(value as number | undefined)?.toLocaleString("ko-KR") ?? "-"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-sm border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">로그</p>
          <button
            type="button"
            onClick={() => void handleClearLogs()}
            disabled={busy !== null}
            className="ml-auto text-xs text-muted-foreground hover:underline disabled:opacity-50"
          >
            지우기
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto space-y-1 font-mono text-xs">
          {logs.length === 0 && <p className="text-muted-foreground">로그가 없습니다.</p>}
          {logs.map((log) => (
            <div key={log.id} className={LEVEL_TONE[log.level] ?? "text-foreground"}>
              <span className="text-muted-foreground">[{formatTime(log.at)}]</span> {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
