"use client";

import Link from "next/link";
import { getKakaoAuthUrl } from "@/lib/kakao-webinar-auth";

/** auctioncoachp.imweb.me/site_join_type_choice(회원가입 유형 선택 화면)를
 * 참고해 "카카오로 시작하기" vs "ID/PW 회원가입" 두 가지 선택지를 제공한다. */

const ACCENT = "#5244d4";

export function WebinarJoinChoicePageClient() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Pretendard, ui-sans-serif, system-ui, sans-serif",
        background: "#fff",
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", textAlign: "center", marginBottom: 8 }}>
          무료 웨비나 신청
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 32 }}>
          신청 방법을 선택해 주세요
        </p>

        <a
          href={getKakaoAuthUrl()}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "16px 0",
            borderRadius: 8,
            background: "#FEE500",
            color: "#3C1E1E",
            fontWeight: 700,
            fontSize: 16,
            textDecoration: "none",
            marginBottom: 12,
          }}
        >
          카카오로 시작하기
        </a>

        <Link
          href="/courses/webinar/join/form"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            padding: "16px 0",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            color: "#374151",
            fontWeight: 700,
            fontSize: 16,
            textDecoration: "none",
          }}
        >
          ID/PW 회원가입
        </Link>

        <div style={{ textAlign: "center", marginTop: 32 }}>
          <Link href="/courses/webinar" style={{ color: "#9ca3af", fontSize: 13, textDecoration: "none" }}>
            ← 웨비나 소개로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
