"use client";

import { useEffect, useState } from "react";
import {
  fetchSiteSettings,
  updateSiteSettings,
  fetchKakaoTemplates,
  type SiteSettings,
  type SolapiTemplate,
} from "@/lib/api";

/** "과제 검토" 탭의 알림톡 설정 — 과제가 새로 제출되면 코치 폰번호로,
 * 코치 피드백이 등록되면 그 과제를 제출한 수강생 폰번호로 알림을
 * 보낸다(사용자 요청, 2026-08-15). 기본은 꺼짐. 발신은 기존
 * 솔라피(경매코치) 계정을 그대로 쓰고, 템플릿을 지정하지 않으면
 * 승인 절차가 필요 없는 문자(SMS)로 대체 발송된다 — 나중에 알림톡
 * 템플릿이 승인되면 드롭다운에서 골라 알림톡으로 바꿀 수 있다. */
export function AssignmentNotifySettingsPanel() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [templates, setTemplates] = useState<SolapiTemplate[]>([]);
  const [templatesError, setTemplatesError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");

  useEffect(() => {
    fetchSiteSettings()
      .then((s) => {
        setSettings(s);
        setPhoneDraft(s.assignmentNotifyCoachPhone);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "설정을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
    fetchKakaoTemplates()
      .then(setTemplates)
      .catch((err) => setTemplatesError(err instanceof Error ? err.message : "알림톡 템플릿 목록을 불러오지 못했습니다."));
  }, []);

  async function save(patch: Partial<SiteSettings>) {
    if (!settings) return;
    setSaving(true);
    setError("");
    const prev = settings;
    setSettings({ ...settings, ...patch });
    try {
      const saved = await updateSiteSettings(patch);
      setSettings(saved);
    } catch (err) {
      setSettings(prev);
      setError(err instanceof Error ? err.message : "설정 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-muted-foreground">불러오는 중...</p>;
  if (!settings) return <p className="p-6 text-sm text-destructive">{error || "설정을 불러오지 못했습니다."}</p>;

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-foreground">과제 알림톡 설정</h2>
        <p className="text-sm text-muted-foreground mt-1">
          과제가 새로 제출되면 아래 코치 폰번호로, 코치 피드백이 등록되면 그 과제를 제출한 수강생이 등록한
          폰번호로 알림을 보냅니다. 발신은 기존 경매코치 알림톡 계정을 그대로 사용합니다.
        </p>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-sm border border-border bg-card p-4 cursor-pointer">
        <span className="text-sm">
          <span className="font-medium text-foreground">과제 알림톡 사용</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            꺼져 있으면 과제 등록/코치 피드백 시 아무 알림도 발송되지 않습니다.
          </span>
        </span>
        <input
          type="checkbox"
          checked={settings.assignmentNotifyEnabled}
          onChange={(e) => void save({ assignmentNotifyEnabled: e.target.checked })}
          disabled={saving}
          className="w-9 h-5 accent-primary shrink-0"
        />
      </label>

      <div className="rounded-sm border border-border bg-card p-4 space-y-3">
        <div>
          <label className="text-sm font-medium text-foreground">코치 폰번호</label>
          <p className="text-xs text-muted-foreground mt-0.5">수강생이 과제를 새로 제출하면 이 번호로 알림톡/문자가 갑니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="tel"
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value)}
            placeholder="01012345678"
            className="flex-1 px-3 py-2 text-sm border border-border rounded-sm bg-secondary/10"
          />
          <button
            type="button"
            onClick={() => void save({ assignmentNotifyCoachPhone: phoneDraft.trim() })}
            disabled={saving || phoneDraft.trim() === settings.assignmentNotifyCoachPhone}
            className="px-3 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </div>

      <div className="rounded-sm border border-border bg-card p-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground">알림톡 템플릿(선택)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            비워두면(기본값) 승인 절차가 필요 없는 문자(SMS)로 대체 발송됩니다. 경매코치 계정에 알림톡 템플릿이
            승인돼 있으면 아래에서 골라 알림톡으로 전환할 수 있습니다.
          </p>
          {templatesError && <p className="text-xs text-destructive mt-1">{templatesError}</p>}
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground">과제 등록 알림(코치에게)</label>
          <select
            value={settings.assignmentCreatedTemplateCode}
            onChange={(e) => void save({ assignmentCreatedTemplateCode: e.target.value })}
            disabled={saving}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-sm bg-secondary/10"
          >
            <option value="">문자(SMS)로 발송</option>
            {templates.map((t) => (
              <option key={t.templateId} value={t.templateId}>
                {t.name} ({t.templateId})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground">코치 피드백 알림(수강생에게)</label>
          <select
            value={settings.coachFeedbackTemplateCode}
            onChange={(e) => void save({ coachFeedbackTemplateCode: e.target.value })}
            disabled={saving}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-sm bg-secondary/10"
          >
            <option value="">문자(SMS)로 발송</option>
            {templates.map((t) => (
              <option key={t.templateId} value={t.templateId}>
                {t.name} ({t.templateId})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
