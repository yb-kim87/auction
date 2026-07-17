"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkTankLoginV3,
  crawlerClearLogs,
  crawlerLoadExcel,
  crawlerLogin,
  crawlerManageUrls,
  crawlerRestartWorker,
  crawlerBackfillNaverIds,
  crawlerStart,
  crawlerStop,
  fetchCrawlerConfig,
  fetchCrawlerLogs,
  fetchCrawlerStatus,
  type CrawlerLogEntry,
  type CrawlerStatus,
  type CrawlerUrlEntry,
} from "@/lib/api";
import { CrawlerAlgorithmTab } from "./CrawlerAlgorithmTab";
import { CrawlerProfitTab } from "./CrawlerProfitTab";
import { CrawlerSearchPanel } from "./CrawlerSearchPanel";

type CrawlerSubTab = "work" | "algorithm" | "profit";

const SUB_TABS: { id: CrawlerSubTab; label: string }[] = [
  { id: "work", label: "작업창" },
  { id: "algorithm", label: "알고리즘" },
  { id: "profit", label: "수익계산" },
];

const PHASE_LABELS: Record<CrawlerStatus["phase"], string> = {
  idle: "대기",
  starting: "워커 시작 중",
  logging_in: "로그인 중",
  collecting: "주소 수집 중",
  crawling: "조회 중",
  stopped: "중단됨",
  error: "오류",
};

function phaseLabel(status: CrawlerStatus | null): string {
  if (!status) return "-";
  if (status.tankLoggedIn && status.phase === "logging_in") {
    return "대기";
  }
  return PHASE_LABELS[status.phase];
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", { hour12: false });
  } catch {
    return iso;
  }
}

