"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearAuthCookie, getLoginRedirect } from "@/lib/auth";
import { fetchMyProfile, logoutUser, updateMyProfile } from "@/lib/api";
import { ROLE_LABELS } from "@/types/auction";
import type { UserProfile } from "@/types/auction";

// ── palette (강의실/강의상세 페이지와 동일한 보라 톤) ─────────────────────────
const C = {
  bg: "#f5f6f8",
  white: "#ffffff",
  border: "#f3f4f6",
  accent: "#5244d4",
  accentLight: "#ede9ff",
  textPrimary: "#111827",
  textSecondary: "#374151",
  textMuted: "#6b7280",
  textDim: "#9ca3af",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  background: C.white,
  color: C.textPrimary,
  fontSize: 14,
  outline: "none",
};

const readOnlyInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: "#f9fafb",
  color: C.textMuted,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: C.textMuted,
  marginBottom: 6,
};

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const homeHref = profile ? getLoginRedirect(profile.role) : "/";

  function applyProfile(data: UserProfile) {
    setProfile(data);
    setName(data.name);
  }

  useEffect(() => {
    fetchMyProfile()
      .then(applyProfile)
      .catch((err) => {
        setMessage({
          type: "error",
          text: err instanceof Error ? err.message : "회원 정보를 불러오지 못했습니다.",
        });
      })
      .finally(() => setLoading(false));
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!profile) return;

    const trimmedName = name.trim();
    const nameChanged = trimmedName !== profile.name;
    const passwordChanging = Boolean(newPassword || confirmPassword || currentPassword);

    if (passwordChanging) {
      if (!currentPassword) {
        setMessage({ type: "error", text: "비밀번호 변경 시 현재 비밀번호를 입력해 주세요." });
        return;
      }
      if (!newPassword) {
        setMessage({ type: "error", text: "새 비밀번호를 입력해 주세요." });
        return;
      }
      if (newPassword.length < 4) {
        setMessage({ type: "error", text: "새 비밀번호는 4자 이상이어야 합니다." });
        return;
      }
      if (newPassword !== confirmPassword) {
        setMessage({ type: "error", text: "새 비밀번호 확인이 일치하지 않습니다." });
        return;
      }
    }

    if (!nameChanged && !passwordChanging) {
      setMessage({ type: "error", text: "변경할 내용이 없습니다." });
      return;
    }

    setSaving(true);
    try {
      const payload: {
        name?: string;
        currentPassword?: string;
        newPassword?: string;
      } = {};

      if (nameChanged) payload.name = trimmedName;
      if (passwordChanging) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const updated = await updateMyProfile(payload);
      applyProfile(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage({ type: "success", text: "회원 정보가 저장되었습니다." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "저장에 실패했습니다.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      {/* ── nav ── */}
      <nav style={{ background: C.white, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 50 }}>
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 24px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link href={homeHref} style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <div
              style={{
                height: 36,
                padding: "0 14px",
                borderRadius: 12,
                background: `linear-gradient(135deg, ${C.accent}, #8b7cf8)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 800,
                color: "#fff",
                whiteSpace: "nowrap",
              }}
            >
              코치픽
            </div>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link
              href="/courses"
              style={{ padding: "8px 16px", color: C.textSecondary, fontSize: 13, fontWeight: 500, borderRadius: 999, textDecoration: "none" }}
            >
              내 강의실
            </Link>
            <span
              style={{
                padding: "8px 16px",
                background: C.accentLight,
                color: C.accent,
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 999,
              }}
            >
              내 정보
            </span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              style={{ padding: "8px 16px", color: C.textSecondary, fontSize: 13, fontWeight: 500, borderRadius: 999, border: "none", background: "none", cursor: "pointer" }}
            >
              로그아웃
            </button>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        {loading ? (
          <p style={{ fontSize: 13, color: C.textDim }}>불러오는 중...</p>
        ) : !profile ? (
          <p style={{ fontSize: 13, color: C.textDim }}>회원 정보를 불러오지 못했습니다.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20, alignItems: "start" }}>
            {/* ── 프로필 사이드바 ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  background: C.white,
                  borderRadius: 16,
                  border: `1px solid ${C.border}`,
                  padding: "28px 20px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: C.accentLight,
                    margin: "0 auto 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    fontWeight: 700,
                    color: C.accent,
                  }}
                >
                  {profile.name.slice(0, 1)}
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, margin: 0 }}>{profile.name}님</h2>
                <p style={{ fontSize: 12, color: C.textDim, margin: "4px 0 10px" }}>{profile.username}</p>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: "#f3f4f6",
                    color: C.textMuted,
                  }}
                >
                  {ROLE_LABELS[profile.role]}
                </span>
              </div>

              <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, padding: 8 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: C.accentLight,
                    color: C.accent,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  계정 설정
                </div>
              </div>
            </div>

            {/* ── 우측 콘텐츠 ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: C.textPrimary, margin: 0 }}>계정 설정</h1>

              {message?.type === "error" && (
                <div style={{ fontSize: 13, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px" }}>
                  {message.text}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>아이디</label>
                    <input readOnly value={profile.username} style={readOnlyInputStyle} />
                  </div>

                  {profile.phone && (
                    <div>
                      <label style={labelStyle}>전화번호</label>
                      <input readOnly value={profile.phone} style={readOnlyInputStyle} />
                    </div>
                  )}

                  <div>
                    <label style={labelStyle}>이름</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} style={inputStyle} />
                  </div>

                  <div>
                    <label style={labelStyle}>등급</label>
                    <input readOnly value={ROLE_LABELS[profile.role]} style={readOnlyInputStyle} />
                  </div>
                </div>

                <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, margin: 0 }}>비밀번호 변경</p>
                    <p style={{ fontSize: 12, color: C.textDim, margin: "4px 0 0" }}>변경하지 않으려면 아래 칸을 비워 두세요.</p>
                  </div>

                  <div>
                    <label style={labelStyle}>현재 비밀번호</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>새 비밀번호</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>새 비밀번호 확인</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      padding: "10px 24px",
                      background: C.accent,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      borderRadius: 10,
                      border: "none",
                      cursor: saving ? "not-allowed" : "pointer",
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                  {message?.type === "success" && (
                    <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>{message.text}</span>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
