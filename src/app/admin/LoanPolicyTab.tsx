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

  function patchLocalRatio(id: string, percent: string) {
    setPolicies((prev) =>
      prev.map((p) => (p.id === id ? { ...p, loanRatio: Number(percent) / 100 } : p)),
    );
  }

  async function handleSave(id: string) {
    const policy = policies.find((p) => p.id === id);
    if (!policy) return;
    setSavingId(id);
    setMessage(null);
    try {
      const updated = await updateLoanPolicy(id, policy.loanRatio);
      setPolicies((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setMessage(`${policy.label} 대출 비율이 저장되었습니다.`);
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
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-foreground">대출 정책 관리</h2>
        <p className="text-sm text-muted-foreground mt-1">
          회원정보(주택수·생애최초 여부)에 따라 추천 서비스에 자동 적용되는 대출 비율입니다.
          정부 정책 변경 시 비율만 수정하면 전체 서비스에 즉시 반영됩니다.
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
              <p className="text-sm font-semibold text-foreground">{policy.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">최저가 기준 대출 비율</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={Math.round(policy.loanRatio * 100)}
                onChange={(e) => patchLocalRatio(policy.id, e.target.value)}
                className="w-20 px-2 py-1.5 text-sm text-right border border-border rounded-sm bg-card"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <button
                type="button"
                onClick={() => handleSave(policy.id)}
                disabled={savingId === policy.id}
                className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
              >
                {savingId === policy.id ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
