"use client";

import { useEffect, useState } from "react";
import { Brain, CircleAlert, FileQuestion, Loader2, RefreshCw, Send, ShieldCheck, Users } from "lucide-react";
import type {
  AuctionAnalysisResult,
  AuctionItem,
  AuctionRightsReview,
} from "@/types/auction";
import {
  analyzeAuction,
  askAi,
  fetchAuctionRightsReview,
  saveAuctionRightsReview,
} from "@/lib/api";

const ANALYSIS_ENGINE_LABEL = "경매코치 AI";
const SECTION = "text-[14px] leading-relaxed";
const TITLE = "text-[15px] font-semibold text-foreground";

function recommendationStyle(rec: string) {
  if (rec.includes("적극")) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (rec.includes("관망")) return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
}

function AnalysisSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className={TITLE}>{title}</h4>
      <div className={`${SECTION} text-foreground/90 whitespace-pre-wrap`}>{children}</div>
    </div>
  );
}

function hasText(value: unknown): boolean {
  const text = String(value ?? "").trim();
  return text !== "" && text !== "-";
}

function rightsReviewStatus(result: AuctionAnalysisResult) {
  const structured = result.structuredRights;
  const assumptionNone =
    structured?.assumption.status === "none" &&
    structured.assumption.estimatedAmount === 0;
  const tenantOpposabilityNone = structured?.tenant.opposability === "none";
  if (result.stale) {
    return {
      label: "재분석 필요",
      description: "물건 또는 내부 경매지식이 변경되었습니다.",
      tone: "warning" as const,
    };
  }
  if (assumptionNone && tenantOpposabilityNone) {
    return {
      label: "인수사항 없음",
      description: "대항력 있는 임차인이 없어 입찰 검토 가능",
      tone: "clear" as const,
    };
  }
  const rightsRisks = (result.risks ?? []).filter(
    (risk) => !/미납\s*관리비|관리비[^.\n]*미납/.test(risk),
  );
  if (rightsRisks.length > 0) {
    const highRisk = rightsRisks.some((risk) =>
      /(인수|선순위|유치권|법정지상권|대항력|전세권|가처분|가등기)/.test(risk),
    );
    return {
      label: highRisk ? "주의 필요" : "추가 확인 필요",
      description: `확인할 권리 위험 ${rightsRisks.length}건`,
      tone: "warning" as const,
    };
  }
  return {
    label: "입찰 검토 가능",
    description: "현재 확보된 자료와 AI 분석 기준",
    tone: "clear" as const,
  };
}

const RIGHTS_TERMS = [
  { term: "대항력", meaning: "임차인이 낙찰자에게도 보증금 반환을 요구할 수 있는 권리" },
  { term: "말소기준권리", meaning: "낙찰 후 없어지는 권리를 판단하는 기준이 되는 권리" },
  { term: "선순위 임차인", meaning: "낙찰자가 보증금을 부담할 수 있어 먼저 확인해야 하는 임차인" },
  { term: "근저당", meaning: "채무를 담보하기 위해 부동산에 설정된 권리" },
  { term: "유치권", meaning: "공사대금 등을 받을 때까지 부동산을 점유할 수 있다고 주장하는 권리" },
  { term: "법정지상권", meaning: "토지와 건물 소유자가 달라질 때 건물을 계속 사용할 수 있는 권리" },
  { term: "가등기", meaning: "향후 소유권 이전 등을 먼저 확보하기 위해 임시로 해 둔 등기" },
] as const;

