"use client";

import { useEffect, useState } from "react";
import {
  fetchCrawlerConfig,
  updateCrawlerConfig,
  type CrawlerSearchConfig,
} from "@/lib/api";

const PROPERTY_OPTIONS = [
  "아파트",
  "다가구주택",
  "상가주택",
  "오피스텔",
  "연립주택",
  "다세대주택",
  "도시형생활주택",
  "근린상가",
  "토지",
];

const STATUS_OPTIONS = ["진행물건", "기타", "매각", "유찰"];
const APPRAISAL_OPTIONS = [
  "1억",
  "2억",
  "3억",
  "4억",
  "5억",
  "6억",
  "7억",
  "8억",
  "10억",
  "15억",
  "20억",
  "30억",
  "50억",
];
const PAGE_SIZE_OPTIONS = ["20", "50", "100", "200"];
const SPECIAL_EXCLUDE = [
  "위반건축물",
  "법정지상권",
  "선순위임차",
  "대지권미등기",
];

export function CrawlerSearchTab() {
  const [search, setSearch] = useState<CrawlerSearchConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchCrawlerConfig()
      .then((config) => setSearch(config.search))
      .catch(() => setMessage("설정을 불러오지 못했습니다."));
  }, []);

  if (!search) {
    return <p className="text-sm text-muted-foreground p-4">불러오는 중...</p>;
  }

  function toggleProperty(type: string) {
    setSearch((prev) => {
      if (!prev) return prev;
      const exists = prev.propertyTypes.includes(type);
      return {
        ...prev,
        propertyTypes: exists
          ? prev.propertyTypes.filter((item) => item !== type)
          : [...prev.propertyTypes, type],
      };
    });
  }

  function toggleExclude(type: string) {
    setSearch((prev) => {
      if (!prev) return prev;
      const exists = prev.excludeSpecialConditions.includes(type);
      return {
        ...prev,
        excludeSpecialConditions: exists
          ? prev.excludeSpecialConditions.filter((item) => item !== type)
          : [...prev.excludeSpecialConditions, type],
      };
    });
  }

  async function handleSave() {
    if (!search) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateCrawlerConfig({ search });
      setMessage("검색 조건이 저장되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div>
        <h3 className="text-base font-bold">검색조건</h3>
        <p className="text-sm text-muted-foreground mt-1">
          프리셋 수집 시 아래 조건이 적용됩니다. &apos;현재&apos; 프리셋은 브라우저 화면 그대로 수집합니다.
        </p>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">물건 구분</span>
          <select
            value={search.listType}
            onChange={(e) =>
              setSearch({
                ...search,
                listType: e.target.value as CrawlerSearchConfig["listType"],
              })
            }
            className="w-full px-3 py-2 border border-border rounded-sm bg-card"
          >
            <option value="auction">경매</option>
            <option value="public">공매</option>
          </select>
        </label>

        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">진행상태</span>
          <select
            value={search.status}
            onChange={(e) => setSearch({ ...search, status: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-sm bg-card"
          >
            {STATUS_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">감정가 (시작)</span>
          <select
            value={search.appraisalMin}
            onChange={(e) =>
              setSearch({ ...search, appraisalMin: e.target.value })
            }
            className="w-full px-3 py-2 border border-border rounded-sm bg-card"
          >
            {APPRAISAL_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">감정가 (끝)</span>
          <select
            value={search.appraisalMax}
            onChange={(e) =>
              setSearch({ ...search, appraisalMax: e.target.value })
            }
            className="w-full px-3 py-2 border border-border rounded-sm bg-card"
          >
            {APPRAISAL_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">보존등기 (년)</span>
          <input
            value={search.preserveRegistryFrom}
            onChange={(e) =>
              setSearch({ ...search, preserveRegistryFrom: e.target.value })
            }
            className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            placeholder="2012"
          />
        </label>

        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">목록 수</span>
          <select
            value={search.pageSize}
            onChange={(e) => setSearch({ ...search, pageSize: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-sm bg-card"
          >
            {PAGE_SIZE_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2">물건종류</p>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_OPTIONS.map((type) => (
            <label
              key={type}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-border rounded-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={search.propertyTypes.includes(type)}
                onChange={() => toggleProperty(type)}
                className="accent-primary"
              />
              {type}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2">특수조건 (선택제외)</p>
        <div className="flex flex-wrap gap-2">
          {SPECIAL_EXCLUDE.map((type) => (
            <label
              key={type}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-border rounded-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={search.excludeSpecialConditions.includes(type)}
                onChange={() => toggleExclude(type)}
                className="accent-primary"
              />
              {type}
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
      >
        {saving ? "저장 중..." : "검색조건 저장"}
      </button>
    </div>
  );
}
