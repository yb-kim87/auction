"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarDays, FileText, Heart, ClipboardCheck, LogOut } from "lucide-react";
import { AppHeader, HEADER_BTN, HEADER_NAV_TRAILING, HEADER_TAB_ACTIVE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";
import { clearAuthCookie } from "@/lib/auth";
import {
  fetchAuctionsByIds,
  fetchFavorites,
  fetchMyBidPlans,
  fetchAssignments,
  logoutUser,
  type BidPlanWithAuction,
  type FavoriteItem,
  type AuctionAssignment,
} from "@/lib/api";
import type { AuctionItem } from "@/types/auction";
import { useProfileStore } from "@/store/useProfileStore";

type Filter = "all" | "favorite" | "plan" | "assignment";
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (value?: string | null) => value ? value.trim().slice(0, 10).replaceAll("/", "-").replaceAll(".", "-") : "";
const dday = (value: string) => Math.ceil((new Date(`${value}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);

export function BidCalendarPageClient() {
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const fetchProfile = useProfileStore((s) => s.fetchProfile);
  const clearProfile = useProfileStore((s) => s.clearProfile);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const favoritesQuery = useQuery({ queryKey: ["favorites"], queryFn: fetchFavorites });
  const plansQuery = useQuery({ queryKey: ["my-bid-plans"], queryFn: fetchMyBidPlans });
  const assignmentsQuery = useQuery({ queryKey: ["my-assignments"], queryFn: fetchAssignments });
  const favorites = favoritesQuery.data ?? [];
  const plans = plansQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];
  const plansSettled = !plansQuery.isPending;
  const assignmentsSettled = !assignmentsQuery.isPending;
  const auctionIds = Array.from(
    new Set([
      ...favorites.map((x) => x.auctionId),
      ...plans.map((x) => x.auctionId),
      ...assignments.map((x) => x.auctionId),
    ]),
  );
  const itemsQuery = useQuery({
    queryKey: ["bid-calendar-items", auctionIds],
    queryFn: () => (auctionIds.length ? fetchAuctionsByIds(auctionIds) : Promise.resolve([])),
    enabled: !favoritesQuery.isPending && plansSettled && assignmentsSettled,
  });
  const items = itemsQuery.data ?? [];
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const loading = favoritesQuery.isPending || plansQuery.isPending || assignmentsQuery.isPending;

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

  const favoriteIds = useMemo(() => new Set(favorites.map(x => x.auctionId)), [favorites]);
  const planById = useMemo(() => new Map(plans.map(x => [x.auctionId, x])), [plans]);
  const assignmentById = useMemo(() => new Map(assignments.map(x => [x.auctionId, x])), [assignments]);
  const events = useMemo(
    () => items.filter(item =>
      filter === "all" ||
      (filter === "favorite" && favoriteIds.has(item.id)) ||
      (filter === "plan" && planById.has(item.id)) ||
      (filter === "assignment" && assignmentById.has(item.id))
    ),
    [items, filter, favoriteIds, planById, assignmentById],
  );
  const first = new Date(month.getFullYear(), month.getMonth(), 1); const start = (first.getDay() + 6) % 7; const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((start + days) / 7) * 7 }, (_, i) => i - start + 1);
  const selectedEvents = events.filter(x => keyOf(x.bidDate) === selected);

  return (
    <>
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
      <main className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarDays className="text-primary" />입찰 달력</h1>
            <p className="mt-1 text-sm text-muted-foreground">관심물건, 입찰계획, 과제제출의 입찰일을 한눈에 확인하세요.</p>
          </div>
          <div className="flex gap-2">
            {([['all', '전체'], ['favorite', '관심물건'], ['plan', '입찰계획'], ['assignment', '과제제출']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} className={`rounded-lg border px-3 py-2 text-sm ${filter === v ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>{l}</button>
            ))}
          </div>
        </div>
        <section className="rounded-2xl border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg border p-2"><ChevronLeft size={18} /></button>
            <h2 className="text-lg font-bold">{month.getFullYear()}년 {month.getMonth() + 1}월</h2>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg border p-2"><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 border-l border-t text-center text-xs">
            <div className="contents">{['월', '화', '수', '목', '금', '토', '일'].map(x => <div key={x} className="border-b border-r bg-secondary/40 p-2 font-semibold">{x}</div>)}</div>
            {cells.map((day, i) => {
              const date = day > 0 && day <= days ? `${month.getFullYear()}-${pad(month.getMonth() + 1)}-${pad(day)}` : "";
              const ev = events.filter(x => keyOf(x.bidDate) === date);
              return (
                <button key={i} onClick={() => date && setSelected(date)} className={`min-h-24 border-b border-r p-2 text-left align-top hover:bg-secondary/40 ${date === selected ? 'bg-primary/10' : ''}`}>
                  <span className="text-xs font-semibold">{date && day}</span>
                  {ev.slice(0, 3).map(x => (
                    <span key={x.id} className={`mt-1 block truncate rounded px-1 py-0.5 text-[10px] ${planById.has(x.id) ? 'bg-violet-100 text-violet-700' : assignmentById.has(x.id) ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{x.auctionNo}</span>
                  ))}
                  {ev.length > 3 && <span className="text-[10px] text-muted-foreground">+{ev.length - 3}건</span>}
                </button>
              );
            })}
          </div>
        </section>
        {loading ? (
          <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">입찰 일정을 불러오는 중...</p>
        ) : selected && (
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-bold">{selected} 입찰 일정 ({selectedEvents.length}건)</h2>
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">등록된 일정이 없습니다.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {selectedEvents.map(item => {
                  const plan = planById.get(item.id);
                  const assignment = assignmentById.get(item.id);
                  const n = dday(keyOf(item.bidDate));
                  return (
                    <article key={item.id} className="rounded-xl border p-4">
                      <div className="flex items-center justify-between">
                        <b>{item.auctionNo}</b>
                        <span className={n <= 1 ? 'text-red-500' : 'text-primary'}>{n < 0 ? '종료' : n === 0 ? '오늘 입찰' : `D-${n}`}</span>
                      </div>
                      <p className="mt-1 truncate text-sm">{item.address}</p>
                      <p className="mt-2 text-xs text-muted-foreground">최저입찰가 {item.minPrice?.toLocaleString()}원 {plan && ` · 계획 입찰가 ${plan.bidPrice.toLocaleString()}원`}</p>
                      <div className="mt-3 flex gap-2 text-xs">
                        {favoriteIds.has(item.id) && <span className="flex items-center gap-1 text-rose-600"><Heart size={13} />관심물건</span>}
                        {plan && <span className="flex items-center gap-1 text-violet-600"><FileText size={13} />입찰계획</span>}
                        {assignment && <span className="flex items-center gap-1 text-emerald-600"><ClipboardCheck size={13} />과제제출</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}
