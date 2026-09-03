"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_COURTAUCTION_SEARCH_CONFIG,
  courtAuctionCrawlerClearLogs,
  courtAuctionCrawlerCollect,
  courtAuctionCrawlerManageUrls,
  courtAuctionCrawlerStart,
  courtAuctionCrawlerStop,
  deleteCourtAuctionSavedSearch,
  fetchCourtAuctionCrawlerLogs,
  fetchCourtAuctionCrawlerStatus,
  fetchCourtAuctionSavedSearches,
  parseCourtAuctionUrls,
  saveCourtAuctionSavedSearch,
  type CourtAuctionCrawlerLogEntry,
  type CourtAuctionCrawlerStatus,
  type CourtAuctionSavedSearch,
  type CourtAuctionSearchConfig,
  type CourtAuctionUrlEntry,
} from "@/lib/api";
import { COURT_OFFICE_OPTIONS, USAGE_LARGE_OPTIONS } from "@/lib/courtauction-crawler-codes";

/** 대법원 법원경매정보(courtauction.go.kr) 작업창 — 탱크옥션 작업창
 * (CrawlerWorkPanel.tsx)·나이스옥션 작업창(NiceCrawlerWorkPanel.tsx)과
 * 완전히 독립된 병렬 시스템(사용자 요청, 2026-09-03: "나이스 작업창처럼
 * 탱크옥션 작업창 옆에 대법원 탭을 만들고 레이아웃을 동일하게").
 *
 * 나이스와의 차이: 2026-09-03 실측으로 목록 API 한 번이면 화면에 필요한
 * 핵심 필드(주소/용도/감정가/최저가/매각기일 등) 대부분을 이미 받아온다는
 * 걸 확인했다 — 그래서 "조회 시작" 단계에서 상세 API를 추가로 부르지
 * 않고 서버가 바로 저장한다(사이트 접근 최소화). 사건상태 코드표
 * (유찰/매각 등 텍스트)와 상세 API 전용 필드(임차인/건물등기/매각물건
 * 명세서 등)는 아직 미확보라 이번 단계엔 비워둔다.
 */

