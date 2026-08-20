"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LectureMaterialsTab } from "@/app/admin/LectureMaterialsTab";
import { useProfileStore } from "@/store/useProfileStore";

export function LectureMaterialsPageClient() {
  const router = useRouter();
  const fetchProfile = useProfileStore((s) => s.fetchProfile);
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((user) => {
        if (cancelled) return;
        if (user.role === "admin") {
          setAllowed(true);
        } else {
          router.replace("/");
        }
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, fetchProfile]);

  if (checking) {
    return <div className="p-8 text-sm text-gray-500">확인 중...</div>;
  }

  if (!allowed) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-8 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-800">
          ← 관리자
        </Link>
        <div className="text-sm font-semibold">강의자료 편집</div>
      </header>
      <main className="max-w-[1400px] mx-auto">
        <LectureMaterialsTab />
      </main>
    </div>
  );
}
