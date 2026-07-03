"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  fetchAdminAuctions,
  fetchAiFeatureHistory,
  fetchAiFeatureList,
  fetchAiTagHistory,
  fetchAiTagList,
  fetchNormalizedDataHistory,
  fetchNormalizedDataList,
  regenerateAiFeatures,
  regenerateAiTags,
  regenerateNormalizedData,
  updateAiFeature,
  updateAiManualTags,
  updateNormalizedData,
  type AiFeatureRow,
  type AiPlatformHistoryEntry,
  type AiTagRow,
  type NormalizedDataRow,
} from "@/lib/api";
import type { AuctionItem } from "@/types/auction";

type EngineKey = "normalizer" | "feature" | "tag";
type Row = NormalizedDataRow | AiFeatureRow | AiTagRow;

const ENGINE_LABEL: Record<EngineKey, string> = {
  normalizer: "Normalized Data",
  feature: "Feature",
  tag: "Tag",
};

function getPrimaryJson(engine: EngineKey, row: Row): Record<string, unknown> {
  if (engine === "normalizer") return (row as NormalizedDataRow).normalizedData;
  if (engine === "feature") return (row as AiFeatureRow).features;
  return { finalTags: (row as AiTagRow).finalTags, manualTags: (row as AiTagRow).manualTags, autoTags: (row as AiTagRow).autoTags };
}

function getSourcesJson(engine: EngineKey, row: Row): Record<string, unknown> {
  if (engine === "normalizer") return (row as NormalizedDataRow).normalizedSources;
  if (engine === "feature") return (row as AiFeatureRow).featureSources;
  return (row as AiTagRow).tagSources;
}

