"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, FileText, Heart } from "lucide-react";
import { AppHeader, HEADER_BTN } from "@/components/AppHeader";
import { fetchAuctionsByIds, fetchFavorites, fetchMyBidPlans, type BidPlanWithAuction, type FavoriteItem } from "@/lib/api";
import type { AuctionItem } from "@/types/auction";

type Filter = "all" | "favorite" | "plan";
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (value?: string | null) => value ? value.slice(0, 10).replaceAll("/", "-") : "";
const dday = (value: string) => Math.ceil((new Date(`${value}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);

export default function BidCalendarPage() {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [plans, setPlans] = useState<BidPlanWithAuction[]>([]);
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([fetchFavorites(), fetchMyBidPlans()]).then(async ([f, p]) => {
      const fav = f.status === "fulfilled" ? f.value : []; const plan = p.status === "fulfilled" ? p.value : [];
      setFavorites(fav); setPlans(plan);
      const ids = Array.from(new Set([...fav.map(x => x.auctionId), ...plan.map(x => x.auctionId)]));
      if (ids.length) setItems(await fetchAuctionsByIds(ids).catch(() => []));
      setLoading(false);
    });
  }, []);

  const favoriteIds = useMemo(() => new Set(favorites.map(x => x.auctionId)), [favorites]);
  const planById = useMemo(() => new Map(plans.map(x => [x.auctionId, x])), [plans]);
  const events = useMemo(() => items.filter(item => filter === "all" || (filter === "favorite" && favoriteIds.has(item.id)) || (filter === "plan" && planById.has(item.id))), [items, filter, favoriteIds, planById]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1); const start = (first.getDay() + 6) % 7; const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((start + days) / 7) * 7 }, (_, i) => i - start + 1);
  const selectedEvents = events.filter(x => keyOf(x.bidDate) === selected);
  return <><AppHeader nav={<><Link className={HEADER_BTN} href="/">추천 물건</Link><Link className={HEADER_BTN} href="/favorites">내 물건</Link><Link className={HEADER_BTN} href="/favorites?tab=assignments">과제</Link></>} /><main className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarDays className="text-primary"/>입찰 달력</h1><p className="mt-1 text-sm text-muted-foreground">관심물건과 입찰계획의 입찰일을 한눈에 확인하세요.</p></div><div className="flex gap-2">{([['all','전체'],['favorite','관심물건'],['plan','입찰계획']] as const).map(([v,l])=><button key={v} onClick={()=>setFilter(v)} className={`rounded-lg border px-3 py-2 text-sm ${filter===v?'bg-primary text-primary-foreground':'bg-card'}`}>{l}</button>)}</div></div><section className="rounded-2xl border bg-card p-4"><div className="mb-4 flex items-center justify-between"><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))} className="rounded-lg border p-2"><ChevronLeft size={18}/></button><h2 className="text-lg font-bold">{month.getFullYear()}년 {month.getMonth()+1}월</h2><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))} className="rounded-lg border p-2"><ChevronRight size={18}/></button></div><div className="grid grid-cols-7 border-l border-t text-center text-xs"><div className="contents">{['월','화','수','목','금','토','일'].map(x=><div key={x} className="border-b border-r bg-secondary/40 p-2 font-semibold">{x}</div>)}</div>{cells.map((day,i)=>{const date=day>0&&day<=days?`${month.getFullYear()}-${pad(month.getMonth()+1)}-${pad(day)}`:"";const ev=events.filter(x=>keyOf(x.bidDate)===date);return <button key={i} onClick={()=>date&&setSelected(date)} className={`min-h-24 border-b border-r p-2 text-left align-top hover:bg-secondary/40 ${date===selected?'bg-primary/10':''}`}><span className="text-xs font-semibold">{date&&day}</span>{ev.slice(0,3).map(x=><span key={x.id} className={`mt-1 block truncate rounded px-1 py-0.5 text-[10px] ${planById.has(x.id)?'bg-violet-100 text-violet-700':'bg-blue-100 text-blue-700'}`}>{x.auctionNo}</span>)}{ev.length>3&&<span className="text-[10px] text-muted-foreground">+{ev.length-3}건</span>}</button>})}</div></section>{loading?<p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">입찰 일정을 불러오는 중...</p>:selected&&<section className="rounded-2xl border bg-card p-5"><h2 className="mb-3 font-bold">{selected} 입찰 일정 ({selectedEvents.length}건)</h2>{selectedEvents.length===0?<p className="text-sm text-muted-foreground">등록된 일정이 없습니다.</p>:<div className="grid gap-3 md:grid-cols-2">{selectedEvents.map(item=>{const plan=planById.get(item.id);const n=dday(keyOf(item.bidDate));return <article key={item.id} className="rounded-xl border p-4"><div className="flex items-center justify-between"><b>{item.auctionNo}</b><span className={n<=1?'text-red-500':'text-primary'}>{n<0?'종료':n===0?'오늘 입찰':`D-${n}`}</span></div><p className="mt-1 truncate text-sm">{item.address}</p><p className="mt-2 text-xs text-muted-foreground">최저입찰가 {item.minPrice?.toLocaleString()}원 {plan&&` · 계획 입찰가 ${plan.bidPrice.toLocaleString()}원`}</p><div className="mt-3 flex gap-2 text-xs">{favoriteIds.has(item.id)&&<span className="flex items-center gap-1 text-rose-600"><Heart size={13}/>관심물건</span>}{plan&&<span className="flex items-center gap-1 text-violet-600"><FileText size={13}/>입찰계획</span>}</div></article>})}</div>}</section>}</main></>;
}
