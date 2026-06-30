"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Search, ExternalLink, ChevronDown, RotateCcw } from "lucide-react";
import type { AuctionItem } from "@/types/auction";
import { STATUS_LABELS } from "@/types/auction";
import {
  deleteMyAuction,
  fetchAuctionCount,
  fetchMyAuctions,
  getTemplateDownloadUrl,
  uploadAuctionExcel,
} from "@/lib/api";
import { clearAuthCookie, getAuthUser } from "@/lib/auth";
import { AuctionFormModal } from "../admin/AuctionFormModal";
import { AppHeader, HEADER_ACCENT_BAR, HEADER_BTN, HEADER_MUTED, HEADER_NAV_TRAILING, HEADER_TITLE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";
import { UpdatedBadge, formatAuctionImportMessage } from "@/components/UpdatedBadge";

function StatusBadge({ status }: { status: AuctionItem["status"] }) {
  const styles = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-sm border ${styles[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function ConsultantPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AuctionItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [counts, data] = await Promise.all([fetchAuctionCount(), fetchMyAuctions()]);
      setTotal(counts.total);
      setPendingCount(counts.pending);
      setItems(data);
    } catch {
      setItems([]);
      setTotal(0);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpload = async () => {
    if (!file) {
      setMessage({ type: "error", text: "업로드할 엑셀 파일을 선택해 주세요." });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const result = await uploadAuctionExcel(file);
      setMessage({
        type: "success",
        text: `${formatAuctionImportMessage(result)} 등록·갱신 요청되었습니다. 관리자 승인 후 검색 페이지에 노출됩니다.`,
      });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await loadData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "업로드에 실패했습니다.",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    clearAuthCookie();
    router.replace("/login");
  };

  const handleRowClick = (item: AuctionItem) => {
    if (item.status !== "pending") return;
    setEditingItem(item);
  };

  const handleDelete = async (item: AuctionItem) => {
    if (item.status !== "pending") return;
    if (!confirm("이 물건 등록 요청을 삭제할까요?")) return;

    setDeleting(true);
    setMessage(null);
    try {
      await deleteMyAuction(item.id);
      setMessage({ type: "success", text: "물건이 삭제되었습니다." });
      await loadData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "삭제에 실패했습니다.",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <AppHeader
        maxWidth="960"
        nav={
          <>
            <div className={HEADER_ACCENT_BAR} />
            <span className={HEADER_TITLE}>컨설턴트 · 물건 등록</span>
            <div className={HEADER_NAV_TRAILING}>
              <span className={`${HEADER_MUTED} hidden sm:inline`}>{getAuthUser()}</span>
              <Link href="/" className={HEADER_BTN}>
                <ChevronDown size={13} className="rotate-90" />
                검색 페이지
              </Link>
              <AccountNavLink />
              <button type="button" onClick={handleLogout} className={HEADER_BTN}>
                <LogOut size={13} />
                로그아웃
              </button>
            </div>
          </>
        }
      />

      <main className="max-w-[960px] mx-auto px-6 py-8 space-y-6">
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

        <div className="bg-card border border-border rounded-sm shadow-sm p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-lg font-bold text-foreground">물건 등록</h1>
              <p className="text-sm text-muted-foreground mt-1">
                엑셀 업로드 또는 수동 입력으로 물건을 등록할 수 있습니다. 승인 후 검색 페이지에 노출됩니다.
              </p>
            </div>
            <div className="text-right shrink-0 space-y-1">
              <p className="text-xs text-muted-foreground">내 등록 {total}건 · 승인대기 {pendingCount}건</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent transition-colors"
            >
              + 수동 등록
            </button>
            <a
              href={getTemplateDownloadUrl()}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary border border-primary/20 bg-primary/5 rounded-sm hover:bg-primary/10 transition-colors"
            >
              <ExternalLink size={14} />
              양식 다운로드
            </a>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) setFile(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-secondary/30"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="text-sm font-medium text-foreground">{file.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">엑셀 파일을 드래그하거나 클릭하여 선택</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            <Search size={14} />
            {uploading ? "업로드 중..." : "엑셀 업로드"}
          </button>
        </div>

        <div className="bg-card border border-border rounded-sm shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">내 등록 물건</h2>
              <p className="text-xs text-muted-foreground mt-1">
                승인 대기 물건은 클릭하여 수정하거나 삭제할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground border border-border rounded-sm hover:text-foreground"
            >
              <RotateCcw size={12} />
              새로고침
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">불러오는 중...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">등록한 물건이 없습니다.</p>
          ) : (
            <div className="border border-border rounded-sm overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-secondary/80">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2.5 text-left font-semibold">상태</th>
                    <th className="px-3 py-2.5 text-left font-semibold">경매번호</th>
                    <th className="px-3 py-2.5 text-left font-semibold">물건주소</th>
                    <th className="px-3 py-2.5 text-left font-semibold">입찰기일</th>
                    <th className="w-16 px-3 py-2.5 text-center font-semibold">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isPending = item.status === "pending";
                    return (
                    <tr
                      key={item.id}
                      onClick={() => handleRowClick(item)}
                      className={`border-b border-border hover:bg-secondary/20 transition-colors ${
                        isPending ? "cursor-pointer" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5"><StatusBadge status={item.status} /></td>
                      <td className="px-3 py-2.5 font-mono text-primary">
                        <span className="inline-flex items-center gap-1.5">
                          {item.auctionNo || "-"}
                          {item.isUpdated && <UpdatedBadge />}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 max-w-[280px] truncate" title={item.address}>{item.address || "-"}</td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">{item.bidDate || "-"}</td>
                      <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        {isPending ? (
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            disabled={deleting}
                            className="text-destructive hover:text-destructive/80 text-xs font-medium disabled:opacity-50"
                          >
                            삭제
                          </button>
                        ) : (
                          <span className="text-muted-foreground/40">-</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <AuctionFormModal
        mode="create"
        editScope="consultant"
        item={null}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={async (saved) => {
          setMessage({
            type: "success",
            text: saved.isUpdated
              ? "동일 경매번호 물건이 갱신되었습니다."
              : "등록 요청이 완료되었습니다. 관리자 승인을 기다려 주세요.",
          });
          await loadData();
        }}
      />

      <AuctionFormModal
        mode="edit"
        editScope="consultant"
        item={editingItem}
        open={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        onSaved={async (_saved) => {
          setMessage({ type: "success", text: "물건 정보가 수정되었습니다." });
          setEditingItem(null);
          await loadData();
        }}
      />
    </div>
  );
}
