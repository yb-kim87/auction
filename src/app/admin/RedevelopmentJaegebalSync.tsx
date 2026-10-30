"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchJaegebalAutoSettings,
  fetchJaegebalSyncStatus,
  saveJaegebalAutoSettings,
  startJaegebalSync,
  type JaegebalAutoSettings,
  type JaegebalSyncStatus,
} from "@/lib/api";

/** 재개발닷컴 구 코드(서울 25개 구). */
const DISTRICTS: Array<[string, string]> = [
  ["11110", "종로구"], ["11140", "중구"], ["11170", "용산구"], ["11200", "성동구"], ["11215", "광진구"],
  ["11230", "동대문구"], ["11260", "중랑구"], ["11290", "성북구"], ["11305", "강북구"], ["11320", "도봉구"],
  ["11350", "노원구"], ["11380", "은평구"], ["11410", "서대문구"], ["11440", "마포구"], ["11470", "양천구"],
  ["11500", "강서구"], ["11530", "구로구"], ["11545", "금천구"], ["11560", "영등포구"], ["11590", "동작구"],
  ["11620", "관악구"], ["11650", "서초구"], ["11680", "강남구"], ["11710", "송파구"], ["11740", "강동구"],
];
const DISTRICT_NAME = new Map(DISTRICTS);
const NORMAL_MAX_DISTRICTS = 3; // 이보다 많으면 서버가 느린 간격(요청 60초·구 사이 120초)으로 실행
const POLL_MS = 5000;
const MAX_CHANGES_SHOWN = 30;
const DEFAULT_INTERVAL_DAYS = 14;

const FIELD_LABEL: Record<string, string> = { stage: "단계 변경", projectType: "사업유형 변경", new: "신규", missing: "사라짐 표시", restored: "복구" };

const namesOf = (codes: string[]) => codes.map((c) => DISTRICT_NAME.get(c) ?? c);
const kstDate = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date(iso));
const kstDateTime = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** 예상 소요 시간(분) — 서버 간격과 같은 계산: 3개 이하 30초 간격, 4개 이상 요청 60초·구 사이 120초. */
function estimateMinutes(n: number): number {
  if (n <= 0) return 0;
  return n <= NORMAL_MAX_DISTRICTS ? Math.max(1, Math.round((n * 30 + (n - 1) * 30) / 60)) : Math.round((n * 60 + (n - 1) * 120) / 60);
}

