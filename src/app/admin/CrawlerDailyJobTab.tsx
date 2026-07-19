"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import {
  fetchCrawlerConfig,
  fetchCrawlerLogs,
  fetchSavedSearches,
  updateCrawlerConfig,
  TODAY_BID_DATE_PRESET_ID,
  TODAY_BID_DATE_PRESET_LABEL,
  type CrawlerLogEntry,
  type CrawlerScheduleConfig,
  type SavedSearchPreset,
} from "@/lib/api";

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", { hour12: false });
  } catch {
    return iso;
  }
}

// 매일 작업(스케줄러)은 작업창의 "주소 추가"/"조회 시작"과 동일한
// 서비스 메서드(collectUrls/startCrawl 등)를 submittedBy="scheduler"로
// 그대로 호출한다 — 그 메서드들이 남기는 로그는 전부 "scheduler님이 ..."
// 형태이므로, 이 문구와 tickScheduler 자체의 "[관심조건]"/"예약 작업 ..."
// 태그를 함께 걸러 매일 작업 실행 로그로 보여준다.
function isDailyJobLog(message: string): boolean {
  return (
    message.startsWith("[관심조건]") ||
    message.startsWith("예약 작업 시작") ||
    message.startsWith("예약 작업 실패") ||
    message.includes("예약 조회가 완료") ||
    message.startsWith("scheduler님이")
  );
}