export function CrawlerWorkPanel() {
  const [subTab, setSubTab] = useState<CrawlerSubTab>("work");
  const [status, setStatus] = useState<CrawlerStatus | null>(null);
  const [logs, setLogs] = useState<CrawlerLogEntry[]>([]);
  const [repeatAfterCollect, setRepeatAfterCollect] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("00:00");
  const [manualUrl, setManualUrl] = useState("");
  const [tankUserId, setTankUserId] = useState("");
  const [tankPassword, setTankPassword] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collectSummary, setCollectSummary] = useState<string | null>(null);
  const [localWorkPanelHint, setLocalWorkPanelHint] = useState(false);
  const [tankLoginChecked, setTankLoginChecked] = useState(false);
  // "주소 추가" 요청을 보낸 순간부터 응답이 올 때까지(로그인 확인+목록
  // 조회로 수십 초 걸릴 수 있음) 폴링을 앞당겨 실행 로그가 실시간으로
  // 갱신되도록 한다 — 이게 없으면 버튼을 눌러도 응답 전까지 화면이 멈춘
  // 것처럼 보인다.
  const [collectingLocal, setCollectingLocal] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const excelRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextLogs] = await Promise.all([
        fetchCrawlerStatus(),
        fetchCrawlerLogs(300),
      ]);
      setStatus(nextStatus);
      setLogs(nextLogs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태 조회 실패");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isLocalHost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (isLocalHost) {
      setLocalWorkPanelHint(false);
      return;
    }
    fetch("http://127.0.0.1:3001/crawler/status", {
      signal: AbortSignal.timeout(1200),
    })
      .then((res) => setLocalWorkPanelHint(res.ok))
      .catch(() => setLocalWorkPanelHint(false));
  }, []);

  useEffect(() => {
    void refresh();
    fetchCrawlerConfig()
      .then((config) => {
        setRepeatAfterCollect(config.schedule.repeatAfterCollect);
        setScheduledTime(config.schedule.time);
        if (config.credentials?.userId) {
          setTankUserId(config.credentials.userId);
        }
        if (config.credentials?.password) {
          setTankPassword(config.credentials.password);
        }
      })
      .catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    const active =
      status?.phase === "crawling" ||
      status?.phase === "collecting" ||
      status?.phase === "logging_in" ||
      status?.phase === "starting" ||
      collectingLocal;

    const isVisible = () =>
      typeof document === "undefined" ||
      document.visibilityState !== "hidden";

    if (!active) {
      const timer = setInterval(() => {
        if (!isVisible()) return;
        void refresh();
      }, 15_000);
      const onVisible = () => {
        if (document.visibilityState === "visible") void refresh();
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisible);
      };
    }

    void refresh();
    const statusTimer = setInterval(() => {
      if (!isVisible()) return;
      void Promise.all([fetchCrawlerStatus(), fetchCrawlerLogs(300)])
        .then(([nextStatus, nextLogs]) => {
          setStatus(nextStatus);
          setLogs(nextLogs);
          setError(null);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "상태 조회 실패");
        });
    }, status?.phase === "collecting" || status?.phase === "logging_in" ? 1200 : 800);

    return () => {
      clearInterval(statusTimer);
    };
  }, [status?.phase, refresh, collectingLocal]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const urls: CrawlerUrlEntry[] = status?.urls ?? [];
  const isRunning =
    status?.phase === "crawling" ||
    status?.phase === "collecting" ||
    (status?.phase === "logging_in" && !status?.tankLoggedIn) ||
    status?.phase === "starting";

  const progress =
    status && status.total > 0
      ? Math.min(100, Math.round((status.completed / status.total) * 100))
      : 0;

  async function runAction(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "작업 실패");
    } finally {
      setBusy(null);
    }
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
    setSelected((prev) =>
      prev.size === urls.length
        ? new Set()
        : new Set(urls.map((_, index) => index)),
    );
  }

  return (
    <div className="space-y-0">
      <div className="flex border-b border-border px-6 pt-4">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
              subTab === tab.id
                ? "text-primary border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === "algorithm" && <CrawlerAlgorithmTab />}
      {subTab === "profit" && <CrawlerProfitTab />}

      {subTab === "work" && (
        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">크롤링 작업창</h2>
              <p className="text-sm text-muted-foreground mt-1">
                탱크옥션 로그인 → 검색조건(관심조건/직접설정) → 주소 추가 → 조회 시작
                {status?.remoteWorker && (
                  <span className="block mt-1 text-amber-700">
                    운영 웹: 관리자 PC 크롤러 워커에 원격 연결됩니다. PC가 꺼져 있으면
                    조회가 시작되지 않습니다.
                  </span>
                )}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground shrink-0">
              <p>
                워커:{" "}
                <span className={status?.workerRunning ? "text-emerald-600" : ""}>
                  {status?.remoteWorker
                    ? status.workerRunning
                      ? "관리자 PC 연결됨"
                      : "관리자 PC 미연결"
                    : status?.workerRunning
                      ? "실행 중"
                      : "미실행"}
                </span>
              </p>
              <p>
                브라우저:{" "}
                <span className={status?.browserReady ? "text-emerald-600" : ""}>
                  {status?.browserReady ? "연결됨" : "미연결"}
                </span>
              </p>
              <p>상태: {phaseLabel(status)}</p>
              <p>
                탱크옥션:{" "}
                <span
                  className={
                    status?.tankLoggedIn ? "text-emerald-600" : "text-muted-foreground"
                  }
                >
                  {status?.tankLoggedIn === true
                    ? "로그인됨"
                    : status?.tankLoggedIn === false
                      ? "미로그인"
                      : "-"}
                </span>
              </p>
              {status?.scheduleEnabled && (
                <p className="text-primary">
                  예약: {status.scheduleRepeatDaily ? "매일" : "1회"}{" "}
                  {status.scheduledTime}
                </p>
              )}
            </div>
          </div>

          {(error || (status?.remoteWorker && !status.workerRunning && status.error)) && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error ?? status?.error}
            </div>
          )}

          {status?.remoteWorker && (
            <div className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 space-y-2">
              <p className="font-semibold">
                원격 크롤 — Chrome은 이 브라우저 탭이 아니라 관리자 PC 화면에서
                열립니다
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>
                  데이터는 운영 DB에 저장되며, 아래 진행률·로그는 PC 워커 상태를
                  반영합니다.
                </li>
                <li>
                  Chrome 창을 보면서 버튼을 누르려면{" "}
                  <strong>크롤 워커가 돌아가는 PC</strong>에서 로컬 작업창을
                  여세요.
                </li>
                <li>
                  운영 URL을 연 PC가 워커 PC와 다르면, 그 PC에서는 크롤을 실행할
                  수 없습니다(워커·터널 설치 필요).
                </li>
                {isRunning && (
                  <li>
                    지금 조회 중이라면 PC에서 Alt+Tab으로 Chrome 창을 찾아
                    보세요.
                  </li>
                )}
              </ul>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href="http://localhost:3000/admin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex px-3 py-1.5 text-xs font-semibold rounded-sm bg-amber-800 text-white hover:bg-amber-900"
                >
                  로컬 작업창 열기 (localhost:3000)
                </a>
                {localWorkPanelHint && (
                  <span className="text-xs text-emerald-700 font-medium">
                    이 PC에서 로컬 API(3001)가 감지되었습니다
                  </span>
                )}
              </div>
            </div>
          )}

          {status?.lastMessage && (
            <div className="rounded-sm border border-border bg-secondary/30 px-4 py-2 text-sm">
              {status.lastMessage}
            </div>
          )}

          {collectSummary && (
            <div className="rounded-sm border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-950">
              {collectSummary}
              {collectSummary.includes("추가된 URL 없음") && (
                <span className="block mt-1 text-xs text-blue-800">
                  DB에 이미 있는 물건(입찰기일 미도래)은 자동 제외됩니다. 신규
                  물건이 없거나 탱크 로그인·검색 조건을 확인해 주세요.
                </span>
              )}
            </div>
          )}

          <div className="border border-border rounded-sm p-4 space-y-3 bg-card">
            <p className="text-sm font-semibold">탱크옥션 로그인</p>
            {status?.remoteWorker ? (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <label className="text-sm space-y-1">
                  <span className="text-muted-foreground text-xs">탱크옥션 ID</span>
                  <input
                    value={tankUserId}
                    onChange={(e) => setTankUserId(e.target.value)}
                    disabled={Boolean(isRunning)}
                    autoComplete="username"
                    className="w-full px-3 py-2 text-sm border border-border rounded-sm bg-card"
                  />
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-muted-foreground text-xs">탱크옥션 PW</span>
                  <input
                    type="password"
                    value={tankPassword}
                    onChange={(e) => setTankPassword(e.target.value)}
                    disabled={Boolean(isRunning)}
                    autoComplete="current-password"
                    className="w-full px-3 py-2 text-sm border border-border rounded-sm bg-card"
                  />
                </label>
                <button
                  type="button"
                  disabled={Boolean(busy) || !tankUserId.trim() || !tankPassword}
                  onClick={() =>
                    runAction("login", async () => {
                      await crawlerLogin({
                        userId: tankUserId.trim(),
                        password: tankPassword,
                      });
                    })
                  }
                  className="px-4 py-2 text-sm font-semibold border border-border rounded-sm hover:bg-secondary/40 disabled:opacity-50 h-[38px]"
                >
                  {busy === "login" ? "로그인 중..." : "로그인"}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    runAction("tank-login-check", async () => {
                      await checkTankLoginV3();
                      setTankLoginChecked(true);
                    })
                  }
                  className={`px-4 py-2 text-sm font-semibold rounded-sm disabled:opacity-50 ${
                    tankLoginChecked
                      ? "border border-emerald-600 text-emerald-700 bg-emerald-50"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {busy === "tank-login-check"
                    ? "확인 중..."
                    : tankLoginChecked
                      ? "로그인 확인됨 ✓ (다시 확인)"
                      : "탱크옥션 로그인 확인"}
                </button>
                <p className="text-xs text-muted-foreground">
                  검색조건/주소 추가를 사용하려면 먼저 로그인을 확인해 주세요.
                  ({tankUserId || "환경변수에 저장된 계정"})
                </p>
              </div>
            )}
          </div>

          <CrawlerSearchPanel
            crawlerVersion={status?.remoteWorker ? undefined : "v3"}
            tankLoginChecked={tankLoginChecked}
            disabled={
              Boolean(busy) || isRunning || (!status?.remoteWorker && !tankLoginChecked)
            }
            onCollectStart={() => {
              setCollectingLocal(true);
              void refresh();
            }}
            onCollected={(result) => {
              setCollectingLocal(false);
              const raw = result.rawCount ?? result.urls.length;
              const parts: string[] = [];
              if (raw > 0) parts.push(`탱크 ${raw}건 수집`);
              parts.push(`작업목록 ${result.urls.length}건`);
              if (result.excluded) {
                parts.push(`DB중복·입찰기일 미도래 ${result.excluded}건 제외`);
              }
              if (result.deduped) parts.push(`목록 중복 ${result.deduped}건 제외`);
              if (result.naverRefresh) {
                parts.push(`네이버 미수집 ${result.naverRefresh}건 포함`);
              }
              setCollectSummary(
                result.urls.length === 0
                  ? `${parts.join(" · ")} — 추가된 URL 없음`
                  : parts.join(" · "),
              );
              if (repeatAfterCollect && result.urls.length > 0) {
                crawlerStart({
                  repeatAfterCollect: true,
                  crawlerVersion: status?.remoteWorker ? undefined : "v3",
                }).catch((err) => {
                  setError(
                    err instanceof Error
                      ? `자동 조회 시작 실패: ${err.message}`
                      : "자동 조회 시작 실패",
                  );
                });
              }
              void refresh();
            }}
            onCollectFinished={() => {
              setCollectingLocal(false);
              void refresh();
            }}
          />

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-2 text-sm">
                  <input
                    type="checkbox"
                    checked={repeatAfterCollect}
                    onChange={(e) => setRepeatAfterCollect(e.target.checked)}
                    disabled={Boolean(isRunning)}
                    className="accent-primary"
                  />
                  주소 추가 후 자동으로 조회 시작
                </label>
                <input
                  type="time"
                  value={scheduledTime}
                  readOnly
                  title="알고리즘 탭에서 예약 시간 설정"
                  className="px-3 py-2 text-sm border border-border rounded-sm bg-secondary/30"
                />
              </div>

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
                    value={status?.total ?? urls.length}
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

              <div className="border border-border rounded-sm h-64 overflow-y-auto bg-card">
                {urls.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground text-center">
                    수집된 URL이 없습니다.
                  </p>
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
                    {urls.map((entry, index) => (
                      <li
                        key={`${entry.url}-${index}`}
                        className="flex items-start gap-2 px-3 py-2 hover:bg-secondary/20"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(index)}
                          onChange={() => toggleSelect(index)}
                          className="mt-0.5 accent-primary"
                        />
                        <span className="break-all">{entry.label || entry.url}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <button
                  type="button"
                  disabled={Boolean(busy) || selected.size === 0}
                  onClick={() =>
                    runAction("remove", async () => {
                      await crawlerManageUrls({
                        action: "remove",
                        indices: Array.from(selected),
                      });
                      setSelected(new Set());
                    })
                  }
                  className="px-3 py-2 text-sm border border-border rounded-sm hover:bg-secondary/40 disabled:opacity-50"
                >
                  선택 삭제
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || urls.length === 0}
                  onClick={() =>
                    runAction("clear", async () => {
                      await crawlerManageUrls({ action: "clear" });
                      setSelected(new Set());
                    })
                  }
                  className="px-3 py-2 text-sm border border-border rounded-sm hover:bg-secondary/40 disabled:opacity-50"
                >
                  모두 삭제
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => excelRef.current?.click()}
                  className="px-3 py-2 text-sm border border-border rounded-sm hover:bg-secondary/40 disabled:opacity-50"
                >
                  불러오기
                </button>
                <input
                  ref={excelRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void runAction("load", async () => {
                      await crawlerLoadExcel(file);
                    });
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={Boolean(busy) || urls.length === 0}
                  title={
                    status?.remoteWorker
                      ? "관리자 PC 워커(Selenium)로 조회합니다."
                      : "브라우저 없이 HTTPX로 조회합니다(서버 자체 실행, 관리자 PC 불필요)."
                  }
                  onClick={() =>
                    runAction(
                      status?.phase === "crawling" ? "stop" : "start",
                      async () => {
                        if (status?.phase === "crawling") {
                          await crawlerStop();
                        } else {
                          await crawlerStart({
                            repeatAfterCollect,
                            crawlerVersion: status?.remoteWorker ? undefined : "v3",
                          });
                        }
                      },
                    )
                  }
                  className="px-3 py-2 text-sm font-semibold rounded-sm bg-emerald-600 text-white disabled:opacity-50"
                >
                  {busy === "start"
                    ? "시작 중..."
                    : busy === "stop"
                      ? "중단 중..."
                      : status?.phase === "crawling"
                        ? "조회 중단"
                        : "조회 시작"}
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="물건 URL 또는 경매번호_URL 형식"
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-sm"
                />
                <button
                  type="button"
                  disabled={Boolean(busy) || !manualUrl.trim()}
                  onClick={() =>
                    runAction("add", async () => {
                      await crawlerManageUrls({
                        action: "add",
                        url: manualUrl.trim(),
                      });
                      setManualUrl("");
                    })
                  }
                  className="px-4 py-2 text-sm border border-border rounded-sm hover:bg-secondary/40 disabled:opacity-50"
                >
                  추가
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(busy) || !isRunning}
                  onClick={() =>
                    runAction("stop", async () => {
                      await crawlerStop();
                    })
                  }
                  className="px-4 py-2 text-sm border border-red-200 text-red-700 rounded-sm hover:bg-red-50 disabled:opacity-50"
                >
                  작업 중단
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || isRunning}
                  onClick={() =>
                    runAction("backfillNaverId", async () => {
                      const result = await crawlerBackfillNaverIds();
                      if (result.message) {
                        setError("");
                      }
                    })
                  }
                  className="px-4 py-2 text-sm border border-[#03C75A]/40 text-[#03A94A] rounded-sm hover:bg-[#03C75A]/10 disabled:opacity-50"
                  title="네이버 ID가 없는 DB 물건만 탱크 페이지에서 N단지정보 ID를 수집합니다"
                >
                  {busy === "backfillNaverId" ? "ID 수집 중..." : "네이버 ID 수집"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || isRunning}
                  onClick={() =>
                    runAction("restartWorker", async () => {
                      await crawlerRestartWorker();
                    })
                  }
                  className="px-4 py-2 text-sm border border-amber-200 text-amber-800 rounded-sm hover:bg-amber-50 disabled:opacity-50"
                  title="Python 크롤러 코드 변경 후 반드시 실행"
                >
                  {busy === "restartWorker" ? "재시작 중..." : "워커 재시작"}
                </button>
              </div>
            </div>

            <div className="border border-border rounded-sm flex flex-col h-[520px]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/40">
                <span className="text-sm font-semibold">실행 로그</span>
                <button
                  type="button"
                  onClick={() =>
                    runAction("clearLogs", async () => {
                      await crawlerClearLogs();
                    })
                  }
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  로그 지우기
                </button>
              </div>
              <div
                ref={logRef}
                className="flex-1 overflow-y-auto p-3 space-y-1 text-xs font-mono"
              >
                {logs.length === 0 ? (
                  <p className="text-muted-foreground">로그가 없습니다.</p>
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

          <p className="text-xs text-muted-foreground">
            텔레그램 알림: <code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_CHAT_ID</code>
          </p>
        </div>
      )}
    </div>
  );
}
