"use client";

import { useEffect, useState } from "react";
import {
  countSearchResultsV3,
  crawlerCollectUrls,
  fetchCrawlerConfig,
  fetchSavedSearches,
  fetchTankFavoriteSearches,
  saveSavedSearch,
  deleteSavedSearch,
  type CrawlerSearchConfig,
  type CrawlerVersion,
  type SavedSearchPreset,
  type TankFavoriteSearch,
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
  "",
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

// 아래 select 옵션들은 탱크옥션 ca/caList.php 검색 폼(#minbAmtBgn,
// #minbPctBgn, #totFlrBgn, #fbCntBgn, #num1_Top1, #auctType, #dpslDvsn)의
// option 값을 그대로 실측(2026-07-17)한 것이다. 값이 바뀌면 여기도 함께
// 갱신할 것 — presets_httpx.py 의 동일 목적 상수와 짝을 이룬다.
const MIN_PRICE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "- 선택 -" },
  { value: "1000000", label: "1백만" },
  { value: "2000000", label: "2백만" },
  { value: "3000000", label: "3백만" },
  { value: "4000000", label: "4백만" },
  { value: "5000000", label: "5백만" },
  { value: "6000000", label: "6백만" },
  { value: "7000000", label: "7백만" },
  { value: "8000000", label: "8백만" },
  { value: "9000000", label: "9백만" },
  { value: "10000000", label: "1천만" },
  { value: "20000000", label: "2천만" },
  { value: "30000000", label: "3천만" },
  { value: "40000000", label: "4천만" },
  { value: "50000000", label: "5천만" },
  { value: "60000000", label: "6천만" },
  { value: "70000000", label: "7천만" },
  { value: "80000000", label: "8천만" },
  { value: "90000000", label: "9천만" },
  { value: "100000000", label: "1억" },
  { value: "150000000", label: "1억 5천만" },
  { value: "200000000", label: "2억" },
  { value: "250000000", label: "2억 5천만" },
  { value: "300000000", label: "3억" },
  { value: "350000000", label: "3억 5천만" },
  { value: "400000000", label: "4억" },
  { value: "450000000", label: "4억 5천만" },
  { value: "500000000", label: "5억" },
  { value: "600000000", label: "6억" },
  { value: "700000000", label: "7억" },
  { value: "800000000", label: "8억" },
  { value: "900000000", label: "9억" },
  { value: "1000000000", label: "10억" },
  { value: "1100000000", label: "11억" },
  { value: "1200000000", label: "12억" },
  { value: "1300000000", label: "13억" },
  { value: "1400000000", label: "14억" },
  { value: "1500000000", label: "15억" },
  { value: "1600000000", label: "16억" },
  { value: "1700000000", label: "17억" },
  { value: "1800000000", label: "18억" },
  { value: "1900000000", label: "19억" },
  { value: "2000000000", label: "20억" },
  { value: "3000000000", label: "30억" },
  { value: "4000000000", label: "40억" },
  { value: "5000000000", label: "50억" },
  { value: "6000000000", label: "60억" },
  { value: "7000000000", label: "70억" },
  { value: "8000000000", label: "80억" },
  { value: "9000000000", label: "90억" },
  { value: "10000000000", label: "100억" },
  { value: "20000000000", label: "200억" },
  { value: "30000000000", label: "300억" },
  { value: "40000000000", label: "400억" },
  { value: "50000000000", label: "500억" },
  { value: "60000000000", label: "600억" },
  { value: "70000000000", label: "700억" },
  { value: "80000000000", label: "800억" },
  { value: "90000000000", label: "900억" },
  { value: "100000000000", label: "1000억" },
];

const MIN_PRICE_PCT_BGN_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "-선택-" },
  { value: "0.1", label: "10" },
  { value: "0.2", label: "20" },
  { value: "0.3", label: "30" },
  { value: "0.4", label: "40" },
  { value: "0.5", label: "50" },
  { value: "0.6", label: "60" },
  { value: "0.7", label: "70" },
  { value: "0.8", label: "80" },
  { value: "0.9", label: "90" },
  { value: "1", label: "100" },
];

