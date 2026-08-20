"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { submitKakaoWebinarLogin } from "@/lib/api";

const ACCENT = "#5244d4";

type Status = "loading" | "success" | "error";

function KakaoCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [nickname, setNickname] = useState("");

  const kakaoLoginMutation = useMutation({
    mutationFn: submitKakaoWebinarLogin,
    onSuccess: (data) => {
      setNickname(data.nickname ?? "");
      setStatus("success");
    },
    onError: (err) => {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "신청 처리에 실패했습니다.");
    },
  });
  const { mutate: submitKakaoLogin } = kakaoLoginMutation;

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage("카카오 로그인이 취소되었습니다.");
      return;
    }
    if (!code) {
      setStatus("error");
      setMessage("잘못된 접근입니다.");
      return;
    }

    submitKakaoLogin(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
        {status === "loading" && <p style={{ fontSize: 18, color: "#374151" }}>카카오 로그인 처리 중입니다...</p>}

        {status === "success" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 12 }}>
              {nickname ? `${nickname}님, ` : ""}신청이 완료되었습니다!
            </h1>
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
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>😥</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 12 }}>신청에 실패했습니다</h1>
            <p style={{ color: "#6b7280", marginBottom: 32 }}>{message}</p>
            <Link
              href="/courses/webinar"
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
              다시 시도하기
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export function KakaoCallbackPageClient() {
  return (
    <Suspense fallback={null}>
      <KakaoCallbackContent />
    </Suspense>
  );
}
