"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchKakaoLeads,
  fetchKakaoLeadDetail,
  resendKakaoLead,
  sendKakaoTestMessage,
  fetchKakaoSyncState,
  runKakaoAutoSend,
  cancelKakaoAutoSend,
  runKakaoAutoSendOne,
  cancelKakaoAutoSendOne,
  fetchKakaoAutoSendStatus,
  fetchKakaoSchedulerStatus,
  toggleKakaoScheduler,
  backfillImwebExistingMembers,
  deleteKakaoLeadsBySource,
  deleteKakaoLeadsByIds,
  fetchKakaoTemplates,
  fetchKakaoSettings,
  updateKakaoSetting,
  fetchKakaoLeadFields,
  fetchInstagramSheetConfig,
  updateInstagramSheetConfig,
  backfillInstagramExistingRows,
  type KakaoLead,
  type KakaoLeadSource,
  type KakaoLeadStatus,
  type KakaoDispatchLog,
  type KakaoSyncState,
  type SolapiTemplate,
  type KakaoLeadFieldOption,
} from "@/lib/api";

const STATUS_LABELS: Record<KakaoLeadStatus, string> = {
  pending: "대기",
  sent: "발송성공",
  failed: "발송실패",
  skipped_duplicate: "중복제외",
};

const STATUS_STYLES: Record<KakaoLeadStatus, string> = {
  pending: "bg-secondary text-muted-foreground border-border",
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-destructive/5 text-destructive border-destructive/30",
  skipped_duplicate: "bg-amber-50 text-amber-700 border-amber-200",
};

const SOURCE_LABELS: Record<KakaoLeadSource, string> = {
  imweb: "아임웹",
  instagram: "인스타",
};

function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 3)}-${phone.slice(3, phone.length - 4)}-${phone.slice(-4)}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