/** 재개발닷컴 구역 업데이트 패널 — 구를 고르고(전체 선택 가능) ① 지금 업데이트 ② 자동 업데이트(주기마다 새벽에 서버가 실행, 기본 꺼짐·14일)를 설정한다. 둘은 별개다. */
export function RedevelopmentJaegebalSync({ onFinished }: { onFinished: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<JaegebalSyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [auto, setAuto] = useState<JaegebalAutoSettings | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const [intervalInput, setIntervalInput] = useState(String(DEFAULT_INTERVAL_DAYS));
  const wasRunning = useRef(false);
  const initialSelectionDone = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const running = !!status?.running;

  // 열 때 서버의 현재 실행 상태와 자동 업데이트 설정을 한 번 확인한다.
  useEffect(() => {
    fetchJaegebalSyncStatus().then(setStatus).catch(() => undefined);
    fetchJaegebalAutoSettings()
      .then((s) => {
        setAuto(s);
        setIntervalInput(String(s.intervalDays));
        if (!initialSelectionDone.current && s.codes.length) {
          initialSelectionDone.current = true;
          setSelected(s.codes);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (running) wasRunning.current = true;
    if (!running && wasRunning.current) {
      wasRunning.current = false;
      onFinishedRef.current();
      fetchJaegebalAutoSettings().then(setAuto).catch(() => undefined); // 자동 실행이 끝났다면 다음 예정 시각이 바뀐다.
    }
    if (!running) return;
    const timer = setInterval(() => {
      fetchJaegebalSyncStatus().then(setStatus).catch((e) => setError(e instanceof Error ? e.message : "상태 확인 실패"));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running]);

  // 새벽에 서버가 자동 실행을 시작한 경우도 화면이 알아채도록, 자동 업데이트가 켜져 있으면 가끔 상태를 확인한다.
  useEffect(() => {
    if (!auto?.enabled || running) return;
    const timer = setInterval(() => {
      fetchJaegebalSyncStatus().then(setStatus).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(timer);
  }, [auto?.enabled, running]);

  const allSelected = selected.length === DISTRICTS.length;

  function toggle(code: string) {
    setSelected((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  }

  /** 선택한 구를 지금 바로 업데이트(자동 업데이트 설정과 별개). 구가 많으면 서버가 느린 간격으로 실행한다. */
  async function startNow() {
    if (selected.length > NORMAL_MAX_DISTRICTS) {
      const ok = window.confirm(
        `선택한 ${selected.length}개 구를 지금 업데이트합니다.\n\n` +
          `• 구가 ${NORMAL_MAX_DISTRICTS}개를 넘으면 사이트에 부담을 주지 않도록 느린 간격(요청 60초·구 사이 120초)으로 실행합니다.\n` +
          `• 약 ${estimateMinutes(selected.length)}분 걸립니다. 화면을 닫아도 서버에서 계속 진행됩니다.\n` +
          "• 사이트 보안 확인이 뜨면 즉시 전체를 멈추고, 구 오류가 2번 연속이면 멈춥니다.\n" +
          "• 최근 6시간 안에 이미 수집한 구는 건너뜁니다.\n" +
          "• 진행 중에는 서버를 배포·재시작하지 마세요(끊기면 다시 실행하세요. 끝낸 구는 건너뛰고 이어서 합니다).\n\n" +
          "시작할까요?",
      );
      if (!ok) return;
    }
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

  async function saveAuto(body: { enabled?: boolean; intervalDays?: number; codes?: string[] }, okMessage: string) {
    setAutoBusy(true);
    setAutoMessage(null);
    setError(null);
    try {
      const saved = await saveJaegebalAutoSettings(body);
      setAuto(saved);
      setIntervalInput(String(saved.intervalDays));
      setAutoMessage(okMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "자동 업데이트 설정을 저장하지 못했습니다.");
    } finally {
      setAutoBusy(false);
    }
  }

  /** 스위치: 켤 때 대상 구가 아직 없으면 지금 선택한 구를 대상으로 저장한다. */
  async function toggleAuto() {
    if (!auto) return;
    if (auto.enabled) {
      await saveAuto({ enabled: false }, "자동 업데이트를 껐습니다.");
      return;
    }
    const codes = auto.codes.length ? undefined : selected;
    if (!auto.codes.length && !selected.length) {
      setError("자동 업데이트할 구를 먼저 선택하세요.");
      return;
    }
    await saveAuto({ enabled: true, ...(codes ? { codes } : {}) }, `자동 업데이트를 켰습니다. 첫 실행은 ${auto.intervalDays}일 뒤 새벽입니다.`);
  }

  async function applyInterval() {
    const n = Number(intervalInput);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      setError("업데이트 주기는 1~365일의 정수여야 합니다.");
      return;
    }
    await saveAuto({ intervalDays: n }, `업데이트 주기를 ${n}일로 적용했습니다.`);
  }

  const doneCount = status?.results.filter((r) => r.name || r.error || r.warning).length ?? 0;
  const autoOn = !!auto?.enabled;
  const savedNames = auto ? namesOf(auto.codes) : [];
  const sameAsSaved = !!auto && auto.codes.length === selected.length && auto.codes.every((c) => selected.includes(c));

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">
        업데이트할 구를 고르세요. <b className="text-foreground">지금 업데이트</b>는 바로 실행하고, 아래 <b className="text-foreground">자동 업데이트</b>는 선택한 구를 주기마다 새벽에 서버가 실행합니다(서로 별개).
        사이트에 부담을 주지 않도록 요청 사이에 간격을 두며, 보안 확인이 뜨면 자동으로 멈춥니다.
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={running}
          onClick={() => setSelected(allSelected ? [] : DISTRICTS.map(([c]) => c))}
          className="rounded-sm border border-border px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40"
        >
          {allSelected ? "전체 해제" : "전체 선택"}
        </button>
        <span className="text-muted-foreground">{selected.length}/{DISTRICTS.length}개 선택</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DISTRICTS.map(([code, name]) => {
          const on = selected.includes(code);
          return (
            <button
              key={code}
              type="button"
              disabled={running}
              onClick={() => toggle(code)}
              className={`rounded-sm border px-2 py-1 text-xs ${on ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-foreground hover:bg-muted"} disabled:opacity-40`}
            >
              {name}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!selected.length || running || starting}
          onClick={startNow}
          className="rounded-sm border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {running ? "업데이트 중…" : starting ? "시작 중…" : `선택한 ${selected.length}개 구 지금 업데이트`}
        </button>
        {selected.length > NORMAL_MAX_DISTRICTS && !running && (
          <span className="text-muted-foreground">약 {estimateMinutes(selected.length)}분 걸립니다(느린 간격으로 실행)</span>
        )}
        {running && status && (
          <span className="text-muted-foreground">
            {status.trigger === "auto" ? "[자동] " : ""}
            {doneCount}/{status.codes.length}개 구 진행{status.all ? " (느린 순차 — 화면을 닫아도 계속됩니다)" : ""} — 끝나면 지도가 자동으로 새로 불러와집니다
          </span>
        )}
      </div>

      {/* 자동 업데이트 — 알림톡 탭의 "자동 반복 발송"과 같은 디자인(켜지면 초록색) */}
      <div
        className={`flex items-center justify-between gap-3 rounded-sm border px-3 py-2 transition-colors ${
          autoOn ? "border-emerald-300 bg-emerald-50" : "border-border bg-secondary/20"
        }`}
      >
        <div className="flex items-center gap-2">
          {autoOn ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40" />
          )}
          <div>
            <p className={`text-xs font-semibold ${autoOn ? "text-emerald-700" : "text-foreground"}`}>{autoOn ? "자동 업데이트 작동 중" : "자동 업데이트 꺼짐"}</p>
            <p className="text-[11px] text-muted-foreground">
              {autoOn && auto
                ? `서버가 ${auto.intervalDays}일마다 새벽(한국시간 1~6시)에 ${auto.codes.length}개 구(${savedNames.slice(0, 5).join(", ")}${savedNames.length > 5 ? " 외" : ""})를 자동으로 업데이트합니다.${
                    auto.nextRunAt ? ` 다음 예정: ${kstDate(auto.nextRunAt)} 이후 새벽.` : ""
                  }${auto.lastRunAt ? ` 마지막 자동 실행: ${kstDateTime(auto.lastRunAt)}.` : ""}`
                : "켜두면 서버가 정해진 주기마다 새벽에 선택한 구를 자동으로 업데이트합니다. 지금은 자동으로 실행되지 않습니다."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void toggleAuto()}
          disabled={!auto || autoBusy}
          role="switch"
          aria-checked={autoOn}
          aria-label="자동 업데이트"
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            autoOn ? "bg-emerald-500" : "bg-secondary border border-border"
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autoOn ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border px-3 py-2">
        <label className="text-xs text-muted-foreground shrink-0">업데이트 주기(일)</label>
        <input
          type="number"
          min={1}
          max={365}
          value={intervalInput}
          onChange={(e) => setIntervalInput(e.target.value)}
          className="w-20 px-2 py-1 text-xs border border-border rounded-sm bg-card"
        />
        <button
          type="button"
          onClick={() => void applyInterval()}
          disabled={!auto || autoBusy}
          className="px-2 py-1 text-[11px] font-medium rounded-sm border border-border hover:bg-secondary disabled:opacity-50"
        >
          {autoBusy ? "적용 중..." : "적용"}
        </button>
        <span className="text-[11px] text-muted-foreground">기본 14일(2주)</span>
        <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" />
        <span className="text-xs text-muted-foreground">
          자동 업데이트 대상: <b className="text-foreground">{auto && auto.codes.length ? `${auto.codes.length}개 구 (${savedNames.slice(0, 4).join(", ")}${savedNames.length > 4 ? " 외" : ""})` : "없음"}</b>
        </span>
        <button
          type="button"
          onClick={() => void saveAuto({ codes: selected }, `자동 업데이트 대상을 ${selected.length}개 구로 저장했습니다.`)}
          disabled={!auto || autoBusy || !selected.length || sameAsSaved}
          className="px-2 py-1 text-[11px] font-medium rounded-sm border border-border hover:bg-secondary disabled:opacity-50"
          title="위에서 선택한 구를 자동 업데이트 대상으로 저장합니다"
        >
          선택한 구를 대상으로 저장
        </button>
      </div>
      {autoMessage && <p className="text-emerald-700">{autoMessage}</p>}

      {error && <p className="text-destructive">{error}</p>}
      {status?.blocked && (
        <p className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
          재개발닷컴 보안 확인에 걸려 중단했습니다. 우회하지 않고 멈췄으니 잠시(몇 시간) 뒤에 다시 시도해 주세요. 자동 업데이트라면 하루 뒤 새벽에 한 번 다시 시도합니다. ({status.blocked})
        </p>
      )}
      {status && status.startedAt && (
        <div className="space-y-1 rounded-sm border border-border bg-muted/40 px-3 py-2">
          <p className="font-semibold text-foreground">
            {running ? "진행 중" : "최근 실행 결과"}
            {status.trigger === "auto" ? " (자동)" : ""} <span className="font-normal text-muted-foreground">{new Date(status.startedAt).toLocaleString("ko-KR")}</span>
          </p>
          {status.results.map((r) => (
            <p key={r.code} className="text-muted-foreground">
              <b className="text-foreground">{r.name ?? DISTRICT_NAME.get(r.code) ?? r.code}</b>
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
