"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { clearAuthCookie, getLoginRedirect } from "@/lib/auth";
import { fetchMyProfile, logoutUser, updateMyProfile } from "@/lib/api";
import { ROLE_LABELS } from "@/types/auction";
import type { UserProfile } from "@/types/auction";
import {
  AppHeader,
  HEADER_ACCENT_BAR,
  HEADER_BTN,
  HEADER_NAV_TRAILING,
  HEADER_TITLE,
} from "@/components/AppHeader";

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
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AccountPageContent />
    </Suspense>
  );
}

function AccountPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isLectureContext = searchParams.get("context") === "lecture";
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

  if (!isLectureContext) {
    return (
      <AuctionAccountView
        profile={profile}
        name={name}
        setName={setName}
        currentPassword={currentPassword}
        setCurrentPassword={setCurrentPassword}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        confirmPassword={confirmPassword}
        setConfirmPassword={setConfirmPassword}
        loading={loading}
        saving={saving}
        message={message}
        onSubmit={handleSubmit}
        onLogout={handleLogout}
        homeHref={homeHref}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      {/* ── nav ── */}
      <nav style={{ background: C.white, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 50 }}>
        <div
          className="flex items-center justify-between gap-2"
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 16px",
            height: 64,
          }}
        >
          <Link href={homeHref} className="shrink-0" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
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

          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <Link
              href="/courses"
              className="whitespace-nowrap"
              style={{ padding: "8px 10px", color: C.textSecondary, fontSize: 13, fontWeight: 500, borderRadius: 999, textDecoration: "none" }}
            >
              내 강의실
            </Link>
            <span
              className="whitespace-nowrap"
              style={{
                padding: "8px 10px",
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
              className="whitespace-nowrap"
              style={{ padding: "8px 10px", color: C.textSecondary, fontSize: 13, fontWeight: 500, borderRadius: 999, border: "none", background: "none", cursor: "pointer" }}
            >
              로그아웃
            </button>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        {loading ? (
          <p style={{ fontSize: 13, color: C.textDim }}>불러오는 중...</p>
        ) : !profile ? (
          <p style={{ fontSize: 13, color: C.textDim }}>회원 정보를 불러오지 못했습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5 items-start">
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

type AccountViewProps = {
  profile: UserProfile | null;
  name: string;
  setName: (value: string) => void;
  currentPassword: string;
  setCurrentPassword: (value: string) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  loading: boolean;
  saving: boolean;
  message: { type: "success" | "error"; text: string } | null;
  onSubmit: (event: React.FormEvent) => Promise<void>;
  onLogout: () => Promise<void>;
  homeHref: string;
};

/** 경매 화면에서 진입하는 기존 정보 밀도/네이비 톤의 회원정보 화면. */
function AuctionAccountView({
  profile,
  name,
  setName,
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  loading,
  saving,
  message,
  onSubmit,
  onLogout,
  homeHref,
}: AccountViewProps) {
  const inputClass =
    "w-full px-3 py-2 border border-border rounded-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
  const readOnlyClass = "w-full px-3 py-2 border border-border rounded-sm bg-secondary/30 text-foreground";

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <AppHeader
        maxWidth="960"
        nav={
          <>
            <div className={HEADER_ACCENT_BAR} />
            <span className={HEADER_TITLE}>회원정보</span>
            <div className={HEADER_NAV_TRAILING}>
              <Link href={homeHref} className={HEADER_BTN}>
                <ChevronDown size={13} className="rotate-90" />
                돌아가기
              </Link>
              <button type="button" onClick={() => void onLogout()} className={HEADER_BTN}>
                <LogOut size={13} />
                로그아웃
              </button>
            </div>
          </>
        }
      />

      <main className="max-w-[960px] mx-auto px-3 sm:px-6 py-5 sm:py-8">
        {message?.type === "error" && (
          <div className="mb-5 rounded-sm border px-4 py-3 text-sm border-destructive/30 bg-destructive/5 text-destructive">
            {message.text}
          </div>
        )}

        <div className="bg-card border border-border rounded-sm shadow-sm p-4 sm:p-6">
          <h1 className="text-lg font-bold text-foreground mb-1">내 정보 수정</h1>
          <p className="text-sm text-muted-foreground mb-6">
            이름과 비밀번호를 변경할 수 있습니다. 아이디는 변경할 수 없습니다.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : profile ? (
            <form onSubmit={(event) => void onSubmit(event)} className="space-y-6 max-w-lg">
              <div className="space-y-4">
                <label className="block text-sm space-y-1">
                  <span className="text-muted-foreground">아이디</span>
                  <input readOnly value={profile.username} className={readOnlyClass} />
                </label>
                {profile.phone && (
                  <label className="block text-sm space-y-1">
                    <span className="text-muted-foreground">전화번호</span>
                    <input readOnly value={profile.phone} className={readOnlyClass} />
                  </label>
                )}
                <label className="block text-sm space-y-1">
                  <span className="text-muted-foreground">이름</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} maxLength={50} />
                </label>
                <label className="block text-sm space-y-1">
                  <span className="text-muted-foreground">등급</span>
                  <input readOnly value={ROLE_LABELS[profile.role]} className={readOnlyClass} />
                </label>
              </div>

              <div className="rounded-sm border border-border bg-secondary/25 p-4 sm:p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">비밀번호 변경</p>
                  <p className="text-xs text-muted-foreground mt-1">변경하지 않으려면 아래 칸을 비워 두세요.</p>
                </div>
                <PasswordInput label="현재 비밀번호" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" className={inputClass} />
                <PasswordInput label="새 비밀번호" value={newPassword} onChange={setNewPassword} autoComplete="new-password" className={inputClass} />
                <PasswordInput label="새 비밀번호 확인" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" className={inputClass} />
              </div>

              <div className="flex items-center gap-3">
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50">
                  {saving ? "저장 중..." : "저장"}
                </button>
                {message?.type === "success" && <span className="text-sm text-emerald-600 font-medium">{message.text}</span>}
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">회원 정보를 불러오지 못했습니다. 로그인이 필요합니다.</p>
          )}
        </div>
      </main>
    </div>
  );
}

function PasswordInput({ label, value, onChange, autoComplete, className }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string; className: string }) {
  return (
    <label className="block text-sm space-y-1">
      <span className="text-muted-foreground">{label}</span>
      <input type="password" value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} className={className} />
    </label>
  );
}
