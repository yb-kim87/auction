"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Brain,
  TrendingUp,
  BarChart3,
  Heart,
  FileText,
  Lock,
  Eye,
  EyeOff,
  Check,
  Building2,
  Gavel,
} from "lucide-react";
import { getLoginRedirect } from "@/lib/auth";
import { loginUser, fetchMyProfile, signupUser } from "@/lib/api";
import { InvestmentInfoSection } from "@/components/InvestmentInfoSection";
import { SelectField, TextAreaField, CheckboxField } from "@/components/InvestmentFormFields";
import { validateInvestmentSignup } from "@/lib/investment-validation";
import {
  EXISTING_LOAN_OPTIONS,
  HOUSING_COUNT_OPTIONS,
  INVESTABLE_FUNDS_OPTIONS,
  TARGET_RETURN_OPTIONS,
} from "@/data/investment-options";

const FEATURES = [
  { icon: Brain, label: "AI 권리분석", desc: "복잡한 등기부를 AI가 즉시 분석" },
  { icon: TrendingUp, label: "실거래가 비교", desc: "주변 실거래 데이터와 즉시 비교" },
  { icon: BarChart3, label: "낙찰가 분석", desc: "유사 물건의 낙찰 패턴 파악" },
  { icon: Heart, label: "관심 물건 관리", desc: "원하는 물건을 저장하고 추적" },
  { icon: FileText, label: "메모 기능", desc: "물건별 분석 노트 작성" },
  { icon: Lock, label: "회원 전용 데이터", desc: "일반 공개 불가 독점 정보 제공" },
];

const STEPS = [
  { num: "01", label: "회원가입", sub: "아이디로 간편 가입" },
  { num: "02", label: "관리자 승인", sub: "수강생 등급 부여" },
  { num: "03", label: "로그인", sub: "승인 후 다시 로그인" },
  { num: "04", label: "데이터 이용", sub: "물건 검색 페이지 이용" },
];

function BrandPanel() {
  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, #0D1E35 0%, var(--primary) 55%, #1A3356 100%)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 flex flex-col h-full px-12 py-12 xl:px-16">
        <div className="flex items-center gap-3 mb-16">


        </div>

        <div className="mb-10">
          <p className="text-white/50 text-sm font-medium mb-3 tracking-[0.12em] uppercase">
            회원 전용
          </p>
          <h1
            className="text-white leading-tight mb-4 font-bold"
            style={{
              fontSize: "clamp(1.6rem, 2.2vw, 2.1rem)",
              letterSpacing: "-0.02em",
              lineHeight: 1.35,
            }}
          >
            경매코치
            <br />
            경매 물건 분석 리스트
          </h1>
          <p className="text-white/60 text-[0.95rem] leading-relaxed">
            경매코치가 제안하는 경매 투자 솔루션
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 flex-1 content-start">
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-4 group">
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-white/15 transition-colors">
                <Icon className="w-4 h-4 text-chart-5/80" />
              </div>
              <div>
                <p className="text-white text-sm font-medium leading-snug">{label}</p>
                <p className="text-white/45 text-[0.8rem] leading-snug mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-8 border-t border-white/10">
          <BottomIllustration />
        </div>
      </div>
    </div>
  );
}

function BottomIllustration() {
  const bars = [38, 55, 42, 70, 58, 82, 65, 90, 74, 95];
  return (
    <div className="relative">
      <p className="text-white/30 text-xs mb-4 tracking-wide">AUCTION TRENDS · 2026</p>
      <div className="flex items-end gap-1.5 h-16">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: `${h}%`,
              background:
                i === bars.length - 1
                  ? "color-mix(in srgb, var(--chart-5) 70%, transparent)"
                  : `rgba(255,255,255,${0.05 + (i / bars.length) * 0.15})`,
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-chart-5/60" />
        </div>

      </div>
    </div>
  );
}