const TOTAL_FLOOR_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "-선택-" },
  ...["3", "4", "5", "6", "7", "8", "9", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55", "60", "65", "70", "75", "80", "85", "90", "95", "100"].map(
    (v) => ({ value: v, label: v }),
  ),
];

const FAIL_COUNT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "-선택-" },
  ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((v) => ({
    value: v,
    label: v,
  })),
];

const CASE_YEAR_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  ...Array.from({ length: 2026 - 2005 + 1 }, (_, i) => 2026 - i).map((y) => ({
    value: String(y),
    label: String(y),
  })),
];

const AUCTION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "-선택-" },
  { value: "1", label: "임의경매" },
  { value: "2", label: "강제경매" },
];

const SALE_DIVISION_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "-선택-" },
  { value: "10", label: "토지·건물 일괄매각" },
  { value: "11", label: "토지 매각" },
  { value: "12", label: "토지지분매각" },
  { value: "13", label: "토지만 매각" },
  { value: "14", label: "토지만 매각(제시외기타제외)" },
  { value: "15", label: "토지및건물 지분 매각" },
  { value: "16", label: "토지만 매각이며,지분 매각임" },
  { value: "17", label: "건물만 매각" },
  { value: "18", label: "건물전부, 토지지분" },
  { value: "19", label: "토지 매각(제시외기타 포함)" },
  { value: "20", label: "토지만매각,지분매각(건물X)" },
  { value: "21", label: "토지지분매각(제시외기타 포함)" },
  { value: "22", label: "건물만 매각이며,지분 매각임" },
  { value: "23", label: "토지전부, 건물지분" },
  { value: "24", label: "전세권만 매각" },
  { value: "25", label: "지상권만 매각" },
  { value: "26", label: "기타" },
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

