"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Search, ExternalLink, ChevronDown, RotateCcw } from "lucide-react";
import type { AuctionItem, UserProfile, UserRole } from "@/types/auction";
import { ROLE_LABELS, STATUS_LABELS } from "@/types/auction";
import {
  approveAuction,
  approveAuctions,
  rejectAuctions,
  deleteAllAuctions,
  deleteAuction,
  deleteAuctions,
  fetchAdminAuctions,
  fetchAuctionCount,
  fetchPendingAuctions,
  fetchUsers,
  getTemplateDownloadUrl,
  rejectAuction,
  updateUserRole,
  uploadAuctionExcel,
} from "@/lib/api";
import { clearAuthCookie } from "@/lib/auth";
import { AuctionFormModal } from "./AuctionFormModal";
import { AuctionChangeHistoryModal } from "@/components/AuctionChangeHistoryModal";
import { AppHeader, HEADER_ACCENT_BAR, HEADER_BTN, HEADER_NAV_TRAILING, HEADER_TITLE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";
import { UpdatedBadge, formatAuctionImportMessage } from "@/components/UpdatedBadge";
import { CrawlerWorkPanel } from "./CrawlerWorkPanel";
import { KnowledgePanel } from "./KnowledgePanel";

function formatRegisteredAt(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const y = String(date.getFullYear()).slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${d} ${h}:${min}`;
}

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

type AdminTab = "data" | "crawler" | "users" | "knowledge";

const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: "data", label: "물건/데이터 관리" },
  { id: "crawler", label: "크롤링 작업" },
  { id: "knowledge", label: "경매지식" },
  { id: "users", label: "회원권한 관리" },
];

function AdminTabs({
  active,
  onChange,
  pendingCount,
}: {
  active: AdminTab;
  onChange: (tab: AdminTab) => void;
  pendingCount: number;
}) {
  return (
    <div className="flex border-b border-border">
      {ADMIN_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`relative px-5 py-3 text-sm font-semibold transition-colors ${
            active === tab.id
              ? "text-primary border-b-2 border-primary -mb-px"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
          {tab.id === "data" && pendingCount > 0 && (
            <span className="ml-1.5 inline-flex min-w-[1.25rem] justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-sm bg-amber-100 text-amber-800 border border-amber-200">
              {pendingCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [pendingItems, setPendingItems] = useState<AuctionItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingSelectedIds, setPendingSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editingItem, setEditingItem] = useState<AuctionItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("data");
  const [historyItem, setHistoryItem] = useState<AuctionItem | null>(null);

  const loadCounts = useCallback(async () => {
    const counts = await fetchAuctionCount();
    setTotal(counts.total);
    setPendingCount(counts.pending);
  }, []);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const data = await fetchAdminAuctions();
      setItems(data);
      setSelectedIds(new Set());
    } catch {
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const data = await fetchPendingAuctions();
      setPendingItems(data);
      setPendingSelectedIds(new Set());
    } catch {
      setPendingItems([]);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      setUsers(await fetchUsers());
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    await Promise.all([loadCounts(), loadItems(), loadPending(), loadUsers()]);
  }, [loadCounts, loadItems, loadPending, loadUsers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFile = (selected: File | null) => {
    if (!selected) return;
    setFile(selected);
    setMessage(null);
  };

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
        text: `${formatAuctionImportMessage(result)} 등록·갱신되었습니다.`,
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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((item) => item.id)));
    }
  };

  const togglePendingSelect = (id: string) => {
    setPendingSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePendingSelectAll = () => {
    if (pendingSelectedIds.size === pendingItems.length) {
      setPendingSelectedIds(new Set());
    } else {
      setPendingSelectedIds(new Set(pendingItems.map((item) => item.id)));
    }
  };

  const handleApproveOne = async (id: string) => {
    setApproving(true);
    setMessage(null);
    try {
      await approveAuction(id);
      setMessage({ type: "success", text: "물건이 승인되었습니다." });
      await loadData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "승인에 실패했습니다.",
      });
    } finally {
      setApproving(false);
    }
  };

  const handleRejectOne = async (id: string) => {
    if (!confirm("이 물건을 반려할까요?")) return;
    setApproving(true);
    setMessage(null);
    try {
      await rejectAuction(id);
      setMessage({ type: "success", text: "물건이 반려되었습니다." });
      await loadData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "반려에 실패했습니다.",
      });
    } finally {
      setApproving(false);
    }
  };

  const handleApproveSelected = async () => {
    if (pendingSelectedIds.size === 0) {
      setMessage({ type: "error", text: "승인할 항목을 선택해 주세요." });
      return;
    }
    setApproving(true);
    setMessage(null);
    try {
      const result = await approveAuctions(Array.from(pendingSelectedIds));
      setMessage({ type: "success", text: `${result.approved}건이 승인되었습니다.` });
      await loadData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "일괄 승인에 실패했습니다.",
      });
    } finally {
      setApproving(false);
    }
  };

  const handleRejectSelected = async () => {
    if (pendingSelectedIds.size === 0) {
      setMessage({ type: "error", text: "반려할 항목을 선택해 주세요." });
      return;
    }
    if (!confirm(`선택한 ${pendingSelectedIds.size}건을 반려할까요?`)) return;

    setApproving(true);
    setMessage(null);
    try {
      const result = await rejectAuctions(Array.from(pendingSelectedIds));
      setMessage({ type: "success", text: `${result.rejected}건이 반려되었습니다.` });
      await loadData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "일괄 반려에 실패했습니다.",
      });
    } finally {
      setApproving(false);
    }
  };

  const handleDeleteOne = async (id: string) => {
    if (!confirm("이 물건을 DB에서 삭제할까요?")) return;

    setDeleting(true);
    setMessage(null);
    try {
      const result = await deleteAuction(id);
      setMessage({ type: "success", text: `${result.deleted}건이 삭제되었습니다.` });
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

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) {
      setMessage({ type: "error", text: "삭제할 항목을 선택해 주세요." });
      return;
    }
    if (!confirm(`선택한 ${selectedIds.size}건을 DB에서 삭제할까요?`)) return;

    setDeleting(true);
    setMessage(null);
    try {
      const result = await deleteAuctions(Array.from(selectedIds));
      setMessage({ type: "success", text: `${result.deleted}건이 삭제되었습니다.` });
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

  const handleDeleteAll = async () => {
    if (total === 0) return;
    if (!confirm(`DB에 등록된 ${total}건을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;

    setDeleting(true);
    setMessage(null);
    try {
      const result = await deleteAllAuctions();
      setMessage({ type: "success", text: `${result.deleted}건이 모두 삭제되었습니다.` });
      await loadData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "전체 삭제에 실패했습니다.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setRoleUpdating(userId);
    setMessage(null);
    try {
      await updateUserRole(userId, role);
      setMessage({ type: "success", text: "회원 권한이 변경되었습니다." });
      await loadUsers();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "권한 변경에 실패했습니다.",
      });
    } finally {
      setRoleUpdating(null);
    }
  };

  const handleLogout = () => {
    clearAuthCookie();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <AppHeader
        maxWidth="960"
        nav={
          <>
            <div className={HEADER_ACCENT_BAR} />
            <span className={HEADER_TITLE}>관리자</span>
            <div className={HEADER_NAV_TRAILING}>
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

        <div className="bg-card border border-border rounded-sm shadow-sm overflow-hidden">
          <AdminTabs active={activeTab} onChange={setActiveTab} pendingCount={pendingCount} />

          {activeTab === "data" && (
            <div className="p-6 space-y-6">
        <div>
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-lg font-bold text-foreground">승인 대기 물건</h1>
              <p className="text-sm text-muted-foreground mt-1">
                컨설턴트가 등록한 물건을 검토하고 승인하면 검색 페이지에 노출됩니다. 행을 클릭하면 수정할 수 있습니다.
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">승인 대기</p>
              <p className="text-2xl font-bold text-amber-600 font-mono mt-0.5">{pendingCount.toLocaleString()}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button
              type="button"
              onClick={handleApproveSelected}
              disabled={approving || pendingSelectedIds.size === 0}
              className="px-3 py-2 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-sm hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              선택 승인 ({pendingSelectedIds.size})
            </button>
            <button
              type="button"
              onClick={handleRejectSelected}
              disabled={approving || pendingSelectedIds.size === 0}
              className="px-3 py-2 text-xs font-medium text-destructive border border-destructive/25 bg-destructive/5 rounded-sm hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              선택 반려 ({pendingSelectedIds.size})
            </button>
            <button
              type="button"
              onClick={loadPending}
              disabled={loadingPending}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-sm hover:text-foreground transition-colors"
            >
              <RotateCcw size={12} />
              새로고침
            </button>
          </div>

          {loadingPending ? (
            <p className="text-sm text-muted-foreground py-8 text-center">불러오는 중...</p>
          ) : pendingItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">승인 대기 물건이 없습니다.</p>
          ) : (
            <div className="border border-border rounded-sm overflow-hidden">
              <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-secondary/80 backdrop-blur-sm">
                    <tr className="border-b border-border">
                      <th className="w-10 px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={pendingItems.length > 0 && pendingSelectedIds.size === pendingItems.length}
                          onChange={togglePendingSelectAll}
                          className="accent-primary"
                        />
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold">등록자</th>
                      <th className="px-3 py-2.5 text-left font-semibold">경매번호</th>
                      <th className="px-3 py-2.5 text-left font-semibold">물건주소</th>
                      <th className="px-3 py-2.5 text-left font-semibold">입찰기일</th>
                      <th className="w-36 px-3 py-2.5 text-center font-semibold">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingItems.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setEditingItem(item)}
                        className="border-b border-border hover:bg-secondary/20 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={pendingSelectedIds.has(item.id)}
                            onChange={() => togglePendingSelect(item.id)}
                            className="accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.submittedBy || "-"}</td>
                        <td className="px-3 py-2.5 font-mono text-primary whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            {item.auctionNo || "-"}
                            {item.isUpdated && <UpdatedBadge />}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[220px] truncate" title={item.address}>{item.address || "-"}</td>
                        <td className="px-3 py-2.5 font-mono text-muted-foreground whitespace-nowrap">{item.bidDate || "-"}</td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setHistoryItem(item)}
                            className="text-primary hover:text-accent text-xs font-medium mr-2"
                          >
                            이력
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveOne(item.id)}
                            disabled={approving}
                            className="text-emerald-600 hover:text-emerald-700 text-xs font-medium disabled:opacity-50 mr-2"
                          >
                            승인
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectOne(item.id)}
                            disabled={approving}
                            className="text-destructive hover:text-destructive/80 text-xs font-medium disabled:opacity-50"
                          >
                            반려
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-foreground">경매 물건 등록</h2>
              <p className="text-sm text-muted-foreground mt-1">
                엑셀 업로드 또는 수동 입력으로 물건을 등록할 수 있습니다. 관리자 등록은 즉시 검색 페이지에 노출됩니다.
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">DB 전체</p>
              <p className="text-2xl font-bold text-primary font-mono mt-0.5">{total.toLocaleString()}</p>
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
              handleFile(e.dataTransfer.files[0] ?? null);
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-secondary/30"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                <Search className="w-5 h-5 text-primary" />
              </div>
              {file ? (
                <>
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">클릭하여 다른 파일 선택</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">엑셀 파일을 드래그하거나 클릭하여 선택</p>
                  <p className="text-xs text-muted-foreground">.xlsx, .xls · 최대 10MB</p>
                </>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-sm hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Search size={14} />
              {uploading ? "업로드 중..." : "엑셀 업로드"}
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">DB 데이터 관리</h2>
              <p className="text-xs text-muted-foreground mt-1">
                행을 클릭하면 수정할 수 있습니다. 체크박스·삭제 버튼은 클릭해도 수정 창이 열리지 않습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={deleting || selectedIds.size === 0}
                className="px-3 py-2 text-xs font-medium text-destructive border border-destructive/25 rounded-sm hover:bg-destructive/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                선택 삭제 ({selectedIds.size})
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={deleting || total === 0}
                className="px-3 py-2 text-xs font-medium text-destructive border border-destructive/25 rounded-sm hover:bg-destructive/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                전체 삭제
              </button>
              <button
                type="button"
                onClick={loadData}
                disabled={loadingItems}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-sm hover:text-foreground transition-colors"
              >
                <RotateCcw size={12} />
                새로고침
              </button>
            </div>
          </div>

          {loadingItems ? (
            <p className="text-sm text-muted-foreground py-8 text-center">데이터를 불러오는 중...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">등록된 물건이 없습니다.</p>
          ) : (
            <div className="border border-border rounded-sm overflow-hidden">
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-secondary/80 backdrop-blur-sm">
                    <tr className="border-b border-border">
                      <th className="w-10 px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={items.length > 0 && selectedIds.size === items.length}
                          onChange={toggleSelectAll}
                          className="accent-primary"
                        />
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">상태</th>
                      <th className="px-3 py-2.5 text-left font-semibold">등록자</th>
                      <th className="px-3 py-2.5 text-left font-semibold">경매번호</th>
                      <th className="px-3 py-2.5 text-left font-semibold">물건주소</th>
                      <th className="px-3 py-2.5 text-left font-semibold">입찰기일</th>
                      <th className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">등록시간</th>
                      <th className="w-32 px-3 py-2.5 text-center font-semibold">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setEditingItem(item)}
                        className="border-b border-border hover:bg-secondary/20 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            className="accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={item.status} /></td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.submittedBy || "-"}</td>
                        <td className="px-3 py-2.5 font-mono text-primary whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            {item.auctionNo || "-"}
                            {item.isUpdated && <UpdatedBadge />}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[220px] truncate" title={item.address}>{item.address || "-"}</td>
                        <td className="px-3 py-2.5 font-mono text-muted-foreground whitespace-nowrap">{item.bidDate || "-"}</td>
                        <td className="px-2 py-2.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                          {formatRegisteredAt(item.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setHistoryItem(item)}
                            className="text-primary hover:text-accent text-xs font-medium mr-2"
                          >
                            이력
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOne(item.id)}
                            disabled={deleting}
                            className="text-destructive hover:text-destructive/80 text-xs font-medium disabled:opacity-50"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
            </div>
          )}

          {activeTab === "crawler" && <CrawlerWorkPanel />}

          {activeTab === "knowledge" && <KnowledgePanel />}

          {activeTab === "users" && (
            <div className="p-6">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-foreground">회원 권한 관리</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    회원에게 수강생 이상 등급을 부여하면 물건 검색 페이지에 접근할 수 있습니다.
                  </p>
                </div>
              </div>

              {loadingUsers ? (
                <p className="text-sm text-muted-foreground py-6 text-center">불러오는 중...</p>
              ) : users.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">등록된 회원이 없습니다.</p>
              ) : (
                <div className="border border-border rounded-sm overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-secondary/80">
                      <tr className="border-b border-border">
                        <th className="px-3 py-2.5 text-left font-semibold">아이디</th>
                        <th className="px-3 py-2.5 text-left font-semibold">이름</th>
                        <th className="px-3 py-2.5 text-left font-semibold">현재 권한</th>
                        <th className="px-3 py-2.5 text-left font-semibold">권한 변경</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-b border-border hover:bg-secondary/20">
                          <td className="px-3 py-2.5 font-mono">{user.username}</td>
                          <td className="px-3 py-2.5">{user.name}</td>
                          <td className="px-3 py-2.5">{ROLE_LABELS[user.role]}</td>
                          <td className="px-3 py-2.5">
                            {user.role === "admin" ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              <select
                                value={user.role}
                                disabled={roleUpdating === user.id}
                                onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                                className="px-2 py-1 text-xs border border-border rounded-sm bg-card disabled:opacity-50"
                              >
                                <option value="member">승인대기</option>
                                <option value="student">수강생</option>
                                <option value="consulting_student">컨설팅 수강생</option>
                                <option value="consultant">컨설턴트</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <AuctionFormModal
        mode="create"
        editScope="admin"
        item={null}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={async (saved) => {
          setMessage({
            type: "success",
            text: saved.isUpdated
              ? "동일 경매번호 물건이 갱신되었습니다."
              : "물건이 등록되었습니다. 검색 페이지에 즉시 노출됩니다.",
          });
          await loadData();
        }}
      />

      <AuctionFormModal
        mode="edit"
        editScope="admin"
        item={editingItem}
        open={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        onSaved={async (_saved) => {
          setMessage({ type: "success", text: "물건 정보가 수정되었습니다." });
          setEditingItem(null);
          await loadData();
        }}
      />

      <AuctionChangeHistoryModal
        item={historyItem}
        open={Boolean(historyItem)}
        onClose={() => setHistoryItem(null)}
      />
    </div>
  );
}
