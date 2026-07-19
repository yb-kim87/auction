"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import {
  fetchCrawlerConfig,
  fetchSavedSearches,
  updateCrawlerConfig,
  TODAY_BID_DATE_PRESET_ID,
  TODAY_BID_DATE_PRESET_LABEL,
  type CrawlerScheduleConfig,
  type SavedSearchPreset,
} from "@/lib/api";

export function CrawlerDailyJobTab() {
  const [schedule, setSchedule] = useState<CrawlerScheduleConfig | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearchPreset[]>([]);
  const [addSelection, setAddSelection] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, []);

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

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={schedule.enabled}
          onChange={(e) => updateSchedule({ enabled: e.target.checked })}
          className="accent-primary"
        />
        <span className="font-semibold">매일 작업 사용</span>
      </label>

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
    </div>
  );
}
