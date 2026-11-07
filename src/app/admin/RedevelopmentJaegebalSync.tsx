"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  fetchJaegebalAutoSettings,
  fetchJaegebalSyncStatus,
  fetchJaegebalTileProgress,
  type JaegebalTileProgress,
  saveJaegebalAutoSettings,
  startJaegebalSync,
  type JaegebalAutoSettings,
  type JaegebalSyncStatus,
} from "@/lib/api";

const POLL_MS = 5000;
const MAX_CHANGES_SHOWN = 30;
const DEFAULT_INTERVAL_DAYS = 14;

const FIELD_LABEL: Record<string, string> = { stage: "단계 변경", projectType: "사업유형 변경", new: "신규", missing: "사라짐 표시", restored: "복구" };

const kstDateTime = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const DEFAULT_RUN_TIME = "03:00";
const pad2 = (n: number) => String(n).padStart(2, "0");
/** 켜면 (오늘 + 주기일)의 한국시간 시:분에 실행된다 — 서버의 nextRunTime과 같은 계산. */
function previewNextRun(intervalDays: number, time: string, from = new Date()): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !Number.isInteger(intervalDays) || intervalDays < 1) return null;
  const kst = new Date(from.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + intervalDays, Number(m[1]), Number(m[2])) - 9 * 3600_000);
}
/** "11월 13일(금) 오전 3:00" */
const kstWhen = (d: Date | string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(d));
/** 한국시간 달력 기준 며칠 뒤인지: 오늘 / 내일 / N일 후 */
function daysLabel(d: Date | string, from = new Date()): string {
  const day = (x: Date) => Math.floor((x.getTime() + 9 * 3600_000) / 86400_000);
  const diff = day(new Date(d)) - day(from);
  return diff <= 0 ? "오늘" : diff === 1 ? "내일" : `${diff}일 후`;
}

/** 재개발닷컴 구역 업데이트 패널 — ① 자동 업데이트(주기·실행 시각·켜기를 정하고 "설정 저장", 서버가 설정한 주기·시각에 실행, 기본 꺼짐·14일·03:00)
 *  ② 수동 업데이트(바로 실행). 재개발닷컴에는 서울·경기·인천 전체를 요청 1번으로 받아 구는 서버가 나눠 반영하므로 구를 고르지 않는다. */
