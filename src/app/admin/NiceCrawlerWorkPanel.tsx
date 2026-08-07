"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_NICE_SEARCH_CONFIG,
  deleteNiceSavedSearch,
  fetchNiceCrawlerLogs,
  fetchNiceCrawlerResaleRunSummary,
  fetchNiceCrawlerStatus,
  fetchNiceSavedSearches,
  fetchTankFavoriteSearches,
  niceCrawlerClearLogs,
  niceCrawlerCollect,
  niceCrawlerManageUrls,
  niceCrawlerStart,
  niceCrawlerStop,
  parseNiceCrawlerUrls,
  saveNiceSavedSearch,
  type CrawlerSearchConfig,
  type NiceCrawlerLogEntry,
  type NiceCrawlerResaleRunSummary,
  type NiceCrawlerStatus,
  type NiceCrawlerUrlEntry,
  type NiceSavedSearch,
  type NiceSearchConfig,
  type TankFavoriteSearch,
} from "@/lib/api";
import {
  NICE_PROGSTATUS_OPTIONS,
  NICE_SPECIALOBJCD_GROUPS,
  NICE_YONGDO_OPTIONS,
} from "@/lib/nice-crawler-codes";

/** 나이스옥션 작업창 — 탱크옥션 작업창(CrawlerWorkPanel.tsx)과 완전히
 * 독립된 병렬 시스템(사용자 요청, 2026-08-07). 검색조건 UI뿐 아니라
 * 작업목록(URL) 스테이징 + 매도분석 연동까지 탱크와 동일한 흐름으로
 * 맞춘다(사용자 요청, 2026-08-07: "1 2번도 일단 붙이고 테스트 해보자") —
 * "주소 추가"(nice_collect.py, 검색만) → 작업목록 다듬기(선택삭제/모두삭제
 * /수동추가) → "조회 시작"(nice_worker.py, 상세조회+저장+매도분석). 다른
 * 점은 오직 실제로 호출하는 대상이 나이스옥션 API라는 것뿐이다.
 *
 * 나이스는 로그인이 필요 없어 "나이스 즐겨찾기" 개념이 없다 — 대신
 * 탱크옥션 즐겨찾기를 불러와 나이스 필터로 변환하는 버튼을 제공한다.
 * 지역코드(법정동코드/pnuCd)는 두 사이트의 체계가 완전히 달라 탱크의
 * 시/도~동 선택 UI를 그대로 재현할 수 없으므로, 같은 자리에 pnuCd 자유
 * 입력 필드를 둔다(정직하게 실측 안 된 부분은 꾸며내지 않음). 탱크옥션
 * 로그인 확인/네이버 ID 수집/워커 재시작은 나이스에 진짜로 대응되는
 * 개념이 없어 넣지 않았다(docs/niceauction-integration-research.md
 * 8차 追記 참고).
 */

const PHASE_LABELS: Record<string, string> = {
  idle: "대기",
  collecting_objids: "물건 목록 수집 중",
  matching: "우리 DB와 대조 중",
  fetching_details: "상세 조회 중",
  stopped: "중단됨",
  error: "오류",
};

const LEVEL_TONE: Record<string, string> = {
  info: "text-foreground",
  warn: "text-amber-600",
  error: "text-destructive",
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", { hour12: false });
  } catch {
    return iso;
  }
}

/** 탱크옥션 즐겨찾기(Partial<CrawlerSearchConfig>) → 나이스 검색조건.
 * 확실히 대응되는 필드만 옮긴다 — 지역코드/특수조건/해당층처럼 나이스에
 * 같은 개념의 파라미터가 없는 건 그대로 둔다(사용자 요청: "동작은 그에
 * 대응하게 나이스에 맞게 동작하도록"). */