function LeadDetailPanel({
  leadId,
  onClose,
  onResent,
}: {
  leadId: string;
  onClose: () => void;
  onResent: () => void;
}) {
  const [lead, setLead] = useState<KakaoLead | null>(null);
  const [logs, setLogs] = useState<KakaoDispatchLog[]>([]);
  const [otherApplications, setOtherApplications] = useState<KakaoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchKakaoLeadDetail(leadId);
      setLead(data.lead);
      setLogs(data.logs);
      setOtherApplications(data.otherApplications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "상세 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleResend() {
    setResending(true);
    setError("");
    try {
      await resendKakaoLead(leadId);
      await load();
      onResent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "재발송에 실패했습니다.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/45" onClick={onClose}>
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-card border border-border rounded-sm shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : lead ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-foreground">{lead.name || "(이름없음)"}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{lead.phone}</p>
              </div>
              <span
                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-sm border ${STATUS_STYLES[lead.status]}`}
              >
                {STATUS_LABELS[lead.status]}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">유입경로</p>
                <p className="font-medium text-foreground flex items-center gap-1">
                  {SOURCE_LABELS[lead.source]}
                  {otherApplications.length > 0 && (
                    <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-sm border bg-amber-50 text-amber-700 border-amber-200">
                      재신청
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">원본 ID</p>
                <p className="font-medium text-foreground truncate">{lead.sourceRefId}</p>
              </div>
              <div>
                <p className="text-muted-foreground">이메일</p>
                <p className="font-medium text-foreground truncate">{lead.email || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">가입일</p>
                <p className="font-medium text-foreground">{formatDate(lead.joinedAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">수집시각</p>
                <p className="font-medium text-foreground">{formatDate(lead.createdAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">최근 갱신</p>
                <p className="font-medium text-foreground">{formatDate(lead.updatedAt)}</p>
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-sm px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={resending}
              className="w-full px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
            >
              {resending ? "재발송 중..." : "알림톡 재발송"}
            </button>

            {otherApplications.length > 0 && (
              <div className="border-t border-border pt-3">
                <h4 className="text-sm font-semibold text-foreground mb-2">
                  같은 번호의 다른 신청 이력 ({otherApplications.length}건)
                </h4>
                <ul className="space-y-2">
                  {otherApplications.map((other) => (
                    <li
                      key={other.id}
                      className="text-xs border border-amber-200 bg-amber-50/50 rounded-sm px-3 py-2 space-y-0.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          {SOURCE_LABELS[other.source]} · {other.name || "(이름없음)"}
                        </span>
                        <span
                          className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-sm border ${STATUS_STYLES[other.status]}`}
                        >
                          {STATUS_LABELS[other.status]}
                        </span>
                      </div>
                      <p className="text-muted-foreground">신청일: {formatDate(other.joinedAt)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-border pt-3">
              <h4 className="text-sm font-semibold text-foreground mb-2">발송 이력</h4>
              {logs.length === 0 ? (
                <p className="text-xs text-muted-foreground">발송 이력이 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {logs.map((log) => (
                    <li
                      key={log.id}
                      className="text-xs border border-border rounded-sm px-3 py-2 space-y-0.5"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-semibold ${log.result === "success" ? "text-emerald-700" : "text-destructive"}`}
                        >
                          {log.result === "success" ? "성공" : "실패"} · {log.triggeredBy === "auto" ? "자동" : log.triggeredBy === "manual_retry" ? "재발송" : "테스트"}
                        </span>
                        <span className="text-muted-foreground">{formatDate(log.sentAt)}</span>
                      </div>
                      {log.errorMessage && (
                        <p className="text-destructive">{log.errorMessage}</p>
                      )}
                      {log.triggeredByAdmin && (
                        <p className="text-muted-foreground">처리자: {log.triggeredByAdmin}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-2 text-sm font-medium border border-border rounded-sm hover:bg-secondary transition-colors"
            >
              닫기
            </button>
          </div>
        ) : (
          <p className="text-sm text-destructive">{error || "고객 정보를 찾을 수 없습니다."}</p>
        )}
      </div>
    </div>
  );
}

/** 템플릿 본문의 #{변수명} 패턴을 모두 추출(순서 유지, 중복 제거) */
/** 템플릿 본문 + 버튼 URL(안드/iOS/PC/모바일 링크)까지 모두 스캔해 #{변수명}을 추출 */
function extractTemplateVars(template: SolapiTemplate): string[] {
  const sources = [
    template.content,
    ...template.buttons.flatMap((b) => [b.linkAnd, b.linkIos, b.linkPc, b.linkMo]),
  ].filter((s): s is string => Boolean(s));

  const names = sources.flatMap((s) => (s.match(/#\{[^}]+\}/g) ?? []).map((m) => m.slice(2, -1)));
  return Array.from(new Set(names));
}

function TestSendCard() {
  const [phone, setPhone] = useState("");
  const [templateCode, setTemplateCode] = useState("");
  const [templates, setTemplates] = useState<SolapiTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState("");
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<KakaoDispatchLog | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchKakaoTemplates()
      .then(setTemplates)
      .catch((err) =>
        setTemplatesError(
          err instanceof Error ? err.message : "템플릿 목록을 불러오지 못했습니다.",
        ),
      )
      .finally(() => setTemplatesLoading(false));
  }, []);

  const selectedTemplate = templates.find((t) => t.templateId === templateCode);
  const templateVarNames = selectedTemplate ? extractTemplateVars(selectedTemplate) : [];

  function handleSelectTemplate(id: string) {
    setTemplateCode(id);
    const tmpl = templates.find((t) => t.templateId === id);
    const vars = tmpl ? extractTemplateVars(tmpl) : [];
    setVarValues(Object.fromEntries(vars.map((v) => [v, ""])));
    setError("");
    setResult(null);
  }

  async function handleSend() {
    if (!phone.trim()) {
      setError("전화번호를 입력해 주세요.");
      return;
    }
    if (!templateCode) {
      setError("템플릿을 선택해 주세요.");
      return;
    }
    setSending(true);
    setError("");
    setResult(null);
    try {
      const log = await sendKakaoTestMessage({
        name: varValues["회원명"] ?? varValues["이름"] ?? "",
        phone,
        templateCode,
        variables: varValues,
      });
      setResult(log);
    } catch (err) {
      setError(err instanceof Error ? err.message : "테스트 발송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border border-border rounded-sm p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-foreground">테스트 발송</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          고객 DB에 저장하지 않고 알림톡 발송만 즉시 테스트합니다. 템플릿을 선택하면 그
          템플릿이 요구하는 변수 입력창이 자동으로 나타납니다.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="전화번호 (010-1234-5678)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-border rounded-sm bg-card"
        />
        <select
          value={templateCode}
          onChange={(e) => handleSelectTemplate(e.target.value)}
          disabled={templatesLoading}
          className="sm:min-w-[14rem] px-2 py-2 text-sm border border-border rounded-sm bg-card disabled:opacity-50"
        >
          <option value="">
            {templatesLoading ? "템플릿 불러오는 중..." : "템플릿 선택"}
          </option>
          {templates.map((t) => (
            <option key={t.templateId} value={t.templateId}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {selectedTemplate && (
        <div className="border border-border rounded-sm p-3 space-y-2 bg-secondary/20">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
            {selectedTemplate.content}
          </p>
          {templateVarNames.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {templateVarNames.map((varName) => (
                <div key={varName} className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-20 shrink-0">
                    #{varName}
                  </label>
                  <input
                    type="text"
                    value={varValues[varName] ?? ""}
                    onChange={(e) =>
                      setVarValues((prev) => ({ ...prev, [varName]: e.target.value }))
                    }
                    className="flex-1 px-2 py-1.5 text-xs border border-border rounded-sm bg-card"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={sending}
        className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
      >
        {sending ? "발송 중..." : "테스트 발송"}
      </button>

      {templatesError && <p className="text-xs text-destructive">{templatesError}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && (
        <div
          className={`text-xs rounded-sm px-3 py-2 border ${
            result.result === "success"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-destructive/5 text-destructive border-destructive/30"
          }`}
        >
          {result.result === "success" ? "발송 성공" : `발송 실패: ${result.errorMessage ?? "알 수 없는 오류"}`}
        </div>
      )}
    </div>
  );
}

const FIELD_REF_PREFIX = "$field:";
const CUSTOM_VALUE = "__custom__";

function TemplateSettingsCard() {
  const [templates, setTemplates] = useState<SolapiTemplate[]>([]);
  const [leadFields, setLeadFields] = useState<KakaoLeadFieldOption[]>([]);
  const [templateCode, setTemplateCode] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [nameVar, setNameVar] = useState("회원명");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [tmpl, setting, fields] = await Promise.all([
        fetchKakaoTemplates(),
        fetchKakaoSettings(),
        fetchKakaoLeadFields(),
      ]);
      setTemplates(tmpl);
      setLeadFields(fields);
      setTemplateCode(setting.templateCode);
      setTemplateName(setting.templateName);
      setNameVar(setting.templateNameVar || "회원명");
      try {
        setVarValues(JSON.parse(setting.variablesJson || "{}"));
      } catch {
        setVarValues({});
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "템플릿 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTemplate = templates.find((t) => t.templateId === templateCode);
  const templateVarNames = selectedTemplate ? extractTemplateVars(selectedTemplate) : [];

  function handleSelectTemplate(id: string) {
    const tmpl = templates.find((t) => t.templateId === id);
    setTemplateCode(id);
    setTemplateName(tmpl?.name ?? "");
    const vars = tmpl ? extractTemplateVars(tmpl) : [];
    // "회원명" 또는 "이름"이 포함된 변수는 기본으로 리드의 "이름" 필드를 참조하게 설정
    const autoNameVar = vars.find((v) => v.includes("회원명") || v.includes("이름"));
    setVarValues(
      Object.fromEntries(
        vars.map((v) => [v, v === autoNameVar ? `${FIELD_REF_PREFIX}name` : ""]),
      ),
    );
    setNameVar(autoNameVar ?? "회원명");
    setMessage("");
  }

  function fieldRefValue(varName: string): string {
    const value = varValues[varName] ?? "";
    return value.startsWith(FIELD_REF_PREFIX) ? value.slice(FIELD_REF_PREFIX.length) : CUSTOM_VALUE;
  }

  function handleSelectChange(varName: string, selected: string) {
    if (selected === CUSTOM_VALUE) {
      setVarValues((prev) => ({ ...prev, [varName]: "" }));
    } else {
      setVarValues((prev) => ({ ...prev, [varName]: `${FIELD_REF_PREFIX}${selected}` }));
    }
  }

  async function handleSave() {
    if (!templateCode) {
      setMessage("템플릿을 선택해 주세요.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await updateKakaoSetting({
        templateCode,
        templateName,
        variables: varValues,
        templateNameVar: nameVar,
      });
      setMessage("템플릿 설정이 저장되었습니다. 이후 신규 고객에게 이 템플릿으로 자동 발송됩니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-border rounded-sm p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-foreground">알림톡 템플릿 설정</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          아임웹·인스타 신규 고객 모두 이 템플릿 하나로 자동 발송됩니다. 템플릿을 선택하면
          필요한 변수 입력창이 자동으로 나타납니다. "회원명"(또는 "이름") 변수는 발송 시
          고객의 실제 이름으로 자동 대체되고, 나머지 변수는 아래 입력한 값이 고정으로
          사용됩니다.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">불러오는 중...</p>
      ) : loadError ? (
        <p className="text-xs text-destructive">{loadError}</p>
      ) : (
        <div className="space-y-3">
          <select
            value={templateCode}
            onChange={(e) => handleSelectTemplate(e.target.value)}
            className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-card"
          >
            <option value="">템플릿 선택</option>
            {templates.map((t) => (
              <option key={t.templateId} value={t.templateId}>
                {t.name}
              </option>
            ))}
          </select>

          {selectedTemplate && (
            <div className="border border-border rounded-sm p-3 space-y-2 bg-secondary/20">
              <p className="text-[11px] font-semibold text-muted-foreground">템플릿 원문</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {selectedTemplate.content}
              </p>

              {templateVarNames.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {templateVarNames.map((varName) => {
                    const selectValue = fieldRefValue(varName);
                    const isCustom = selectValue === CUSTOM_VALUE;
                    return (
                      <div key={varName} className="flex items-center gap-1.5">
                        <label className="text-xs text-muted-foreground w-20 shrink-0">
                          #{varName}
                        </label>
                        <select
                          value={selectValue}
                          onChange={(e) => handleSelectChange(varName, e.target.value)}
                          className="shrink-0 w-[92px] px-1.5 py-1.5 text-xs border border-border rounded-sm bg-card"
                        >
                          <option value={CUSTOM_VALUE}>직접입력</option>
                          {leadFields.map((f) => (
                            <option key={f.field} value={f.field}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={isCustom ? (varValues[varName] ?? "") : ""}
                          onChange={(e) =>
                            setVarValues((prev) => ({ ...prev, [varName]: e.target.value }))
                          }
                          placeholder={
                            isCustom ? "" : `${leadFields.find((f) => f.field === selectValue)?.label ?? ""} 값으로 자동 대체됨`
                          }
                          disabled={!isCustom}
                          className="flex-1 px-2 py-1.5 text-xs border border-border rounded-sm bg-card disabled:opacity-50"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      )}

      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}

function InstagramSheetConfigCard() {
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetRange, setSheetRange] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState("");

  useEffect(() => {
    fetchInstagramSheetConfig()
      .then((config) => {
        setSpreadsheetId(config.spreadsheetId);
        setSheetRange(config.sheetRange);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!spreadsheetId.trim()) {
      setMessage("구글시트 ID를 입력해 주세요.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await updateInstagramSheetConfig({ spreadsheetId, sheetRange });
      setMessage("저장되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleBackfill() {
    if (
      !window.confirm(
        "기존 인스타 인스턴트 리드 전체를 발송 없이 '발송됨' 상태로 저장합니다. 계속할까요?",
      )
    ) {
      return;
    }
    setBackfilling(true);
    setBackfillMessage("");
    try {
      const result = await backfillInstagramExistingRows();
      setBackfillMessage(
        `기존 리드 ${result.processed}건 확인, ${result.created}건 신규 저장(발송됨 처리)`,
      );
    } catch (err) {
      setBackfillMessage(err instanceof Error ? err.message : "백필에 실패했습니다.");
    } finally {
      setBackfilling(false);
    }
  }

  if (loading) return null;

  return (
    <div className="border border-border rounded-sm p-4 space-y-3">
      <h3 className="text-sm font-bold text-foreground">인스타 인스턴트(구글시트) 연동</h3>
      <p className="text-[11px] text-muted-foreground">
        인스타 인스턴트 리드가 쌓이는 구글시트를 지정합니다. 시트를 서비스 계정에 뷰어로 공유해야 합니다.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">구글시트 ID</label>
          <input
            type="text"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            placeholder="시트 URL의 /d/와 /edit 사이 문자열"
            className="w-full px-2 py-1.5 text-sm border border-border rounded-sm bg-card"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">시트 범위</label>
          <input
            type="text"
            value={sheetRange}
            onChange={(e) => setSheetRange(e.target.value)}
            placeholder="시트1!A2:I"
            className="w-full px-2 py-1.5 text-sm border border-border rounded-sm bg-card"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium rounded-sm border border-border hover:bg-secondary disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={() => void handleBackfill()}
          disabled={backfilling}
          className="px-3 py-1.5 text-xs font-medium rounded-sm border border-border hover:bg-secondary disabled:opacity-50"
        >
          {backfilling ? "처리 중..." : "기존 리드 백필"}
        </button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      {backfillMessage && <p className="text-xs text-muted-foreground">{backfillMessage}</p>}
    </div>
  );
}

function SyncStateCard() {
  const [states, setStates] = useState<KakaoSyncState[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [runningSource, setRunningSource] = useState<KakaoLeadSource | null>(null);
  const [cancellingSource, setCancellingSource] = useState<KakaoLeadSource | null>(null);
  const [sourceMessages, setSourceMessages] = useState<Record<string, string>>({});
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState("");
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [schedulerLoading, setSchedulerLoading] = useState(true);
  const [schedulerToggling, setSchedulerToggling] = useState(false);

  const load = useCallback(() => {
    return fetchKakaoSyncState()
      .then(setStates)
      .catch(() => setStates([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchKakaoSchedulerStatus()
      .then((s) => setSchedulerEnabled(s.enabled))
      .catch(() => {})
      .finally(() => setSchedulerLoading(false));
  }, []);

  async function handleToggleScheduler() {
    setSchedulerToggling(true);
    try {
      const result = await toggleKakaoScheduler(!schedulerEnabled);
      setSchedulerEnabled(result.enabled);
    } catch (err) {
      setRunMessage(err instanceof Error ? err.message : "설정 변경에 실패했습니다.");
    } finally {
      setSchedulerToggling(false);
    }
  }

  useEffect(() => {
    if (!running && !runningSource) return;
    const timer = setInterval(() => {
      fetchKakaoAutoSendStatus()
        .then((status) => {
          if (!status.imweb.running && !status.instagram.running) {
            setRunning(false);
            setRunningSource(null);
            void load();
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [running, runningSource, load]);

  async function handleRunNow() {
    setRunning(true);
    setRunMessage("");
    try {
      const result = await runKakaoAutoSend();
      const summarize = (label: string, r: typeof result.imweb) =>
        "error" in r ? `${label}: 오류(${r.error})` : `${label}: ${r.processed}건 확인, ${r.created}건 신규`;
      setRunMessage(
        `${summarize("아임웹", result.imweb)} / ${summarize("인스타", result.instagram)}`,
      );
      await load();
    } catch (err) {
      setRunMessage(err instanceof Error ? err.message : "자동발송 실행에 실패했습니다.");
    } finally {
      setRunning(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelKakaoAutoSend();
      setRunMessage("중단을 요청했습니다. 진행 중인 리드 처리가 끝나면 멈춥니다.");
    } catch (err) {
      setRunMessage(err instanceof Error ? err.message : "중단 요청에 실패했습니다.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleRunNowOne(source: KakaoLeadSource) {
    setRunningSource(source);
    setSourceMessages((prev) => ({ ...prev, [source]: "" }));
    try {
      const result = await runKakaoAutoSendOne(source);
      setSourceMessages((prev) => ({
        ...prev,
        [source]: `${result.processed}건 확인, ${result.created}건 신규 발송`,
      }));
      await load();
    } catch (err) {
      setSourceMessages((prev) => ({
        ...prev,
        [source]: err instanceof Error ? err.message : "실행에 실패했습니다.",
      }));
    } finally {
      setRunningSource(null);
    }
  }

  async function handleCancelOne(source: KakaoLeadSource) {
    setCancellingSource(source);
    try {
      await cancelKakaoAutoSendOne(source);
      setSourceMessages((prev) => ({ ...prev, [source]: "중단을 요청했습니다." }));
    } catch (err) {
      setSourceMessages((prev) => ({
        ...prev,
        [source]: err instanceof Error ? err.message : "중단 요청에 실패했습니다.",
      }));
    } finally {
      setCancellingSource(null);
    }
  }

  async function handleBackfill() {
    if (
      !window.confirm(
        "기존 아임웹 회원 전체를 발송 없이 '발송됨' 상태로 저장합니다. 계속할까요?",
      )
    ) {
      return;
    }
    setBackfilling(true);
    setBackfillMessage("");
    try {
      const result = await backfillImwebExistingMembers();
      setBackfillMessage(
        `기존 회원 ${result.processed}건 확인, ${result.created}건 신규 저장(발송됨 처리)`,
      );
      await load();
    } catch (err) {
      setBackfillMessage(err instanceof Error ? err.message : "백필에 실패했습니다.");
    } finally {
      setBackfilling(false);
    }
  }

  async function handleResetAndBackfill() {
    if (
      !window.confirm(
        "저장된 아임웹 고객 데이터를 모두 삭제한 뒤 가입일 순서대로 다시 백필합니다. 계속할까요?",
      )
    ) {
      return;
    }
    setBackfilling(true);
    setBackfillMessage("");
    try {
      const del = await deleteKakaoLeadsBySource("imweb");
      const result = await backfillImwebExistingMembers();
      setBackfillMessage(
        `기존 데이터 ${del.deleted}건 삭제 후 재백필: ${result.processed}건 확인, ${result.created}건 저장`,
      );
      await load();
    } catch (err) {
      setBackfillMessage(err instanceof Error ? err.message : "재정렬에 실패했습니다.");
    } finally {
      setBackfilling(false);
    }
  }

  if (loading) return null;

  return (
    <div className="border border-border rounded-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-foreground">알림톡 자동발송</h3>
        <div className="flex gap-2">
          {running && (
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={cancelling}
              className="px-3 py-1.5 text-xs font-medium rounded-sm border border-destructive/40 text-destructive hover:bg-destructive/5 disabled:opacity-50"
            >
              {cancelling ? "중단 요청 중..." : "중단"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleRunNow()}
            disabled={running}
            className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            {running ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-primary-foreground animate-pulse" />
                발송 중...
              </span>
            ) : (
              "알림톡 자동발송"
            )}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-secondary/20 px-3 py-2">
        <div>
          <p className="text-xs font-semibold text-foreground">
            자동 반복 발송 {schedulerEnabled ? "켜짐" : "꺼짐"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            켜두면 서버가 5분 간격으로 계속 신규 고객을 확인해 자동 발송합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleToggleScheduler()}
          disabled={schedulerLoading || schedulerToggling}
          role="switch"
          aria-checked={schedulerEnabled}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            schedulerEnabled ? "bg-primary" : "bg-secondary border border-border"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              schedulerEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        아임웹·인스타 인스턴트에서 신규로 확인된 고객에게 알림톡을 자동으로 발송합니다.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {states.map((state) => (
          <div key={state.source} className="border border-border rounded-sm p-3 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-foreground">{SOURCE_LABELS[state.source]}</p>
              <div className="flex gap-1.5">
                {runningSource === state.source && (
                  <button
                    type="button"
                    onClick={() => void handleCancelOne(state.source)}
                    disabled={cancellingSource === state.source}
                    className="px-2 py-1 text-[11px] font-medium rounded-sm border border-destructive/40 text-destructive hover:bg-destructive/5 disabled:opacity-50"
                  >
                    {cancellingSource === state.source ? "중단 중..." : "중단"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleRunNowOne(state.source)}
                  disabled={runningSource === state.source || running}
                  className="px-2 py-1 text-[11px] font-medium rounded-sm border border-border hover:bg-secondary disabled:opacity-50"
                >
                  {runningSource === state.source ? "발송 중..." : "이 경로만 발송"}
                </button>
              </div>
            </div>
            <p className="text-muted-foreground">마지막 동기화: {formatDate(state.lastSyncedAt)}</p>
            <p className="text-muted-foreground">마지막 실행: {formatDate(state.lastRunAt)}</p>
            <p
              className={
                state.lastRunStatus === "error" ? "text-destructive" : "text-muted-foreground"
              }
            >
              상태: {state.lastRunStatus === "ok" ? "정상" : state.lastRunStatus === "error" ? "오류" : "미실행"}
            </p>
            {state.lastErrorMessage && (
              <p className="text-destructive">{state.lastErrorMessage}</p>
            )}
            {sourceMessages[state.source] && (
              <p className="text-muted-foreground">{sourceMessages[state.source]}</p>
            )}
          </div>
        ))}
      </div>
      {runMessage && <p className="text-xs text-muted-foreground">{runMessage}</p>}
      <div className="border-t border-border pt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          이미 Make로 알림톡을 발송한 기존 아임웹 회원을 발송 없이 &quot;발송됨&quot; 상태로만 채워넣습니다(1회성).
        </p>
        <div className="shrink-0 flex gap-2">
          <button
            type="button"
            onClick={() => void handleBackfill()}
            disabled={backfilling}
            className="px-2 py-1 text-[11px] font-medium rounded-sm border border-border hover:bg-secondary disabled:opacity-50"
          >
            {backfilling ? "처리 중..." : "기존 회원 백필"}
          </button>
          <button
            type="button"
            onClick={() => void handleResetAndBackfill()}
            disabled={backfilling}
            className="px-2 py-1 text-[11px] font-medium rounded-sm border border-destructive/40 text-destructive hover:bg-destructive/5 disabled:opacity-50"
          >
            초기화 후 재백필
          </button>
        </div>
      </div>
      {backfillMessage && <p className="text-xs text-muted-foreground">{backfillMessage}</p>}
    </div>
  );
}

export function KakaoNotifyPanel() {
  const [leads, setLeads] = useState<KakaoLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState<KakaoLeadSource | "">("");
  const [status, setStatus] = useState<KakaoLeadStatus | "">("");
  const [search, setSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchKakaoLeads({
        source: source || undefined,
        status: status || undefined,
        search: search || undefined,
        page,
        pageSize,
      });
      setLeads(result.items);
      setTotal(result.total);
    } catch {
      setLeads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [source, status, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setCheckedIds(new Set());
  }, [leads]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCheckAll() {
    setCheckedIds((prev) =>
      prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id)),
    );
  }

  async function handleDeleteSelected() {
    if (checkedIds.size === 0) return;
    if (!window.confirm(`선택한 고객 ${checkedIds.size}명을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`)) {
      return;
    }
    setDeleting(true);
    try {
      await deleteKakaoLeadsByIds(Array.from(checkedIds));
      setCheckedIds(new Set());
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">알림톡 관리</h2>
        <p className="text-sm text-muted-foreground mt-1">
          아임웹·인스타그램에서 유입된 고객 DB와 솔라피 알림톡 발송 이력을 관리합니다.
        </p>
      </div>

      <TemplateSettingsCard />
      <TestSendCard />
      <InstagramSheetConfigCard />
      <SyncStateCard />

      <div className="border border-border rounded-sm">
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-border">
          <select
            value={source}
            onChange={(e) => {
              setPage(1);
              setSource(e.target.value as KakaoLeadSource | "");
            }}
            className="px-2 py-1.5 text-sm border border-border rounded-sm bg-card"
          >
            <option value="">전체 유입경로</option>
            <option value="imweb">아임웹</option>
            <option value="instagram">인스타</option>
          </select>
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as KakaoLeadStatus | "");
            }}
            className="px-2 py-1.5 text-sm border border-border rounded-sm bg-card"
          >
            <option value="">전체 상태</option>
            <option value="pending">대기</option>
            <option value="sent">발송성공</option>
            <option value="failed">발송실패</option>
            <option value="skipped_duplicate">중복제외</option>
          </select>
          <input
            type="text"
            placeholder="이름 또는 전화번호 검색"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="flex-1 min-w-[160px] px-2 py-1.5 text-sm border border-border rounded-sm bg-card"
          />
          <span className="text-xs text-muted-foreground">총 {total}건</span>
          {checkedIds.size > 0 && (
            <button
              type="button"
              onClick={() => void handleDeleteSelected()}
              disabled={deleting}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-destructive text-destructive-foreground disabled:opacity-50"
            >
              {deleting ? "삭제 중..." : `선택 삭제 (${checkedIds.size})`}
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground p-6 text-center">불러오는 중...</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">고객 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-secondary/80">
                <tr className="border-b border-border">
                  <th className="px-3 py-2.5 text-left">
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && checkedIds.size === leads.length}
                      onChange={toggleCheckAll}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold">이름</th>
                  <th className="px-3 py-2.5 text-left font-semibold">전화번호</th>
                  <th className="px-3 py-2.5 text-left font-semibold">유입경로</th>
                  <th className="px-3 py-2.5 text-left font-semibold">상태</th>
                  <th className="px-3 py-2.5 text-left font-semibold">가입일</th>
                  <th className="px-3 py-2.5 text-left font-semibold">수집시각</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="border-b border-border hover:bg-secondary/20 cursor-pointer"
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checkedIds.has(lead.id)}
                        onChange={() => toggleChecked(lead.id)}
                      />
                    </td>
                    <td className="px-3 py-2.5">{lead.name || "-"}</td>
                    <td className="px-3 py-2.5 font-mono">{maskPhone(lead.phone)}</td>
                    <td className="px-3 py-2.5">{SOURCE_LABELS[lead.source]}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-sm border ${STATUS_STYLES[lead.status]}`}
                      >
                        {STATUS_LABELS[lead.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(lead.joinedAt)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(lead.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-3 border-t border-border">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-xs border border-border rounded-sm disabled:opacity-40"
            >
              이전
            </button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs border border-border rounded-sm disabled:opacity-40"
            >
              다음
            </button>
          </div>
        )}
      </div>

      {selectedLeadId && (
        <LeadDetailPanel
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onResent={() => void load()}
        />
      )}
    </div>
  );
}
