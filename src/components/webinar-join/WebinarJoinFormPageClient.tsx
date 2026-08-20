"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { joinWebinarByEmail } from "@/lib/api";

const ACCENT = "#5244d4";

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 15,
  outline: "none",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 6,
};

export function WebinarJoinFormPageClient() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    gender: "",
    phone: "",
    homepage: "",
    address: "",
    addressDetail: "",
    recommendCode: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await joinWebinarByEmail(form);
      router.push("/courses/webinar/join/complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        fontFamily: "Pretendard, ui-sans-serif, system-ui, sans-serif",
        background: "#fff",
        padding: "48px 20px",
      }}
    >
      <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 32 }}>ID/PW 회원가입</h1>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>이메일 *</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            style={inputStyle}
            placeholder="이메일"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>비밀번호 *</label>
          <input
            type="password"
            required
            minLength={4}
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            style={inputStyle}
            placeholder="비밀번호 (4자 이상)"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>비밀번호 확인 *</label>
          <input
            type="password"
            required
            value={form.passwordConfirm}
            onChange={(e) => update("passwordConfirm", e.target.value)}
            style={inputStyle}
            placeholder="비밀번호 확인"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>이름 *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            style={inputStyle}
            placeholder="이름을(를) 입력하세요"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>성별</label>
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#374151" }}>
              <input type="radio" name="gender" checked={form.gender === "M"} onChange={() => update("gender", "M")} />
              남성
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#374151" }}>
              <input type="radio" name="gender" checked={form.gender === "F"} onChange={() => update("gender", "F")} />
              여성
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>연락처 *</label>
          <input
            type="tel"
            required
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            style={inputStyle}
            placeholder="연락처"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>홈페이지</label>
          <input
            type="text"
            value={form.homepage}
            onChange={(e) => update("homepage", e.target.value)}
            style={inputStyle}
            placeholder="홈페이지"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>주소</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            style={{ ...inputStyle, marginBottom: 8 }}
            placeholder="주소"
          />
          <input
            type="text"
            value={form.addressDetail}
            onChange={(e) => update("addressDetail", e.target.value)}
            style={inputStyle}
            placeholder="상세주소"
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>추천인 코드</label>
          <input
            type="text"
            value={form.recommendCode}
            onChange={(e) => update("recommendCode", e.target.value)}
            style={inputStyle}
            placeholder="추천인 코드를 입력하세요."
          />
        </div>

        {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 16 }}>{error}</p>}

        <div style={{ display: "flex", gap: 12 }}>
          <Link
            href="/courses/webinar/join"
            style={{
              flex: 1,
              textAlign: "center",
              padding: "14px 0",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              color: "#374151",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={submitting}
            style={{
              flex: 1,
              padding: "14px 0",
              borderRadius: 8,
              border: "none",
              background: ACCENT,
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "가입 중..." : "가입하기"}
          </button>
        </div>
      </form>
    </div>
  );
}