export function CrawlerDailyJobTab() {
  const [schedule, setSchedule] = useState<CrawlerScheduleConfig | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearchPreset[]>([]);
  const [addSelection, setAddSelection] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<CrawlerLogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const refreshLogs = useCallback(() => {
    fetchCrawlerLogs(500)
      .then((all) => setLogs(all.filter((entry) => isDailyJobLog(entry.message))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    Promise.all([fetchCrawlerConfig(), fetchSavedSearches()])
      .then(([config, presets]) => {
        setSchedule({
          ...config.schedule,
          presets:
            config.schedule.presets && config.schedule.presets.length > 0
              ? config.schedule.presets
              : [],
        });
        setSavedSearches(presets);
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : "설정을 불러오지 못했습니다.");
      })
      .finally(() => setLoading(false));
    refreshLogs();
  }, [refreshLogs]);

  // 예약 시각 전후 1분 구간에는 2초 간격으로, 평소에는 15초 간격으로
  // 폴링한다 — 실행 로그가 최대한 빨리 보이면서도 평소엔 불필요한 요청을
  // 줄인다.
  const isNearScheduledTime = useCallback(() => {
    if (!schedule?.enabled) return false;
    const [h, m] = schedule.time.split(":").map((v) => parseInt(v, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return false;
    const now = new Date();
    const scheduled = new Date(now);
    scheduled.setHours(h, m, 0, 0);
    const diffMs = Math.abs(now.getTime() - scheduled.getTime());
    return diffMs <= 60_000;
  }, [schedule?.enabled, schedule?.time]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const schedulePoll = () => {
      clearInterval(timer);
      timer = setInterval(refreshLogs, isNearScheduledTime() ? 2_000 : 15_000);
    };
    schedulePoll();
    const rescheduleCheck = setInterval(schedulePoll, 10_000);
    return () => {
      clearInterval(timer);
      clearInterval(rescheduleCheck);
    };
  }, [refreshLogs, isNearScheduledTime]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const presetNameById = useMemo(() => {
    const map = new Map<string, string>();
    savedSearches.forEach((p) => map.set(p.name, p.name));
    return map;
  }, [savedSearches]);

  const availableToAdd = useMemo(() => {
    const current = new Set(schedule?.presets ?? []);
    const options: { id: string; label: string }[] = [];
    if (!current.has(TODAY_BID_DATE_PRESET_ID)) {
      options.push({ id: TODAY_BID_DATE_PRESET_ID, label: TODAY_BID_DATE_PRESET_LABEL });
    }
    savedSearches
      .filter((p) => !current.has(p.name))
      .forEach((p) => options.push({ id: p.name, label: p.name }));
    return options;
  }, [schedule?.presets, savedSearches]);

  if (loading || !schedule) {
    return <p className="text-sm text-muted-foreground p-6">불러오는 중...</p>;
  }

  const presets = schedule.presets ?? [];

  function updateSchedule(patch: Partial<CrawlerScheduleConfig>) {
    setSchedule((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function addPreset() {
    if (!addSelection) return;
    updateSchedule({ presets: [...presets, addSelection] });
    setAddSelection("");
  }

  function removePreset(index: number) {
    updateSchedule({ presets: presets.filter((_, i) => i !== index) });
  }

  function movePreset(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= presets.length) return;
    const next = [...presets];
    [next[index], next[target]] = [next[target], next[index]];
    updateSchedule({ presets: next });
  }

  async function handleSave() {
    if (!schedule) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateCrawlerConfig({ schedule });
      setMessage("매일 작업 설정이 저장되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  function labelFor(id: string) {
    if (id === TODAY_BID_DATE_PRESET_ID) return TODAY_BID_DATE_PRESET_LABEL;
    return presetNameById.get(id) ?? id;
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-foreground">매일 작업</h2>
        <p className="text-sm text-muted-foreground mt-1">
          지정한 시간에 아래 관심조건 목록을 순서대로 한 번씩 돌면서 자동으로
          주소 수집과 조회를 실행합니다. 관심조건은 작업창에 저장해 둔 검색조건
          목록에서 가져와 추가할 수 있습니다.
        </p>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <div
        className={`flex items-center justify-between gap-3 rounded-sm border px-3 py-2 transition-colors ${
          schedule.enabled
            ? "border-emerald-300 bg-emerald-50"
            : "border-border bg-secondary/20"
        }`}
      >
        <div className="flex items-center gap-2">
          {schedule.enabled ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40" />
          )}
          <div>
            <p
              className={`text-xs font-semibold ${schedule.enabled ? "text-emerald-700" : "text-foreground"}`}
            >
              {schedule.enabled ? "매일 작업 작동 중" : "매일 작업 꺼짐"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {schedule.enabled
                ? `매일 ${schedule.time}에 아래 관심조건 목록을 순서대로 자동 수집·조회합니다.`
                : "켜두면 지정한 시간에 서버가 관심조건 목록을 순서대로 자동 수집·조회합니다. 지금은 자동으로 실행되지 않습니다."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => updateSchedule({ enabled: !schedule.enabled })}
          role="switch"
          aria-checked={schedule.enabled}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            schedule.enabled ? "bg-emerald-500" : "bg-secondary border border-border"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              schedule.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        토글을 바꾼 뒤 아래 &quot;설정 저장&quot;을 눌러야 반영됩니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">실행 시간</span>
          <input
            type="time"
            value={schedule.time}
            onChange={(e) => updateSchedule({ time: e.target.value })}
            disabled={!schedule.enabled}
            className="w-full px-3 py-2 border border-border rounded-sm disabled:opacity-50"
          />
        </label>

        <label className="flex items-center gap-2 text-sm mt-6">
          <input
            type="checkbox"
            checked={schedule.repeatDaily}
            onChange={(e) => updateSchedule({ repeatDaily: e.target.checked })}
            disabled={!schedule.enabled}
            className="accent-primary disabled:opacity-50"
          />
          매일 반복
          {!schedule.repeatDaily && (
            <span className="text-muted-foreground text-xs">
              (지정 시간에 1회만 실행 후 예약 해제)
            </span>
          )}
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">관심조건 목록 (순서대로 실행)</p>
        </div>

        <div className="border border-border rounded-sm bg-card">
          {presets.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              추가된 관심조건이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {presets.map((id, index) => (
                <li
                  key={`${id}-${index}`}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm"
                >
                  <span className="w-6 text-center text-muted-foreground font-mono text-xs">
                    {index + 1}
                  </span>
                  <span
                    className={`flex-1 ${
                      id === TODAY_BID_DATE_PRESET_ID ? "text-primary font-semibold" : ""
                    }`}
                  >
                    {labelFor(id)}
                  </span>
                  <button
                    type="button"
                    onClick={() => movePreset(index, -1)}
                    disabled={index === 0}
                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="위로"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePreset(index, 1)}
                    disabled={index === presets.length - 1}
                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="아래로"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removePreset(index)}
                    className="p-1 text-destructive hover:text-destructive/70"
                    aria-label="삭제"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <select
              value={addSelection}
              onChange={(e) => setAddSelection(e.target.value)}
              className="w-full appearance-none px-3 py-2 pr-8 text-sm border border-border rounded-sm bg-card"
            >
              <option value="">관심조건 선택...</option>
              {availableToAdd.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={addPreset}
            disabled={!addSelection}
            className="px-4 py-2 text-sm font-semibold border border-border rounded-sm hover:bg-secondary/40 disabled:opacity-50"
          >
            추가
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          작업창에 저장한 관심조건이 목록에 없다면, 먼저 작업창의 검색조건에서
          &quot;현재 조건 저장&quot;으로 이름을 붙여 저장해 주세요.
        </p>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
      >
        {saving ? "저장 중..." : "설정 저장"}
      </button>

      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm font-semibold">매일 작업 실행 로그</p>
          <button
            type="button"
            onClick={refreshLogs}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            새로고침
          </button>
        </div>
        <div className="border border-border rounded-sm h-72 overflow-hidden flex flex-col bg-card">
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto p-3 space-y-1 text-xs font-mono"
          >
            {logs.length === 0 ? (
              <p className="text-muted-foreground">
                아직 매일 작업이 실행된 기록이 없습니다.
              </p>
            ) : (
              logs.map((entry, index) => (
                <div
                  key={`${entry.at}-${index}`}
                  className={
                    entry.level === "error"
                      ? "text-red-600"
                      : entry.level === "warn"
                        ? "text-amber-700"
                        : "text-foreground/80"
                  }
                >
                  <span className="text-muted-foreground">
                    [{formatTime(entry.at)}]
                  </span>{" "}
                  {entry.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
