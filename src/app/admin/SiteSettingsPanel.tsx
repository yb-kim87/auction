"use client";

import { useEffect, useState } from "react";
import { fetchSiteSettings, updateSiteSettings, type SiteSettings } from "@/lib/api";

/** 관리자 페이지의 사이트 전역 설정 토글 모음(사용자 요청, 2026-08-08:
 * "해당 부분을 토글 버튼으로 조정할 수 있게 관리자 페이지에도
 * 만들어줘"). 설정이 늘어나면 이 컴포넌트에 항목만 추가하면 된다. */
export function SiteSettingsPanel() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSiteSettings()
      .then(setSettings)
      .catch((err) => setError(err instanceof Error ? err.message : "설정을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(next: boolean) {
    if (!settings) return;
    setSaving(true);
    setError("");
    const prev = settings;
    setSettings({ ...settings, hideRegistryTenantForStudents: next });
    try {
      const saved = await updateSiteSettings({ hideRegistryTenantForStudents: next });
      setSettings(saved);
    } catch (err) {
      setSettings(prev);
      setError(err instanceof Error ? err.message : "설정 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="mb-6 rounded-sm border border-border bg-card p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">사이트 노출 설정</h3>
      <label className="flex items-center justify-between gap-4 py-1.5 cursor-pointer">
        <span className="text-sm">
          <span className="font-medium text-foreground">등기·임차인 정보 숨김(수강생 이하 등급)</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            켜면 물건 상세의 &quot;등기·임차인 정보&quot; 섹션(건물 등기 권리내역/임차인·점유 현황/미납 관리비)이
            수강생·회원·OT수강생 등급에게 보이지 않습니다. 컨설팅수강생 이상은 항상 볼 수 있습니다.
          </span>
        </span>
        <input
          type="checkbox"
          checked={settings?.hideRegistryTenantForStudents ?? true}
          onChange={(e) => void handleToggle(e.target.checked)}
          disabled={saving}
          className="w-9 h-5 accent-primary shrink-0"
        />
      </label>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}