function RightsSummaryCard({
  label,
  value,
  description,
  icon,
  warning = false,
}: {
  label: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3.5 py-3 ${
        warning ? "border-amber-200 bg-amber-50/70" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`mt-1.5 text-sm font-bold ${warning ? "text-amber-800" : "text-foreground"}`}>
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function AskAboutItemBox({ auctionId }: { auctionId: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed) return;
    setAskError("");
    setAnswer(null);
    setAsking(true);
    try {
      const result = await askAi({ question: trimmed, auctionId });
      setAnswer(result.answer);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "질문 처리에 실패했습니다.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="rounded-sm border border-border bg-card p-3 sm:p-4 space-y-2">
      <h4 className={TITLE}>이 물건에 대해 물어보기</h4>
      <div className="flex items-center gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAsk();
          }}
          placeholder="예: 이 물건 어때? 왜 추천됐지?"
          className="flex-1 min-w-0 bg-transparent text-[14px] focus:outline-none placeholder:text-muted-foreground/60 border-b border-border pb-1.5"
        />
        <button
          type="button"
          onClick={() => void handleAsk()}
          disabled={asking || !question.trim()}
          className="shrink-0 p-1.5 rounded-sm text-primary hover:bg-primary/10 disabled:opacity-40"
          aria-label="질문하기"
        >
          <Send size={16} />
        </button>
      </div>
      {asking && <p className="text-[13px] text-muted-foreground">답변을 준비하고 있어요...</p>}
      {askError && <p className="text-[13px] text-destructive">{askError}</p>}
      {answer && (
        <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{answer}</p>
      )}
    </div>
  );
}

const EMPTY_RIGHTS_REVIEW: AuctionRightsReview = {
  status: "uninvestigated",
  baselineRightType: "",
  baselineRightDate: "",
  seniorTenantStatus: "unknown",
  opposabilityStatus: "unknown",
  depositAmount: null,
  expectedDividendAmount: null,
  assumptionAmount: null,
  specialRights: "",
  evidenceNote: "",
  confirmedAt: "",
  confirmedBy: "",
};