function mapTankFavoriteToNiceConfig(
  tank: Partial<CrawlerSearchConfig>,
  base: NiceSearchConfig,
): NiceSearchConfig {
  const next: NiceSearchConfig = { ...base };

  if (tank.propertyTypes?.length) {
    const codes = tank.propertyTypes
      .map((label) => NICE_YONGDO_OPTIONS.find((o) => o.label === label || label.includes(o.label))?.code)
      .filter((c): c is string => !!c);
    if (codes.length) next.yongdoCd = codes;
  }
  if (tank.status) {
    const code = NICE_PROGSTATUS_OPTIONS.find(
      (o) => o.label === tank.status || tank.status === "진행물건",
    )?.code;
    // "진행물건"은 나이스 프리셋 값(9000003,9000004,9000006,9000012,9000011)과
    // 대응 — 단일 코드가 아니라 나이스 기본값을 그대로 쓰는 게 맞다.
    if (tank.status === "진행물건") next.objProgStatusCd = [];
    else if (code) next.objProgStatusCd = [code];
  }
  if (tank.appraisalMin) next.gamjungAmtStart = tank.appraisalMin;
  if (tank.appraisalMax) next.gamjungAmtEnd = tank.appraisalMax;
  if (tank.minPriceMin) next.minAmtStart = tank.minPriceMin;
  if (tank.minPriceMax) next.minAmtEnd = tank.minPriceMax;
  if (tank.minPricePctMin) next.gamjungAmtRateStart = tank.minPricePctMin;
  if (tank.minPricePctMax) next.gamjungAmtRateEnd = tank.minPricePctMax;
  if (tank.landAreaMin) next.tojiAreaStart = tank.landAreaMin;
  if (tank.landAreaMax) next.tojiAreaEnd = tank.landAreaMax;
  if (tank.buildingAreaMin) next.bldgAreaStart = tank.buildingAreaMin;
  if (tank.buildingAreaMax) next.bldgAreaEnd = tank.buildingAreaMax;
  if (tank.failCountMin) next.uchalCntStart = tank.failCountMin;
  if (tank.failCountMax) next.uchalCntEnd = tank.failCountMax;
  if (tank.bidDateFrom) next.dspslDxdyYmdStart = tank.bidDateFrom;
  if (tank.bidDateTo) next.dspslDxdyYmdEnd = tank.bidDateTo;
  if (tank.preserveRegistryFrom) next.initRegYmdStart = tank.preserveRegistryFrom;
  if (tank.preserveRegistryTo) next.initRegYmdEnd = tank.preserveRegistryTo;
  if (tank.caseYear) next.caseYear = tank.caseYear;
  if (tank.caseSerial) next.caseSerial = tank.caseSerial;

  return next;
}

// 탱크 SPECIAL_CONDITION_MODE_OPTIONS와 동일한 3버튼을 시각적으로 두되,
// 나이스에서 실제 확인된 파라미터는 include(1개 이상 포함)/exclude(제외)
// 뿐이다 — "선택 모두 포함"(AND)은 나이스 쿼리 파라미터로 확인되지 않아
// include와 동일하게 동작한다(레이아웃은 탱크와 동일하게 유지).
const SPECIAL_CONDITION_MODE_OPTIONS: { value: "exclude" | "include"; label: string }[] = [
  { value: "exclude", label: "선택 제외" },
  { value: "include", label: "선택 1개 이상 포함" },
];

const CASE_YEAR_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  ...Array.from({ length: 2026 - 2005 + 1 }, (_, i) => 2026 - i).map((y) => ({
    value: String(y),
    label: String(y),
  })),
];

// CrawlerSearchPanel.tsx의 RangeSelectRow/RangeInputRow와 동일한 레이아웃
// (grid-cols-[6.5rem_1fr], label + 두 input을 "~"로 연결). 나이스는 탱크와
// 달리 확정된 select 프리셋 목록이 없는 필드가 대부분이라 전부 자유 입력
// (RangeInputRow) 형태로 통일한다.
function RangeInputRow({
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  unit,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  unit?: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm sm:items-center">
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
        {unit && <span className="text-muted-foreground shrink-0 select-none">{unit}</span>}
      </div>
    </div>
  );
}

