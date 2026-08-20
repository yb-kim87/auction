"use client";

import Link from "next/link";

const ACCENT = "#5244d4";

export function WebinarJoinCompletePageClient() {
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
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 12 }}>신청이 완료되었습니다!</h1>
        <p style={{ color: "#6b7280", marginBottom: 32 }}>무료 웨비나 신청이 정상적으로 접수되었습니다.</p>
        <Link
          href="/courses"
          style={{
            display: "inline-block",
            padding: "14px 32px",
            borderRadius: 999,
            background: ACCENT,
            color: "#fff",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          강의실로 돌아가기
        </Link>
      </div>
    </div>
  );
}
