"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { InvestmentInfoSection } from "@/components/InvestmentInfoSection";
import { SelectField, InvestmentGoalField, CheckboxField } from "@/components/InvestmentFormFields";
import {
  EXISTING_LOAN_OPTIONS,
  HOUSING_COUNT_OPTIONS,
  INVESTABLE_FUNDS_OPTIONS,
  TARGET_RETURN_OPTIONS,
  CREDIT_SCORE_OPTIONS,
  ANNUAL_NET_INCOME_OPTIONS,
} from "@/data/investment-options";

const inputClass =
  "w-full px-3 py-2 border border-border rounded-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
const readOnlyClass =
  "w-full px-3 py-2 border border-border rounded-sm bg-secondary/30 text-foreground";

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [investableFunds, setInvestableFunds] = useState("");
  const [existingLoanAmount, setExistingLoanAmount] = useState("");
  const [housingCount, setHousingCount] = useState("");
  const [creditScore, setCreditScore] = useState("");
  const [annualNetIncome, setAnnualNetIncome] = useState("");
  const [targetReturn, setTargetReturn] = useState("");
  const [investmentGoal, setInvestmentGoal] = useState("");
  const [firstTimeBuyer, setFirstTimeBuyer] = useState(false);
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
    setInvestableFunds(data.investableFunds ?? "");
    setExistingLoanAmount(data.existingLoanAmount ?? "");
    setHousingCount(String(data.housingCount ?? 0));
    setCreditScore(data.creditScore ?? "");
    setAnnualNetIncome(data.annualNetIncome ?? "");
    setTargetReturn(data.targetReturn ?? "");
    setInvestmentGoal(data.investmentGoal ?? "");
    setFirstTimeBuyer(data.firstTimeBuyer ?? false);
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
    const trimmedInvestableFunds = investableFunds.trim();
    const trimmedExistingLoanAmount = existingLoanAmount.trim();
    const trimmedCreditScore = creditScore.trim();
    const trimmedAnnualNetIncome = annualNetIncome.trim();
    const trimmedTargetReturn = targetReturn.trim();
    const trimmedInvestmentGoal = investmentGoal.trim();
    const parsedHousingCount = Number.parseInt(housingCount, 10);

    const nameChanged = trimmedName !== profile.name;
    const investableFundsChanged = trimmedInvestableFunds !== (profile.investableFunds ?? "");
    const existingLoanAmountChanged =
      trimmedExistingLoanAmount !== (profile.existingLoanAmount ?? "");
    const housingCountChanged = parsedHousingCount !== (profile.housingCount ?? 0);
    const creditScoreChanged = trimmedCreditScore !== (profile.creditScore ?? "");
    const annualNetIncomeChanged = trimmedAnnualNetIncome !== (profile.annualNetIncome ?? "");
    const targetReturnChanged = trimmedTargetReturn !== (profile.targetReturn ?? "");
    const investmentGoalChanged = trimmedInvestmentGoal !== (profile.investmentGoal ?? "");
    const firstTimeBuyerChanged = firstTimeBuyer !== (profile.firstTimeBuyer ?? false);
    const profileFieldsChanged =
      investableFundsChanged ||
      existingLoanAmountChanged ||
      housingCountChanged ||
      creditScoreChanged ||
      annualNetIncomeChanged ||
      targetReturnChanged ||
      investmentGoalChanged ||
      firstTimeBuyerChanged;
    const passwordChanging = Boolean(newPassword || confirmPassword || currentPassword);

    if (profileFieldsChanged) {
      if (
        !trimmedInvestableFunds ||
        !trimmedExistingLoanAmount ||
        !trimmedCreditScore ||
        !trimmedAnnualNetIncome ||
        !trimmedTargetReturn ||
        !trimmedInvestmentGoal
      ) {
        setMessage({ type: "error", text: "투자정보 항목을 모두 입력해 주세요." });
        return;
      }
      if (Number.isNaN(parsedHousingCount) || parsedHousingCount < 0) {
        setMessage({ type: "error", text: "주택수는 0 이상의 숫자로 입력해 주세요." });
        return;
      }
    }

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

    if (!nameChanged && !profileFieldsChanged && !passwordChanging) {
      setMessage({ type: "error", text: "변경할 내용이 없습니다." });
      return;
    }

    setSaving(true);
    try {
      const payload: {
        name?: string;
        currentPassword?: string;
        newPassword?: string;
        investableFunds?: string;
        existingLoanAmount?: string;
        housingCount?: number;
        creditScore?: string;
        annualNetIncome?: string;
        targetReturn?: string;
        investmentGoal?: string;
        firstTimeBuyer?: boolean;
      } = {};

      if (nameChanged) payload.name = trimmedName;
      if (investableFundsChanged) payload.investableFunds = trimmedInvestableFunds;
      if (existingLoanAmountChanged) payload.existingLoanAmount = trimmedExistingLoanAmount;
      if (housingCountChanged) payload.housingCount = parsedHousingCount;
      if (creditScoreChanged) payload.creditScore = trimmedCreditScore;
      if (annualNetIncomeChanged) payload.annualNetIncome = trimmedAnnualNetIncome;
      if (targetReturnChanged) payload.targetReturn = trimmedTargetReturn;
      if (investmentGoalChanged) payload.investmentGoal = trimmedInvestmentGoal;
      if (firstTimeBuyerChanged) payload.firstTimeBuyer = firstTimeBuyer;
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
              <button type="button" onClick={handleLogout} className={HEADER_BTN}>
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
            이름, 투자정보, 비밀번호를 변경할 수 있습니다. 아이디는 변경할 수 없습니다.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : profile ? (
            <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
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
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                    maxLength={50}
                  />
                </label>

                <label className="block text-sm space-y-1">
                  <span className="text-muted-foreground">등급</span>
                  <input readOnly value={ROLE_LABELS[profile.role]} className={readOnlyClass} />
                </label>
              </div>

              <InvestmentInfoSection className="rounded-sm">
                <SelectField
                  label="투자가능자금"
                  placeholder="투자가능자금 선택"
                  value={investableFunds}
                  onChange={setInvestableFunds}
                  options={INVESTABLE_FUNDS_OPTIONS}
                />
                <SelectField
                  label="연순소득"
                  placeholder="연순소득 선택"
                  value={annualNetIncome}
                  onChange={setAnnualNetIncome}
                  options={ANNUAL_NET_INCOME_OPTIONS}
                  hint="* 매출이 아닌 순소득정보입니다."
                />
                <SelectField
                  label="기존대출금액"
                  placeholder="기존대출금액 선택"
                  value={existingLoanAmount}
                  onChange={setExistingLoanAmount}
                  options={EXISTING_LOAN_OPTIONS}
                />
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <SelectField
                      label="주택수"
                      placeholder="보유 주택수 선택"
                      value={housingCount}
                      onChange={(v) => {
                        setHousingCount(v);
                        if (v !== "0") setFirstTimeBuyer(false);
                      }}
                      options={HOUSING_COUNT_OPTIONS}
                    />
                  </div>
                  <div className={`h-11 flex items-center ${housingCount !== "0" ? "opacity-40 pointer-events-none" : ""}`}>
                    <CheckboxField
                      label="생애최초 주택구입"
                      checked={firstTimeBuyer}
                      onChange={setFirstTimeBuyer}
                    />
                  </div>
                </div>
                <SelectField
                  label="신용점수"
                  placeholder="신용점수 선택"
                  value={creditScore}
                  onChange={setCreditScore}
                  options={CREDIT_SCORE_OPTIONS}
                  hint="* 나이스/KCB 신용점수는 토스/카카오를 통해 확인가능합니다."
                />
                <SelectField
                  label="목표 수익"
                  placeholder="목표 수익 선택"
                  value={targetReturn}
                  onChange={setTargetReturn}
                  options={TARGET_RETURN_OPTIONS}
                />
                <InvestmentGoalField value={investmentGoal} onChange={setInvestmentGoal} />
              </InvestmentInfoSection>

              <div className="rounded-sm border border-border bg-secondary/25 p-4 sm:p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">비밀번호 변경</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    변경하지 않으려면 아래 칸을 비워 두세요.
                  </p>
                </div>

                <label className="block text-sm space-y-1">
                  <span className="text-muted-foreground">현재 비밀번호</span>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    className={inputClass}
                  />
                </label>

                <label className="block text-sm space-y-1">
                  <span className="text-muted-foreground">새 비밀번호</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </label>

                <label className="block text-sm space-y-1">
                  <span className="text-muted-foreground">새 비밀번호 확인</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
                {message?.type === "success" && (
                  <span className="text-sm text-emerald-600 font-medium">
                    {message.text}
                  </span>
                )}
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              회원 정보를 불러오지 못했습니다.{" "}
              {profile ? "잠시 후 다시 시도해 주세요." : "로그인이 필요합니다."}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
