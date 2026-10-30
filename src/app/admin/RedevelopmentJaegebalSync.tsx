"use client";

import { useEffect, useRef, useState } from "react";
import { fetchJaegebalSyncStatus, startJaegebalSync, type JaegebalSyncStatus } from "@/lib/api";

/** 재개발닷컴 구 코드(서울 25개 구). */
const DISTRICTS: Array<[string, string]> = [
  ["11110", "종로구"], ["11140", "중구"], ["11170", "용산구"], ["11200", "성동구"], ["11215", "광진구"],
  ["11230", "동대문구"], ["11260", "중랑구"], ["11290", "성북구"], ["11305", "강북구"], ["11320", "도봉구"],
  ["11350", "노원구"], ["11380", "은평구"], ["11410", "서대문구"], ["11440", "마포구"], ["11470", "양천구"],
  ["11500", "강서구"], ["11530", "구로구"], ["11545", "금천구"], ["11560", "영등포구"], ["11590", "동작구"],
  ["11620", "관악구"], ["11650", "서초구"], ["11680", "강남구"], ["11710", "송파구"], ["11740", "강동구"],
];
const MAX_DISTRICTS = 3;
const POLL_MS = 5000;
const MAX_CHANGES_SHOWN = 30;

const FIELD_LABEL: Record<string, string> = { stage: "단계 변경", projectType: "사업유형 변경", new: "신규", missing: "사라짐 표시", restored: "복구" };

/** 갱신할 구를 골라 재개발닷컴 구역을 가져오는 패널 — 한 번에 최대 3개 구, 서버가 구마다 간격을 두고 가져온다. */
export function RedevelopmentJaegebalSync({ onFinished }: { onFinished: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<JaegebalSyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const wasRunning = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const running = !!status?.running;

  // 열 때 서버의 현재 상태를 한 번 확인(다른 곳에서 이미 실행 중일 수 있음).
  useEffect(() => {
    fetchJaegebalSyncStatus().then(setStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (running) wasRunning.current = true;
    if (!running && wasRunning.current) {
      wasRunning.current = false;
      onFinishedRef.current();
    }
    if (!running) return;
    const timer = setInterval(() => {
      fetchJaegebalSyncStatus().then(setStatus).catch((e) => setError(e instanceof Error ? e.message : "상태 확인 실패"));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running]);

  function toggle(code: string) {
    setSelected((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : cur.length < MAX_DISTRICTS ? [...cur, code] : cur));
  }

  async function start() {
    setError(null);
    setStarting(true);
    try {
      setStatus(await startJaegebalSync(selected));
    } catch (e) {
      setError(e instanceof Error ? e.message : "업데이트를 시작하지 못했습니다.");
    } finally {
      setStarting(false);
    }
  }

  const doneCount = status?.results.filter((r) => r.name || r.error || r.warning).length ?? 0;

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">
        갱신할 구를 고르세요(한 번에 최대 {MAX_DISTRICTS}개). 구마다 약 1분 걸리고, 사이트에 부담을 주지 않도록 요청 사이에 간격을 두며, 보안 확인이 뜨면 자동으로 멈춥니다.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {DISTRICTS.map(([code, name]) => {
          const on = selected.includes(code);
          const disabled = running || (!on && selected.length >= MAX_DISTRICTS);
          return (
            <button
              key={code}
              type="button"
              disabled={disabled}
              onClick={() => toggle(code)}
              className={`rounded-sm border px-2 py-1 text-xs ${on ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-foreground hover:bg-muted"} disabled:opacity-40`}
            >
              {name}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!selected.length || running || starting}
          onClick={start}
          className="rounded-sm border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {running ? "업데이트 중…" : starting ? "시작 중…" : `선택한 ${selected.length}개 구 업데이트`}
        </button>
        {running && status && (
          <span className="text-muted-foreground">
            {doneCount}/{status.codes.length}개 구 진행 — 끝나면 지도가 자동으로 새로 불러와집니다
          </span>
        )}
      </div>
      {error && <p className="text-destructive">{error}</p>}
      {status?.blocked && (
        <p className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
          재개발닷컴 보안 확인에 걸려 중단했습니다. 우회하지 않고 멈췄으니 잠시(몇 시간) 뒤에 다시 시도해 주세요. ({status.blocked})
        </p>
      )}
      {status && status.startedAt && (
        <div className="space-y-1 rounded-sm border border-border bg-muted/40 px-3 py-2">
          <p className="font-semibold text-foreground">
            {running ? "진행 중" : "최근 실행 결과"} <span className="font-normal text-muted-foreground">{new Date(status.startedAt).toLocaleString("ko-KR")}</span>
          </p>
          {status.results.map((r) => (
            <p key={r.code} className="text-muted-foreground">
              <b className="text-foreground">{r.name ?? DISTRICTS.find(([c]) => c === r.code)?.[1] ?? r.code}</b>
              {r.fetched != null &&
                ` — 가져옴 ${r.fetched} · 신규 ${r.created ?? 0} · 변경 ${r.updated ?? 0} · 사라짐 표시 ${r.markedMissing ?? 0} · 복구 ${r.restored ?? 0}`}
              {!!r.skippedManual && ` · 수동 수정 보호로 건너뜀 ${r.skippedManual}`}
              {r.warning && <span className="text-amber-600"> · {r.warning}</span>}
              {r.error && <span className="text-destructive"> · {r.error}</span>}
            </p>
          ))}
          {status.changes.length > 0 && (
            <details>
              <summary className="cursor-pointer text-muted-foreground">변경 내역 {status.changes.length}건 보기 (누적 이력은 &quot;구역 업데이트 이력&quot; 탭에서)</summary>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto text-muted-foreground">
                {status.changes.slice(0, MAX_CHANGES_SHOWN).map((c, i) => (
                  <li key={`${c.key}-${i}`}>
                    [{FIELD_LABEL[c.field] ?? c.field}] {c.name}
                    {c.field === "stage" || c.field === "projectType" ? `: ${c.from ?? "-"} → ${c.to ?? "-"}` : c.to ? ` (${c.to})` : ""}
                  </li>
                ))}
              </ul>
              {status.changes.length > MAX_CHANGES_SHOWN && <p className="text-muted-foreground">외 {status.changes.length - MAX_CHANGES_SHOWN}건</p>}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
