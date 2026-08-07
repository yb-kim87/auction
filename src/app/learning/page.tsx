"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, MessageSquareWarning } from "lucide-react";
import { AppHeader, HEADER_BTN } from "@/components/AppHeader";
import { fetchMyProfile } from "@/lib/api";
import type { UserProfile } from "@/types/auction";
const allowed=new Set(["student","consulting_student","consultant","admin"]);
export default function LearningSupportPage(){const [profile,setProfile]=useState<UserProfile|null>(null);useEffect(()=>{fetchMyProfile().then(setProfile).catch(()=>{});},[]);if(profile&&!allowed.has(profile.role))return <><AppHeader/><main className="mx-auto max-w-4xl p-8"><h1 className="text-2xl font-bold">학습 지원</h1><p className="mt-4 rounded-xl bg-card p-6">수강생 이상 등급부터 이용할 수 있습니다.</p></main></>;return <><AppHeader nav={<><Link className={HEADER_BTN} href="/">추천 물건</Link><Link className={HEADER_BTN} href="/favorites">내 물건</Link></>}/><main className="mx-auto max-w-4xl space-y-5 p-6"><h1 className="text-2xl font-bold">학습 지원</h1><p className="text-sm text-muted-foreground">물건을 기록하고 서비스 개선 의견을 남겨보세요.</p><div className="grid gap-4 md:grid-cols-2"><Link href="/assignments" className="rounded-2xl border bg-card p-6 hover:border-primary"><ClipboardCheck className="text-primary"/><h2 className="mt-4 text-lg font-bold">물건 찾기 과제</h2><p className="mt-2 text-sm text-muted-foreground">시세조사와 입찰가를 기록합니다.</p></Link><Link href="/reports" className="rounded-2xl border bg-card p-6 hover:border-primary"><MessageSquareWarning className="text-primary"/><h2 className="mt-4 text-lg font-bold">버그·개선 제보</h2><p className="mt-2 text-sm text-muted-foreground">서비스 오류와 개선 의견을 남깁니다.</p></Link></div></main></>}