export function RedevelopmentJaegebalSync({ onFinished, summary }: { onFinished: () => void; summary?: ReactNode }) {
  const [status, setStatus] = useState<JaegebalSyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // 자동 업데이트: 서버에 저장된 값과, 저장 전에 편집 중인 값(주기·시각). 켜짐/꺼짐은 스위치가 즉시 저장한다.
  const [auto, setAuto] = useState<JaegebalAutoSettings | null>(null);
  const [intervalInput, setIntervalInput] = useState(String(DEFAULT_INTERVAL_DAYS));
  const [timeInput, setTimeInput] = useState(DEFAULT_RUN_TIME); // 실행 시각(한국시간) HH:MM
  const [autoBusy, setAutoBusy] = useState(false);
  const [tileFromInput, setTileFromInput] = useState("1"); // 나눠서 실행할 타일 시작 번호(지난번 끝 다음 번호로 자동 채움)
  const [tileProgress, setTileProgress] = useState<JaegebalTileProgress | null>(null);
  const [tileToInput, setTileToInput] = useState("10"); // 나눠서 실행할 타일 끝 번호
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const wasRunning = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const running = !!status?.running;

  function applySaved(s: JaegebalAutoSettings) {
    setAuto(s);
    setIntervalInput(String(s.intervalDays));
    setTimeInput(`${pad2(s.runHour ?? 3)}:${pad2(s.runMinute ?? 0)}`);
  }

  // 열 때 서버의 현재 실행 상태와 자동 업데이트 설정을 한 번 확인한다.
  function loadTileProgress() {
    fetchJaegebalTileProgress()
      .then((p) => {
        setTileProgress(p);
        setTileFromInput(String(p.next));
        setTileToInput((cur) => (Number(cur) < p.next ? String(p.next + 2) : cur)); // 끝 번호가 시작보다 작아지면 3개 단위로 맞춘다
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    fetchJaegebalSyncStatus().then(setStatus).catch(() => undefined);
    fetchJaegebalAutoSettings().then(applySaved).catch(() => undefined);
    loadTileProgress();
  }, []);

  useEffect(() => {
    if (running) wasRunning.current = true;
    if (!running && wasRunning.current) {
      wasRunning.current = false;
      onFinishedRef.current();
      loadTileProgress();
      // 자동 실행이 끝났다면 다음 예정 시각이 바뀐다(편집 중인 값은 건드리지 않고 저장된 값만 갱신).
      fetchJaegebalAutoSettings().then(setAuto).catch(() => undefined);
    }
    if (!running) return;
    const timer = setInterval(() => {
      fetchJaegebalSyncStatus().then(setStatus).catch((e) => setError(e instanceof Error ? e.message : "상태 확인 실패"));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running]);

  // 서버가 정해진 시각에 자동 실행을 시작한 경우도 화면이 알아채도록, 자동 업데이트가 켜져 있으면 가끔 상태를 확인한다.
  useEffect(() => {
    if (!auto?.enabled || running) return;
    const timer = setInterval(() => {
      fetchJaegebalSyncStatus().then(setStatus).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(timer);
  }, [auto?.enabled, running]);

  /** 지금 바로 업데이트(자동 업데이트 설정과 별개). 서울·경기·인천 전체를 요청 1번으로 받아 반영한다. */
  async function startNow(tileRange?: { from: number; to: number }) {
    setError(null);
    setStarting(true);
    try {
      setStatus(await startJaegebalSync([], tileRange));
    } catch (e) {
      setError(e instanceof Error ? e.message : "업데이트를 시작하지 못했습니다.");
    } finally {
      setStarting(false);
    }
  }

  /** 설정 저장 — 업데이트 주기와 실행 시각을 저장한다(켜짐/꺼짐은 스위치가 따로 즉시 저장). */
  async function saveSettings() {
    setAutoMessage(null);
    setError(null);
    const days = Number(intervalInput);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError("업데이트 주기는 1~365일의 정수여야 합니다.");
      return;
    }
    const tm = /^(\d{2}):(\d{2})$/.exec(timeInput);
    if (!tm) {
      setError("실행 시각(한국시간)을 입력하세요.");
      return;
    }
    setAutoBusy(true);
    try {
      const saved = await saveJaegebalAutoSettings({ intervalDays: days, runHour: Number(tm[1]), runMinute: Number(tm[2]) });
      applySaved(saved);
      setAutoMessage(
        `설정을 저장했습니다 — ${saved.intervalDays}일마다 · 매 ${pad2(saved.runHour ?? 3)}:${pad2(saved.runMinute ?? 0)}` +
          (saved.enabled && saved.nextRunAt ? ` · 다음 실행 ${daysLabel(saved.nextRunAt)}인 ${kstWhen(saved.nextRunAt)}` : saved.enabled ? "" : " (자동 업데이트는 꺼져 있습니다)"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "자동 업데이트 설정을 저장하지 못했습니다.");
    } finally {
      setAutoBusy(false);
    }
  }

  /** 스위치 — 알림톡의 "자동 반복 발송"처럼 누르는 즉시 켜고 끈다. 이미 저장된 설정(주기·시각)대로 동작한다. */
  async function toggleAuto() {
    if (!auto) return;
    setAutoMessage(null);
    setError(null);
    setAutoBusy(true);
    try {
      const saved = await saveJaegebalAutoSettings({ enabled: !auto.enabled });
      setAuto(saved);
      setAutoMessage(
        saved.enabled
          ? `자동 업데이트를 켰습니다 — ${saved.nextRunAt ? `${daysLabel(saved.nextRunAt)}인 ${kstWhen(saved.nextRunAt)}에 처음 실행되고, ` : ""}이후 ${saved.intervalDays}일마다 같은 시각에 서울·경기·인천 구역을 업데이트합니다.`
          : "자동 업데이트를 껐습니다. 저장된 설정은 그대로 남아 있습니다.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "자동 업데이트를 켜고 끄지 못했습니다.");
    } finally {
      setAutoBusy(false);
    }
  }

  const doneCount = status?.results.filter((r) => r.name || r.error || r.warning).length ?? 0;
  const autoOn = !!auto?.enabled;
  const savedTime = auto ? `${pad2(auto.runHour ?? 3)}:${pad2(auto.runMinute ?? 0)}` : DEFAULT_RUN_TIME;
  const dirty = !!auto && (Number(intervalInput) !== auto.intervalDays || timeInput !== savedTime);
  const preview = previewNextRun(Number(intervalInput), timeInput);

  return (
    <div className="space-y-2">
      {summary}
      <p className="text-muted-foreground">
        <b className="text-foreground">자동 업데이트</b>는 스위치를 켜면 저장된 주기·시각에 서버가 실행하고(주기·시각은 <b className="text-foreground">설정 저장</b>으로 저장), <b className="text-foreground">수동 업데이트</b>는 아래 버튼으로 바로 실행합니다.
        서울·경기·인천 전체를 재개발닷컴에 요청 1번으로 받아 구별로 나눠 반영하며, 보안 확인이 뜨면 자동으로 멈춥니다.
      </p>

      {/* 자동 업데이트 — 알림톡 탭의 "자동 반복 발송"과 같은 디자인(켜지면 초록색). 스위치는 즉시 켜고 끄며, 주기·대상 구는 "설정 저장"으로 저장한다. */}
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
                ? `서버가 ${auto.intervalDays}일마다 ${savedTime}(한국시간)에 서울·경기·인천 구역을 자동으로 업데이트합니다.${
                    auto.nextRunAt ? ` 다음 실행: ${kstWhen(auto.nextRunAt)} (${daysLabel(auto.nextRunAt)}).` : ""
                  }${auto.lastRunAt ? ` 마지막 자동 실행: ${kstDateTime(auto.lastRunAt)}.` : ""}`
                : `켜면 ${preview ? `${daysLabel(preview)}인 ${kstWhen(preview)}에 처음 실행되고 ` : ""}이후 ${auto?.intervalDays ?? DEFAULT_INTERVAL_DAYS}일마다 같은 시각에 서울·경기·인천 구역을 자동으로 업데이트합니다. 지금은 자동으로 실행되지 않습니다.`}
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
      <div className="space-y-2 rounded-sm border border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground shrink-0">업데이트 주기(일)</label>
          <input
            type="number"
            min={1}
            max={365}
            value={intervalInput}
            onChange={(e) => setIntervalInput(e.target.value)}
            className="w-20 px-2 py-1 text-xs border border-border rounded-sm bg-card"
          />
          <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" />
          <label className="text-xs text-muted-foreground shrink-0">실행 시각(한국시간)</label>
          <input
            type="time"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            className="px-2 py-1 text-xs border border-border rounded-sm bg-card"
          />
        </div>
        {preview && (
          <p className="text-[11px] text-muted-foreground">
            이 설정으로 켜면 <b className="text-foreground">{daysLabel(preview)}인 {kstWhen(preview)}</b>에 처음 실행되고, 이후 {Number(intervalInput)}일마다 같은 시각에 실행됩니다.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={!auto || autoBusy}
            className="rounded-sm border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            {autoBusy ? "저장 중…" : "설정 저장"}
          </button>
          {dirty && <span className="text-[11px] text-amber-600">저장되지 않은 주기·시각 변경이 있습니다 — &quot;설정 저장&quot;을 눌러야 자동 업데이트에 적용됩니다</span>}
        </div>
      </div>
      {autoMessage && <p className="text-emerald-700">{autoMessage}</p>}
      <p className="text-muted-foreground">
        마지막 반영 후 <b className="text-foreground">2주</b>가 지나면 재개발 텔레그램 채널로 업데이트 요청 알림이 옵니다(매일 오전 10시 확인). 자동 업데이트를 켜 두면 성공한 실행도 마지막 반영으로 봅니다.
      </p>

      {/* 수동 업데이트 — 자동 업데이트와 별개로 바로 실행 */}
      <div className="space-y-2 rounded-sm border border-border px-3 py-2">
        <p className="text-xs font-semibold text-foreground">수동 업데이트 <span className="font-normal text-muted-foreground">— 자동 업데이트 설정과 별개로, 지금 바로 서울·경기·인천 구역을 업데이트합니다(최근 6시간 안에 수집했으면 건너뜁니다)</span></p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={running || starting}
            onClick={() => void startNow()}
            className="rounded-sm border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            {running ? "업데이트 중…" : starting ? "시작 중…" : "전체 실행 (구역도 업데이트)"}
          </button>
          <span className="flex items-center gap-1">
            <span className="text-muted-foreground">나눠서 실행: 타일{tileProgress?.lastTo ? ` (지난번 ${tileProgress.lastTo}번까지 완료)` : ""}</span>
            <input
              type="number"
              min={1}
              value={tileFromInput}
              onChange={(e) => setTileFromInput(e.target.value)}
              disabled={running || starting}
              className="w-14 rounded-sm border border-border bg-background px-1.5 py-1 text-xs"
            />
            <span>~</span>
            <input
              type="number"
              min={1}
              value={tileToInput}
              onChange={(e) => setTileToInput(e.target.value)}
              disabled={running || starting}
              className="w-14 rounded-sm border border-border bg-background px-1.5 py-1 text-xs"
            />
            <span className="text-muted-foreground">번{tileProgress?.total ?? status?.tileRange?.total ? ` (전체 ${tileProgress?.total ?? status?.tileRange?.total}개)` : ""}</span>
            <button
              type="button"
              disabled={running || starting}
              onClick={() => {
                const from = Number(tileFromInput);
                const to = Number(tileToInput);
                if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
                  setError("타일 번호는 1 이상의 정수이고, 끝 번호가 시작 번호 이상이어야 합니다.");
                  return;
                }
                void startNow({ from, to });
              }}
              className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-40"
            >
              이 범위만 업데이트
            </button>
          </span>
          {running && status && (
            <span className="text-muted-foreground">
              {status.trigger === "auto" ? "[자동] " : ""}
              {status.tileRange ? `[타일 ${status.tileRange.from}~${Math.min(status.tileRange.to, status.tileRange.total ?? status.tileRange.to)}번만] ` : ""}{status.phase ? `${status.phase} · ` : ""}{doneCount}/{status.codes.length}개 지역 반영 — 끝나면 지도가 자동으로 새로 불러와집니다
            </span>
          )}
        </div>
      </div>

      {error && <p className="text-destructive">{error}</p>}
      {status?.blocked && (
        <p className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
          재개발닷컴 보안 확인에 걸려 중단했습니다. 우회하지 않고 멈췄으니 잠시(몇 시간) 뒤에 다시 시도해 주세요. 자동 업데이트라면 하루 뒤 한 번 다시 시도합니다. ({status.blocked})
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
              <b className="text-foreground">{r.name ?? r.code}</b>
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
