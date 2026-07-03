"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  Loader2,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import type { CafeCrawlStatus, KnowledgeDraftItem, KnowledgeDraftStatus } from "@/types/auction";
import {
  approveKnowledgeDraft,
  cafeCrawlStart,
  cafeCrawlStop,
  cafeCheckLogin,
  cafeCollectUrls,
  cafeImportArticle,
  cafeLogin,
  cafeOpen,
  cafeOpenLogin,
  cafeRestartBrowser,
  deleteKnowledgeDraft,
  fetchCafeCollectedUrls,
  fetchCafeCrawlStatus,
  fetchCrawlerConfig,
  fetchKnowledgeDrafts,
  rejectKnowledgeDraft,
  structureKnowledgeDraft,
  structureKnowledgeDraftBatch,
  updateKnowledgeDraft,
} from "@/lib/api";

const DEFAULT_CAFE_URL = "https://cafe.naver.com/0113053470";
const CATEGORIES = ["권리분석", "대출", "가격분석", "투자전략", "기타"];

const STATUS_LABELS: Record<KnowledgeDraftStatus, string> = {
  raw: "수집됨",
  structured: "AI 정리됨",
  approved: "승인됨",
  rejected: "거절",
  skipped: "스킵",
};

export function CafeKnowledgePanel() {
  const [cafeUrl, setCafeUrl] = useState(DEFAULT_CAFE_URL);
  const [articleUrl, setArticleUrl] = useState("");
  const [maxArticles, setMaxArticles] = useState(30);
  const [maxPages, setMaxPages] = useState(10);
  const [naverUserId, setNaverUserId] = useState("");
  const [naverPassword, setNaverPassword] = useState("");
  const [naverLoggedIn, setNaverLoggedIn] = useState(false);
  const [crawlStatus, setCrawlStatus] = useState<CafeCrawlStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [collectedUrls, setCollectedUrls] = useState<
    Array<{ url: string; title?: string; articleId?: string }>
  >([]);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<KnowledgeDraftItem[]>([]);
  const [filter, setFilter] = useState<KnowledgeDraftStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    category: "권리분석",
    tags: "",
    content: "",
  });

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastImportedRef = useRef(0);

  const loadCollectedUrls = useCallback(async () => {
    try {
      const data = await fetchCafeCollectedUrls();
      setCollectedUrls(data.urls ?? []);
      setCollectedAt(data.collectedAt ?? null);
    } catch {
      // ignore
    }
  }, []);

  const loadDrafts = useCallback(async () => {
    try {
      const items = await fetchKnowledgeDrafts(
        filter === "all" ? undefined : filter,
      );
      setDrafts(items);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "초안 목록 로드 실패",
      });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const pollStatus = useCallback(async () => {
    try {
      const status = await fetchCafeCrawlStatus();
      setCrawlStatus(status);
      if (status.naverLoggedIn) setNaverLoggedIn(true);
      if (status.events?.length) {
        setLogs((prev) => [...prev, ...status.events!].slice(-100));
      }
      const imported = status.imported ?? 0;
      if (imported > lastImportedRef.current) {
        lastImportedRef.current = imported;
        await loadDrafts();
      }
      if (
        status.subPhase === "urls_ready" ||
        (status.phase === "idle" && (status.urlCollectTotal ?? 0) > 0)
      ) {
        await loadCollectedUrls();
      }
    } catch {
      // ignore polling errors
    }
  }, [loadDrafts, loadCollectedUrls]);

  useEffect(() => {
    void loadDrafts();
    void loadCollectedUrls();
    fetchCrawlerConfig()
      .then((config) => {
        if (config.naverCredentials?.userId) {
          setNaverUserId(config.naverCredentials.userId);
        }
        if (config.naverCredentials?.password) {
          setNaverPassword(config.naverCredentials.password);
        }
      })
      .catch(() => undefined);
  }, [loadDrafts, loadCollectedUrls]);

  useEffect(() => {
    void pollStatus();
    pollingRef.current = setInterval(() => void pollStatus(), 2000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [pollStatus]);

  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setEditForm({
      title: selected.title || selected.sourceTitle,
      category: selected.category || "기타",
      tags: selected.tags,
      content: selected.content || selected.rawContent.slice(0, 4000),
    });
  }, [selected]);

  async function handleNaverLogin() {
    const userId = naverUserId.trim();
    const password = naverPassword;
    if (!userId || !password) {
      setMessage({ type: "error", text: "네이버 ID와 비밀번호를 입력해 주세요." });
      return;
    }
    setBusy("login");
    setMessage({
      type: "success",
      text: "Chrome 창에서 네이버 로그인을 시도합니다. 창이 뜨지 않으면 「로그인 페이지 열기」를 눌러 주세요.",
    });
    try {
      const res = await cafeLogin({ userId, password });
      if (res.naverLoggedIn) {
        setNaverLoggedIn(true);
        setMessage({
          type: "success",
          text:
            res.message ??
            "네이버 로그인 완료. 정보는 저장되어 다음에도 사용됩니다.",
        });
        return;
      }
      setMessage({
        type: res.needsManualAuth ? "success" : "error",
        text:
          res.message ??
          "로그인에 실패했습니다. Chrome 창에서 추가 인증을 완료한 뒤 「로그인 확인」을 눌러 주세요.",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "네이버 로그인 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleRestartChrome() {
    setBusy("restart-chrome");
    try {
      const res = await cafeRestartBrowser();
      if (res.naverLoggedIn) setNaverLoggedIn(true);
      setMessage({
        type: "success",
        text:
          res.message ??
          `Chrome을 재시작했습니다.${res.currentUrl ? ` (${res.currentUrl})` : ""}`,
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Chrome 재시작 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenLoginPage() {
    setBusy("open-login");
    try {
      const res = await cafeOpenLogin();
      if (res.naverLoggedIn) setNaverLoggedIn(true);
      setMessage({
        type: "success",
        text:
          res.message ??
          "네이버 로그인 페이지를 열었습니다. Chrome 창에서 로그인해 주세요.",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "로그인 페이지 열기 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleCheckLogin() {
    setBusy("check-login");
    try {
      const res = await cafeCheckLogin();
      if (res.naverLoggedIn) setNaverLoggedIn(true);
      setMessage({
        type: res.naverLoggedIn ? "success" : "error",
        text: res.message ?? (res.naverLoggedIn ? "네이버 로그인됨" : "로그인 필요"),
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "로그인 확인 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenCafe() {
    setBusy("open");
    try {
      const res = await cafeOpen(cafeUrl);
      if (res.naverLoggedIn) setNaverLoggedIn(true);
      setMessage({ type: "success", text: res.message ?? "카페 페이지를 열었습니다." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "카페 열기 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleCollectUrlsOnly() {
    setBusy("collect-urls");
    setLogs([]);
    try {
      const res = await cafeCollectUrls({
        cafeUrl,
        maxArticles,
        maxPages,
        userId: naverUserId.trim() || undefined,
        password: naverPassword || undefined,
      });
      setMessage({
        type: "success",
        text: res.message ?? "URL 수집을 시작했습니다. Chrome 창과 아래 로그를 확인하세요.",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "URL 수집 시작 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleStartCrawl() {
    setBusy("crawl");
    setLogs([]);
    lastImportedRef.current = 0;
    try {
      const res = await cafeCrawlStart({
        cafeUrl,
        maxArticles,
        maxPages,
        userId: naverUserId.trim() || undefined,
        password: naverPassword || undefined,
      });
      setMessage({ type: "success", text: res.message ?? "수집을 시작했습니다. 글마다 본문을 긁어 초안에 저장합니다." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "수집 시작 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleImportSingleArticle() {
    const url = articleUrl.trim();
    if (!url.includes("cafe.naver.com")) {
      setMessage({ type: "error", text: "카페 글 URL을 입력해 주세요." });
      return;
    }
    setBusy("single");
    setLogs([]);
    lastImportedRef.current = 0;
    try {
      const res = await cafeImportArticle({
        articleUrl: url,
        cafeUrl,
        userId: naverUserId.trim() || undefined,
        password: naverPassword || undefined,
      });
      setMessage({
        type: "success",
        text: res.message ?? "단일 글 수집을 시작했습니다. 잠시 후 초안 목록을 확인하세요.",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "단일 글 수집 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleStopCrawl() {
    setBusy("stop");
    try {
      await cafeCrawlStop();
      setMessage({ type: "success", text: "중단 요청을 보냈습니다." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "중단 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleBatchStructure() {
    setBusy("batch");
    try {
      const res = await structureKnowledgeDraftBatch(20);
      setMessage({
        type: "success",
        text: `AI 정리 완료 — 성공 ${res.structured}건, 스킵 ${res.skipped}건, 실패 ${res.failed}건`,
      });
      await loadDrafts();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "일괄 정리 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleStructureOne(id: string) {
    setBusy(`structure-${id}`);
    try {
      await structureKnowledgeDraft(id);
      await loadDrafts();
      setMessage({ type: "success", text: "AI 정리가 완료되었습니다." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "AI 정리 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveEdit() {
    if (!selected) return;
    setBusy("save");
    try {
      await updateKnowledgeDraft(selected.id, editForm);
      await loadDrafts();
      setMessage({ type: "success", text: "초안을 저장했습니다." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "저장 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove(id: string) {
    if (!confirm("이 초안을 경매지식으로 승인·등록할까요?")) return;
    setBusy(`approve-${id}`);
    try {
      await updateKnowledgeDraft(id, editForm);
      await approveKnowledgeDraft(id);
      await loadDrafts();
      setSelectedId(null);
      setMessage({ type: "success", text: "경매지식으로 등록되었습니다." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "승인 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleReject(id: string) {
    setBusy(`reject-${id}`);
    try {
      await rejectKnowledgeDraft(id);
      await loadDrafts();
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "거절 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 초안을 삭제할까요?")) return;
    try {
      await deleteKnowledgeDraft(id);
      await loadDrafts();
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "삭제 실패",
      });
    }
  }

  const crawling =
    crawlStatus?.phase === "crawling" || crawlStatus?.phase === "collecting_urls";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">네이버 카페 → 경매지식</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          카페 글을 수집한 뒤 경매코치 AI가 권리분석·대출 등으로 정리합니다.
          승인하기 전까지 RAG에는 반영되지 않습니다.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-sm border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="border border-border rounded-sm p-4 space-y-4 bg-card">
        <h3 className="text-sm font-bold">1. 네이버 로그인</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          ID/비밀번호 입력 후 「네이버 로그인」을 누르면 Chrome에서 자동 입력합니다.
          캡차·2단계 인증이 뜨면 Chrome에서 직접 완료한 뒤 「로그인 확인」을 누르세요.
          Chrome 창이 안 뜨거나 503 오류가 나면 「Chrome 재시작」을 먼저 눌러 주세요.
          자동 입력이 안 되면 「로그인 페이지 열기」로 수동 로그인할 수 있습니다.
          <br />
          프로필 폴더(<code className="text-[11px]">data/crawler/chrome-profile-cafe</code>)는
          삭제하지 마세요.
        </p>
        <div className="grid gap-3 max-w-md sm:grid-cols-2">
          <label className="text-sm space-y-1 block">
            <span className="text-muted-foreground">네이버 ID</span>
            <input
              value={naverUserId}
              onChange={(e) => setNaverUserId(e.target.value)}
              autoComplete="username"
              className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
            />
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-muted-foreground">비밀번호</span>
            <input
              type="password"
              value={naverPassword}
              onChange={(e) => setNaverPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void handleNaverLogin()}
            className="px-3 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            {busy === "login" ? "로그인 중…" : "네이버 로그인"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void handleOpenLoginPage()}
            className="px-3 py-2 text-sm rounded-sm border border-border disabled:opacity-50"
          >
            {busy === "open-login" ? "열기 중…" : "로그인 페이지 열기"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void handleCheckLogin()}
            className="px-3 py-2 text-sm rounded-sm border border-border disabled:opacity-50"
          >
            {busy === "check" ? "확인 중…" : "로그인 확인"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void handleRestartChrome()}
            className="px-3 py-2 text-sm rounded-sm border border-amber-500/60 text-amber-800 dark:text-amber-200 disabled:opacity-50"
            title="Chrome이 뜨지 않거나 503 오류가 나면 먼저 눌러 주세요"
          >
            {busy === "restart-chrome" ? "재시작 중…" : "Chrome 재시작"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void handleOpenCafe()}
            className="px-3 py-2 text-sm rounded-sm border border-border"
          >
            카페 열기
          </button>
          <span
            className={`inline-flex items-center px-2 py-1 text-xs rounded-sm ${
              naverLoggedIn
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {naverLoggedIn ? "네이버 로그인됨" : "로그인 필요"}
          </span>
        </div>
      </section>

      <section className="border-2 border-primary/30 rounded-sm p-4 space-y-4 bg-card">
        <h3 className="text-sm font-bold">2. 글 URL 목록 가져오기 (1단계)</h3>
        <p className="text-xs text-muted-foreground">
          전체글 목록에서 <strong>글 주소만</strong> 먼저 수집합니다. 본문 열람은 하지 않습니다.
          수집된 URL은 아래 목록과 <code className="text-[11px]">data/crawler/cafe-collected-urls.json</code>에 저장됩니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy || crawling}
            onClick={() => void handleCollectUrlsOnly()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            {busy === "collect-urls" || crawlStatus?.subPhase === "urls_only" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : null}
            URL 목록만 가져오기
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void loadCollectedUrls()}
            className="px-3 py-2 text-sm rounded-sm border border-border disabled:opacity-50"
          >
            목록 새로고침
          </button>
          {collectedUrls.length > 0 ? (
            <button
              type="button"
              className="px-3 py-2 text-sm rounded-sm border border-border"
              onClick={() => {
                void navigator.clipboard.writeText(
                  collectedUrls.map((u) => u.url).join("\n"),
                );
                setMessage({ type: "success", text: "URL 목록을 클립보드에 복사했습니다." });
              }}
            >
              URL 전체 복사
            </button>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {collectedUrls.length > 0 ? (
            <>
              <strong>{collectedUrls.length}건</strong> URL 저장됨
              {collectedAt ? ` · ${new Date(collectedAt).toLocaleString("ko-KR")}` : ""}
            </>
          ) : (
            "아직 수집된 URL이 없습니다. 「URL 목록만 가져오기」를 눌러 주세요."
          )}
        </div>
        {collectedUrls.length > 0 ? (
          <div className="border border-border rounded-sm max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5 w-10">#</th>
                  <th className="text-left px-2 py-1.5">제목</th>
                  <th className="text-left px-2 py-1.5">URL</th>
                </tr>
              </thead>
              <tbody>
                {collectedUrls.map((item, i) => (
                  <tr key={`${item.url}-${i}`} className="border-t border-border/60">
                    <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-1.5 max-w-[200px] truncate" title={item.title}>
                      {item.title || item.articleId || "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline break-all"
                      >
                        {item.url}
                        <ExternalLink size={11} className="shrink-0" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {logs.length > 0 ? (
          <pre className="text-[11px] bg-secondary/40 rounded-sm p-3 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
            {logs.slice(-30).join("\n")}
          </pre>
        ) : null}
      </section>

      <section className="border border-border rounded-sm p-4 space-y-4 bg-card">
        <h3 className="text-sm font-bold">2-A. 단일 글 가져오기</h3>
        <p className="text-xs text-muted-foreground">
          마음에 드는 글 URL을 붙여넣으면 해당 글만 본문 수집 → 초안 목록에 추가됩니다.
        </p>
        <label className="text-sm space-y-1 block max-w-3xl">
          <span className="text-muted-foreground">카페 글 URL</span>
          <input
            value={articleUrl}
            onChange={(e) => setArticleUrl(e.target.value)}
            placeholder="https://cafe.naver.com/0113053470/123456789"
            className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
          />
        </label>
        <button
          type="button"
          disabled={!!busy || crawling}
          onClick={() => void handleImportSingleArticle()}
          className="px-3 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          이 글만 초안으로 가져오기
        </button>
      </section>

      <section className="border border-border rounded-sm p-4 space-y-4 bg-card">
        <h3 className="text-sm font-bold">2-B. 전체글 본문 수집 (2단계)</h3>
        <p className="text-xs text-muted-foreground">
          URL 목록 수집 후, 저장된 주소로 한 건씩 들어가 본문을 수집합니다.
          먼저 위 <strong>「URL 목록만 가져오기」</strong>로 주소가 나오는지 확인하세요.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl">
          <label className="text-sm space-y-1 block">
            <span className="text-muted-foreground">카페 URL</span>
            <input
              value={cafeUrl}
              onChange={(e) => setCafeUrl(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
            />
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-muted-foreground">최대 수집 글 수</span>
            <input
              type="number"
              min={1}
              max={200}
              value={maxArticles}
              onChange={(e) => setMaxArticles(Number(e.target.value) || 30)}
              className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
            />
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-muted-foreground">최대 목록 페이지</span>
            <input
              type="number"
              min={1}
              max={50}
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value) || 10)}
              className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy || crawling}
            onClick={() => void handleStartCrawl()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            {crawling ? <Loader2 size={14} className="animate-spin" /> : null}
            전체글 수집 시작
          </button>
          <button
            type="button"
            disabled={!!busy || !crawling}
            onClick={() => void handleStopCrawl()}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-sm border border-border disabled:opacity-50"
          >
            <Square size={13} />
            중단
          </button>
        </div>
        {crawlStatus && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              상태: {crawlStatus.phase}
              {crawlStatus.subPhase === "collecting_urls"
                ? " · URL 수집 중"
                : crawlStatus.subPhase === "reading_articles"
                  ? " · 글 열람 중"
                  : ""}
              {crawlStatus.urlCollectTotal
                ? ` · URL ${crawlStatus.urlCollectTotal}건`
                : ""}
              {crawlStatus.total
                ? ` · 진행 ${crawlStatus.completed ?? 0}/${crawlStatus.total}`
                : ""}
              {crawlStatus.imported != null ? ` · 저장 ${crawlStatus.imported}건` : ""}
              {crawlStatus.skipped ? ` · 중복 ${crawlStatus.skipped}건` : ""}
              {crawlStatus.lastMessage ? ` · ${crawlStatus.lastMessage}` : ""}
            </p>
            {crawlStatus.collectedUrls && crawlStatus.collectedUrls.length > 0 ? (
              <div className="text-xs border border-border rounded-sm p-2 max-h-32 overflow-y-auto bg-muted/30">
                <p className="font-semibold mb-1">수집된 글 URL (미리보기)</p>
                <ul className="space-y-0.5">
                  {crawlStatus.collectedUrls.slice(0, 8).map((item, i) => (
                    <li key={`${item.url}-${i}`} className="truncate">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {item.title || item.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
        {logs.length > 0 && (
          <pre className="text-[11px] bg-secondary/40 rounded-sm p-3 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
            {logs.slice(-25).join("\n")}
          </pre>
        )}
      </section>

      <section className="border border-border rounded-sm p-4 space-y-4 bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold">3. 초안 검토 · 승인</h3>
          <div className="flex flex-wrap gap-2">
            <select
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as KnowledgeDraftStatus | "all")
              }
              className="px-2 py-1.5 text-sm border border-border rounded-sm bg-background"
            >
              <option value="all">전체</option>
              <option value="raw">수집됨</option>
              <option value="structured">AI 정리됨</option>
              <option value="approved">승인됨</option>
              <option value="rejected">거절</option>
              <option value="skipped">스킵</option>
            </select>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void handleBatchStructure()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-sm border border-border disabled:opacity-50"
            >
              <Sparkles size={14} />
              AI 일괄 정리 (20건)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-border rounded-sm overflow-hidden max-h-[420px] overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">불러오는 중...</p>
            ) : drafts.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                수집된 초안이 없습니다. 위에서 카페 수집을 실행하세요.
              </p>
            ) : (
              <ul>
                {drafts.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-border hover:bg-secondary/30 ${
                        selectedId === item.id ? "bg-secondary/50" : ""
                      }`}
                    >
                      <div className="text-sm font-medium truncate">
                        {item.title || item.sourceTitle || "(제목 없음)"}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex gap-2">
                        <span>{STATUS_LABELS[item.status]}</span>
                        {item.category && <span>{item.category}</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-border rounded-sm p-4 space-y-3 min-h-[280px]">
            {!selected ? (
              <p className="text-sm text-muted-foreground">왼쪽에서 초안을 선택하세요.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">원문</p>
                    <a
                      href={selected.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary inline-flex items-center gap-1"
                    >
                      {selected.sourceTitle || "카페 글"}
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-sm bg-secondary">
                    {STATUS_LABELS[selected.status]}
                  </span>
                </div>

                {selected.aiNote && (
                  <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
                    AI 메모: {selected.aiNote}
                  </p>
                )}

                {selected.errorMessage && (
                  <p className="text-xs text-destructive">{selected.errorMessage}</p>
                )}

                <label className="block text-sm space-y-1">
                  <span className="text-muted-foreground">제목</span>
                  <input
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, title: e.target.value }))
                    }
                    className="w-full px-2 py-1.5 border border-border rounded-sm bg-background text-sm"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-sm space-y-1">
                    <span className="text-muted-foreground">분류</span>
                    <select
                      value={editForm.category}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, category: e.target.value }))
                      }
                      className="w-full px-2 py-1.5 border border-border rounded-sm bg-background text-sm"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm space-y-1">
                    <span className="text-muted-foreground">태그</span>
                    <input
                      value={editForm.tags}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, tags: e.target.value }))
                      }
                      className="w-full px-2 py-1.5 border border-border rounded-sm bg-background text-sm"
                    />
                  </label>
                </div>

                <label className="block text-sm space-y-1">
                  <span className="text-muted-foreground">내용 (승인 시 경매지식으로 등록)</span>
                  <textarea
                    value={editForm.content}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, content: e.target.value }))
                    }
                    rows={8}
                    className="w-full px-2 py-1.5 border border-border rounded-sm bg-background text-sm resize-y"
                  />
                </label>

                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">원문 보기</summary>
                  <pre className="mt-2 p-2 bg-secondary/30 rounded-sm max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {selected.rawContent.slice(0, 3000)}
                  </pre>
                </details>

                <div className="flex flex-wrap gap-2 pt-1">
                  {(selected.status === "raw" || selected.errorMessage) && (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void handleStructureOne(selected.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-sm border border-border"
                    >
                      <Sparkles size={13} />
                      AI 정리
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void handleSaveEdit()}
                    className="px-3 py-1.5 text-sm rounded-sm border border-border"
                  >
                    저장
                  </button>
                  {selected.status !== "approved" && (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void handleApprove(selected.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-sm bg-emerald-600 text-white"
                    >
                      <Check size={13} />
                      승인·등록
                    </button>
                  )}
                  {selected.status !== "rejected" && selected.status !== "approved" && (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void handleReject(selected.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-sm border border-border"
                    >
                      <X size={13} />
                      거절
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(selected.id)}
                    className="px-3 py-1.5 text-sm text-destructive"
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