export function NiceCrawlerWorkPanel() {
  const [status, setStatus] = useState<NiceCrawlerStatus | null>(null);
  const [logs, setLogs] = useState<NiceCrawlerLogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [expanded, setExpanded] = useState(true);
  const [config, setConfig] = useState<NiceSearchConfig>(DEFAULT_NICE_SEARCH_CONFIG);
  const [savedSearches, setSavedSearches] = useState<NiceSavedSearch[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [tankFavorites, setTankFavorites] = useState<TankFavoriteSearch[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectSummary, setCollectSummary] = useState<string | null>(null);

  // 작업목록 스테이징(탱크의 "주소 추가 → 조회 시작" 2단계) + 매도분석.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [manualObjId, setManualObjId] = useState("");
  const [autoStartAfterCollect, setAutoStartAfterCollect] = useState(false);
  const [resaleAnalysisEnabled, setResaleAnalysisEnabled] = useState(false);
  const [resaleStats, setResaleStats] = useState<NiceCrawlerResaleRunSummary | null>(null);
  const [resaleStatsLoading, setResaleStatsLoading] = useState(false);
  const [resaleStatsError, setResaleStatsError] = useState("");
  const [resaleStillRunning, setResaleStillRunning] = useState(false);
  const pendingResaleSummaryFetchRef = useRef(false);
  const prevFetchingPhaseRef = useRef(false);
  const resalePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const urls = parseNiceCrawlerUrls(status);

  const refresh = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([fetchNiceCrawlerStatus(), fetchNiceCrawlerLogs(200)]);
      setStatus(s);
      setLogs(l);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태를 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    pollRef.current = setInterval(() => void refresh(), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    refreshSavedSearches();
  }, []);

  // "조회 시작"(상세조회) 단계가 끝나는 순간을 감지해 매도분석 결과를
  // 가져온다 — 탱크옥션 CrawlerWorkPanel.tsx의 동일 패턴(사용자 요청,
  // 2026-08-01/2026-08-03: 매도분석 결과는 db 저장 진행 상황이 아니라
  // 분석이 끝난 시점의 최종 값으로만 채운다).
  useEffect(() => {
    const nowFetching = status?.phase === "fetching_details";
    const justFinished = prevFetchingPhaseRef.current && !nowFetching;
    prevFetchingPhaseRef.current = nowFetching;

    if (justFinished && pendingResaleSummaryFetchRef.current) {
      pendingResaleSummaryFetchRef.current = false;
      setResaleStatsLoading(true);
      setResaleStatsError("");
      setResaleStats(null);
      setResaleStillRunning(true);

      const POLL_INTERVAL_MS = 3000;
      const POLL_TIMEOUT_MS = 15 * 60_000;
      const startedAt = Date.now();

      const poll = () => {
        fetchNiceCrawlerResaleRunSummary()
          .then((summary) => {
            setResaleStatsLoading(false);
            const done = !summary || summary.processed >= summary.totalRequested;
            const timedOut = Date.now() - startedAt > POLL_TIMEOUT_MS;
            if (done || timedOut) {
              setResaleStats(summary);
              setResaleStillRunning(false);
              return;
            }
            resalePollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          })
          .catch((err) => {
            setResaleStatsError(err instanceof Error ? err.message : "매도분석 조회에 실패했습니다.");
            setResaleStatsLoading(false);
            setResaleStillRunning(false);
          });
      };
      poll();
    }

    return () => {
      if (resalePollTimerRef.current) {
        clearTimeout(resalePollTimerRef.current);
        resalePollTimerRef.current = null;
      }
    };
  }, [status?.phase]);

  function refreshSavedSearches() {
    fetchNiceSavedSearches()
      .then(setSavedSearches)
      .catch(() => {});
  }

  function patch(fields: Partial<NiceSearchConfig>) {
    setConfig((prev) => ({ ...prev, ...fields }));
  }

  // 탱크의 "주소 추가"에 대응 — 검색조건으로 작업목록(objId)만 만든다.
  async function handleCollect() {
    setCollecting(true);
    setError(null);
    setCollectSummary(null);
    try {
      let presetLabel = activePresetId ? presetName.trim() : "";
      const name = presetName.trim();
      if (name) {
        const saved = await saveNiceSavedSearch({ id: activePresetId ?? undefined, name, search: config });
        setActivePresetId(saved.id);
        presetLabel = saved.name;
        refreshSavedSearches();
      }
      void presetLabel;
      const result = await niceCrawlerCollect(config);
      const parts = [`나이스 검색 ${result.total.toLocaleString("ko-KR")}건 중 확인 ${result.rawCount}건`];
      if (result.excluded) parts.push(`DB중복 ${result.excluded}건 제외`);
      parts.push(`작업목록 ${result.items.length}건`);
      setCollectSummary(parts.join(" · "));
      setSelected(new Set());
      await refresh();
      if (autoStartAfterCollect && result.items.length > 0) {
        await handleStart();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "수집에 실패했습니다.");
    } finally {
      setCollecting(false);
    }
  }

  // 탱크의 "조회 시작"에 대응 — 스테이징된 작업목록을 상세조회+저장.
  async function handleStart() {
    setBusy("start");
    setError(null);
    try {
      if (resaleAnalysisEnabled) pendingResaleSummaryFetchRef.current = true;
      await niceCrawlerStart({ resaleAnalysisEnabled });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "시작에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleStop() {
    setBusy("stop");
    try {
      await niceCrawlerStop();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "중지에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleClearLogs() {
    setBusy("clear");
    try {
      await niceCrawlerClearLogs();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그 삭제에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSavePreset() {
    const name = presetName.trim();
    if (!name) {
      setError("저장할 조건 이름을 입력해 주세요.");
      return;
    }
    setSavingPreset(true);
    setError(null);
    try {
      const saved = await saveNiceSavedSearch({ id: activePresetId ?? undefined, name, search: config });
      setActivePresetId(saved.id);
      setPresetName(saved.name);
      refreshSavedSearches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "조건 저장에 실패했습니다.");
    } finally {
      setSavingPreset(false);
    }
  }

  function handleNewPreset() {
    setActivePresetId(null);
    setPresetName("");
  }

  async function handleDeletePreset(id: string) {
    try {
      await deleteNiceSavedSearch(id);
      if (activePresetId === id) {
        setActivePresetId(null);
        setPresetName("");
      }
      refreshSavedSearches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  function applyPreset(preset: NiceSavedSearch) {
    setActivePresetId(preset.id);
    setPresetName(preset.name);
    setConfig(preset.search);
  }

  async function loadTankFavorites() {
    setLoadingFavorites(true);
    setError(null);
    try {
      const result = await fetchTankFavoriteSearches();
      setTankFavorites(result.items);
      setFavoritesLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "즐겨쓰는 검색 조회 실패");
    } finally {
      setLoadingFavorites(false);
    }
  }

  function applyTankFavorite(favorite: TankFavoriteSearch) {
    setActivePresetId(null);
    setPresetName(favorite.title);
    setConfig((prev) => mapTankFavoriteToNiceConfig(favorite.search, prev));
  }

  function toggleYongdo(code: string) {
    setConfig((prev) => {
      const exists = prev.yongdoCd.includes(code);
      return {
        ...prev,
        yongdoCd: exists ? prev.yongdoCd.filter((c) => c !== code) : [...prev.yongdoCd, code],
      };
    });
  }

  function toggleSpecialObjCd(code: string) {
    setConfig((prev) => {
      const exists = (prev.specialObjCd ?? []).includes(code);
      return {
        ...prev,
        specialObjCd: exists
          ? (prev.specialObjCd ?? []).filter((c) => c !== code)
          : [...(prev.specialObjCd ?? []), code],
      };
    });
  }

  function toggleProgStatus(code: string) {
    setConfig((prev) => {
      const exists = prev.objProgStatusCd.includes(code);
      return {
        ...prev,
        objProgStatusCd: exists
          ? prev.objProgStatusCd.filter((c) => c !== code)
          : [...prev.objProgStatusCd, code],
      };
    });
  }

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === urls.length ? new Set() : new Set(urls.map((_, i) => i))));
  }

  async function handleRemoveSelected() {
    const indices = Array.from(selected);
    if (indices.length === 0) return;
    setBusy("remove");
    try {
      await niceCrawlerManageUrls({ action: "remove", indices });
      setSelected(new Set());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(null);
    }
  }

  async function handleClearUrls() {
    setBusy("clearUrls");
    try {
      await niceCrawlerManageUrls({ action: "clear" });
      setSelected(new Set());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(null);
    }
  }

  async function handleAddManual() {
    const raw = manualObjId.trim();
    if (!raw) return;
    setBusy("add");
    try {
      await niceCrawlerManageUrls({ action: "add", objId: raw });
      setManualObjId("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setBusy(null);
    }
  }

  const stale = status?.running && Date.now() - new Date(status.updatedAt).getTime() > 60_000;
  const isRunning = status?.phase === "fetching_details" || status?.phase === "collecting_objids";
  const progress =
    status && status.matched > 0 ? Math.min(100, Math.round((status.completed / status.matched) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">나이스옥션 작업창</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              검색조건(관심조건/직접설정) → 주소 추가 → 조회 시작
            </p>
          </div>
          <span className="px-2 py-0.5 text-xs rounded-sm bg-muted text-muted-foreground">
            {PHASE_LABELS[status?.phase ?? "idle"] ?? status?.phase ?? "-"}
          </span>
          {status?.running && (
            <span className="px-2 py-0.5 text-xs rounded-sm bg-emerald-100 text-emerald-700">실행 중</span>
          )}
          {stale && (
            <span className="px-2 py-0.5 text-xs rounded-sm bg-amber-100 text-amber-800">워커 응답 없음</span>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {status?.error && <p className="text-xs text-destructive">워커 오류: {status.error}</p>}
        {status?.lastMessage && <p className="text-xs text-muted-foreground">{status.lastMessage}</p>}
        {collectSummary && (
          <div className="rounded-sm border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-950">
            {collectSummary}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div>
            <label className="text-muted-foreground text-xs">완료 개수</label>
            <input
              readOnly
              value={status?.completed ?? 0}
              className="w-full mt-1 px-3 py-2 border border-border rounded-sm bg-secondary/30"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs">총 작업 개수</label>
            <input
              readOnly
              value={status?.matched ?? urls.length}
              className="w-full mt-1 px-3 py-2 border border-border rounded-sm bg-secondary/30"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs">DB 등록</label>
            <input
              readOnly
              value={status?.created ?? 0}
              className="w-full mt-1 px-3 py-2 border border-border rounded-sm bg-secondary/30"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs">DB 갱신</label>
            <input
              readOnly
              value={status?.updated ?? 0}
              className="w-full mt-1 px-3 py-2 border border-border rounded-sm bg-secondary/30"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">진행률</span>
            <span className="text-xs font-mono">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* 검색조건 — CrawlerSearchPanel.tsx와 동일한 박스 구성/필드 순서 */}
      <div className="border border-border rounded-sm bg-card">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <h3 className="text-sm font-bold">검색조건</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              관심조건을 선택하거나 직접 설정한 뒤 주소 추가를 누르세요. (나이스옥션 API 기준)
            </p>
          </div>
          <span className="text-muted-foreground text-sm">{expanded ? "접기 ▲" : "펼치기 ▼"}</span>
        </button>

        {expanded && (
          <div className="border-t border-border p-4 space-y-5">
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm sm:items-center">
                <span className="font-semibold">관심조건</span>
                {savedSearches.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={activePresetId ?? ""}
                      onChange={(e) => {
                        const preset = savedSearches.find((p) => p.id === e.target.value);
                        if (preset) applyPreset(preset);
                      }}
                      className="w-full max-w-xs px-3 py-2 border border-border rounded-sm bg-card"
                    >
                      <option value="" disabled>
                        저장된 관심조건에서 선택...
                      </option>
                      {savedSearches.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                    {activePresetId && (
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(activePresetId)}
                        className="px-2 py-2 text-xs text-muted-foreground border border-border rounded-sm hover:text-destructive shrink-0"
                      >
                        삭제
                      </button>
                    )}
                    <input
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      placeholder="조건 이름 (예: 강남 아파트)"
                      className="w-64 px-3 py-1.5 text-sm border border-border rounded-sm bg-card shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSavePreset()}
                      disabled={savingPreset || !presetName.trim()}
                      className="px-3 py-2 text-xs rounded-sm border border-border shrink-0 whitespace-nowrap disabled:opacity-50"
                    >
                      {savingPreset ? "저장 중..." : "현재 조건 저장"}
                    </button>
                    {activePresetId && (
                      <button
                        type="button"
                        onClick={handleNewPreset}
                        className="px-2 py-2 text-xs text-muted-foreground border border-border rounded-sm hover:text-foreground shrink-0 whitespace-nowrap"
                      >
                        새 조건으로
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      placeholder="조건 이름 (예: 강남 아파트) — 비우면 저장 없이 1회성 조회"
                      className="px-3 py-1.5 text-sm border border-border rounded-sm bg-card flex-1 min-w-[220px]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSavePreset()}
                      disabled={savingPreset || !presetName.trim()}
                      className="px-3 py-2 text-xs rounded-sm border border-border shrink-0 whitespace-nowrap disabled:opacity-50"
                    >
                      {savingPreset ? "저장 중..." : "현재 조건 저장"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">탱크옥션 즐겨쓰는 검색</p>
                <button
                  type="button"
                  onClick={loadTankFavorites}
                  disabled={loadingFavorites}
                  className="px-3 py-1.5 text-xs rounded-sm border border-border disabled:opacity-50"
                >
                  {loadingFavorites ? "불러오는 중..." : favoritesLoaded ? "새로고침" : "불러오기"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                나이스는 로그인이 없어 자체 즐겨찾기가 없습니다 — 탱크옥션 즐겨찾기를 불러와 나이스
                조건으로 변환합니다(지역코드·특수조건 등 대응 없는 항목은 변환되지 않습니다).
              </p>
              {favoritesLoaded && tankFavorites.length > 0 ? (
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
                      {favorite.title}
                    </option>
                  ))}
                </select>
              ) : (
                favoritesLoaded && (
                  <p className="text-xs text-muted-foreground">
                    탱크옥션에 등록된 즐겨쓰는 검색이 없습니다.
                  </p>
                )
              )}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold">검색조건</p>
              <p className="text-xs text-muted-foreground">
                비워두면 조건 없이 검색합니다. 값을 입력하거나 선택한 항목만 검색에 반영됩니다.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm sm:items-center">
              <span className="text-muted-foreground">사건번호</span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={config.caseYear ?? ""}
                  onChange={(e) => patch({ caseYear: e.target.value })}
                  className="w-24 shrink-0 px-3 py-2 border border-border rounded-sm bg-card"
                >
                  {CASE_YEAR_OPTIONS.map((item) => (
                    <option key={item.value || "all"} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <span className="text-muted-foreground shrink-0 select-none">타경</span>
                <input
                  value={config.caseSerial ?? ""}
                  onChange={(e) => patch({ caseSerial: e.target.value })}
                  placeholder="일련번호"
                  className="w-24 shrink-0 px-3 py-2 border border-border rounded-sm bg-card"
                />
                <span className="text-muted-foreground shrink-0 select-none ml-2">물건종류</span>
                <div className="flex-1 min-w-[10rem]">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) toggleYongdo(e.target.value);
                      e.target.value = "";
                    }}
                    className="w-full px-3 py-2 border border-border rounded-sm bg-card"
                  >
                    <option value="">선택 (복수 선택 가능)</option>
                    {NICE_YONGDO_OPTIONS.map((item) => (
                      <option key={item.code} value={item.code} disabled={config.yongdoCd.includes(item.code)}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {config.yongdoCd.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {config.yongdoCd.map((code) => (
                        <button
                          type="button"
                          key={code}
                          onClick={() => toggleYongdo(code)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded-sm bg-secondary/30"
                        >
                          {NICE_YONGDO_OPTIONS.find((o) => o.code === code)?.label ?? code}
                          <span className="text-muted-foreground">×</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm sm:items-start">
              <span className="text-muted-foreground pt-2">소재지</span>
              <div className="flex flex-col gap-1.5">
                <input
                  value={config.pnuCd ?? ""}
                  onChange={(e) => patch({ pnuCd: e.target.value })}
                  placeholder="법정동코드(pnuCd, 10자리) — 나이스는 탱크와 지역코드 체계가 달라 자동 변환하지 않습니다"
                  className="w-full px-3 py-2 border border-border rounded-sm bg-card"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm sm:items-center">
              <span className="text-muted-foreground">매각기일</span>
              <div className="flex items-center gap-2 max-w-md">
                <input
                  value={config.dspslDxdyYmdStart ?? ""}
                  onChange={(e) => patch({ dspslDxdyYmdStart: e.target.value })}
                  placeholder="20260101"
                  className="w-full px-3 py-2 border border-border rounded-sm bg-card"
                />
                <span className="text-muted-foreground shrink-0 select-none">~</span>
                <input
                  value={config.dspslDxdyYmdEnd ?? ""}
                  onChange={(e) => patch({ dspslDxdyYmdEnd: e.target.value })}
                  placeholder="20261231"
                  className="w-full px-3 py-2 border border-border rounded-sm bg-card"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm sm:items-center">
                <span className="text-muted-foreground">물건 구분</span>
                <select
                  value={config.objTypes}
                  onChange={(e) => patch({ objTypes: e.target.value as NiceSearchConfig["objTypes"] })}
                  className="w-full px-3 py-2 border border-border rounded-sm bg-card"
                >
                  <option value="경매">경매</option>
                  <option value="공매">공매</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm sm:items-start">
                <span className="text-muted-foreground pt-2">진행상태</span>
                <div>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) toggleProgStatus(e.target.value);
                      e.target.value = "";
                    }}
                    className="w-full px-3 py-2 border border-border rounded-sm bg-card"
                  >
                    <option value="">선택 (비워두면 진행물건 기본값, 복수 선택 가능)</option>
                    {NICE_PROGSTATUS_OPTIONS.map((item) => (
                      <option key={item.code} value={item.code} disabled={config.objProgStatusCd.includes(item.code)}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {config.objProgStatusCd.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {config.objProgStatusCd.map((code) => (
                        <button
                          type="button"
                          key={code}
                          onClick={() => toggleProgStatus(code)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded-sm bg-secondary/30"
                        >
                          {NICE_PROGSTATUS_OPTIONS.find((o) => o.code === code)?.label ?? code}
                          <span className="text-muted-foreground">×</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <RangeInputRow
                label="감정가"
                unit="원"
                minValue={config.gamjungAmtStart ?? ""}
                maxValue={config.gamjungAmtEnd ?? ""}
                onMinChange={(v) => patch({ gamjungAmtStart: v })}
                onMaxChange={(v) => patch({ gamjungAmtEnd: v })}
              />

              <RangeInputRow
                label="최저가"
                unit="원"
                minValue={config.minAmtStart ?? ""}
                maxValue={config.minAmtEnd ?? ""}
                onMinChange={(v) => patch({ minAmtStart: v })}
                onMaxChange={(v) => patch({ minAmtEnd: v })}
              />

              <RangeInputRow
                label="대지면적(㎡)"
                minValue={config.tojiAreaStart ?? ""}
                maxValue={config.tojiAreaEnd ?? ""}
                onMinChange={(v) => patch({ tojiAreaStart: v })}
                onMaxChange={(v) => patch({ tojiAreaEnd: v })}
              />

              <RangeInputRow
                label="보존등기 (년)"
                minValue={config.initRegYmdStart ?? ""}
                maxValue={config.initRegYmdEnd ?? ""}
                onMinChange={(v) => patch({ initRegYmdStart: v })}
                onMaxChange={(v) => patch({ initRegYmdEnd: v })}
              />

              <RangeInputRow
                label="건물면적(㎡)"
                minValue={config.bldgAreaStart ?? ""}
                maxValue={config.bldgAreaEnd ?? ""}
                onMinChange={(v) => patch({ bldgAreaStart: v })}
                onMaxChange={(v) => patch({ bldgAreaEnd: v })}
              />

              <RangeInputRow
                label="유찰횟수"
                minValue={config.uchalCntStart ?? ""}
                maxValue={config.uchalCntEnd ?? ""}
                onMinChange={(v) => patch({ uchalCntStart: v })}
                onMaxChange={(v) => patch({ uchalCntEnd: v })}
              />

              <RangeInputRow
                label="감정가대비(%)"
                minValue={config.gamjungAmtRateStart ?? ""}
                maxValue={config.gamjungAmtRateEnd ?? ""}
                onMinChange={(v) => patch({ gamjungAmtRateStart: v })}
                onMaxChange={(v) => patch({ gamjungAmtRateEnd: v })}
              />

              <div className="grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm sm:items-center">
                <span className="text-muted-foreground">감정회사명</span>
                <input
                  value={config.gamjungCompanyNm ?? ""}
                  onChange={(e) => patch({ gamjungCompanyNm: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-sm bg-card"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm sm:items-center">
                <span className="text-muted-foreground">소유자</span>
                <input
                  value={config.soyujaNm ?? ""}
                  onChange={(e) => patch({ soyujaNm: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-sm bg-card"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm sm:items-center">
                <span className="text-muted-foreground">채무자</span>
                <input
                  value={config.chamujaNm ?? ""}
                  onChange={(e) => patch({ chamujaNm: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-sm bg-card"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm sm:items-center">
                <span className="text-muted-foreground">채권자</span>
                <input
                  value={config.chaeonjaNm ?? ""}
                  onChange={(e) => patch({ chaeonjaNm: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-sm bg-card"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm sm:items-center">
              <span className="text-muted-foreground">이번 실행 최대 처리 건수</span>
              <div>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={config.maxItems}
                  onChange={(e) => patch({ maxItems: Number(e.target.value) || 1 })}
                  className="w-full max-w-xs px-3 py-2 border border-border rounded-sm bg-card"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  안전장치 — 대량 실행 사고 방지를 위해 항상 상한을 둡니다. 처음엔 작게(5~10건) 시작해
                  결과를 확인한 뒤 늘리는 걸 권장합니다.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">특수조건</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {SPECIAL_CONDITION_MODE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="niceSpecialConditionMode"
                      checked={(config.specialObjCdMode ?? "exclude") === opt.value}
                      onChange={() => patch({ specialObjCdMode: opt.value })}
                      className="accent-primary"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <div className="space-y-3">
                {NICE_SPECIALOBJCD_GROUPS.map(({ group, items }) => (
                  <div key={group} className="text-sm">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{group}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((item) => (
                        <label
                          key={item.code}
                          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-border rounded-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={(config.specialObjCd ?? []).includes(item.code)}
                            onChange={() => toggleSpecialObjCd(item.code)}
                            className="accent-primary"
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 px-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoStartAfterCollect}
                  onChange={(e) => setAutoStartAfterCollect(e.target.checked)}
                  disabled={isRunning}
                  className="accent-primary"
                />
                주소 추가 후 자동으로 조회 시작
              </label>
              <label className="flex items-center gap-2 px-2 text-sm">
                <input
                  type="checkbox"
                  checked={resaleAnalysisEnabled}
                  onChange={(e) => setResaleAnalysisEnabled(e.target.checked)}
                  disabled={isRunning}
                  className="accent-primary"
                />
                매도분석
              </label>
            </div>

            <button
              type="button"
              onClick={() => void handleCollect()}
              disabled={collecting || savingPreset || isRunning}
              className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
            >
              {collecting ? "수집 중..." : "주소 추가"}
            </button>
          </div>
        )}
      </div>

      {(resaleStatsLoading || resaleStats || resaleStatsError || resaleStillRunning) && (
        <div className="rounded-sm border border-border bg-card p-4 space-y-3">
          {resaleStatsLoading ? (
            <p className="text-sm text-muted-foreground">매도분석 조회 중...</p>
          ) : resaleStatsError ? (
            <p className="text-sm text-destructive">{resaleStatsError}</p>
          ) : resaleStillRunning && !resaleStats ? (
            <p className="text-sm text-muted-foreground">매도분석 진행 중...</p>
          ) : resaleStats ? (
            <>
              <p className="text-sm font-semibold text-foreground">
                매도분석 결과 (요청 {resaleStats.totalRequested}건 기준, 분석 완료)
              </p>
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 border border-border rounded-sm">
                  <p className="text-xs text-muted-foreground">요청 건수</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">{resaleStats.totalRequested}건</p>
                </div>
                <div className="p-3 border border-border rounded-sm">
                  <p className="text-xs text-muted-foreground">분석 시도</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">{resaleStats.attempted}건</p>
                </div>
                <div className="p-3 border border-border rounded-sm">
                  <p className="text-xs text-muted-foreground">QA 후보 있음</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">{resaleStats.candidateFound}건</p>
                </div>
                <div className="p-3 border border-border rounded-sm">
                  <p className="text-xs text-muted-foreground">매도 확정 표시</p>
                  <p className="text-xl font-bold text-emerald-700 mt-0.5">{resaleStats.displayed}건</p>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* 작업목록(URL) — 탱크옥션 "주소 추가"로 만든 목록과 동일한 스테이징 UI */}
      <div className="space-y-3">
        <div className="border border-border rounded-sm h-64 overflow-y-auto bg-card">
          {urls.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">작업목록이 없습니다. 검색조건에서 주소 추가를 눌러 주세요.</p>
          ) : (
            <ul className="divide-y divide-border text-xs font-mono">
              <li className="flex items-center gap-2 px-3 py-2 bg-secondary/40 sticky top-0">
                <input
                  type="checkbox"
                  checked={urls.length > 0 && selected.size === urls.length}
                  onChange={toggleSelectAll}
                  className="accent-primary"
                />
                <span className="font-semibold text-foreground/80">
                  전체 선택 ({selected.size}/{urls.length})
                </span>
              </li>
              {urls.map((entry: NiceCrawlerUrlEntry, index: number) => (
                <li key={`${entry.objId}-${index}`} className="flex items-start gap-2 px-3 py-2 hover:bg-secondary/20">
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={() => toggleSelect(index)}
                    className="mt-0.5 accent-primary"
                  />
                  <span className="break-all">{entry.label || entry.objId}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <button
            type="button"
            disabled={busy !== null || selected.size === 0}
            onClick={() => void handleRemoveSelected()}
            className="px-3 py-2 text-sm border border-border rounded-sm hover:bg-secondary/40 disabled:opacity-50"
          >
            선택 삭제
          </button>
          <button
            type="button"
            disabled={busy !== null || urls.length === 0}
            onClick={() => void handleClearUrls()}
            className="px-3 py-2 text-sm border border-border rounded-sm hover:bg-secondary/40 disabled:opacity-50"
          >
            모두 삭제
          </button>
          <button
            type="button"
            disabled={busy !== null || urls.length === 0}
            title="브라우저 없이 HTTPX로 조회합니다(서버 자체 실행)."
            onClick={() =>
              void (status?.phase === "fetching_details" ? handleStop() : handleStart())
            }
            className="px-3 py-2 text-sm font-semibold rounded-sm bg-emerald-600 text-white disabled:opacity-50"
          >
            {busy === "start"
              ? "시작 중..."
              : busy === "stop"
                ? "중단 중..."
                : status?.phase === "fetching_details"
                  ? "조회 중단"
                  : "조회 시작"}
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={manualObjId}
            onChange={(e) => setManualObjId(e.target.value)}
            placeholder="objId 또는 나이스 상세 링크"
            className="flex-1 px-3 py-2 text-sm border border-border rounded-sm"
          />
          <button
            type="button"
            disabled={busy !== null || !manualObjId.trim()}
            onClick={() => void handleAddManual()}
            className="px-4 py-2 text-sm border border-border rounded-sm hover:bg-secondary/40 disabled:opacity-50"
          >
            추가
          </button>
        </div>

        <button
          type="button"
          disabled={busy !== null || !isRunning}
          onClick={() => void handleStop()}
          className="px-4 py-2 text-sm border border-red-200 text-red-700 rounded-sm hover:bg-red-50 disabled:opacity-50"
        >
          작업 중단
        </button>
      </div>

      <div className="rounded-sm border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">로그</p>
          <button
            type="button"
            onClick={() => void handleClearLogs()}
            disabled={busy !== null}
            className="ml-auto text-xs text-muted-foreground hover:underline disabled:opacity-50"
          >
            지우기
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto space-y-1 font-mono text-xs">
          {logs.length === 0 && <p className="text-muted-foreground">로그가 없습니다.</p>}
          {logs.map((log) => (
            <div key={log.id} className={LEVEL_TONE[log.level] ?? "text-foreground"}>
              <span className="text-muted-foreground">[{formatTime(log.at)}]</span> {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
