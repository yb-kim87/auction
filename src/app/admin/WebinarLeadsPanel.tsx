"use client";

import { useEffect, useState } from "react";
import { fetchWebinarLeads, fetchWebinarEmailLeads, type WebinarKakaoLead, type WebinarEmailLead } from "@/lib/api";

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR");
}

interface UnifiedRow {
  id: string;
  method: "카카오" | "이메일";
  name: string;
  email: string;
  phone: string;
  createdAt: string;
}

/** /courses/webinar에서 신청한 사람들 목록. 카카오 로그인(webinar_kakao_leads)과
 * ID/PW 회원가입(webinar_email_leads) 두 테이블을 합쳐 최신순으로 보여준다. */
export function WebinarLeadsPanel() {
  const [rows, setRows] = useState<UnifiedRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetchWebinarLeads(), fetchWebinarEmailLeads()])
      .then(([kakaoLeads, emailLeads]: [WebinarKakaoLead[], WebinarEmailLead[]]) => {
        const merged: UnifiedRow[] = [
          ...kakaoLeads.map((l) => ({
            id: `kakao-${l.id}`,
            method: "카카오" as const,
            name: l.nickname || "-",
            email: l.email || "-",
            phone: l.phone || "-",
            createdAt: l.createdAt,
          })),
          ...emailLeads.map((l) => ({
            id: `email-${l.id}`,
            method: "이메일" as const,
            name: l.name || "-",
            email: l.email || "-",
            phone: l.phone || "-",
            createdAt: l.createdAt,
          })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRows(merged);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "목록을 불러오지 못했습니다."));
  }, []);

  if (error) return <p className="text-sm text-destructive p-4">{error}</p>;
  if (rows === null) return <p className="text-sm text-muted-foreground p-4">불러오는 중...</p>;

  return (
    <div className="p-4">
      <h3 className="text-sm font-bold text-foreground mb-1">무료 웨비나 신청자</h3>
      <p className="text-xs text-muted-foreground mb-4">
        /courses/webinar에서 카카오 로그인 또는 ID/PW 회원가입으로 신청한 사람 목록입니다. 총 {rows.length}명.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 신청자가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">가입방식</th>
                <th className="py-2 pr-4 font-medium">이름</th>
                <th className="py-2 pr-4 font-medium">이메일</th>
                <th className="py-2 pr-4 font-medium">전화번호</th>
                <th className="py-2 pr-4 font-medium">신청일시</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border">
                  <td className="py-2 pr-4">
                    <span
                      className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-sm border ${
                        row.method === "카카오"
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-blue-100 text-blue-800 border-blue-200"
                      }`}
                    >
                      {row.method}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-medium text-foreground">{row.name}</td>
                  <td className="py-2 pr-4">{row.email}</td>
                  <td className="py-2 pr-4">{row.phone}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