export function AiPlatformPanel({ engine }: { engine: EngineKey }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [regenerating, setRegenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [history, setHistory] = useState<AiPlatformHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const auctionById = useMemo(() => {
    const map = new Map<string, AuctionItem>();
    auctions.forEach((a) => map.set(a.id, a));
    return map;
  }, [auctions]);

  async function load() {
    setLoading(true);
    try {
      const [rowsData, auctionsData] = await Promise.all([
        engine === "normalizer"
          ? fetchNormalizedDataList()
          : engine === "feature"
            ? fetchAiFeatureList()
            : fetchAiTagList(),
        fetchAdminAuctions(),
      ]);
      setRows(rowsData);
      setAuctions(auctionsData);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    setSelectedIds(new Set());
    setDetailItemId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  function toggleSelect(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function handleRegenerate(scope: "all" | "selected") {
    setRegenerating(true);
    setMessage(null);
    try {
      const itemIds = scope === "selected" ? Array.from(selectedIds) : undefined;
      if (scope === "selected" && (!itemIds || itemIds.length === 0)) {
        setMessage("재생성할 물건을 선택해 주세요.");
        return;
      }
      const fn =
        engine === "normalizer"
          ? regenerateNormalizedData
          : engine === "feature"
            ? regenerateAiFeatures
            : regenerateAiTags;
      const result = await fn(itemIds);
      setMessage(`${result.count}건 재생성되었습니다.`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "재생성에 실패했습니다.");
    } finally {
      setRegenerating(false);
    }
  }

  async function openDetail(row: Row) {
    setDetailItemId(row.itemId);
    setEditText(JSON.stringify(getPrimaryJson(engine, row), null, 2));
    setHistoryLoading(true);
    try {
      const fn =
        engine === "normalizer"
          ? fetchNormalizedDataHistory
          : engine === "feature"
            ? fetchAiFeatureHistory
            : fetchAiTagHistory;
      setHistory(await fn(row.itemId));
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleSaveEdit() {
    if (!detailItemId) return;
    setSaving(true);
    setMessage(null);
    try {
      const parsed = JSON.parse(editText);
      if (engine === "normalizer") {
        await updateNormalizedData(detailItemId, parsed);
      } else if (engine === "feature") {
        await updateAiFeature(detailItemId, parsed);
      } else {
        const manualTags = Array.isArray(parsed.manualTags) ? parsed.manualTags : null;
        await updateAiManualTags(detailItemId, manualTags);
      }
      setMessage("저장되었습니다.");
      await load();
      const refreshed = (
        engine === "normalizer"
          ? await fetchNormalizedDataList()
          : engine === "feature"
            ? await fetchAiFeatureList()
            : await fetchAiTagList()
      ).find((r) => r.itemId === detailItemId);
      if (refreshed) await openDetail(refreshed);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "저장에 실패했습니다. JSON 형식을 확인해 주세요.",
      );
    } finally {
      setSaving(false);
    }
  }

  const detailRow = rows.find((r) => r.itemId === detailItemId) ?? null;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">{ENGINE_LABEL[engine]} 관리</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {engine === "normalizer" && "원본 물건 데이터를 표준값으로 정규화한 결과입니다."}
            {engine === "feature" && "정규화 데이터를 기반으로 생성된 Feature입니다."}
            {engine === "tag" && "Feature 기반 자동 태그와 관리자 수동 태그(final_tags 우선)입니다."}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleRegenerate("selected")}
            disabled={regenerating}
            className="px-3 py-2 text-xs font-medium border border-border rounded-sm hover:bg-secondary/40 disabled:opacity-50"
          >
            선택 재생성 ({selectedIds.size})
          </button>
          <button
            type="button"
            onClick={() => handleRegenerate("all")}
            disabled={regenerating}
            className="px-3 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent disabled:opacity-50"
          >
            {regenerating ? "재생성 중..." : "전체 재생성"}
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-sm hover:text-foreground"
          >
            <RotateCcw size={12} />
            새로고침
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        <div className="border border-border rounded-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-secondary/80 backdrop-blur-sm">
                <tr className="border-b border-border">
                  <th className="w-10 px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && selectedIds.size === rows.length}
                      onChange={() =>
                        setSelectedIds(
                          selectedIds.size === rows.length
                            ? new Set()
                            : new Set(rows.map((r) => r.itemId)),
                        )
                      }
                      className="accent-primary"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold">경매번호</th>
                  <th className="px-3 py-2.5 text-left font-semibold">물건주소</th>
                  <th className="px-3 py-2.5 text-left font-semibold">요약</th>
                  <th className="w-16 px-3 py-2.5 text-center font-semibold">버전</th>
                  <th className="w-32 px-3 py-2.5 text-left font-semibold">수정시각</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      불러오는 중...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      데이터가 없습니다. &quot;전체 재생성&quot;을 눌러 생성해 주세요.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const auction = auctionById.get(row.itemId);
                    const summary = JSON.stringify(getPrimaryJson(engine, row)).slice(0, 60);
                    return (
                      <tr
                        key={row.id}
                        onClick={() => openDetail(row)}
                        className={`border-b border-border hover:bg-secondary/20 cursor-pointer transition-colors ${
                          detailItemId === row.itemId ? "bg-primary/5" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.itemId)}
                            onChange={() => toggleSelect(row.itemId)}
                            className="accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-primary whitespace-nowrap">
                          {auction?.auctionNo || row.itemId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2.5 max-w-[220px] truncate" title={auction?.address}>
                          {auction?.address || "-"}
                        </td>
                        <td className="px-3 py-2.5 max-w-[280px] truncate text-muted-foreground" title={summary}>
                          {summary}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono">{row.version}</td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                          {new Date(row.updatedAt).toLocaleString("ko-KR")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border border-border rounded-sm p-4 max-h-[560px] overflow-y-auto">
          {!detailRow ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              행을 클릭하면 상세 데이터와 이력을 확인할 수 있습니다.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  {engine === "tag" ? "final_tags / manual_tags / auto_tags 편집" : "데이터 편집"}
                </p>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={10}
                  className="w-full font-mono text-[11px] border border-border rounded-sm p-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="mt-2 px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-sm disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "수정 저장"}
                </button>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">생성 근거(sources)</p>
                <pre className="text-[10px] bg-secondary/20 border border-border rounded-sm p-2 overflow-x-auto">
                  {JSON.stringify(getSourcesJson(engine, detailRow), null, 2)}
                </pre>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">변경 이력</p>
                {historyLoading ? (
                  <p className="text-xs text-muted-foreground">불러오는 중...</p>
                ) : history.length === 0 ? (
                  <p className="text-xs text-muted-foreground">이력이 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {history.map((h) => (
                      <li key={h.id} className="text-[11px] border border-border rounded-sm p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold">
                            {h.actionType === "auto_generate"
                              ? "자동 생성"
                              : h.actionType === "manual_update"
                                ? "관리자 수정"
                                : "재생성"}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(h.createdAt).toLocaleString("ko-KR")} · {h.changedBy}
                          </span>
                        </div>
                        <pre className="whitespace-pre-wrap break-all text-muted-foreground">
                          {h.afterData}
                        </pre>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
