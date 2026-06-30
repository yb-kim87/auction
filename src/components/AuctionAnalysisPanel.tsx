"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Loader2, RefreshCw } from "lucide-react";
import type { AuctionAnalysisResult } from "@/types/auction";
import { analyzeAuction, fetchAuctionAnalysis } from "@/lib/api";

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

export function AuctionAnalysisPanel({ auctionId }: { auctionId: string }) {
  const [result, setResult] = useState<AuctionAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const loadCached = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuctionAnalysis(auctionId);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "분석 결과를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [auctionId]);

  useEffect(() => {
    void loadCached();
  }, [loadCached]);

  async function runAnalysis(refresh = false) {
    setAnalyzing(true);
    setError("");
    try {
      const data = await analyzeAuction(auctionId, refresh);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "경매코치 AI 분석에 실패했습니다.");
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        분석 기록 확인 중...
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-primary/20 bg-primary/[0.03] p-4 sm:p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-primary" />
            <h3 className="text-base font-bold text-foreground">{ANALYSIS_ENGINE_LABEL} 물건 분석</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            권리분석 · 물건분석 · 대출·자금 관점을 종합합니다. (참고용, 최종 판단은 전문가 확인 필요)
          </p>
        </div>
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
          {result && (
            <button
              type="button"
              onClick={() => void runAnalysis(true)}
              disabled={analyzing}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-sm border border-border bg-card disabled:opacity-50"
              title="캐시 무시하고 새로 분석"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-sm px-3 py-2">
          {error}
        </p>
      )}

      {!result && !analyzing && !error && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          「분석 시작」을 누르면 {ANALYSIS_ENGINE_LABEL}가 이 물건에 대한 분석 리포트를 생성합니다.
        </p>
      )}

      {analyzing && (
        <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 size={24} className="animate-spin text-primary" />
          {ANALYSIS_ENGINE_LABEL}가 물건 정보와 회원 투자정보를 분석하고 있습니다...
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
            {result.cached && (
              <span className="text-[11px] text-muted-foreground">저장된 분석</span>
            )}
            {result.stale && (
              <span className="text-[11px] text-amber-700">물건 정보 변경됨 — 다시 분석 권장</span>
            )}
            {result.model && (
              <span className="text-[11px] text-muted-foreground ml-auto">
                {ANALYSIS_ENGINE_LABEL}
              </span>
            )}
          </div>

          {result.summary && (
            <p className={`${SECTION} font-medium text-foreground bg-secondary/40 rounded-sm px-3 py-2.5`}>
              {result.summary}
            </p>
          )}

          <AnalysisSection title="가격·시세 분석">{result.priceAnalysis || "-"}</AnalysisSection>
          <AnalysisSection title="권리분석">{result.rightsAnalysis || "-"}</AnalysisSection>
          <AnalysisSection title="대출·자금 분석">{result.loanAnalysis || "-"}</AnalysisSection>
          <AnalysisSection title="투자 적합도">{result.investmentFit || "-"}</AnalysisSection>

          {result.risks?.length > 0 && (
            <div className="space-y-2">
              <h4 className={TITLE}>주요 리스크</h4>
              <ul className="list-disc pl-5 space-y-1 text-sm text-destructive/90">
                {result.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {result.checklist?.length > 0 && (
            <div className="space-y-2">
              <h4 className={TITLE}>입찰 전 체크리스트</h4>
              <ul className="list-decimal pl-5 space-y-1 text-sm text-foreground/90">
                {result.checklist.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {result.citations && result.citations.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <h4 className={TITLE}>참고한 경매지식</h4>
              <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                {result.citations.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
