"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((c) => b.includes(c));
const kstDate = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date(iso));
const kstDateTime = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** 예상 소요 시간(분) — 서버 간격과 같은 계산: 3개 이하 30초 간격, 4개 이상 요청 60초·구 사이 120초. */
function estimateMinutes(n: number): number {
  if (n <= 0) return 0;
  return n <= NORMAL_MAX_DISTRICTS ? Math.max(1, Math.round((n * 30 + (n - 1) * 30) / 60)) : Math.round((n * 60 + (n - 1) * 120) / 60);
}

/** 구 선택(전체 선택/해제 + 25개 구 버튼). 자동 업데이트 대상과 지금 업데이트 대상은 각각 따로 고른다. */
function DistrictPicker({ value, onChange, disabled }: { value: string[]; onChange: (codes: string[]) => void; disabled?: boolean }) {
  const all = value.length === DISTRICTS.length;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(all ? [] : DISTRICTS.map(([c]) => c))}
          className="rounded-sm border border-border px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40"
        >
          {all ? "전체 해제" : "전체 선택"}
        </button>
        <span className="text-muted-foreground">{value.length}/{DISTRICTS.length}개 선택</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DISTRICTS.map(([code, name]) => {
          const on = value.includes(code);
          return (
            <button
              key={code}
              type="button"
              disabled={disabled}
              onClick={() => onChange(on ? value.filter((c) => c !== code) : [...value, code])}
              className={`rounded-sm border px-2 py-1 text-xs ${on ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-foreground hover:bg-muted"} disabled:opacity-40`}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 재개발닷컴 구역 업데이트 패널 — ① 자동 업데이트(대상 구·주기·켜기를 정하고 "설정 저장", 서버가 주기마다 새벽에 실행, 기본 꺼짐·14일)
 *  ② 지금 업데이트(구를 따로 골라 바로 실행). 두 구 선택은 서로 별개다. */
export function RedevelopmentJaegebalSync({ onFinished, summary }: { onFinished: () => void; summary?: ReactNode }) {
  // 지금 업데이트용 구 선택
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<JaegebalSyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // 자동 업데이트: 서버에 저장된 값과, 저장 전에 편집 중인 값(스위치·주기·대상 구)
  const [auto, setAuto] = useState<JaegebalAutoSettings | null>(null);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftCodes, setDraftCodes] = useState<string[]>([]);
  const [intervalInput, setIntervalInput] = useState(String(DEFAULT_INTERVAL_DAYS));
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const wasRunning = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const running = !!status?.running;

  function applySaved(s: JaegebalAutoSettings) {
    setAuto(s);
    setDraftEnabled(s.enabled);
    setDraftCodes(s.codes);
    setIntervalInput(String(s.intervalDays));
  }

  // 열 때 서버의 현재 실행 상태와 자동 업데이트 설정을 한 번 확인한다.
  useEffect(() => {
    fetchJaegebalSyncStatus().then(setStatus).catch(() => undefined);
    fetchJaegebalAutoSettings().then(applySaved).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (running) wasRunning.current = true;
    if (!running && wasRunning.current) {
      wasRunning.current = false;
      onFinishedRef.current();
      // 자동 실행이 끝났다면 다음 예정 시각이 바뀐다(편집 중인 값은 건드리지 않고 저장된 값만 갱신).
      fetchJaegebalAutoSettings().then(setAuto).catch(() => undefined);
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

  /** 설정 저장 — 스위치(켜짐/꺼짐)·주기·대상 구를 한 번에 저장한다. */
  async function saveSettings() {
    setAutoMessage(null);
    setError(null);
    const days = Number(intervalInput);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError("업데이트 주기는 1~365일의 정수여야 합니다.");
      return;
    }
    if (draftEnabled && !draftCodes.length) {
      setError("자동 업데이트를 켜려면 대상 구를 하나 이상 선택하세요.");
      return;
    }
    setAutoBusy(true);
    try {
      const saved = await saveJaegebalAutoSettings({ enabled: draftEnabled, intervalDays: days, codes: draftCodes });
      applySaved(saved);
      setAutoMessage(
        `설정을 저장했습니다 — 자동 업데이트 ${saved.enabled ? "켜짐" : "꺼짐"} · ${saved.intervalDays}일마다 · 대상 ${saved.codes.length}개 구` +
          (saved.enabled && saved.nextRunAt ? ` · 첫/다음 실행 ${kstDate(saved.nextRunAt)} 이후 새벽` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "자동 업데이트 설정을 저장하지 못했습니다.");
    } finally {
      setAutoBusy(false);
    }
  }

  const doneCount = status?.results.filter((r) => r.name || r.error || r.warning).length ?? 0;
  const autoOn = !!auto?.enabled;
  const savedNames = auto ? namesOf(auto.codes) : [];
  const dirty = !!auto && (draftEnabled !== auto.enabled || Number(intervalInput) !== auto.intervalDays || !sameSet(draftCodes, auto.codes));

  return (
    <div className="space-y-2">
      {summary}
      <p className="text-muted-foreground">
        <b className="text-foreground">자동 업데이트</b>는 대상 구·주기를 정해 <b className="text-foreground">설정 저장</b>을 누르면 서버가 주기마다 새벽에 실행하고, <b className="text-foreground">지금 업데이트</b>는 아래에서 구를 따로 골라 바로 실행합니다(두 선택은 서로 별개).
        사이트에 부담을 주지 않도록 요청 사이에 간격을 두며, 보안 확인이 뜨면 자동으로 멈춥니다.
      </p>

      {/* 자동 업데이트 — 알림톡 탭의 "자동 반복 발송"과 같은 디자인(켜지면 초록색). 스위치·주기·대상 구는 "설정 저장"으로 한 번에 저장한다. */}
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
                : "켜두면 서버가 정해진 주기마다 새벽에 대상 구를 자동으로 업데이트합니다. 지금은 자동으로 실행되지 않습니다."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDraftEnabled((v) => !v)}
          disabled={!auto || autoBusy}
          role="switch"
          aria-checked={draftEnabled}
          aria-label="자동 업데이트"
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            draftEnabled ? "bg-emerald-500" : "bg-secondary border border-border"
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${draftEnabled ? "translate-x-6" : "translate-x-1"}`} />
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
          <span className="text-[11px] text-muted-foreground">기본 14일(2주)</span>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            자동 업데이트 대상 구 <span className="text-[11px]">(스위치가 꺼져 있어도 대상은 저장됩니다)</span>
          </p>
          <DistrictPicker value={draftCodes} onChange={setDraftCodes} disabled={!auto || autoBusy} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={!auto || autoBusy}
            className="rounded-sm border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            {autoBusy ? "저장 중…" : "설정 저장"}
          </button>
          {dirty && <span className="text-[11px] text-amber-600">저장되지 않은 변경이 있습니다 — &quot;설정 저장&quot;을 눌러야 자동 업데이트에 적용됩니다</span>}
        </div>
      </div>
      {autoMessage && <p className="text-emerald-700">{autoMessage}</p>}
      <p className="text-muted-foreground">
        마지막 반영 후 <b className="text-foreground">2주</b>가 지나면 재개발 텔레그램 채널로 업데이트 요청 알림이 옵니다(매일 오전 10시 확인). 자동 업데이트를 켜 두면 성공한 실행도 마지막 반영으로 봅니다.
      </p>

      {/* 지금 업데이트 — 자동 업데이트와 별개로 구를 따로 골라 바로 실행 */}
      <div className="space-y-2 rounded-sm border border-border px-3 py-2">
        <p className="text-xs font-semibold text-foreground">지금 업데이트 <span className="font-normal text-muted-foreground">— 자동 업데이트 설정과 별개로, 고른 구를 바로 실행합니다</span></p>
        <DistrictPicker value={selected} onChange={setSelected} disabled={running} />
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
      </div>

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
