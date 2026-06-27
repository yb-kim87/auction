"use client";

import { useEffect, useState } from "react";
import {
  fetchCrawlerConfig,
  updateCrawlerConfig,
  type CrawlerAlgorithmConfig,
  type CrawlerScheduleConfig,
} from "@/lib/api";

const REGISTRY_OPTIONS = ["", "가처분", "사단복지법인", "사해행위", "압류"];
const PRESETS = ["현재", "다가구", "빌라", "지방", "공매", "아파트"];

export function CrawlerAlgorithmTab() {
  const [algorithm, setAlgorithm] = useState<CrawlerAlgorithmConfig | null>(null);
  const [schedule, setSchedule] = useState<CrawlerScheduleConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchCrawlerConfig().then((config) => {
      setAlgorithm(config.algorithm);
      setSchedule({
        ...config.schedule,
        repeatDaily: config.schedule.repeatDaily ?? true,
      });
    });
  }, []);

  if (!algorithm || !schedule) {
    return <p className="text-sm text-muted-foreground p-4">불러오는 중...</p>;
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await updateCrawlerConfig({ algorithm, schedule });
      setMessage("알고리즘·예약 설정이 저장되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-bold">알고리즘 (아파트)</h3>
          <p className="text-sm text-muted-foreground mt-1">
            조회 완료 후 조건을 만족하면 텔레그램으로 알림을 보냅니다.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={algorithm.enabled}
            onChange={(e) =>
              setAlgorithm({ ...algorithm, enabled: e.target.checked })
            }
            className="accent-primary"
          />
          알고리즘 활성화
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={algorithm.telegramEnabled}
            onChange={(e) =>
              setAlgorithm({ ...algorithm, telegramEnabled: e.target.checked })
            }
            className="accent-primary"
          />
          텔레그램 알림
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">평형 (㎡ 이상)</span>
            <input
              type="number"
              value={algorithm.minArea}
              onChange={(e) =>
                setAlgorithm({ ...algorithm, minArea: Number(e.target.value) })
              }
              className="w-full px-3 py-2 border border-border rounded-sm"
            />
          </label>

          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">가격갭 (만원 이상)</span>
            <input
              type="number"
              value={algorithm.minGapPriceMan}
              onChange={(e) =>
                setAlgorithm({
                  ...algorithm,
                  minGapPriceMan: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-border rounded-sm"
            />
          </label>

          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">세대수 (이상)</span>
            <input
              type="number"
              value={algorithm.minHouseholds}
              onChange={(e) =>
                setAlgorithm({
                  ...algorithm,
                  minHouseholds: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-border rounded-sm"
            />
          </label>

          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">등기정보 포함</span>
            <select
              value={algorithm.registryKeyword}
              onChange={(e) =>
                setAlgorithm({ ...algorithm, registryKeyword: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            >
              {REGISTRY_OPTIONS.map((item) => (
                <option key={item || "none"} value={item}>
                  {item || "(선택 안함)"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h3 className="text-base font-bold">예약 조회</h3>
          <p className="text-sm text-muted-foreground mt-1">
            지정 시간에 주소 수집(및 조회 반복)을 자동 실행합니다. 브라우저가
            열려 있지 않거나 로그인되지 않은 경우 작업창에 저장된 ID/PW로
            자동 로그인합니다.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={schedule.enabled}
            onChange={(e) =>
              setSchedule({ ...schedule, enabled: e.target.checked })
            }
            className="accent-primary"
          />
          예약 조회 사용
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={schedule.repeatDaily}
            onChange={(e) =>
              setSchedule({ ...schedule, repeatDaily: e.target.checked })
            }
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">실행 시간</span>
            <input
              type="time"
              value={schedule.time}
              onChange={(e) => setSchedule({ ...schedule, time: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-sm"
            />
          </label>

          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">프리셋</span>
            <select
              value={schedule.preset}
              onChange={(e) =>
                setSchedule({ ...schedule, preset: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            >
              {PRESETS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={schedule.repeatAfterCollect}
            onChange={(e) =>
              setSchedule({ ...schedule, repeatAfterCollect: e.target.checked })
            }
            className="accent-primary"
          />
          수집 후 자동 조회
        </label>
      </section>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
      >
        {saving ? "저장 중..." : "설정 저장"}
      </button>

      <p className="text-xs text-muted-foreground">
        텔레그램: <code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_CHAT_ID</code> 환경변수 필요
      </p>
    </div>
  );
}