function InputField({
  label,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [showPw, setShowPw] = useState(false);
  const isPw = type === "password";
  const inputType = isPw && showPw ? "text" : type;

  return (
    <div>
      <label className="block text-[0.82rem] font-medium text-foreground/70 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={inputType}
          placeholder={placeholder}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-11 px-4 rounded-xl bg-input-background border border-border text-[0.9rem] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 transition-all"
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("아이디와 비밀번호를 입력하세요.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await loginUser(username.trim(), password, remember);
      const profile = await fetchMyProfile();
      router.replace(getLoginRedirect(profile.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleLogin}>
      <InputField
        label="아이디"
        type="text"
        placeholder="아이디를 입력하세요"
        value={username}
        onChange={(v) => {
          setUsername(v);
          setError("");
        }}
        autoComplete="username"
      />
      <InputField
        label="비밀번호"
        type="password"
        placeholder="비밀번호를 입력하세요"
        value={password}
        onChange={(v) => {
          setPassword(v);
          setError("");
        }}
        autoComplete="current-password"
      />

      {error && (
        <p className="text-[0.82rem] text-destructive font-medium">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => setRemember(!remember)}
            className={`w-4 h-4 rounded flex items-center justify-center border transition-all cursor-pointer ${
              remember
                ? "bg-primary border-primary"
                : "border-border bg-card"
            }`}
          >
            {remember && (
              <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />
            )}
          </div>
          <span className="text-[0.82rem] text-muted-foreground">로그인 상태 유지</span>
        </label>
        <button
          type="button"
          className="text-[0.82rem] text-primary/70 hover:text-primary transition-colors"
        >
          비밀번호 찾기
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full h-11 rounded-xl font-semibold text-sm text-primary-foreground bg-gradient-to-br from-primary to-accent transition-all hover:opacity-90 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-60"
      >
        {loading ? "로그인 중..." : "로그인"}
      </button>

      <div className="pt-2 text-center border-t border-border">
        <p className="text-[0.82rem] text-muted-foreground mt-4 mb-2">
          아직 회원이 아니신가요?
        </p>
        <button
          type="button"
          onClick={onSwitch}
          className="w-full h-11 rounded-xl text-sm font-medium text-primary border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all focus:outline-none"
        >
          회원가입
        </button>
      </div>
    </form>
  );
}

function SignupForm({ onSwitch }: { onSwitch: () => void }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [investableFunds, setInvestableFunds] = useState("");
  const [existingLoanAmount, setExistingLoanAmount] = useState("");
  const [housingCount, setHousingCount] = useState("");
  const [investmentGoal, setInvestmentGoal] = useState("");
  const [targetReturn, setTargetReturn] = useState("");
  const [firstTimeBuyer, setFirstTimeBuyer] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (
      !name.trim() ||
      !username.trim() ||
      !password.trim() ||
      !confirm.trim()
    ) {
      setError("아이디, 비밀번호, 이름을 입력해 주세요.");
      return;
    }
    if (password.length < 4) {
      setError("비밀번호는 4자 이상 입력해 주세요.");
      return;
    }
    if (password !== confirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    const investmentCheck = validateInvestmentSignup({
      investableFunds,
      existingLoanAmount,
      housingCount,
      investmentGoal,
      targetReturn,
    });
    if (!investmentCheck.ok) {
      setError(investmentCheck.message);
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await signupUser({
        username: username.trim(),
        password,
        name: name.trim(),
        investableFunds: investableFunds.trim(),
        existingLoanAmount: existingLoanAmount.trim(),
        housingCount: investmentCheck.housingCount,
        investmentGoal: investmentGoal.trim(),
        targetReturn: targetReturn.trim(),
        firstTimeBuyer,
      });
      setSuccess("회원가입이 완료되었습니다. 관리자 승인 후 로그인해 주세요.");
      setTimeout(() => onSwitch(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <InputField label="이름" type="text" placeholder="홍길동" value={name} onChange={setName} autoComplete="name" />
        <InputField label="아이디" type="text" placeholder="아이디를 입력하세요" value={username} onChange={setUsername} autoComplete="username" />
        <InputField label="비밀번호" type="password" placeholder="4자 이상 입력하세요" value={password} onChange={setPassword} autoComplete="new-password" />
        <InputField label="비밀번호 확인" type="password" placeholder="비밀번호를 다시 입력하세요" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      </div>

      <InvestmentInfoSection>
        <SelectField
          label="투자가능자금"
          placeholder="투자가능자금 선택"
          value={investableFunds}
          onChange={setInvestableFunds}
          options={INVESTABLE_FUNDS_OPTIONS}
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
          label="목표 금액"
          placeholder="목표 금액 선택"
          value={targetReturn}
          onChange={setTargetReturn}
          options={TARGET_RETURN_OPTIONS}
        />
        <TextAreaField
          label="투자목표"
          placeholder="예: 갭투자, 임대수익, 실거주 등 목표를 입력해 주세요"
          value={investmentGoal}
          onChange={setInvestmentGoal}
        />
      </InvestmentInfoSection>

      {error && <p className="text-[0.82rem] text-destructive font-medium">{error}</p>}
      {success && <p className="text-[0.82rem] text-emerald-600 font-medium">{success}</p>}

      <div className="pt-1">
        <button
          type="button"
          onClick={handleSignup}
          disabled={loading}
          className="w-full h-11 rounded-xl font-semibold text-sm text-primary-foreground bg-gradient-to-br from-primary to-accent transition-all hover:opacity-90 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-60"
        >
          {loading ? "가입 중..." : "회원가입"}
        </button>
      </div>

      <div className="text-center pt-2 border-t border-border">
        <p className="text-[0.82rem] text-muted-foreground mt-4 mb-2">
          이미 회원이신가요?
        </p>
        <button
          type="button"
          onClick={onSwitch}
          className="w-full h-11 rounded-xl text-sm font-medium text-primary border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all focus:outline-none"
        >
          로그인하기
        </button>
      </div>
    </div>
  );
}

function SignupSteps() {
  return (
    <div className="mt-8 pt-7 border-t border-border">
      <p className="text-[0.78rem] font-semibold text-muted-foreground tracking-[0.1em] uppercase mb-5">
        가입 절차
      </p>
      <div className="flex items-start gap-0">
        {STEPS.map((step, i) => (
          <div key={step.num} className="flex-1 relative">
            <div className="flex items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[0.7rem] font-bold flex-shrink-0 ${
                  i === 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/10 text-primary border border-primary/15"
                }`}
              >
                {step.num}
              </div>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-px mx-1 bg-border" />
              )}
            </div>
            <div className="mt-2 pr-2">
              <p className="text-[0.8rem] font-semibold text-foreground/80 leading-tight">
                {step.label}
              </p>
              <p className="text-[0.72rem] text-muted-foreground leading-snug mt-0.5">
                {step.sub}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [tab, setTab] = useState<"login" | "signup">("login");

  return (
    <div className="min-h-screen w-full bg-background flex items-stretch">
      <div className="flex w-full min-h-screen">
        <div className="hidden lg:block w-[46%] xl:w-[44%] flex-shrink-0 min-h-screen">
          <BrandPanel />
        </div>

        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8 lg:py-16 bg-background overflow-y-auto">
          <div className={`w-full ${tab === "signup" ? "max-w-[480px]" : "max-w-[420px]"}`}>
            <div className="mb-8">
              <div className="flex items-center gap-2.5 mb-6 lg:hidden">
                <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
                  <Gavel className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-semibold text-foreground text-base">AucSearch</span>
              </div>


              <h2
                className="text-foreground font-bold"
                style={{ fontSize: "1.45rem", letterSpacing: "-0.025em" }}
              >
                {tab === "login" ? "만나서 반갑습니다" : "지금 시작하세요"}
              </h2>
              <p className="text-muted-foreground text-sm mt-1.5">
                {tab === "login"
                  ? "아이디와 비밀번호로 로그인하세요"
                  : "회원 전용 경매 플랫폼에 가입하세요"}
              </p>
            </div>

            <div className="flex bg-secondary rounded-xl p-1 mb-8">
              {(["login", "signup"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all ${
                    tab === t
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground/70"
                  }`}
                >
                  {t === "login" ? "로그인" : "회원가입"}
                </button>
              ))}
            </div>

            <div className="bg-card rounded-2xl border border-border p-5 sm:p-7 shadow-[0_2px_20px_rgba(30,58,95,0.06),0_1px_4px_rgba(30,58,95,0.04)]">
              {tab === "login" ? (
                <LoginForm onSwitch={() => setTab("signup")} />
              ) : (
                <SignupForm onSwitch={() => setTab("login")} />
              )}
            </div>

            {tab === "signup" && <SignupSteps />}

            <p className="text-center text-[0.75rem] text-muted-foreground/60 mt-8">
              © 2026 경매코치. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