const PHASE_LABELS: Record<string, string> = {
  idle: "대기",
  importing: "저장 중",
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

function todayYmd(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function CourtAuctionWorkPanel() {
  const [status, setStatus] = useState<CourtAuctionCrawlerStatus | null>(null);
  const [logs, setLogs] = useState<CourtAuctionCrawlerLogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [expanded, setExpanded] = useState(true);
  const [config, setConfig] = useState<CourtAuctionSearchConfig>({
    ...DEFAULT_COURTAUCTION_SEARCH_CONFIG,
    bidBgngYmd: todayYmd(),
    bidEndYmd: todayYmd(14),
  });
  const [savedSearches, setSavedSearches] = useState<CourtAuctionSavedSearch[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [collectSummary, setCollectSummary] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const urls = parseCourtAuctionUrls(status);

  const refresh = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([fetchCourtAuctionCrawlerStatus(), fetchCourtAuctionCrawlerLogs(200)]);
      setStatus(s);
      setLogs(l);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태를 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    pollRef.current = setInterval(() => void refresh(), 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    refreshSavedSearches();
  }, []);

  function refreshSavedSearches() {
    fetchCourtAuctionSavedSearches()
      .then(setSavedSearches)
      .catch(() => {});
  }

  function patch(fields: Partial<CourtAuctionSearchConfig>) {
    setConfig((prev) => ({ ...prev, ...fields }));
  }

  async function handleCollect() {
    setCollecting(true);
    setError(null);
    setCollectSummary(null);
    try {
      const result = await courtAuctionCrawlerCollect(config);
      setCollectSummary(
        `검색 결과 ${result.total.toLocaleString("ko-KR")}건 중 작업목록 ${result.items.length}건`,
      );
      setSelected(new Set());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "수집에 실패했습니다.");
    } finally {
      setCollecting(false);
    }
  }

  async function handleStart() {
    setBusy("start");
    setError(null);
    try {
      await courtAuctionCrawlerStart();
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
      await courtAuctionCrawlerStop();
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
      await courtAuctionCrawlerClearLogs();
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
    try {
      const saved = await saveCourtAuctionSavedSearch({ id: activePresetId ?? undefined, name, search: config });
      setActivePresetId(saved.id);
      setPresetName(saved.name);
      refreshSavedSearches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "조건 저장에 실패했습니다.");
    }
  }

  function handleNewPreset() {
    setActivePresetId(null);
    setPresetName("");
  }

  async function handleDeletePreset(id: string) {
    try {
      await deleteCourtAuctionSavedSearch(id);
      if (activePresetId === id) {
        setActivePresetId(null);
        setPresetName("");
      }
      refreshSavedSearches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  function applyPreset(preset: CourtAuctionSavedSearch) {
    setActivePresetId(preset.id);
    setPresetName(preset.name);
    setConfig(preset.search);
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
    setBusy("removeSelected");
    try {
      await courtAuctionCrawlerManageUrls({ action: "remove", indices: [...selected] });
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
      await courtAuctionCrawlerManageUrls({ action: "clear" });
      setSelected(new Set());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(null);
    }
  }

  const isRunning = status?.phase === "importing";
  const progress =
    status && status.matched > 0 ? Math.min(100, Math.round((status.completed / status.matched) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">대법원 작업창</p>
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
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {status?.error && <p className="text-xs text-destructive">오류: {status.error}</p>}
        {status?.lastMessage && <p className="text-xs text-muted-foreground">{status.lastMessage}</p>}
        {collectSummary && (
          <div className="rounded-sm border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-950">
            {collectSummary}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div>
            <label className="text-muted-foreground text-xs">완료 개수</label>
            <input readOnly value={status?.completed ?? 0} className="w-full mt-1 px-3 py-2 border border-border rounded-sm bg-secondary/30" />
          </div>
          <div>
            <label className="text-muted-foreground text-xs">총 작업 개수</label>
            <input readOnly value={status?.matched ?? urls.length} className="w-full mt-1 px-3 py-2 border border-border rounded-sm bg-secondary/30" />
          </div>
          <div>
            <label className="text-muted-foreground text-xs">DB 등록</label>
            <input readOnly value={status?.created ?? 0} className="w-full mt-1 px-3 py-2 border border-border rounded-sm bg-secondary/30" />
          </div>
          <div>
            <label className="text-muted-foreground text-xs">DB 갱신</label>
            <input readOnly value={status?.updated ?? 0} className="w-full mt-1 px-3 py-2 border border-border rounded-sm bg-secondary/30" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">진행률</span>
            <span className="text-xs font-mono">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* 검색조건 */}
      <div className="border border-border rounded-sm bg-card">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <h3 className="text-sm font-bold">검색조건</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              법원은 필수입니다(전체 법원 선택 시 400 에러 — 2026-09-03 실측). 조건을 선택한 뒤 주소 추가를 누르세요.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{expanded ? "접기" : "펼치기"}</span>
        </button>

        {expanded && (
          <div className="border-t border-border p-4 space-y-4">
            {savedSearches.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {savedSearches.map((preset) => (
                  <div key={preset.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`px-2.5 py-1 text-xs rounded-full border ${
                        activePresetId === preset.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-secondary/40"
                      }`}
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeletePreset(preset.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                      title="삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleNewPreset}
                  className="px-2.5 py-1 text-xs rounded-full border border-dashed border-border text-muted-foreground hover:bg-secondary/40"
                >
                  + 새 조건
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">법원 (필수)</label>
                <select
                  value={config.cortOfcCd}
                  onChange={(e) => patch({ cortOfcCd: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-sm bg-background"
                >
                  <option value="">법원 선택</option>
                  {COURT_OFFICE_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">용도 대분류</label>
                <select
                  value={config.lclDspslGdsLstUsgCd ?? ""}
                  onChange={(e) => patch({ lclDspslGdsLstUsgCd: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-sm bg-background"
                >
                  <option value="">전체</option>
                  {USAGE_LARGE_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">매각기일 시작(YYYYMMDD)</label>
                <input
                  value={config.bidBgngYmd}
                  onChange={(e) => patch({ bidBgngYmd: e.target.value })}
                  placeholder="20260903"
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-sm bg-background font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">매각기일 종료(YYYYMMDD)</label>
                <input
                  value={config.bidEndYmd}
                  onChange={(e) => patch({ bidEndYmd: e.target.value })}
                  placeholder="20260917"
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-sm bg-background font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  용도 중분류 코드 <span className="text-muted-foreground/70">(코드표 미확보 — 직접 입력)</span>
                </label>
                <input
                  value={config.mclDspslGdsLstUsgCd ?? ""}
                  onChange={(e) => patch({ mclDspslGdsLstUsgCd: e.target.value })}
                  placeholder="예: 20100"
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-sm bg-background font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">최대 수집 건수</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={config.maxItems}
                  onChange={(e) => patch({ maxItems: Number(e.target.value) || 1 })}
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-sm bg-background"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="이 조건 저장할 이름(선택)"
                className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-border rounded-sm bg-background"
              />
              <button
                type="button"
                onClick={() => void handleSavePreset()}
                className="px-3 py-2 text-sm border border-border rounded-sm hover:bg-secondary/40"
              >
                조건 저장
              </button>
              <button
                type="button"
                disabled={collecting}
                onClick={() => void handleCollect()}
                className="ml-auto px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
              >
                {collecting ? "수집 중..." : "주소 추가"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 작업목록 */}
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
              {urls.map((entry: CourtAuctionUrlEntry, index: number) => (
                <li key={`${entry.docid}-${index}`} className="flex items-start gap-2 px-3 py-2 hover:bg-secondary/20">
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={() => toggleSelect(index)}
                    className="mt-0.5 accent-primary"
                  />
                  <span className="break-all">{entry.label || entry.docid}</span>
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
            title="서버에서 바로 저장합니다(추가 사이트 요청 없음)."
            onClick={() => void (isRunning ? handleStop() : handleStart())}
            className="px-3 py-2 text-sm font-semibold rounded-sm bg-emerald-600 text-white disabled:opacity-50"
          >
            {busy === "start" ? "시작 중..." : busy === "stop" ? "중단 중..." : isRunning ? "조회 중단" : "조회 시작"}
          </button>
        </div>
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
