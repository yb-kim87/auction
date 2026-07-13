"use client";

import { useEffect, useState } from "react";
import { fetchLoanPolicies, updateLoanPolicy, type LoanPolicy } from "@/lib/api";

export function LoanPolicyTab() {
  const [policies, setPolicies] = useState<LoanPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchLoanPolicies()
      .then(setPolicies)
      .finally(() => setLoading(false));
  }, []);

  function patchLocal(id: string, field: "loanRatio" | "appraisalRatio", percent: string) {
    setPolicies((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: Number(percent) / 100 } : p)),
    );
    setMessage(null);
  }

  async function handleSave(policy: LoanPolicy) {
    setSavingId(policy.id);
    setMessage(null);
    try {
      const updated = await updateLoanPolicy(policy.id, {
        loanRatio: policy.loanRatio,
        appraisalRatio: policy.appraisalRatio,
      });
      setPolicies((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setMessage(`"${policy.label}" 정책이 저장되었습니다.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground p-6">불러오는 중...</p>;
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-foreground">대출 정책 관리</h2>
        <p className="text-sm text-muted-foreground mt-1">
          회원정보(주택수·생애최초 여부)와 물건의 규제지역 여부에 따라 추천 서비스에 자동
          적용되는 대출 비율입니다. 실제 대출한도는{" "}
          <span className="font-medium text-foreground">
            min(감정가 × 감정가비율, 낙찰가 × 낙찰가비율)
          </span>
          로 계산됩니다(더 낮은 쪽이 적용). 물건별 규제지역 여부는 물건 등록/수정 화면에서
          지정합니다.
        </p>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <div className="border border-border rounded-sm divide-y divide-border">
        {policies.map((policy) => (
          <div key={policy.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                {policy.label}
                {policy.regulatedArea && (
                  <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-sm border bg-red-50 text-red-700 border-red-200">
                    규제지역
                  </span>
                )}
                {policy.businessLoanOnly && (
                  <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-sm border bg-amber-50 text-amber-700 border-amber-200">
                    사업자대출만 · 단타만 가능
                  </span>
                )}
              </p>
              {policy.loanUnavailable ? (
                <p className="text-xs text-muted-foreground mt-0.5">대출 불가 (비율 지정 불가)</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  min(감정가비율, 낙찰가비율) 중 낮은 쪽이 최종 적용
                </p>
              )}
            </div>

            {policy.loanUnavailable ? (
              <span className="text-sm text-destructive font-semibold">대출 불가</span>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground w-14">감정가</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={Math.round(policy.appraisalRatio * 100)}
                    onChange={(e) => patchLocal(policy.id, "appraisalRatio", e.target.value)}
                    className="w-16 px-2 py-1.5 text-sm text-right border border-border rounded-sm bg-card"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground w-14">낙찰가</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={Math.round(policy.loanRatio * 100)}
                    onChange={(e) => patchLocal(policy.id, "loanRatio", e.target.value)}
                    className="w-16 px-2 py-1.5 text-sm text-right border border-border rounded-sm bg-card"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSave(policy)}
                  disabled={savingId === policy.id}
                  className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
                >
                  {savingId === policy.id ? "저장 중..." : "저장"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