// "이상 ~ 이하" 한 줄 구간 선택 — 관리자 화면 검색조건(search/page.tsx의
// PriceRangeSelect)과 동일한 레이아웃. 시작/끝 select 두 개를 라벨 하나
// 아래 한 줄에 배치한다.
function RangeSelectRow({
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  options,
  hint,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <div className="text-sm space-y-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <select
          value={minValue}
          onChange={(e) => onMinChange(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-sm bg-card"
        >
          {options.map((item) => (
            <option key={item.value || "none"} value={item.value}>
              {item.value === "" ? "이상" : item.label}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground shrink-0 select-none">~</span>
        <select
          value={maxValue}
          onChange={(e) => onMaxChange(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-sm bg-card"
        >
          {options.map((item) => (
            <option key={item.value || "none"} value={item.value}>
              {item.value === "" ? "이하" : item.label}
            </option>
          ))}
        </select>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// 숫자 자유 입력용 "이상 ~ 이하" — 대지면적/건물면적처럼 목록이 아니라
// 임의 숫자를 받는 필드에 사용.
function RangeInputRow({
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
}) {
  return (
    <div className="text-sm space-y-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          value={minValue}
          onChange={(e) => onMinChange(e.target.value)}
          placeholder="이상"
          className="w-full px-3 py-2 border border-border rounded-sm bg-card"
        />
        <span className="text-muted-foreground shrink-0 select-none">~</span>
        <input
          value={maxValue}
          onChange={(e) => onMaxChange(e.target.value)}
          placeholder="이하"
          className="w-full px-3 py-2 border border-border rounded-sm bg-card"
        />
      </div>
    </div>
  );
}

type CollectResult = {
  urls: unknown[];
  message?: string;
  rawCount?: number;
  excluded?: number;
  deduped?: number;
  naverRefresh?: number;
};

// 즐겨찾기/관심조건을 적용할 때 기준이 되는 "조건 없음" 템플릿. 화면에
// 현재 표시 중인 검색조건(관리자 기본값이 채워져 있을 수 있음)과 병합
// 하면, 즐겨찾기 원본에 없던 필드(감정가 범위, 보존등기 연도, 특수조건
// 제외 등)에 관리자 기본값이 그대로 남아 의도치 않게 조건이 좁아진다
// (실측: 32건→1건, 2026-07-17). 즐겨찾기를 적용할 때는 항상 이 빈
// 템플릿을 기준으로 덮어써야 한다.
const EMPTY_SEARCH: CrawlerSearchConfig = {
  listType: "auction",
  propertyTypes: [],
  status: "",
  appraisalMin: "",
  appraisalMax: "",
  preserveRegistryFrom: "",
  excludeSpecialConditions: [],
  pageSize: "100",
};

export function CrawlerSearchPanel({
  crawlerVersion,
  disabled,
  tankLoginChecked,
  onCollectStart,
  onCollected,
  onCollectFinished,
}: {
  crawlerVersion?: CrawlerVersion;
  disabled?: boolean;
  /** v3(로컬 워커) 모드에서 탱크옥션 로그인 확인이 끝났는지 — 끝나야
   * 탱크옥션 "즐겨쓰는 검색" 목록을 불러올 수 있다. 원격 워커(v1) 모드에서는
   * 이 값과 무관하게 항상 조회 가능(별도 로그인 절차가 있으므로). */
  tankLoginChecked?: boolean;
  /** 주소 추가 요청을 보내는 시점(응답 전)에 호출 — 로그인 확인·목록
   * 조회에 시간이 걸리는 동안 부모가 실행 로그 폴링을 앞당겨 시작하도록
   * 알리는 용도. 이게 없으면 버튼을 누른 뒤 응답이 올 때까지 화면에
   * 아무 변화가 없어 멈춘 것처럼 보인다. */
  onCollectStart?: () => void;
  onCollected?: (result: CollectResult) => void;
  /** 성공/실패와 무관하게 요청이 끝나면 항상 호출 — onCollectStart로 켠
   * "수집 중" 표시를 꺼뜨리는 용도(실패 시에는 onCollected가 호출되지
   * 않으므로 이게 없으면 상태가 계속 켜진 채로 남는다). */
  onCollectFinished?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [search, setSearch] = useState<CrawlerSearchConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearchPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [tankFavorites, setTankFavorites] = useState<TankFavoriteSearch[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [checkingCount, setCheckingCount] = useState(false);

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

  async function loadTankFavorites() {
    setLoadingFavorites(true);
    setMessage(null);
    try {
      const result = await fetchTankFavoriteSearches();
      setTankFavorites(result.items);
      setFavoritesLoaded(true);
      if (result.items.length === 0) {
        setMessage("탱크옥션에 등록된 즐겨쓰는 검색이 없습니다.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "즐겨쓰는 검색 조회 실패");
    } finally {
      setLoadingFavorites(false);
    }
  }

  // 탱크옥션에서 즐겨찾기 이름을 지을 때 특수문자 입력 제약 때문에 ","를
  // "콤마", "~"를 "물결표"라는 한글 텍스트로 직접 타이핑해 저장한 경우가
  // 있어(원본 응답 자체에 이 단어들이 그대로 들어있음, 인코딩 문제 아님),
  // 우리 화면에서 보여줄 때만 원래 기호로 치환한다. 저장된 원본 데이터는
  // 건드리지 않는다.
  function formatFavoriteTitle(title: string): string {
    return title.replace(/콤마/g, ",").replace(/물결표/g, "~");
  }

  // 관심조건/즐겨찾기를 선택한 직후 "지금 이 조건으로 조회하면 몇 건
  // 나오는지" 미리 보여준다(탱크옥션 즐겨찾기 항목의 저장 당시 건수는
  // 이후 물건 변동으로 달라져 있을 수 있어 그대로 믿을 수 없으므로,
  // dataSize=1로 최소 조회해 현재 시점 totalCount 를 다시 구한다).
  async function showResultCount(nextSearch: CrawlerSearchConfig, label: string) {
    if (crawlerVersion !== "v3") {
      setMessage(label);
      return;
    }
    setCheckingCount(true);
    try {
      const { total } = await countSearchResultsV3(nextSearch);
      setMessage(`${label} — 현재 조건으로 ${total}건이 검색됩니다.`);
    } catch (err) {
      setMessage(
        `${label} (건수 확인 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"})`,
      );
    } finally {
      setCheckingCount(false);
    }
  }

  function applyTankFavorite(favorite: TankFavoriteSearch) {
    const displayTitle = formatFavoriteTitle(favorite.title);
    setActivePresetId(null);
    setPresetName(displayTitle);
    // 화면에 남아있던 이전 검색조건(관리자 기본값 포함)과 병합하지 않고,
    // "조건 없음" 템플릿 위에 즐겨찾기 값만 덮어쓴다.
    const next = { ...EMPTY_SEARCH, ...favorite.search };
    setSearch(next);
    void showResultCount(next, `탱크옥션 즐겨찾기 "${displayTitle}" 조건을 불러왔습니다.`);
  }

  function applyPreset(preset: SavedSearchPreset) {
    setActivePresetId(preset.id);
    setPresetName(preset.name);
    setSearch(preset.search);
    void showResultCount(preset.search, `"${preset.name}" 조건을 불러왔습니다.`);
  }

  function handleNewPreset() {
    setActivePresetId(null);
    setPresetName("");
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

  // "검색조건 저장"이었던 버튼이 이제 "주소 추가" 역할을 겸한다: 이름을
  // 입력했으면 관심조건으로 저장(신규 또는 덮어쓰기)하고, 곧바로 그
  // 조건으로 주소 수집을 실행한다. 이름이 비어 있으면 저장 없이 현재
  // 조건 그대로 1회성 수집만 수행한다.
  async function handleAddUrls() {
    if (!search) return;
    setCollecting(true);
    setSavingPreset(true);
    setMessage(null);
    try {
      let presetLabel = activePresetId ? presetName.trim() : "";
      const name = presetName.trim();
      if (name) {
        const saved = await saveSavedSearch({
          id: activePresetId ?? undefined,
          name,
          search,
        });
        setActivePresetId(saved.id);
        presetLabel = saved.name;
        refreshSavedSearches();
      }

      onCollectStart?.();
      const result = await crawlerCollectUrls(presetLabel || "직접 설정", {
        clear: true,
        search,
        crawlerVersion,
      });

      const raw = result.rawCount ?? result.urls.length;
      const parts: string[] = [];
      if (raw > 0) parts.push(`탱크 ${raw}건 수집`);
      parts.push(`작업목록 ${result.urls.length}건`);
      if (result.excluded) parts.push(`DB중복·입찰기일 미도래 ${result.excluded}건 제외`);
      if (result.deduped) parts.push(`목록 중복 ${result.deduped}건 제외`);
      if (result.naverRefresh) parts.push(`네이버 미수집 ${result.naverRefresh}건 포함`);
      setMessage(
        result.urls.length === 0
          ? `${parts.join(" · ")} — 추가된 URL 없음`
          : parts.join(" · "),
      );
      onCollected?.(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "주소 추가 실패");
    } finally {
      setCollecting(false);
      setSavingPreset(false);
      onCollectFinished?.();
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

  return (
    <div className="border border-border rounded-sm bg-card">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <h3 className="text-sm font-bold">검색조건</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            관심조건을 선택하거나 직접 설정한 뒤 주소 추가를 누르세요.
          </p>
        </div>
        <span className="text-muted-foreground text-sm">
          {expanded ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </button>

      {expanded && search && (
        <div className="border-t border-border p-4 space-y-5">
          {(message || checkingCount) && (
            <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
              {checkingCount ? "조건에 맞는 건수를 확인하는 중..." : message}
            </div>
          )}

          <div className="space-y-3">
            <p className="text-sm font-semibold">관심조건</p>
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
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="조건 이름 (예: 강남 아파트) — 비우면 저장 없이 1회성 조회"
                className="px-3 py-1.5 text-sm border border-border rounded-sm bg-card flex-1 min-w-[220px]"
              />
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

          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">탱크옥션 즐겨쓰는 검색</p>
              <button
                type="button"
                onClick={loadTankFavorites}
                disabled={loadingFavorites || (crawlerVersion === "v3" && !tankLoginChecked)}
                className="px-3 py-1.5 text-xs rounded-sm border border-border disabled:opacity-50"
              >
                {loadingFavorites
                  ? "불러오는 중..."
                  : favoritesLoaded
                    ? "새로고침"
                    : "불러오기"}
              </button>
            </div>
            {crawlerVersion === "v3" && !tankLoginChecked ? (
              <p className="text-xs text-muted-foreground">
                상단에서 탱크옥션 로그인을 먼저 확인해야 불러올 수 있습니다.
              </p>
            ) : favoritesLoaded && tankFavorites.length > 0 ? (
              <select
                defaultValue=""
                onChange={(e) => {
                  const favorite = tankFavorites.find((f) => f.id === e.target.value);
                  if (favorite) applyTankFavorite(favorite);
                  e.target.value = "";
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-sm bg-card"
              >
                <option value="" disabled>
                  탱크옥션 즐겨찾기에서 선택...
                </option>
                {tankFavorites.map((favorite) => (
                  <option key={favorite.id} value={favorite.id}>
                    {formatFavoriteTitle(favorite.title)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">
                탱크옥션 검색 페이지에서 등록한 즐겨쓰는 검색을 불러와 바로 적용할 수 있습니다.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-semibold">검색조건</p>
            <p className="text-xs text-muted-foreground">
              비워두면 조건 없이 검색합니다. 값을 입력하거나 선택한 항목만 검색에 반영됩니다.
            </p>
          </div>

          <label className="text-sm space-y-1 block max-w-lg">
            <span className="text-muted-foreground">사건번호</span>
            <div className="flex items-center gap-2">
              <select
                value={search.caseYear ?? ""}
                onChange={(e) => setSearch({ ...search, caseYear: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-sm bg-card"
              >
                {CASE_YEAR_OPTIONS.map((item) => (
                  <option key={item.value || "all"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground shrink-0 select-none">타경</span>
              <input
                value={search.caseSerial ?? ""}
                onChange={(e) => setSearch({ ...search, caseSerial: e.target.value })}
                placeholder="일련번호"
                className="w-full px-3 py-2 border border-border rounded-sm bg-card"
              />
              <span className="text-muted-foreground shrink-0 select-none">물건번호</span>
              <input
                value={search.itemNumber ?? ""}
                onChange={(e) => setSearch({ ...search, itemNumber: e.target.value })}
                placeholder="1"
                className="w-16 shrink-0 px-3 py-2 border border-border rounded-sm bg-card"
              />
            </div>
          </label>

          <div className="text-sm space-y-1">
            <span className="text-muted-foreground">시/도 · 시/군/구·읍/면/동·상세주소</span>
            <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-2">
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
              <input
                value={search.addressKeyword ?? ""}
                onChange={(e) => setSearch({ ...search, addressKeyword: e.target.value })}
                placeholder="예: 강남구, 래미안 (시/군/구 이하는 코드 대신 자유 텍스트로 필터링)"
                className="w-full px-3 py-2 border border-border rounded-sm bg-card"
              />
            </div>
          </div>

          <div className="text-sm space-y-1 max-w-md">
            <span className="text-muted-foreground">매각기일</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={search.bidDateFrom ?? ""}
                onChange={(e) => setSearch({ ...search, bidDateFrom: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-sm bg-card"
              />
              <span className="text-muted-foreground shrink-0 select-none">~</span>
              <input
                type="date"
                value={search.bidDateTo ?? ""}
                onChange={(e) => setSearch({ ...search, bidDateTo: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-sm bg-card"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <RangeSelectRow
              label="감정가"
              minValue={search.appraisalMin}
              maxValue={search.appraisalMax}
              onMinChange={(v) => setSearch({ ...search, appraisalMin: v })}
              onMaxChange={(v) => setSearch({ ...search, appraisalMax: v })}
              options={APPRAISAL_OPTIONS.map((v) => ({ value: v, label: v }))}
            />

            <RangeSelectRow
              label="최저가"
              minValue={search.minPriceMin ?? ""}
              maxValue={search.minPriceMax ?? ""}
              onMinChange={(v) => setSearch({ ...search, minPriceMin: v })}
              onMaxChange={(v) => setSearch({ ...search, minPriceMax: v })}
              options={MIN_PRICE_OPTIONS}
            />

            <div className="grid grid-cols-2 gap-2">
              <RangeSelectRow
                label="최저가율(%)"
                minValue={search.minPricePctMin ?? ""}
                maxValue={search.minPricePctMax ?? ""}
                onMinChange={(v) => setSearch({ ...search, minPricePctMin: v })}
                onMaxChange={(v) => setSearch({ ...search, minPricePctMax: v })}
                options={MIN_PRICE_PCT_BGN_OPTIONS}
              />
            </div>

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

            <RangeInputRow
              label="대지면적(㎡)"
              minValue={search.landAreaMin ?? ""}
              maxValue={search.landAreaMax ?? ""}
              onMinChange={(v) => setSearch({ ...search, landAreaMin: v })}
              onMaxChange={(v) => setSearch({ ...search, landAreaMax: v })}
            />

            <RangeInputRow
              label="건물면적(㎡)"
              minValue={search.buildingAreaMin ?? ""}
              maxValue={search.buildingAreaMax ?? ""}
              onMinChange={(v) => setSearch({ ...search, buildingAreaMin: v })}
              onMaxChange={(v) => setSearch({ ...search, buildingAreaMax: v })}
            />

            <RangeSelectRow
              label="총 층수"
              minValue={search.totalFloorMin ?? ""}
              maxValue={search.totalFloorMax ?? ""}
              onMinChange={(v) => setSearch({ ...search, totalFloorMin: v })}
              onMaxChange={(v) => setSearch({ ...search, totalFloorMax: v })}
              options={TOTAL_FLOOR_OPTIONS}
            />

            <RangeSelectRow
              label="유찰횟수"
              minValue={search.failCountMin ?? ""}
              maxValue={search.failCountMax ?? ""}
              onMinChange={(v) => setSearch({ ...search, failCountMin: v })}
              onMaxChange={(v) => setSearch({ ...search, failCountMax: v })}
              options={FAIL_COUNT_OPTIONS}
            />

            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">경매구분</span>
              <select
                value={search.auctionType ?? ""}
                onChange={(e) => setSearch({ ...search, auctionType: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-sm bg-card"
              >
                {AUCTION_TYPE_OPTIONS.map((item) => (
                  <option key={item.value || "none"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">매각구분</span>
              <select
                value={search.saleDivision ?? ""}
                onChange={(e) => setSearch({ ...search, saleDivision: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-sm bg-card"
              >
                {SALE_DIVISION_OPTIONS.map((item) => (
                  <option key={item.value || "none"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="text-sm space-y-1 block max-w-xs">
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
            onClick={handleAddUrls}
            disabled={collecting || savingPreset || disabled}
            className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            {collecting ? "수집 중..." : "주소 추가"}
          </button>
        </div>
      )}
    </div>
  );
}
