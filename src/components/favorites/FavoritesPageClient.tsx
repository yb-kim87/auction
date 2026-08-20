"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, ClipboardList, FileText, Heart, LogOut, Target } from "lucide-react";
import type { AuctionItem } from "@/types/auction";
import { clearAuthCookie } from "@/lib/auth";
import {
  fetchAuctionsByIds,
  fetchFavorites,
  fetchRecommendations,
  addFavorite,
  removeFavorite,
  logoutUser,
  fetchMyBidPlans,
  fetchAssignments,
  type FavoriteItem,
  type BidPlanWithAuction,
  type AuctionAssignment,
} from "@/lib/api";
import { AuctionDetailModal } from "@/components/AuctionDetailModal";
import { RecommendCard, type LoanInfo } from "@/components/RecommendCard";
import { CaseStateBadge } from "@/components/CaseStateBadge";
import { formatWonShort, parseMoneyToWon } from "@/lib/investment-money";
import { AppHeader, HEADER_BTN, HEADER_NAV_TRAILING, HEADER_TAB_ACTIVE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";
import { useProfileStore } from "@/store/useProfileStore";

const UNCATEGORIZED = "미분류";

function PlanMetric({
  label,
  value,
  primary = false,
  positive,
}: {
  label: string;
  value: string;
  primary?: boolean;
  positive?: boolean;
}) {
  const valueClass = primary
    ? "text-primary"
    : positive === true
      ? "text-blue-600"
      : positive === false
        ? "text-red-500"
        : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 lg:block lg:text-right">
      <span className="text-[0.66rem] text-muted-foreground lg:hidden">{label}</span>
      <span className={`text-sm font-bold ${valueClass}`} style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>{value}</span>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { draft: "제출됨", reviewed: "코치 확인됨" };

/** 과제제출 탭의 항목 하나 — 제출 현황 표시 전용. 수정은 물건 상세의
 * 수익계산기(제출 당시와 동일한 화면)에서 하도록 안내한다(사용자 요청,
 * 2026-08-07: "그냥 아예 그쪽으로 가서 수정하게 하는건 어때?" — 이
 * 탭에 별도 수정 폼을 두면 메모/전화시세/안전마진은 고칠 수 있어도
 * 입찰가·매도가는 여기서 못 고쳐 혼란스러웠음). */
function AssignmentCard({
  assignment,
  itemAvailable,
  onOpenDetail,
}: {
  assignment: AuctionAssignment;
  itemAvailable: boolean;
  onOpenDetail: (auctionId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[0.68rem] font-semibold text-primary">{assignment.auctionNo || "사건번호 없음"}</span>
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-amber-700">
              {STATUS_LABEL[assignment.status] ?? assignment.status}
            </span>
          </div>
          <p className="mt-1 text-[0.82rem] font-semibold text-foreground">{assignment.address || "주소 정보 없음"}</p>
          <p className="mt-1 text-[0.68rem] text-muted-foreground">
            {new Date(assignment.updatedAt).toLocaleString("ko-KR")} 제출
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PlanMetric label="입찰가" value={formatWonShort(assignment.targetBidPrice)} />
          <PlanMetric label="예상 매도가" value={formatWonShort(assignment.finalMarketPrice)} />
          <PlanMetric
            label="최종수익"
            value={formatWonShort(assignment.finalProfit)}
            positive={assignment.finalProfit >= 0}
            primary
          />
          <button
            type="button"
            onClick={() => onOpenDetail(assignment.auctionId)}
            disabled={!itemAvailable}
            title={itemAvailable ? undefined : "물건 정보를 불러오는 중이거나 삭제된 물건입니다."}
            className="rounded-lg border border-primary/25 bg-primary/[0.05] px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/[0.1] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            물건 상세에서 수정
          </button>
        </div>
      </div>

      {assignment.memo && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">메모</span> · {assignment.memo}
        </p>
      )}

      {assignment.coachFeedback && (
        <div className="rounded-lg border border-primary/20 bg-primary/[0.05] px-3 py-2 text-xs text-foreground">
          <span className="font-semibold text-primary">코치 피드백</span> · {assignment.coachFeedback}
        </div>
      )}
    </div>
  );
}

export function FavoritesPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useProfileStore((s) => s.profile);
  const fetchProfile = useProfileStore((s) => s.fetchProfile);
  const clearProfile = useProfileStore((s) => s.clearProfile);

  // 관심물건/입찰계획/과제제출을 각각 독립된 쿼리로 관리한다 — 예전에는
  // Promise.all로 묶어 공용 .catch에서 실패 시 favorites까지 통째로 []로
  // 리셋했는데, 그러면 관심물건 조회 자체는 성공했는데도 입찰계획 쪽 API가
  // 실패하면 "내 물건" 화면에 관심물건이 0개로 잘못 표시되는 버그가 있었다
  // (사용자 리포트, 2026-08-04). React Query는 쿼리마다 에러 상태가
  // 독립적이라 이 문제를 자연스럽게 해결한다. favorites 쿼리키는 홈페이지와
  // 동일한 ["favorites"]를 써서 캐시를 공유한다.
  const favoritesQuery = useQuery({ queryKey: ["favorites"], queryFn: fetchFavorites });
  const bidPlansQuery = useQuery({ queryKey: ["my-bid-plans"], queryFn: fetchMyBidPlans });
  const assignmentsQuery = useQuery({ queryKey: ["my-assignments"], queryFn: fetchAssignments });
  const favorites = favoritesQuery.data ?? [];
  const bidPlans = bidPlansQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];

  // 관심물건 카드를 추천 물건 페이지와 동일한 카드(RecommendCard)로 보여주기
  // 위해 최소 필요자금/예상 수익 계산에 쓰는 loanInfoByItemId도 함께
  // 받아온다 — favoritesOnly=true는 예산/필터와 무관하게 관심등록한 물건
  // 전체를 반환한다(사용자 요청, 2026-08-05). 입찰계획/과제제출에는 있지만
  // 관심물건에는 없는 물건도 상세보기가 가능해야 하므로 함께 받아온다
  // (사용자 요청, 2026-08-07).
  const bidPlanIds = bidPlans.map((p) => p.auctionId);
  const assignmentIds = assignments.map((a) => a.auctionId);
  const itemsQuery = useQuery({
    queryKey: ["favorites-items", bidPlanIds, assignmentIds],
    queryFn: async () => {
      const res = await fetchRecommendations(undefined, { limit: 50, offset: 0 }, { favoritesOnly: true });
      const favIds = new Set(res.items.map((item) => item.id));
      const extraIds = new Set(
        [...bidPlanIds, ...assignmentIds].filter((id) => !favIds.has(id)),
      );
      const planOnlyIds = Array.from(extraIds);
      if (planOnlyIds.length === 0) {
        return { items: res.items, loanInfoByItemId: res.loanInfoByItemId ?? {} };
      }
      try {
        const extra = await fetchAuctionsByIds(planOnlyIds);
        return { items: [...res.items, ...extra], loanInfoByItemId: res.loanInfoByItemId ?? {} };
      } catch {
        return { items: res.items, loanInfoByItemId: res.loanInfoByItemId ?? {} };
      }
    },
    // 핵심 목록(관심물건/입찰계획/과제제출)이 먼저 자리를 잡은 뒤에만 보강
    // 조회를 시작한다(기존 useEffect가 첫 단계 완료 후에만 두 번째 단계를
    // 실행하던 순서를 그대로 유지).
    enabled: !bidPlansQuery.isPending && !assignmentsQuery.isPending,
  });
  const items = itemsQuery.data?.items ?? [];
  const loanInfoByItemId = itemsQuery.data?.loanInfoByItemId ?? {};
  const loading = favoritesQuery.isPending || bidPlansQuery.isPending || assignmentsQuery.isPending;

  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  const [selectedItemModalTab, setSelectedItemModalTab] = useState<"info" | "profit">("info");
  const [openAssignmentEditor, setOpenAssignmentEditor] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"favorites" | "plans" | "assignments">("favorites");

  // "/favorites?tab=assignments"로 들어오면 과제제출 탭을 바로 연다
  // (사용자 요청, 2026-08-07 — 과제제출 방식 변경으로 없어진 /assignments
  // 링크 대신 쓰는 안내용 쿼리 파라미터).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "assignments" || tab === "plans") setActiveTab(tab);
  }, []);

  const isAdmin = profile?.role === "admin";
  const isConsultant = profile?.role === "consultant";

  useEffect(() => {
    fetchProfile().catch(() => {});
  }, [fetchProfile]);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // ignore
    }
    clearAuthCookie();
    clearProfile();
    router.replace("/login");
  };

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (vars: { auctionId: string; next: boolean; category?: string | null; memo?: string | null }) => {
      if (vars.next) {
        await addFavorite(vars.auctionId, vars.category, vars.memo);
      } else {
        await removeFavorite(vars.auctionId);
      }
    },
    onMutate: async ({ auctionId, next, category, memo }) => {
      setFavoriteBusy(true);
      await queryClient.cancelQueries({ queryKey: ["favorites"] });
      const previous = queryClient.getQueryData<FavoriteItem[]>(["favorites"]);
      queryClient.setQueryData<FavoriteItem[]>(["favorites"], (prev = []) => {
        const withoutExisting = prev.filter((favorite) => favorite.auctionId !== auctionId);
        return next
          ? [...withoutExisting, { auctionId, category: category?.trim() || null, memo: memo?.trim() || null }]
          : withoutExisting;
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context) queryClient.setQueryData(["favorites"], context.previous);
    },
    onSettled: () => setFavoriteBusy(false),
  });

  async function handleToggleFavorite(auctionId: string, next: boolean, category?: string | null, memo?: string | null) {
    await toggleFavoriteMutation.mutateAsync({ auctionId, next, category, memo });
  }

  const itemById = useMemo(() => {
    const map = new Map<string, AuctionItem>();
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.auctionId)), [favorites]);
  const availableCapital = parseMoneyToWon(profile?.investableFunds ?? "");
  const firstTimeBuyer = profile?.firstTimeBuyer ?? false;
  const housingCount = profile?.housingCount ?? null;

  const groups = useMemo(() => {
    const byCategory = new Map<string, AuctionItem[]>();
    for (const fav of favorites) {
      const item = itemById.get(fav.auctionId);
      if (!item) continue;
      const key = fav.category?.trim() || UNCATEGORIZED;
      const list = byCategory.get(key) ?? [];
      list.push(item);
      byCategory.set(key, list);
    }
    const categories = Array.from(byCategory.keys()).sort((a, b) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b, "ko");
    });
    return { byCategory, categories };
  }, [favorites, itemById]);

  const visibleItems = useMemo(() => {
    if (!activeCategory) {
      // 전체 보기: 카테고리 순서대로 이어붙이되 중복 없이(하나의 물건이 한
      // 카테고리에만 속하므로 자연히 중복이 없다).
      return groups.categories.flatMap((c) => groups.byCategory.get(c) ?? []);
    }
    return groups.byCategory.get(activeCategory) ?? [];
  }, [activeCategory, groups]);

  return (
    <div className="min-h-screen bg-secondary/30">
      <AppHeader
        maxWidth="1400"
        nav={
          <>
            <Link href="/" className={HEADER_BTN}>
              추천 물건
            </Link>
            <Link href="/search" className={HEADER_BTN}>
              전체 검색
            </Link>
            {isConsultant && (
              <Link href="/consultant" className={HEADER_BTN}>
                컨설턴트
              </Link>
            )}
            <span className={HEADER_TAB_ACTIVE}>내 물건</span>
            <div className={HEADER_NAV_TRAILING}>
              <Link
                href="/courses/my"
                className={`${HEADER_BTN} border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10`}
              >
                강의실
              </Link>
              {isAdmin && (
                <Link href="/admin" className={HEADER_BTN}>
                  관리자
                </Link>
              )}
              <AccountNavLink name={profile?.name} />
              <button type="button" onClick={handleLogout} className={HEADER_BTN}>
                <LogOut size={16} />
                로그아웃
              </button>
            </div>
          </>
        }
      />

      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-primary" />
            <div>
              <h1 className="text-lg font-bold text-foreground">내 물건</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">관심 후보와 저장한 입찰 계획을 한곳에서 관리합니다.</p>
            </div>
          </div>
          <div className="inline-flex rounded-xl border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setActiveTab("favorites")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${activeTab === "favorites" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              <Heart size={14} /> 관심물건 <span className="opacity-75">{favorites.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("plans")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${activeTab === "plans" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              <FileText size={14} /> 입찰계획 <span className="opacity-75">{bidPlans.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("assignments")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${activeTab === "assignments" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              <ClipboardList size={14} /> 과제제출 <span className="opacity-75">{assignments.length}</span>
            </button>
            <Link href="/favorites/calendar" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary">
              <Calendar size={14} /> 입찰 달력
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-sm border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
            불러오는 중...
          </div>
        ) : activeTab === "favorites" ? (
          favorites.length === 0 ? (
          <div className="rounded-sm border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
            아직 등록한 관심물건이 없습니다. 물건 상세에서 "관심등록"을 눌러 추가해 보세요.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  activeCategory === null
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-secondary/60"
                }`}
              >
                전체 ({favorites.length})
              </button>
              {groups.categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    activeCategory === c
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-secondary/60"
                  }`}
                >
                  {c} ({groups.byCategory.get(c)?.length ?? 0})
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleItems.map((item) => {
                const fav = favorites.find((f) => f.auctionId === item.id);
                return (
                  <div key={item.id} className="space-y-1.5">
                    {fav?.memo && (
                      <div className="flex items-start gap-1.5 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2 text-[0.72rem] text-foreground">
                        <Heart size={12} className="mt-0.5 shrink-0 fill-current text-primary" />
                        <span className="line-clamp-2"><span className="font-semibold text-primary">메모</span> · {fav.memo}</span>
                      </div>
                    )}
                    <RecommendCard
                      item={item}
                      loanInfo={loanInfoByItemId[item.id]}
                      firstTimeBuyer={firstTimeBuyer}
                      housingCount={housingCount}
                      availableCapital={availableCapital}
                      isFavorite={favoriteIds.has(item.id)}
                      favoriteBusy={favoriteBusy}
                      onToggleFavorite={() => void handleToggleFavorite(item.id, !favoriteIds.has(item.id))}
                      onOpen={() => {
                        setSelectedItemModalTab("info");
                        setOpenAssignmentEditor(false);
                        setSelectedItem(item);
                      }}
                    />
                    {fav?.category && (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-[0.72rem] text-muted-foreground">
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{fav.category}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
          )
        ) : activeTab === "plans" ? (
          bidPlans.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
            <FileText size={28} className="mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm font-semibold text-foreground">저장한 입찰 계획이 없습니다.</p>
            <p className="mt-1 text-xs text-muted-foreground">물건 상세의 수익계산기에서 입찰가와 매도가를 설정한 후 계획을 저장해 보세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="hidden grid-cols-[minmax(15rem,1.5fr)_7rem_7rem_7rem_7rem_6rem] gap-3 border-b border-border bg-secondary/40 px-4 py-2.5 text-[0.68rem] font-semibold text-muted-foreground lg:grid">
                <span>물건</span><span className="text-right">계획 입찰가</span><span className="text-right">예상 매도가</span><span className="text-right">투입자금</span><span className="text-right">예상수익</span><span className="text-right">수익률</span>
              </div>
              {bidPlans.map((plan) => {
                const item = itemById.get(plan.auctionId);
                const auction = item ?? plan.auction;
                const profitRate = plan.requiredEquity && plan.requiredEquity > 0 && plan.finalProfit != null
                  ? (plan.finalProfit / plan.requiredEquity) * 100
                  : null;
                const hasFavorite = favoriteIds.has(plan.auctionId);
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      if (!item) return;
                      setSelectedItemModalTab("profit");
                      setOpenAssignmentEditor(false);
                      setSelectedItem(item);
                    }}
                    disabled={!item}
                    className="grid w-full gap-3 border-b border-border/70 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-secondary/25 disabled:cursor-default lg:grid-cols-[minmax(15rem,1.5fr)_7rem_7rem_7rem_7rem_6rem] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[0.68rem] font-semibold text-primary">{auction?.auctionNo ?? "삭제된 물건"}</span>
                        {hasFavorite && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-rose-600">관심물건</span>}
                        {item && <CaseStateBadge caseState={item.caseState} />}
                      </div>
                      <p className="mt-1 truncate text-[0.82rem] font-semibold text-foreground">{auction?.address ?? "물건 정보를 찾을 수 없습니다."}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Calendar size={11} />{auction?.bidDate || "입찰일 미정"}</span>
                        <span>{new Date(plan.updatedAt).toLocaleDateString("ko-KR")} 저장</span>
                      </div>
                      {plan.memo && <p className="mt-1.5 truncate text-[0.68rem] text-muted-foreground">메모 · {plan.memo}</p>}
                    </div>
                    <PlanMetric label="계획 입찰가" value={formatWonShort(plan.bidPrice)} />
                    <PlanMetric label="예상 매도가" value={formatWonShort(plan.salePrice)} />
                    <PlanMetric label="투입자금" value={plan.requiredEquity != null ? formatWonShort(plan.requiredEquity) : "-"} primary />
                    <PlanMetric label="예상수익" value={plan.finalProfit != null ? formatWonShort(plan.finalProfit) : "-"} positive={plan.finalProfit != null ? plan.finalProfit >= 0 : undefined} />
                    <PlanMetric label="수익률" value={profitRate != null ? `${profitRate.toFixed(1)}%` : "-"} positive={profitRate != null ? profitRate >= 0 : undefined} />
                  </button>
                );
              })}
            </div>
          </div>
          )
        ) : assignments.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
            <ClipboardList size={28} className="mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm font-semibold text-foreground">제출한 과제가 없습니다.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              물건 상세의 수익계산기에서 "과제제출" 버튼을 눌러 제출해 보세요.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                itemAvailable={itemById.has(assignment.auctionId)}
                onOpenDetail={(auctionId) => {
                  const item = itemById.get(auctionId);
                  if (!item) return;
                  setSelectedItemModalTab("profit");
                  setOpenAssignmentEditor(true);
                  setSelectedItem(item);
                }}
              />
            ))}
          </div>
        )}
      </main>

      <AuctionDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        editable={false}
        isAdmin={isAdmin}
        viewerRole={profile?.role ?? null}
        initialTab={selectedItemModalTab}
        initialShowAssignmentEditor={openAssignmentEditor}
        hasBidPlan={selectedItem ? bidPlans.some((p) => p.auctionId === selectedItem.id) : null}
        isFavorite={selectedItem ? favoriteIds.has(selectedItem.id) : false}
        favoriteBusy={favoriteBusy}
        favoriteMemo={selectedItem ? favorites.find((f) => f.auctionId === selectedItem.id)?.memo ?? null : null}
        favoriteCategory={selectedItem ? favorites.find((f) => f.auctionId === selectedItem.id)?.category ?? null : null}
        onToggleFavorite={
          selectedItem
            ? (next, category, memo) => handleToggleFavorite(selectedItem.id, next, category, memo)
            : undefined
        }
      />
    </div>
  );
}
