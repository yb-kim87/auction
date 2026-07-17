"use client";

import { useEffect, useState } from "react";
import {
  fetchCrawlerConfig,
  updateCrawlerConfig,
  fetchSavedSearches,
  saveSavedSearch,
  deleteSavedSearch,
  type CrawlerSearchConfig,
  type SavedSearchPreset,
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

// 탱크옥션 ca/caList.php 검색 폼의 #siCd select 옵션을 그대로 실측(2026-07-17).
const REGION_SI_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "11", label: "서울" },
  { value: "26", label: "부산" },
  { value: "27", label: "대구" },
  { value: "28", label: "인천" },
  { value: "12", label: "광주" },
  { value: "30", label: "대전" },
  { value: "31", label: "울산" },
  { value: "36", label: "세종" },
  { value: "41", label: "경기" },
  { value: "51", label: "강원" },
  { value: "43", label: "충북" },
  { value: "44", label: "충남" },
  { value: "52", label: "전북" },
  { value: "47", label: "경북" },
  { value: "48", label: "경남" },
  { value: "50", label: "제주" },
];

export function CrawlerSearchTab() {
  const [search, setSearch] = useState<CrawlerSearchConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearchPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  useEffect(() => {
    fetchCrawlerConfig()
      .then((config) => setSearch(config.search))
      .catch(() => setMessage("설정을 불러오지 못했습니다."));
    refreshSavedSearches();
  }, []);

  function refreshSavedSearches() {
    fetchSavedSearches()
      .then(setSavedSearches)
      .catch(() => {});
  }

  function applyPreset(preset: SavedSearchPreset) {
    setSearch(preset.search);
    setActivePresetId(preset.id);
    setPresetName(preset.name);
    setMessage(`"${preset.name}" 조건을 불러왔습니다.`);
  }

  async function handleSavePreset() {
    if (!search) return;
    const name = presetName.trim();
    if (!name) {
      setMessage("저장할 이름을 입력해 주세요.");
      return;
    }
    setSavingPreset(true);
    setMessage(null);
    try {
      const saved = await saveSavedSearch({
        id: activePresetId ?? undefined,
        name,
        search,
      });
      setActivePresetId(saved.id);
      setMessage(`"${saved.name}" 조건이 저장되었습니다.`);
      refreshSavedSearches();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSavingPreset(false);
    }
  }

  async function handleDeletePreset(id: string) {
    try {
      await deleteSavedSearch(id);
      if (activePresetId === id) {
        setActivePresetId(null);
        setPresetName("");
      }
      refreshSavedSearches();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  function handleNewPreset() {
    setActivePresetId(null);
    setPresetName("");
  }

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

      <div className="border border-border rounded-sm p-4 space-y-3 bg-secondary/10">
        <p className="text-sm font-semibold">관심조건 (즐겨찾기)</p>
        {savedSearches.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {savedSearches.map((preset) => (
              <div
                key={preset.id}
                className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs border rounded-sm ${
                  activePresetId === preset.id
                    ? "border-primary bg-primary/10"
                    : "border-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="font-medium"
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePreset(preset.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`${preset.name} 삭제`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            저장된 관심조건이 없습니다. 아래에서 조건을 설정한 뒤 이름을 붙여 저장하세요.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="조건 이름 (예: 강남 아파트)"
            className="px-3 py-1.5 text-sm border border-border rounded-sm bg-card flex-1 min-w-[160px]"
          />
          <button
            type="button"
            onClick={handleSavePreset}
            disabled={savingPreset}
            className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            {savingPreset
              ? "저장 중..."
              : activePresetId
                ? "현재 조건으로 덮어쓰기"
                : "새 조건으로 저장"}
          </button>
          {activePresetId && (
            <button
              type="button"
              onClick={handleNewPreset}
              className="px-3 py-1.5 text-xs rounded-sm border border-border"
            >
              새로 만들기
            </button>
          )}
        </div>
      </div>

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

      <div className="border-t border-border pt-4">
        <p className="text-sm font-semibold mb-2">상세 검색조건 (선택)</p>
        <p className="text-xs text-muted-foreground mb-3">
          비워두면 조건 없이 검색합니다. 값을 입력한 항목만 검색에 반영됩니다.
          시/군/구·읍/면/동은 코드 선택 대신 검색어(자유 텍스트)로 필터링합니다.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">사건번호 연도</span>
            <input
              value={search.caseYear ?? ""}
              onChange={(e) => setSearch({ ...search, caseYear: e.target.value })}
              placeholder="예: 2024"
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">사건번호 일련번호</span>
            <input
              value={search.caseSerial ?? ""}
              onChange={(e) => setSearch({ ...search, caseSerial: e.target.value })}
              placeholder="예: 12345"
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">물건번호</span>
            <input
              value={search.itemNumber ?? ""}
              onChange={(e) => setSearch({ ...search, itemNumber: e.target.value })}
              placeholder="예: 1"
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">시/도</span>
            <select
              value={search.regionSiCd ?? ""}
              onChange={(e) => setSearch({ ...search, regionSiCd: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            >
              {REGION_SI_OPTIONS.map((item) => (
                <option key={item.value || "all"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1 md:col-span-2">
            <span className="text-muted-foreground text-xs">
              시/군/구·읍/면/동·상세주소 검색어
            </span>
            <input
              value={search.addressKeyword ?? ""}
              onChange={(e) => setSearch({ ...search, addressKeyword: e.target.value })}
              placeholder="예: 강남구, 래미안"
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">최저가(원) 시작</span>
            <input
              value={search.minPriceMin ?? ""}
              onChange={(e) => setSearch({ ...search, minPriceMin: e.target.value })}
              placeholder="예: 100000000"
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">최저가(원) 끝</span>
            <input
              value={search.minPriceMax ?? ""}
              onChange={(e) => setSearch({ ...search, minPriceMax: e.target.value })}
              placeholder="예: 500000000"
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">최저가율(%) 시작</span>
            <input
              value={
                search.minPricePctMin
                  ? String(Number(search.minPricePctMin) * 100)
                  : ""
              }
              onChange={(e) => {
                const pct = e.target.value.trim();
                setSearch({
                  ...search,
                  minPricePctMin: pct ? String(Number(pct) / 100) : "",
                });
              }}
              placeholder="예: 50"
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">최저가율(%) 끝</span>
            <input
              value={
                search.minPricePctMax
                  ? String(Number(search.minPricePctMax) * 100)
                  : ""
              }
              onChange={(e) => {
                const pct = e.target.value.trim();
                setSearch({
                  ...search,
                  minPricePctMax: pct ? String(Number(pct) / 100) : "",
                });
              }}
              placeholder="예: 100"
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">대지면적(㎡) 시작</span>
            <input
              value={search.landAreaMin ?? ""}
              onChange={(e) => setSearch({ ...search, landAreaMin: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">대지면적(㎡) 끝</span>
            <input
              value={search.landAreaMax ?? ""}
              onChange={(e) => setSearch({ ...search, landAreaMax: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">건물면적(㎡) 시작</span>
            <input
              value={search.buildingAreaMin ?? ""}
              onChange={(e) => setSearch({ ...search, buildingAreaMin: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">건물면적(㎡) 끝</span>
            <input
              value={search.buildingAreaMax ?? ""}
              onChange={(e) => setSearch({ ...search, buildingAreaMax: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">총 층수 시작</span>
            <input
              value={search.totalFloorMin ?? ""}
              onChange={(e) => setSearch({ ...search, totalFloorMin: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">총 층수 끝</span>
            <input
              value={search.totalFloorMax ?? ""}
              onChange={(e) => setSearch({ ...search, totalFloorMax: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">유찰횟수 시작</span>
            <input
              value={search.failCountMin ?? ""}
              onChange={(e) => setSearch({ ...search, failCountMin: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">유찰횟수 끝</span>
            <input
              value={search.failCountMax ?? ""}
              onChange={(e) => setSearch({ ...search, failCountMax: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">매각기일 시작일</span>
            <input
              type="date"
              value={search.bidDateFrom ?? ""}
              onChange={(e) => setSearch({ ...search, bidDateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground text-xs">매각기일 종료일</span>
            <input
              type="date"
              value={search.bidDateTo ?? ""}
              onChange={(e) => setSearch({ ...search, bidDateTo: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-sm bg-card"
            />
          </label>
        </div>
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
