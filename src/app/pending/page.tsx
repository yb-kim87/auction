"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, LogOut } from "lucide-react";
import { clearAuthCookie } from "@/lib/auth";
import { fetchMyProfile, logoutUser } from "@/lib/api";

export default function PendingPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");

  useEffect(() => {
    fetchMyProfile()
      .then((profile) => setUsername(profile.username))
      .catch(() => setUsername(""));
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // ignore
    }
    clearAuthCookie();
    router.replace("/login");
  };

  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center px-6"
      style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
    >
      <div className="w-full max-w-md bg-card border border-border rounded-sm shadow-sm p-8 text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-primary/10 flex items-center justify-center">
          <Clock size={28} className="text-primary" />
        </div>
        <h1 className="text-lg font-bold text-foreground">승인 대기 중입니다</h1>
        <p className="mt-3 text-[15px] text-muted-foreground leading-relaxed">
          {username ? (
            <>
              <span className="font-medium text-foreground">{username}</span>님, 회원가입이 완료되었습니다.
            </>
          ) : (
            "회원가입이 완료되었습니다."
          )}
          <br />
          관리자가 <span className="font-medium text-foreground">수강생</span> 이상 등급을 부여하면
          물건 검색 페이지를 이용할 수 있습니다.
        </p>
        <p className="mt-4 text-[14px] text-muted-foreground">
          승인 후 다시 로그인해 주세요.
        </p>
        <div className="mt-8 flex flex-col gap-2">
          <Link
            href="/account"
            className="w-full py-2.5 text-[15px] font-semibold border border-border rounded-sm hover:bg-secondary/40 transition-colors"
          >
            회원정보 수정
          </Link>
          <Link
            href="/login"
            className="w-full py-2.5 text-[15px] font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent transition-colors"
          >
            로그인 페이지로
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[15px] font-medium text-muted-foreground border border-border rounded-sm hover:text-foreground transition-colors"
          >
            <LogOut size={15} />
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
