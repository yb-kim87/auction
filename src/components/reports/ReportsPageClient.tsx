"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppHeader, HEADER_BTN } from "@/components/AppHeader";
import { createServiceReport, fetchServiceReports, type ServiceReport } from "@/lib/api";
import { useProfileStore } from "@/store/useProfileStore";
const allowed = new Set(["student", "consulting_student", "consultant", "admin"]);
export function ReportsPageClient() {
  const profile = useProfileStore((s) => s.profile);
  const fetchProfile = useProfileStore((s) => s.fetchProfile);
  const queryClient = useQueryClient();
  const reportsQuery = useQuery({ queryKey: ["service-reports"], queryFn: fetchServiceReports });
  const rows = reportsQuery.data ?? [];
  const [f, setF] = useState({ type: "bug", title: "", description: "" });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    fetchProfile().catch(() => {});
  }, [fetchProfile]);
  const loadErrorMsg = reportsQuery.isError
    ? reportsQuery.error instanceof Error
      ? reportsQuery.error.message
      : "제보 목록을 불러오지 못했습니다."
    : "";
  if (profile && !allowed.has(profile.role))
    return (
      <>
        <AppHeader />
        <main className="p-8">
          <h1 className="text-2xl font-bold">서비스 제보</h1>
          <p>수강생 이상 등급부터 이용할 수 있습니다.</p>
        </main>
      </>
    );
  const createReportMutation = useMutation({
    mutationFn: createServiceReport,
    onSuccess: (r) => {
      queryClient.setQueryData<ServiceReport[]>(["service-reports"], (prev = []) => [r, ...prev]);
      setF({ type: "bug", title: "", description: "" });
      setMsg("제보가 접수되었습니다.");
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "제보에 실패했습니다."),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createReportMutation.mutate(f);
  };
  return (
    <>
      <AppHeader
        nav={
          <>
            <Link className={HEADER_BTN} href="/">추천 물건</Link>
            <Link className={HEADER_BTN} href="/favorites?tab=assignments">과제</Link>
          </>
        }
      />
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <h1 className="text-2xl font-bold">서비스 버그·개선 제보</h1>
        <form onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-5">
          <select className="rounded-lg border p-3" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="bug">버그 제보</option>
            <option value="improvement">개선 제안</option>
          </select>
          <input
            className="w-full rounded-lg border p-3"
            required
            placeholder="제목"
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
          />
          <textarea
            className="min-h-40 w-full rounded-lg border p-3"
            required
            placeholder="상세 내용을 입력해주세요"
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
          <button className="rounded-lg bg-primary px-4 py-3 text-primary-foreground">제보 등록</button>
          {(msg || loadErrorMsg) && <p className="text-sm text-muted-foreground">{msg || loadErrorMsg}</p>}
        </form>
        {rows.map((r) => (
          <article key={r.id} className="rounded-xl border bg-card p-4">
            <b>{r.title}</b>
            <span className="ml-3 text-xs text-muted-foreground">{r.status}</span>
            <p className="mt-2 whitespace-pre-wrap text-sm">{r.description}</p>
          </article>
        ))}
      </main>
    </>
  );
}