function RightsReviewEditor({
  auctionId,
  analysis,
  initialReview,
  onSaved,
}: {
  auctionId: string;
  analysis: AuctionAnalysisResult;
  initialReview: AuctionRightsReview | null;
  onSaved: (review: AuctionRightsReview) => void;
}) {
  const [form, setForm] = useState<AuctionRightsReview>(
    initialReview ?? EMPTY_RIGHTS_REVIEW,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm(initialReview ?? EMPTY_RIGHTS_REVIEW);
  }, [initialReview]);

  const setAmount = (
    key: "depositAmount" | "expectedDividendAmount" | "assumptionAmount",
    raw: string,
  ) => {
    const cleaned = raw.replace(/[^\d]/g, "");
    setForm((prev) => ({ ...prev, [key]: cleaned ? Number(cleaned) : null }));
  };

  const applyAiDraft = () => {
    const draft = analysis.structuredRights;
    if (!draft) {
      setMessage("현재 분석에는 구조화 초안이 없습니다. 다시 분석해 주세요.");
      return;
    }
    setForm((prev) => ({
      ...prev,
      status: draft.reviewStatus === "none" ? "none" : "in_progress",
      baselineRightType: draft.baselineRight.type,
      baselineRightDate: draft.baselineRight.date,
      seniorTenantStatus: draft.tenant.priorityStatus,
      opposabilityStatus: draft.tenant.opposability,
      depositAmount: draft.tenant.depositAmount,
      assumptionAmount: draft.assumption.estimatedAmount,
      evidenceNote: [
        ...draft.evidence,
        ...draft.missingEvidence.map((value) => `미확인: ${value}`),
        draft.assumption.reason,
      ]
        .filter(Boolean)
        .join("\n"),
    }));
    setMessage("AI 초안을 불러왔습니다. 근거 자료와 금액을 확인한 뒤 저장하세요.");
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const saved = await saveAuctionRightsReview(auctionId, form);
      setForm(saved);
      onSaved(saved);
      setMessage("관리자 확인값을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const findingOptions = [
    ["unknown", "미확인"],
    ["none", "해당 없음"],
    ["possible", "가능성 있음"],
    ["confirmed", "확인 완료"],
  ] as const;

  return (
    <div className="rounded-xl border border-primary/20 bg-card px-4 py-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className={TITLE}>관리자 권리분석 확인</h4>
          <p className="mt-1 text-[11px] text-muted-foreground">
            AI 초안은 참고용이며, 저장한 관리자 확인값만 사용자 화면과 계산기에 사용됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={applyAiDraft}
          className="rounded-sm border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary"
        >
          AI 초안 불러오기
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">
          검토 상태
          <select
            value={form.status}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                status: event.target.value as AuctionRightsReview["status"],
              }))
            }
            className="mt-1 block w-full rounded-sm border border-border bg-card px-2.5 py-2 text-sm"
          >
            <option value="uninvestigated">미조사</option>
            <option value="in_progress">조사 중</option>
            <option value="none">해당 없음</option>
            <option value="confirmed">확인 완료</option>
            <option value="unverifiable">확인 불가</option>
          </select>
        </label>
        <label className="text-xs font-medium">
          말소기준권리
          <input
            value={form.baselineRightType}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, baselineRightType: event.target.value }))
            }
            className="mt-1 block w-full rounded-sm border border-border px-2.5 py-2 text-sm"
            placeholder="예: 근저당권"
          />
        </label>
        <label className="text-xs font-medium">
          말소기준권리 일자
          <input
            type="date"
            value={form.baselineRightDate}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, baselineRightDate: event.target.value }))
            }
            className="mt-1 block w-full rounded-sm border border-border px-2.5 py-2 text-sm"
          />
        </label>
        {[
          ["seniorTenantStatus", "선순위 임차인"],
          ["opposabilityStatus", "대항력"],
        ].map(([key, label]) => (
          <label key={key} className="text-xs font-medium">
            {label}
            <select
              value={form[key as "seniorTenantStatus" | "opposabilityStatus"]}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  [key]: event.target.value,
                }))
              }
              className="mt-1 block w-full rounded-sm border border-border bg-card px-2.5 py-2 text-sm"
            >
              {findingOptions.map(([value, text]) => (
                <option key={value} value={value}>{text}</option>
              ))}
            </select>
          </label>
        ))}
        {[
          ["depositAmount", "임차보증금"],
          ["expectedDividendAmount", "예상 배당액"],
          ["assumptionAmount", "낙찰자 인수 예상금액"],
        ].map(([key, label]) => (
          <label key={key} className="text-xs font-medium">
            {label}
            <input
              inputMode="numeric"
              value={
                form[key as "depositAmount" | "expectedDividendAmount" | "assumptionAmount"]
                  ?.toLocaleString("ko-KR") ?? ""
              }
              onChange={(event) =>
                setAmount(
                  key as "depositAmount" | "expectedDividendAmount" | "assumptionAmount",
                  event.target.value,
                )
              }
              className="mt-1 block w-full rounded-sm border border-border px-2.5 py-2 text-right text-sm"
              placeholder="확인 전에는 비워두세요"
            />
          </label>
        ))}
      </div>
      <label className="block text-xs font-medium">
        특수권리
        <textarea
          value={form.specialRights}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, specialRights: event.target.value }))
          }
          rows={2}
          className="mt-1 block w-full rounded-sm border border-border px-2.5 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-medium">
        확인 근거·미확인 자료
        <textarea
          value={form.evidenceNote}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, evidenceNote: event.target.value }))
          }
          rows={4}
          className="mt-1 block w-full rounded-sm border border-border px-2.5 py-2 text-sm"
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "저장 중..." : "관리자 확인값 저장"}
        </button>
      </div>
    </div>
  );
}

