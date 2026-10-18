"use client";

import { useState } from "react";
import { contractConsultingPdfUrl, type ConsultingContractFields } from "@/lib/api";

const INPUT_CLS =
  "h-9 w-full px-3 text-sm bg-background border border-border rounded-sm focus:outline-none focus:ring-1 focus:ring-primary";

const DEFAULT_FIELDS: ConsultingContractFields = {
  clientName: "",
  clientBirth: "",
  clientAddress: "",
  clientPhone: "",
  contractDate: "2026년 06월 17일",
  retainerFee: "2,000,000",
  feeRate: "2",
  companyName: "코치픽",
  companyCeo: "",
  companyAddress: "",
  companyPhone: "",
  bankName: "신한은행",
  bankAccount: "110-294-645628",
  bankHolder: "김영배",
};

const FIELD_GROUPS: {
  title: string;
  fields: { key: keyof ConsultingContractFields; label: string }[];
}[] = [
  {
    title: "갑 (의뢰인)",
    fields: [
      { key: "clientName", label: "성명" },
      { key: "clientBirth", label: "생년월일" },
      { key: "clientAddress", label: "주소" },
      { key: "clientPhone", label: "연락처" },
    ],
  },
  {
    title: "을 (코치픽)",
    fields: [
      { key: "companyName", label: "상호" },
      { key: "companyCeo", label: "대표" },
      { key: "companyAddress", label: "주소" },
      { key: "companyPhone", label: "연락처" },
    ],
  },
  {
    title: "계약 조건",
    fields: [
      { key: "contractDate", label: "계약체결일" },
      { key: "retainerFee", label: "착수금(원)" },
      { key: "feeRate", label: "보수율(%)" },
    ],
  },
  {
    title: "보수지급계좌",
    fields: [
      { key: "bankName", label: "은행" },
      { key: "bankAccount", label: "계좌번호" },
      { key: "bankHolder", label: "예금주" },
    ],
  },
];

/** 관리자 페이지 "계약서 생성" 탭 — 경매 컨설팅 계약서(HWP 샘플)에서
 * 반복적으로 바뀌는 항목만 입력하면 채워진 PDF를 생성/다운로드한다
 * (사용자 요청, 2026-10-18). */
export function ContractGeneratorTab() {
  const [fields, setFields] = useState<ConsultingContractFields>(DEFAULT_FIELDS);

  const setField = (key: keyof ConsultingContractFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const downloadUrl = contractConsultingPdfUrl(fields);

  return (
    <div className="space-y-6">
      <div className="rounded-sm border border-border bg-card p-5 space-y-5">
        <div>
          <h2 className="text-base font-bold text-foreground">계약서 생성 (경매 컨설팅 계약서)</h2>
          <p className="text-xs text-muted-foreground mt-1">
            매번 바뀌는 항목만 입력하면 나머지 조항은 샘플 계약서 그대로 채워진 PDF가 생성됩니다.
            빈칸으로 두면 샘플 기본값이 그대로 들어갑니다.
          </p>
        </div>

        {FIELD_GROUPS.map((group) => (
          <div key={group.title} className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {group.fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{f.label}</label>
                  <input
                    type="text"
                    value={fields[f.key]}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="pt-2">
          <a
            href={downloadUrl}
            className="inline-flex h-9 items-center px-4 text-sm font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent transition-colors"
          >
            계약서 PDF 다운로드
          </a>
        </div>
      </div>
    </div>
  );
}