export function AuctionAnalysisPanel({
  auctionId,
  item,
  isAdmin = false,
  aiAnalysisLimit,
  aiAnalysisUsed,
  onAnalysisUsed,
  onResult,
}: {
  auctionId: string;
  item?: AuctionItem;
  isAdmin?: boolean;
  aiAnalysisLimit?: number;
  aiAnalysisUsed?: number;
  onAnalysisUsed?: () => void;
  onResult?: (result: AuctionAnalysisResult) => void;
}) {
  const [result, setResult] = useState<AuctionAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const wasCachedBeforeRun = result != null;

  async function runAnalysis(refresh = false) {
    setAnalyzing(true);
    setError("");
    try {
      const data = await analyzeAuction(auctionId, refresh);
      setResult(data);
      onResult?.(data);
      if (!isAdmin && !data.cached && !wasCachedBeforeRun) {
        onAnalysisUsed?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "경매코치 AI 분석에 실패했습니다.");
    } finally {
      setAnalyzing(false);
    }
  }

  const remaining =
    !isAdmin && aiAnalysisLimit != null && aiAnalysisUsed != null
      ? Math.max(0, aiAnalysisLimit - aiAnalysisUsed)
      : null;

  const canRunAnalysis = !result;
  const majorRightsRisks = (result?.risks ?? []).filter(
    (risk) => !/미납\s*관리비|관리비[^.\n]*미납/.test(risk),
  );

  return (
    <div className="space-y-4">
      {isAdmin && <AskAboutItemBox auctionId={auctionId} />}
      <div className="rounded-sm border border-primary/20 bg-primary/[0.03] p-4 sm:p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-primary" />
            <h3 className="text-base font-bold text-foreground">{ANALYSIS_ENGINE_LABEL} 권리분석</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            등기·임차인·대항력 등 권리관계를 중심으로 분석합니다. (참고용, 최종 판단은 전문가 확인 필요)
          </p>
          {remaining != null && (
            <p className="text-xs text-muted-foreground mt-1">
              남은 AI 분석 횟수: <span className="font-semibold text-foreground">{remaining}</span>회
            </p>
          )}
        </div>
        {canRunAnalysis && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runAnalysis(Boolean(result))}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
            >
              {analyzing ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  분석 중...
                </>
              ) : (
                <>
                  <Brain size={13} />
                  {result ? "다시 분석" : "분석 시작"}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-sm px-3 py-2">
          {error}
        </p>
      )}

      {!result && !analyzing && !error && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          「분석 시작」을 누르면 {ANALYSIS_ENGINE_LABEL}가 이 물건의 권리분석 리포트를 생성합니다.
        </p>
      )}

      {analyzing && (
        <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 size={24} className="animate-spin text-primary" />
          {ANALYSIS_ENGINE_LABEL}가 이 물건의 등기·임차인 권리관계를 분석하고 있습니다...
        </div>
      )}

      {result && !analyzing && (
        <div className="space-y-5 border-t border-border pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex px-2.5 py-1 text-xs font-bold rounded-sm border ${recommendationStyle(result.recommendation)}`}
            >
              {result.recommendation}
            </span>
            {result.model && (
              <span className="text-[11px] text-muted-foreground ml-auto">
                {ANALYSIS_ENGINE_LABEL}
              </span>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => void runAnalysis(true)}
                disabled={analyzing}
                className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary disabled:opacity-50"
                title="현재 RAG 지식을 반영해 공용 권리분석을 새로 생성합니다."
              >
                <RefreshCw size={12} />
                새 지식 반영해 다시 분석
              </button>
            )}
          </div>

          {result.summary && (
            <p className={`${SECTION} font-medium text-foreground bg-secondary/40 rounded-sm px-3 py-2.5`}>
              {result.summary}
            </p>
          )}

          {(() => {
            const review = rightsReviewStatus(result);
            const autoRights = result.autoRights;
            const structured = result.structuredRights;
            const assumptionNone =
              structured?.assumption.status === "none" &&
              structured.assumption.estimatedAmount === 0;
            const assumptionLabel = assumptionNone
              ? "0원"
              : autoRights?.calculationReady
              ? autoRights.assumptionAmount && autoRights.assumptionAmount > 0
                ? `${autoRights.assumptionAmount.toLocaleString("ko-KR")}원`
                : "0원"
              : "금액 확인 필요";
            const noInvestigatedTenant =
              /조사된 임차내역이 없어|조사된 임차내역 없음/.test(
                `${result.summary} ${result.rightsAnalysis}`,
              );
            const tenantValue =
              structured?.tenant.opposability === "none"
                ? noInvestigatedTenant
                  ? "임차인 없음"
                  : "대항력 없음"
                : structured?.tenant.opposability === "possible"
                  ? "선순위 가능"
                  : "확인 필요";
            const tenantDescription =
              tenantValue === "임차인 없음"
                ? "법원 조사자료상 확인된 임차인이 없습니다."
                : tenantValue === "대항력 없음"
                  ? "확인된 임차인은 낙찰자에게 대항할 수 없습니다."
                  : tenantValue === "선순위 가능"
                    ? "보증금 인수 가능성을 추가로 확인해야 합니다."
                    : "전입일과 대항요건 확인이 필요합니다.";
            const baseline = structured?.baselineRight;
            const baselineValue = hasText(baseline?.type)
              ? baseline!.type
              : "확인 필요";
            const baselineDescription = hasText(baseline?.date)
              ? `말소기준일 ${baseline!.date}`
              : "말소기준권리 종류와 일자를 확인하세요.";

            return (
              <div className="rounded-xl border border-primary/15 bg-primary/[0.025] p-4 space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/60">
                    Rights Summary
                  </p>
                  <h4 className="mt-0.5 text-[15px] font-bold text-foreground">
                    권리분석 한눈에 보기
                  </h4>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <RightsSummaryCard
                    label="쉬운 결론"
                    value={review.label}
                    description={review.description}
                    icon={review.tone === "clear" ? <ShieldCheck size={13} /> : <CircleAlert size={13} />}
                    warning={review.tone === "warning"}
                  />
                  <RightsSummaryCard
                    label="낙찰 후 부담 가능 금액"
                    value={assumptionLabel}
                    description={
                      assumptionNone
                        ? tenantValue === "임차인 없음"
                          ? "임차인이 없어 인수할 임차보증금이 없습니다."
                          : "대항력 있는 임차인이 없어 인수할 임차보증금이 없습니다."
                        : autoRights?.calculationReady
                          ? "확인 가능한 자료를 기준으로 산정한 예상 금액입니다."
                        : "필수 자료가 부족하면 계산기에 임의 금액을 넣지 않습니다."
                    }
                    icon={<FileQuestion size={13} />}
                    warning={!assumptionNone && !autoRights?.calculationReady}
                  />
                  <RightsSummaryCard
                    label="임차인 상태"
                    value={tenantValue}
                    description={tenantDescription}
                    icon={<Users size={13} />}
                    warning={tenantValue === "확인 필요" || tenantValue === "선순위 가능"}
                  />
                  <RightsSummaryCard
                    label="말소기준권리"
                    value={baselineValue}
                    description={baselineDescription}
                    icon={<ShieldCheck size={13} />}
                    warning={baselineValue === "확인 필요"}
                  />
                </div>

                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  법원 제공자료를 기준으로 정리한 결과입니다. 입찰 전 최신 등기부와
                  매각물건명세서를 반드시 확인하세요.
                </p>
                {item?.unpaidFeeAmount != null && item.unpaidFeeAmount > 0 && (
                  <p className="rounded-md bg-secondary/50 px-3 py-2 text-[11px] text-muted-foreground">
                    참고 · 조사된 미납 관리비{" "}
                    <span className="font-semibold text-foreground">
                      {item.unpaidFeeAmount.toLocaleString("ko-KR")}원
                    </span>
                  </p>
                )}
              </div>
            );
          })()}

          {majorRightsRisks.length > 0 && (
            <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3.5">
              <h4 className="text-[15px] font-semibold text-red-800">먼저 확인할 주요 리스크</h4>
              <ul className="list-disc pl-5 space-y-1 text-sm text-destructive/90">
                {majorRightsRisks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {result.checklist?.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-3.5">
              <h4 className={TITLE}>입찰 전 반드시 확인하세요</h4>
              <ul className="space-y-2 text-sm text-foreground/90">
                {result.checklist.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border text-[10px] text-muted-foreground">
                      {i + 1}
                    </span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <AnalysisSection title="권리분석 상세">{result.rightsAnalysis || "-"}</AnalysisSection>

          {(() => {
            const analysisText = [
              result.rightsAnalysis,
              ...(result.risks ?? []),
              ...(result.checklist ?? []),
            ].join(" ");
            const termsToExplain = RIGHTS_TERMS.filter(({ term }) =>
              analysisText.includes(term),
            );
            if (termsToExplain.length === 0) return null;
            return (
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3.5">
                <h4 className={TITLE}>어려운 용어 쉽게 보기</h4>
                <dl className="mt-2.5 space-y-2">
                  {termsToExplain.map(({ term, meaning }) => (
                    <div key={term} className="grid gap-0.5 sm:grid-cols-[7rem_1fr]">
                      <dt className="text-sm font-semibold text-blue-900">{term}</dt>
                      <dd className="text-sm leading-relaxed text-foreground/80">{meaning}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })()}


        </div>
      )}
      </div>
    </div>
  );
}
