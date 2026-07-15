"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchKakaoLeads,
  fetchKakaoLeadIds,
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
  updateKakaoSchedulerInterval,
  backfillImwebExistingMembers,
  deleteKakaoLeadsBySource,
  deleteKakaoLeadsByIds,
  bulkSendKakaoLeads,
  fetchKakaoTemplates,
  fetchKakaoSettings,
  updateKakaoSetting,
  fetchKakaoLeadFields,
  fetchInstagramSheetConfig,
  updateInstagramSheetConfig,
  backfillInstagramExistingRows,
  isScheduledDispatch,
  fetchKakaoScheduledDispatches,
  cancelKakaoScheduledDispatch,
  fetchKakaoDailyStats,
  setKakaoLeadBulkExclusion,
  fetchKakaoAdCreatives,
  upsertKakaoAdCreative,
  deleteKakaoAdCreative,
  fetchKakaoGroupLabels,
  setKakaoLeadGroup,
  setKakaoLeadGroupBulk,
  type KakaoLead,
  type KakaoLeadSource,
  type KakaoLeadStatus,
  type KakaoDispatchLog,
  type KakaoSyncState,
  type SolapiTemplate,
  type KakaoLeadFieldOption,
  type KakaoBulkSendResult,
  type KakaoScheduledDispatch,
  type KakaoScheduledDispatchStatus,
  type KakaoDailyStat,
  type KakaoAdCreative,
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

/**
 * "(잠재_인스턴트) 경매코치_영상_3" 같은 유입소재명에서 앞의
 * "(구분) 캠페인명_" 접두어를 잘라내고 "영상_3"만 남긴다. 패턴이
 * 맞지 않으면 원문을 그대로 반환한다.
 */
function shortenAdName(adName: string): string {
  const match = adName.match(/^\([^)]*\)\s*[^_]+_(.+)$/);
  return match ? match[1] : adName;
}

/**
 * 유입소재/유입 캠페인(소재ID) 공용 라벨 셀. 등록된 참고 이미지·영상이 있으면
 * 클릭 시 원본을 새 탭에서 연다. displayKey는 KakaoAdCreative 테이블의
 * 조회/저장 키(adName 컬럼을 범용 키로 재사용)이고, displayLabel은 화면에
 * 보여줄 텍스트다(둘이 다를 수 있음 — 예: 유입소재는 축약 표시, 소재ID는
 * 원본 숫자 그대로).
 */
function AdCreativeHoverLabel({
  displayKey,
  displayLabel,
  creative,
  onRegistered,
  showNameInput = false,
}: {
  displayKey: string;
  displayLabel: string;
  creative: KakaoAdCreative | undefined;
  onRegistered: (creative: KakaoAdCreative) => void;
  /** true면 등록 폼에 "소재명" 입력란을 함께 보여준다(소재ID처럼 원본
   *  텍스트만으로는 알아보기 어려운 경우용). */
  showNameInput?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (creative) {
    const shownLabel = creative.label || displayLabel;
    return (
      <a
        href={creative.mediaUrl}
        target="_blank"
        rel="noreferrer"
        title={`${shownLabel} — 등록된 ${creative.mediaType === "video" ? "영상" : "이미지"} 열기`}
        className="block max-w-full truncate underline decoration-dotted text-primary hover:decoration-solid"
        onClick={(e) => e.stopPropagation()}
      >
        {shownLabel}
      </a>
    );
  }

  if (editing) {
    async function handleSave() {
      if (!mediaUrl.trim()) return;
      if (showNameInput && !label.trim()) return;
      setSaving(true);
      setError("");
      try {
        const saved = await upsertKakaoAdCreative({
          adName: displayKey,
          label: showNameInput ? label.trim() : undefined,
          mediaUrl: mediaUrl.trim(),
          mediaType,
        });
        onRegistered(saved);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "등록에 실패했습니다.");
      } finally {
        setSaving(false);
      }
    }

    return (
      <span
        className="inline-flex items-center gap-1 flex-wrap"
        onClick={(e) => e.stopPropagation()}
      >
        <select
          value={mediaType}
          onChange={(e) => setMediaType(e.target.value === "video" ? "video" : "image")}
          className="px-1 py-0.5 text-[10px] border border-border rounded-sm bg-card"
        >
          <option value="image">이미지</option>
          <option value="video">영상</option>
        </select>
        {showNameInput && (
          <input
            type="text"
            autoFocus
            placeholder="소재명(예: 이미지_10)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-24 px-1 py-0.5 text-[10px] border border-border rounded-sm bg-card"
          />
        )}
        <input
          type="text"
          autoFocus={!showNameInput}
          placeholder="이미지/영상 URL"
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-32 px-1 py-0.5 text-[10px] border border-border rounded-sm bg-card"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-1.5 py-0.5 text-[10px] font-medium rounded-sm border border-primary/40 text-primary hover:bg-primary/5 disabled:opacity-50"
        >
          저장
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          취소
        </button>
        {error && <span className="text-[10px] text-destructive w-full">{error}</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      title={`${displayLabel} — 클릭해서 참고 이미지/영상 등록`}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="max-w-full truncate underline decoration-dotted decoration-muted-foreground/50 hover:text-foreground"
    >
      {displayLabel}
    </button>
  );
}

/** 템플릿 본문의 #{변수명}을 실제 발송 변수값으로 치환해 최종 발송 텍스트를 만든다 */
function renderTemplateContent(content: string, variables: Record<string, string>): string {
  return content.replace(/#\{([^}]+)\}/g, (match, varName) =>
    Object.prototype.hasOwnProperty.call(variables, varName) ? variables[varName] : match,
  );
}

/** 솔라피 알림톡 미리보기와 동일한 형태로 템플릿을 렌더링한다(발송 이력 상세, 템플릿 선택 미리보기 공용) */
function AlimtalkPreview({
  template,
  content,
}: {
  template: SolapiTemplate;
  content: string;
}) {
  return (
    <div className="bg-[#b2c7e0] p-3 rounded-[10px] inline-block">
      <div className="w-[240px] rounded-[10px] overflow-hidden font-['Malgun_Gothic',sans-serif]">
        <div className="bg-[#f9de00] text-[#3a2929] text-[13px] font-bold px-3 py-2 flex items-center">
          알림톡 도착
          <span className="ml-auto text-[11px] font-semibold text-[#3a2929]">kakao</span>
        </div>
        <div className="bg-white px-3 pt-2.5 pb-3 space-y-1.5">
          {template.emphasizeSubtitle && (
            <p className="text-[11px] text-[#8b8b8b] leading-[1.4]">{template.emphasizeSubtitle}</p>
          )}
          {template.emphasizeTitle && (
            <>
              <p className="text-[14px] font-bold text-[#151515] leading-[1.4] pb-1">
                {template.emphasizeTitle}
              </p>
              <hr className="border-t border-[#e5e5e5] my-1.5" />
            </>
          )}
          <p className="text-[12px] text-[#151515] whitespace-pre-wrap leading-[1.55]">{content}</p>
          {template.extra && (
            <p className="text-[11px] text-[#8b8b8b] whitespace-pre-wrap leading-[1.4] pt-1">
              {template.extra}
            </p>
          )}
          {template.buttons.map((btn, i) => (
            <div
              key={i}
              className="bg-[#f2f2f2] text-[12px] font-medium text-center text-[#151515] rounded-[6px] py-2 mt-2"
            >
              {btn.buttonName}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DispatchLogDetail({ log, templates }: { log: KakaoDispatchLog; templates: SolapiTemplate[] }) {
  const parsed = (() => {
    try {
      return JSON.parse(log.requestPayload) as { toPhone?: string; variables?: Record<string, string> };
    } catch {
      return null;
    }
  })();
  const template = templates.find((t) => t.templateId === log.templateCode);
  const variables = parsed?.variables ?? {};
  const renderedContent = template ? renderTemplateContent(template.content, variables) : null;

  return (
    <div className="mt-2 space-y-2">
      {template && renderedContent !== null ? (
        <AlimtalkPreview template={template} content={renderedContent} />
      ) : (
        <p className="text-xs text-muted-foreground">
          템플릿 정보를 찾을 수 없습니다(코드: {log.templateCode}).
        </p>
      )}
      {Object.keys(variables).length > 0 && (
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          {Object.entries(variables).map(([k, v]) => (
            <p key={k}>
              #{k} → {v || "(빈 값)"}
            </p>
          ))}
        </div>
      )}
    </div>
  );
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
  const [landingVisit, setLandingVisit] = useState<{ landingUrl: string; referrer: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<SolapiTemplate[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [togglingExclusion, setTogglingExclusion] = useState(false);
  const [groupInput, setGroupInput] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchKakaoLeadDetail(leadId);
      setLead(data.lead);
      setLogs(data.logs);
      setOtherApplications(data.otherApplications);
      setLandingVisit(data.landingVisit);
      setGroupInput(data.lead.groupLabel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "상세 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchKakaoTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

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

  async function handleSaveGroup() {
    setSavingGroup(true);
    setError("");
    try {
      const updated = await setKakaoLeadGroup(leadId, groupInput);
      setLead(updated);
      onResent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "그룹 지정에 실패했습니다.");
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleToggleExclusion() {
    if (!lead) return;
    setTogglingExclusion(true);
    setError("");
    try {
      const updated = await setKakaoLeadBulkExclusion(leadId, !lead.excludedFromBulk);
      setLead(updated);
      onResent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "알림톡 제외 설정에 실패했습니다.");
    } finally {
      setTogglingExclusion(false);
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
              <div className="flex flex-col items-end gap-1">
                <span
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-sm border ${STATUS_STYLES[lead.status]}`}
                >
                  {STATUS_LABELS[lead.status]}
                </span>
                {lead.excludedFromBulk && (
                  <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-sm border bg-destructive/10 text-destructive border-destructive/30">
                    알림톡 제외됨
                  </span>
                )}
              </div>
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
                <p className="text-muted-foreground">성별</p>
                <p className="font-medium text-foreground">{lead.gender || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">생년월일</p>
                <p className="font-medium text-foreground">{lead.birthDate || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">주소</p>
                <p className="font-medium text-foreground truncate" title={lead.address}>
                  {lead.address || "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">유입소재</p>
                <p className="font-medium text-foreground truncate" title={lead.adName}>
                  {lead.adName ? shortenAdName(lead.adName) : "-"}
                </p>
              </div>
              {(lead.utmSource || lead.utmCampaign) && (
                <div>
                  <p className="text-muted-foreground">
                    유입 캠페인(추정)
                    <span title="랜딩페이지 방문~가입완료 시각 매칭 기반 추정치로, 100% 정확하지 않을 수 있습니다.">
                      {" "}
                      ⓘ
                    </span>
                  </p>
                  <p className="font-medium text-foreground truncate">
                    {[lead.utmSource, lead.utmCampaign, lead.utmContent].filter(Boolean).join(" / ") || "-"}
                  </p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">
                  카톡방 버튼 클릭
                  <span title="가입완료 페이지의 '카톡방 참여하기' 버튼 클릭 여부만 확인 가능합니다. 실제로 오픈채팅방에 입장했는지는 카카오 쪽에서 확인할 방법이 없습니다.">
                    {" "}
                    ⓘ
                  </span>
                </p>
                <p className="font-medium text-foreground">
                  {lead.kakaoRoomClickedAt
                    ? lead.kakaoRoomClickCount > 1
                      ? `${formatDate(lead.kakaoRoomClickedAt)} (총 ${lead.kakaoRoomClickCount}회, 최초 ${formatDate(lead.firstKakaoRoomClickedAt ?? lead.kakaoRoomClickedAt)})`
                      : formatDate(lead.kakaoRoomClickedAt)
                    : "클릭 안 함"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">가입시각</p>
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

            {landingVisit && (
              <div className="text-xs border-t border-border pt-3">
                <p className="text-muted-foreground mb-1">
                  랜딩 방문 원본 URL(진단용)
                  <span title="유입 캠페인 매칭에 사용된 원본 방문 URL입니다. 소재ID가 어떤 파라미터로 오는지 확인할 때 참고하세요.">
                    {" "}
                    ⓘ
                  </span>
                </p>
                <p className="font-mono text-[11px] text-foreground break-all bg-muted/40 rounded-sm p-2">
                  {landingVisit.landingUrl || "-"}
                </p>
                {landingVisit.referrer && (
                  <p className="font-mono text-[11px] text-muted-foreground break-all mt-1">
                    referrer: {landingVisit.referrer}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                list="kakao-group-label-options"
                value={groupInput}
                onChange={(e) => setGroupInput(e.target.value)}
                placeholder="그룹명 (예: 2월 세미나)"
                className="flex-1 px-3 py-1.5 text-xs border border-border rounded-sm bg-card"
              />
              <button
                type="button"
                onClick={() => void handleSaveGroup()}
                disabled={savingGroup || groupInput === lead.groupLabel}
                className="px-3 py-1.5 text-xs font-medium rounded-sm border border-border hover:bg-secondary disabled:opacity-50"
              >
                {savingGroup ? "저장 중..." : "그룹 저장"}
              </button>
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

            <button
              type="button"
              onClick={() => void handleToggleExclusion()}
              disabled={togglingExclusion}
              className={`w-full px-4 py-2 text-sm font-medium rounded-sm border disabled:opacity-50 ${
                lead.excludedFromBulk
                  ? "border-border text-foreground hover:bg-secondary"
                  : "border-destructive/40 text-destructive hover:bg-destructive/5"
              }`}
            >
              {togglingExclusion
                ? "처리 중..."
                : lead.excludedFromBulk
                  ? "알림톡 제외 해제"
                  : "알림톡 제외"}
            </button>
            <p className="text-[11px] text-muted-foreground -mt-2">
              선택 발송(일괄발송) 대상에서만 제외됩니다. 자동발송·개별 재발송에는 영향이 없습니다.
            </p>

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
                  {logs.map((log) => {
                    const expanded = expandedLogId === log.id;
                    return (
                      <li
                        key={log.id}
                        className="text-xs border border-border rounded-sm px-3 py-2 space-y-0.5 cursor-pointer hover:bg-secondary/20"
                        onClick={() => setExpandedLogId(expanded ? null : log.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-semibold ${log.result === "success" ? "text-emerald-700" : "text-destructive"}`}
                          >
                            {log.result === "success" ? "성공" : "실패"} ·{" "}
                            {log.triggeredBy === "auto"
                              ? "자동"
                              : log.triggeredBy === "manual_retry"
                                ? "재발송"
                                : log.triggeredBy === "bulk_manual"
                                  ? "일괄발송"
                                  : log.triggeredBy === "scheduled"
                                    ? "예약발송"
                                    : "테스트"}
                          </span>
                          <span className="text-muted-foreground">
                            {formatDate(log.sentAt)}
                            <span className="ml-1.5">{expanded ? "▲" : "▼"}</span>
                          </span>
                        </div>
                        {log.errorMessage && (
                          <p className="text-destructive">{log.errorMessage}</p>
                        )}
                        {log.triggeredByAdmin && (
                          <p className="text-muted-foreground">처리자: {log.triggeredByAdmin}</p>
                        )}
                        {expanded && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <DispatchLogDetail log={log} templates={templates} />
                          </div>
                        )}
                      </li>
                    );
                  })}
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

/** datetime-local 입력에 넣을 "지금부터 minMinutes 뒤" 기본값(로컬 시각 기준) */
function defaultScheduleInputValue(minMinutes = 10): string {
  const d = new Date(Date.now() + minMinutes * 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 문자열(로컬 시각)을 그대로 Date로 해석해 ISO 문자열로 변환 */
function scheduleInputToISOString(value: string): string {
  return new Date(value).toISOString();
}

/** datetime-local 값을 "7월 12일(일) 오후 5:42"처럼 요일 포함해 보여준다(브라우저 위젯의 요일 표시가 잘리는 문제 보완) */
function formatScheduleDisplay(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function ScheduleToggle({
  scheduled,
  onToggle,
  value,
  onChange,
}: {
  scheduled: boolean;
  onToggle: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 border border-border rounded-sm p-2.5 bg-secondary/10">
      <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none shrink-0">
        <input
          type="checkbox"
          checked={scheduled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-3.5 h-3.5"
        />
        예약 발송
      </label>
      {scheduled && (
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            min={defaultScheduleInputValue(1)}
            className="px-2 py-1.5 text-xs border border-border rounded-sm bg-card"
          />
          {value && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatScheduleDisplay(value)}
            </span>
          )}
        </div>
      )}
    </div>
  );
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
  const [scheduleResult, setScheduleResult] = useState<KakaoScheduledDispatch | null>(null);
  const [error, setError] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => defaultScheduleInputValue());

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
    setScheduleResult(null);
    try {
      const res = await sendKakaoTestMessage({
        name: varValues["회원명"] ?? varValues["이름"] ?? "",
        phone,
        templateCode,
        templateName: selectedTemplate?.name,
        variables: varValues,
        scheduledAt: scheduled ? scheduleInputToISOString(scheduledAt) : undefined,
      });
      if (isScheduledDispatch(res)) {
        setScheduleResult(res);
      } else {
        setResult(res);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "테스트 발송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <details className="border border-border rounded-sm p-4 group">
      <summary className="cursor-pointer select-none list-none flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground inline">테스트 발송</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            고객 DB에 저장하지 않고 알림톡 발송만 즉시 테스트합니다.
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0 ml-2 group-open:hidden">펼치기</span>
        <span className="text-xs text-muted-foreground shrink-0 ml-2 hidden group-open:inline">접기</span>
      </summary>
      <div className="space-y-3 mt-3">
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
        <div className="border border-border rounded-sm p-3 space-y-3 bg-secondary/20">
          <div className="flex justify-center">
            <AlimtalkPreview
              template={selectedTemplate}
              content={renderTemplateContent(selectedTemplate.content, varValues)}
            />
          </div>
          {templateVarNames.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {templateVarNames.map((varName) => (
                <div key={varName} className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-20 shrink-0">
                    #{varName}
                  </label>
                  <textarea
                    rows={2}
                    value={varValues[varName] ?? ""}
                    onChange={(e) =>
                      setVarValues((prev) => ({ ...prev, [varName]: e.target.value }))
                    }
                    className="flex-1 px-2 py-1.5 text-xs border border-border rounded-sm bg-card resize-y"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ScheduleToggle
        scheduled={scheduled}
        onToggle={setScheduled}
        value={scheduledAt}
        onChange={setScheduledAt}
      />

      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={sending}
        className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
      >
        {sending ? "처리 중..." : scheduled ? "예약 등록" : "테스트 발송"}
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
      {scheduleResult && (
        <div className="text-xs rounded-sm px-3 py-2 border bg-blue-50 text-blue-700 border-blue-200">
          {new Date(scheduleResult.scheduledAt).toLocaleString("ko-KR")}에 발송되도록 예약했습니다.
          예약 탭에서 확인·취소할 수 있습니다.
        </div>
      )}
      </div>
    </details>
  );
}

const FIELD_REF_PREFIX = "$field:";
const CUSTOM_VALUE = "__custom__";

function GroupAssignModal({
  count,
  existingGroups,
  onClose,
  onAssign,
}: {
  count: number;
  existingGroups: string[];
  onClose: () => void;
  onAssign: (groupLabel: string) => void;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/45" onClick={onClose}>
      <div
        className="relative w-full max-w-sm bg-card border border-border rounded-sm shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-bold text-foreground">그룹 지정</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            선택한 고객 {count}명에게 그룹명을 지정합니다(예: &quot;2월 세미나&quot;). 빈 값으로
            저장하면 그룹이 해제됩니다.
          </p>
        </div>
        <input
          type="text"
          list="kakao-group-label-options"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="그룹명 입력 또는 선택"
          className="w-full px-3 py-2 text-sm border border-border rounded-sm bg-card"
        />
        <datalist id="kakao-group-label-options">
          {existingGroups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onAssign(value)}
            className="flex-1 px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground"
          >
            {count}명에게 지정
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-sm hover:bg-secondary transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkSendModal({
  leadIds,
  onClose,
  onDone,
}: {
  leadIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [templates, setTemplates] = useState<SolapiTemplate[]>([]);
  const [leadFields, setLeadFields] = useState<KakaoLeadFieldOption[]>([]);
  const [templateCode, setTemplateCode] = useState("");
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [nameVar, setNameVar] = useState("회원명");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<KakaoBulkSendResult | null>(null);
  const [scheduleResult, setScheduleResult] = useState<KakaoScheduledDispatch | null>(null);
  const [error, setError] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => defaultScheduleInputValue());

  useEffect(() => {
    Promise.all([fetchKakaoTemplates(), fetchKakaoLeadFields()])
      .then(([tmpl, fields]) => {
        setTemplates(tmpl);
        setLeadFields(fields);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "템플릿 목록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  const selectedTemplate = templates.find((t) => t.templateId === templateCode);
  const templateVarNames = selectedTemplate ? extractTemplateVars(selectedTemplate) : [];

  function handleSelectTemplate(id: string) {
    const tmpl = templates.find((t) => t.templateId === id);
    setTemplateCode(id);
    const vars = tmpl ? extractTemplateVars(tmpl) : [];
    const autoNameVar = vars.find((v) => v.includes("회원명") || v.includes("이름"));
    setVarValues(
      Object.fromEntries(vars.map((v) => [v, v === autoNameVar ? `${FIELD_REF_PREFIX}name` : ""])),
    );
    setNameVar(autoNameVar ?? "회원명");
    setError("");
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

  async function handleSend() {
    if (!templateCode) {
      setError("템플릿을 선택해 주세요.");
      return;
    }
    const confirmMessage = scheduled
      ? `선택한 고객 ${leadIds.length}명에게 예약된 시각에 알림톡을 발송하도록 등록합니다. 계속할까요?`
      : `선택한 고객 ${leadIds.length}명에게 알림톡을 발송합니다. 계속할까요?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await bulkSendKakaoLeads({
        ids: leadIds,
        templateCode,
        templateName: selectedTemplate?.name,
        variables: varValues,
        templateNameVar: nameVar,
        scheduledAt: scheduled ? scheduleInputToISOString(scheduledAt) : undefined,
      });
      if (isScheduledDispatch(res)) {
        setScheduleResult(res);
      } else {
        setResult(res);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "발송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/45" onClick={onClose}>
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-card border border-border rounded-sm shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-bold text-foreground">선택 발송</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            선택한 고객 {leadIds.length}명에게 지정한 템플릿으로 알림톡을 즉시 발송합니다.
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
              <div className="border border-border rounded-sm p-3 space-y-3 bg-secondary/20">
                <p className="text-[11px] font-semibold text-muted-foreground">템플릿 미리보기</p>
                <div className="flex justify-center">
                  <AlimtalkPreview
                    template={selectedTemplate}
                    content={renderTemplateContent(
                      selectedTemplate.content,
                      Object.fromEntries(
                        Object.entries(varValues).map(([k, v]) => [
                          k,
                          v.startsWith(FIELD_REF_PREFIX)
                            ? `{${leadFields.find((f) => f.field === v.slice(FIELD_REF_PREFIX.length))?.label ?? v.slice(FIELD_REF_PREFIX.length)}}`
                            : v,
                        ]),
                      ),
                    )}
                  />
                </div>

                {templateVarNames.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 pt-1">
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
                          <textarea
                            rows={isCustom ? 3 : 1}
                            value={isCustom ? (varValues[varName] ?? "") : ""}
                            onChange={(e) =>
                              setVarValues((prev) => ({ ...prev, [varName]: e.target.value }))
                            }
                            placeholder={
                              isCustom ? "" : `${leadFields.find((f) => f.field === selectValue)?.label ?? ""} 값으로 자동 대체됨`
                            }
                            disabled={!isCustom}
                            className="flex-1 px-2 py-1.5 text-xs border border-border rounded-sm bg-card disabled:opacity-50 resize-y"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!loading && !loadError && !result && !scheduleResult && (
          <ScheduleToggle
            scheduled={scheduled}
            onToggle={setScheduled}
            value={scheduledAt}
            onChange={setScheduledAt}
          />
        )}

        {error && (
          <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-sm px-3 py-2">
            {error}
          </p>
        )}

        {result && (
          <div className="text-xs border border-border rounded-sm p-3 space-y-0.5">
            <p className="font-semibold text-foreground">
              발송 완료: 총 {result.total}건 중 성공 {result.success}건, 실패 {result.failed}건
            </p>
          </div>
        )}

        {scheduleResult && (
          <div className="text-xs border border-blue-200 bg-blue-50 text-blue-700 rounded-sm p-3 space-y-0.5">
            <p className="font-semibold">
              {new Date(scheduleResult.scheduledAt).toLocaleString("ko-KR")}에 {leadIds.length}명 발송 예약 완료
            </p>
            <p>예약 탭에서 확인·취소할 수 있습니다.</p>
          </div>
        )}

        <div className="flex gap-2">
          {!result && !scheduleResult && (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || loading}
              className="flex-1 px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
            >
              {sending ? "처리 중..." : scheduled ? `${leadIds.length}명 예약 등록` : `${leadIds.length}명에게 발송`}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-sm hover:bg-secondary transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

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
            <div className="border border-border rounded-sm p-3 space-y-3 bg-secondary/20">
              <p className="text-[11px] font-semibold text-muted-foreground">템플릿 미리보기</p>
              <div className="flex justify-center">
                <AlimtalkPreview
                  template={selectedTemplate}
                  content={renderTemplateContent(
                    selectedTemplate.content,
                    Object.fromEntries(
                      Object.entries(varValues).map(([k, v]) => [
                        k,
                        v.startsWith(FIELD_REF_PREFIX)
                          ? `{${leadFields.find((f) => f.field === v.slice(FIELD_REF_PREFIX.length))?.label ?? v.slice(FIELD_REF_PREFIX.length)}}`
                          : v || `#{${k}}`,
                      ]),
                    ),
                  )}
                />
              </div>

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
                        <textarea
                          rows={isCustom ? 3 : 1}
                          value={isCustom ? (varValues[varName] ?? "") : ""}
                          onChange={(e) =>
                            setVarValues((prev) => ({ ...prev, [varName]: e.target.value }))
                          }
                          placeholder={
                            isCustom ? "" : `${leadFields.find((f) => f.field === selectValue)?.label ?? ""} 값으로 자동 대체됨`
                          }
                          disabled={!isCustom}
                          className="flex-1 px-2 py-1.5 text-xs border border-border rounded-sm bg-card disabled:opacity-50 resize-y"
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
            {saving ? "적용 중..." : "적용"}
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
          {saving ? "적용 중..." : "적용"}
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

function DailyStatsCard() {
  const [stats, setStats] = useState<KakaoDailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<number | null>(14);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rangeError, setRangeError] = useState("");

  const load = useCallback(() => {
    if (days === null) {
      if (!customFrom || !customTo) return;
      if (customFrom > customTo) {
        setRangeError("시작일이 종료일보다 늦습니다.");
        return;
      }
    }
    setRangeError("");
    setLoading(true);
    const params = days !== null ? { days } : { from: customFrom, to: customTo };
    fetchKakaoDailyStats(params)
      .then(setStats)
      .catch(() => setStats([]))
      .finally(() => setLoading(false));
  }, [days, customFrom, customTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxTotal = Math.max(1, ...stats.map((s) => s.total));
  const totalSum = stats.reduce((sum, s) => sum + s.total, 0);
  const imwebSum = stats.reduce((sum, s) => sum + s.imweb, 0);
  const instagramSum = stats.reduce((sum, s) => sum + s.instagram, 0);

  return (
    <div className="border border-border rounded-sm p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">일자별 가입 현황</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {days !== null
              ? `최근 ${days}일간 실제 가입/신청일 기준 고객 DB 건수입니다.`
              : "지정한 기간의 실제 가입/신청일 기준 고객 DB 건수입니다."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {[14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-2 py-1 text-[11px] font-medium rounded-sm border ${
                  days === d
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-secondary"
                }`}
              >
                {d}일
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                setDays(null);
              }}
              className="px-1.5 py-1 text-[11px] border border-border rounded-sm bg-card"
            />
            <span className="text-[11px] text-muted-foreground">~</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => {
                setCustomTo(e.target.value);
                setDays(null);
              }}
              className="px-1.5 py-1 text-[11px] border border-border rounded-sm bg-card"
            />
          </div>
        </div>
      </div>
      {rangeError && <p className="text-[11px] text-destructive">{rangeError}</p>}

      <div className="flex gap-4 text-xs">
        <span className="text-foreground font-semibold">총 {totalSum}건</span>
        <span className="text-blue-600">아임웹 {imwebSum}건</span>
        <span className="text-fuchsia-600">인스타 {instagramSum}건</span>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">불러오는 중...</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex items-end gap-1.5 h-40 min-w-fit pt-2">
            {stats.map((s) => {
              const chartAreaPx = 140;
              const barHeightPx = Math.max(s.total > 0 ? 3 : 0, (s.total / maxTotal) * chartAreaPx);
              const imwebRatio = s.total > 0 ? s.imweb / s.total : 0;
              return (
                <div
                  key={s.date}
                  className="flex flex-col items-center gap-1 w-6 shrink-0"
                  title={`${s.date}\n총 ${s.total}건 (아임웹 ${s.imweb} / 인스타 ${s.instagram})`}
                >
                  <div className="w-full flex items-end" style={{ height: chartAreaPx }}>
                    <div
                      className="w-full rounded-t-sm overflow-hidden flex flex-col-reverse"
                      style={{ height: barHeightPx }}
                    >
                      <div
                        className="w-full bg-blue-400"
                        style={{ height: `${imwebRatio * 100}%` }}
                      />
                      <div
                        className="w-full bg-fuchsia-400"
                        style={{ height: `${(1 - imwebRatio) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                    {s.date.slice(5).replace("-", "/")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AutoSendControlCard() {
  const [states, setStates] = useState<KakaoSyncState[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [schedulerLoading, setSchedulerLoading] = useState(true);
  const [schedulerToggling, setSchedulerToggling] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [intervalInput, setIntervalInput] = useState("5");
  const [intervalSaving, setIntervalSaving] = useState(false);
  const [intervalMessage, setIntervalMessage] = useState("");

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
      .then((s) => {
        setSchedulerEnabled(s.enabled);
        setIntervalMinutes(s.intervalMinutes);
        setIntervalInput(String(s.intervalMinutes));
      })
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

  async function handleSaveInterval() {
    const minutes = Number(intervalInput);
    if (!Number.isFinite(minutes) || minutes < 1) {
      setIntervalMessage("1 이상의 숫자를 입력해 주세요.");
      return;
    }
    setIntervalSaving(true);
    setIntervalMessage("");
    try {
      const result = await updateKakaoSchedulerInterval(minutes);
      setIntervalMinutes(result.intervalMinutes);
      setIntervalInput(String(result.intervalMinutes));
      setIntervalMessage("저장되었습니다.");
    } catch (err) {
      setIntervalMessage(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setIntervalSaving(false);
    }
  }

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      fetchKakaoAutoSendStatus()
        .then((status) => {
          if (!status.imweb.running && !status.instagram.running) {
            setRunning(false);
            void load();
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [running, load]);

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
            title="자동 반복 주기를 기다리지 않고 지금 바로 신규 고객을 확인해 발송합니다."
            className="px-3 py-1.5 text-xs font-semibold rounded-sm border border-border hover:bg-secondary disabled:opacity-50"
          >
            {running ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-foreground animate-pulse" />
                발송 중...
              </span>
            ) : (
              "지금 바로 발송"
            )}
          </button>
        </div>
      </div>
      <div
        className={`flex items-center justify-between gap-3 rounded-sm border px-3 py-2 transition-colors ${
          schedulerEnabled
            ? "border-emerald-300 bg-emerald-50"
            : "border-border bg-secondary/20"
        }`}
      >
        <div className="flex items-center gap-2">
          {schedulerEnabled ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40" />
          )}
          <div>
            <p
              className={`text-xs font-semibold ${schedulerEnabled ? "text-emerald-700" : "text-foreground"}`}
            >
              {schedulerEnabled ? "자동 반복 발송 작동 중" : "자동 반복 발송 꺼짐"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {schedulerEnabled
                ? `서버가 ${intervalMinutes}분 간격으로 계속 신규 고객을 확인해 자동 발송하고 있습니다.`
                : "켜두면 서버가 신규 고객을 주기적으로 확인해 자동 발송합니다. 지금은 자동으로 발송되지 않습니다."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleToggleScheduler()}
          disabled={schedulerLoading || schedulerToggling}
          role="switch"
          aria-checked={schedulerEnabled}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            schedulerEnabled ? "bg-emerald-500" : "bg-secondary border border-border"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              schedulerEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      <div className="flex items-center gap-2 rounded-sm border border-border px-3 py-2">
        <label className="text-xs text-muted-foreground shrink-0">확인 간격(분)</label>
        <input
          type="number"
          min={1}
          max={180}
          value={intervalInput}
          onChange={(e) => setIntervalInput(e.target.value)}
          className="w-20 px-2 py-1 text-xs border border-border rounded-sm bg-card"
        />
        <button
          type="button"
          onClick={() => void handleSaveInterval()}
          disabled={intervalSaving}
          className="px-2 py-1 text-[11px] font-medium rounded-sm border border-border hover:bg-secondary disabled:opacity-50"
        >
          {intervalSaving ? "적용 중..." : "적용"}
        </button>
        {intervalMessage && <span className="text-[11px] text-muted-foreground">{intervalMessage}</span>}
      </div>
      <p className="text-[11px] text-muted-foreground">
        아임웹·인스타 인스턴트에서 신규로 확인된 고객에게 알림톡을 자동으로 발송합니다.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {states.map((state) => (
          <div key={state.source} className="border border-border rounded-sm p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">{SOURCE_LABELS[state.source]}</p>
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
          </div>
        ))}
      </div>
      {runMessage && <p className="text-xs text-muted-foreground">{runMessage}</p>}
    </div>
  );
}

function AdCreativeManagerCard() {
  const [creatives, setCreatives] = useState<KakaoAdCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [adName, setAdName] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    return fetchKakaoAdCreatives()
      .then(setCreatives)
      .catch(() => setCreatives([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    setError("");
    if (!adName.trim() || !mediaUrl.trim()) {
      setError("유입소재명과 이미지/영상 URL을 모두 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      await upsertKakaoAdCreative({ adName: adName.trim(), mediaUrl: mediaUrl.trim(), mediaType });
      setAdName("");
      setMediaUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 소재 이미지 등록을 삭제할까요?")) return;
    try {
      await deleteKakaoAdCreative(id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    }
  }

  return (
    <div className="border border-border rounded-sm p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-foreground">유입소재 이미지 등록</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          목록에 표시되는 축약된 소재명(예: &quot;이미지_10&quot;) 또는 원본 전체 소재명 중
          하나와 정확히 일치하게 등록하면, 고객 목록에서 해당 소재명에 마우스를 올렸을 때
          이미지/영상 미리보기가 표시됩니다.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="유입소재명(고객 목록의 '유입소재' 값과 정확히 일치해야 함)"
          value={adName}
          onChange={(e) => setAdName(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-border rounded-sm bg-card"
        />
        <select
          value={mediaType}
          onChange={(e) => setMediaType(e.target.value === "video" ? "video" : "image")}
          className="px-2 py-2 text-sm border border-border rounded-sm bg-card"
        >
          <option value="image">이미지</option>
          <option value="video">영상</option>
        </select>
      </div>
      <input
        type="text"
        placeholder="이미지/영상 URL"
        value={mediaUrl}
        onChange={(e) => setMediaUrl(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-border rounded-sm bg-card"
      />
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
      >
        {saving ? "저장 중..." : "등록"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {loading ? (
        <p className="text-xs text-muted-foreground">불러오는 중...</p>
      ) : creatives.length === 0 ? (
        <p className="text-xs text-muted-foreground">등록된 소재 이미지가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
          {creatives.map((c) => (
            <div key={c.id} className="border border-border rounded-sm p-2 space-y-1 text-xs">
              {c.mediaType === "video" ? (
                <video src={c.mediaUrl} controls className="w-full h-20 object-cover rounded-sm" />
              ) : (
                <img
                  src={c.mediaUrl}
                  alt={c.adName}
                  referrerPolicy="no-referrer"
                  className="w-full h-20 object-cover rounded-sm"
                />
              )}
              <p className="truncate text-muted-foreground" title={c.adName}>
                {c.adName}
              </p>
              <button
                type="button"
                onClick={() => void handleDelete(c.id)}
                className="w-full px-2 py-1 text-[11px] font-medium rounded-sm border border-destructive/40 text-destructive hover:bg-destructive/5"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdvancedSyncCard() {
  const [states, setStates] = useState<KakaoSyncState[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningSource, setRunningSource] = useState<KakaoLeadSource | null>(null);
  const [cancellingSource, setCancellingSource] = useState<KakaoLeadSource | null>(null);
  const [sourceMessages, setSourceMessages] = useState<Record<string, string>>({});
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState("");

  const load = useCallback(() => {
    return fetchKakaoSyncState()
      .then(setStates)
      .catch(() => setStates([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      <div>
        <h3 className="text-sm font-bold text-foreground">아임웹/인스타 개별 실행</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          아임웹 또는 인스타 한쪽만 개별로 신규 리드를 확인해 발송합니다(문제 진단용).
        </p>
      </div>
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
                  disabled={runningSource === state.source}
                  className="px-2 py-1 text-[11px] font-medium rounded-sm border border-border hover:bg-secondary disabled:opacity-50"
                >
                  {runningSource === state.source ? "발송 중..." : "이 경로만 발송"}
                </button>
              </div>
            </div>
            <p className="text-muted-foreground">마지막 동기화: {formatDate(state.lastSyncedAt)}</p>
            <p className="text-muted-foreground">마지막 실행: {formatDate(state.lastRunAt)}</p>
            {sourceMessages[state.source] && (
              <p className="text-muted-foreground">{sourceMessages[state.source]}</p>
            )}
          </div>
        ))}
      </div>
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

const SCHEDULE_STATUS_LABELS: Record<KakaoScheduledDispatchStatus, string> = {
  scheduled: "대기중",
  sent: "발송완료",
  canceled: "취소됨",
  failed: "실패",
};

const SCHEDULE_STATUS_STYLES: Record<KakaoScheduledDispatchStatus, string> = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  canceled: "bg-secondary text-muted-foreground border-border",
  failed: "bg-destructive/5 text-destructive border-destructive/30",
};

function ScheduledDispatchDetailPanel({
  item,
  onClose,
}: {
  item: KakaoScheduledDispatch;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<SolapiTemplate[]>([]);
  const [leadFields, setLeadFields] = useState<KakaoLeadFieldOption[]>([]);

  useEffect(() => {
    fetchKakaoTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
    fetchKakaoLeadFields()
      .then(setLeadFields)
      .catch(() => setLeadFields([]));
  }, []);

  const template = templates.find((t) => t.templateId === item.templateCode);
  const rawVariables = (() => {
    try {
      return JSON.parse(item.variablesJson) as Record<string, string>;
    } catch {
      return {};
    }
  })();
  // 선택발송 예약은 "$field:xxx" 형태로 발송 시점에 리드 필드값으로 치환될 참조를
  // 저장해둔다. 아직 발송 전이라 실제 값이 없으므로, 사람이 읽기 좋은 필드명으로
  // 바꿔서 "{회원명}"처럼 어떤 값이 들어갈지 알 수 있게 보여준다.
  const variables = Object.fromEntries(
    Object.entries(rawVariables).map(([k, v]) => [
      k,
      v.startsWith(FIELD_REF_PREFIX)
        ? `{${leadFields.find((f) => f.field === v.slice(FIELD_REF_PREFIX.length))?.label ?? v.slice(FIELD_REF_PREFIX.length)}}`
        : v,
    ]),
  );
  const leadIds = (() => {
    try {
      return JSON.parse(item.leadIdsJson) as string[];
    } catch {
      return [];
    }
  })();
  const renderedContent = template ? renderTemplateContent(template.content, variables) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/45" onClick={onClose}>
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-card border border-border rounded-sm shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground">
              {item.kind === "bulk" ? "선택발송 예약" : "테스트발송 예약"}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {new Date(item.scheduledAt).toLocaleString("ko-KR")}
            </p>
          </div>
          <span
            className={`inline-block px-2 py-1 rounded-sm border text-xs font-semibold ${SCHEDULE_STATUS_STYLES[item.status]}`}
          >
            {SCHEDULE_STATUS_LABELS[item.status]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">대상</p>
            <p className="font-medium text-foreground">
              {item.kind === "bulk" ? `${item.targetCount}명` : `${item.testName} (${item.testPhone})`}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">템플릿</p>
            <p className="font-medium text-foreground">{item.templateName || item.templateCode}</p>
          </div>
          <div>
            <p className="text-muted-foreground">등록자</p>
            <p className="font-medium text-foreground">{item.createdByAdmin}</p>
          </div>
          <div>
            <p className="text-muted-foreground">등록시각</p>
            <p className="font-medium text-foreground">{new Date(item.createdAt).toLocaleString("ko-KR")}</p>
          </div>
          {item.processedAt && (
            <div>
              <p className="text-muted-foreground">처리시각</p>
              <p className="font-medium text-foreground">
                {new Date(item.processedAt).toLocaleString("ko-KR")}
              </p>
            </div>
          )}
          {item.status === "sent" && (
            <div>
              <p className="text-muted-foreground">발송 결과</p>
              <p className="font-medium text-foreground">
                성공 {item.successCount ?? 0} / 실패 {item.failedCount ?? 0}
              </p>
            </div>
          )}
        </div>

        {item.status === "failed" && item.errorMessage && (
          <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-sm px-3 py-2">
            {item.errorMessage}
          </p>
        )}

        {item.kind === "bulk" && leadIds.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            대상 고객 ID {leadIds.length}건 (상세 목록은 발송 이력에서 개별 확인 가능)
          </p>
        )}

        <div>
          <p className="text-xs font-semibold text-foreground mb-2">발송 내용 미리보기</p>
          {template && renderedContent !== null ? (
            <AlimtalkPreview template={template} content={renderedContent} />
          ) : (
            <p className="text-xs text-muted-foreground">
              템플릿 정보를 찾을 수 없습니다(코드: {item.templateCode}).
            </p>
          )}
          {Object.keys(variables).length > 0 && (
            <div className="text-[11px] text-muted-foreground space-y-0.5 mt-2">
              {Object.entries(variables).map(([k, v]) => (
                <p key={k}>
                  #{k} → {v || "(빈 값)"}
                </p>
              ))}
            </div>
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
    </div>
  );
}

function ScheduledDispatchesTab() {
  const [items, setItems] = useState<KakaoScheduledDispatch[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<KakaoScheduledDispatchStatus | "">("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<KakaoScheduledDispatch | null>(null);
  const pageSize = 20;

  const load = useCallback(() => {
    setLoading(true);
    return fetchKakaoScheduledDispatches({ status: status || undefined, page, pageSize })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // 대기중 예약건이 있으면 시각이 지나 처리됐는지 주기적으로 갱신해서 보여준다.
  useEffect(() => {
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  async function handleCancel(id: string) {
    if (!window.confirm("이 예약을 취소할까요?")) return;
    setCancelingId(id);
    try {
      await cancelKakaoScheduledDispatch(id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "예약 취소에 실패했습니다.");
    } finally {
      setCancelingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="border border-border rounded-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-border">
        <div>
          <h3 className="text-sm font-bold text-foreground">예약 발송 목록</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            선택 발송·테스트 발송에서 예약한 건들을 확인하고 대기중인 예약을 취소할 수 있습니다.
          </p>
        </div>
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as KakaoScheduledDispatchStatus | "");
          }}
          className="px-2 py-1.5 text-xs border border-border rounded-sm bg-card"
        >
          <option value="">전체 상태</option>
          {(Object.keys(SCHEDULE_STATUS_LABELS) as KakaoScheduledDispatchStatus[]).map((s) => (
            <option key={s} value={s}>
              {SCHEDULE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">예약 시각</th>
              <th className="px-3 py-2 font-medium">종류</th>
              <th className="px-3 py-2 font-medium">대상</th>
              <th className="px-3 py-2 font-medium">템플릿</th>
              <th className="px-3 py-2 font-medium">상태</th>
              <th className="px-3 py-2 font-medium">등록자</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  불러오는 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  예약된 발송이 없습니다.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="border-b border-border last:border-0 hover:bg-secondary/20 cursor-pointer"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(item.scheduledAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2">{item.kind === "bulk" ? "선택발송" : "테스트"}</td>
                  <td className="px-3 py-2">
                    {item.kind === "bulk" ? `${item.targetCount}명` : item.testPhone}
                  </td>
                  <td className="px-3 py-2">{item.templateName || item.templateCode}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-sm border text-[11px] ${SCHEDULE_STATUS_STYLES[item.status]}`}
                    >
                      {SCHEDULE_STATUS_LABELS[item.status]}
                    </span>
                    {item.status === "sent" && (
                      <span className="ml-1.5 text-muted-foreground">
                        성공 {item.successCount ?? 0}/실패 {item.failedCount ?? 0}
                      </span>
                    )}
                    {item.status === "failed" && item.errorMessage && (
                      <span className="ml-1.5 text-destructive">{item.errorMessage}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{item.createdByAdmin}</td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {item.status === "scheduled" && (
                      <button
                        type="button"
                        onClick={() => void handleCancel(item.id)}
                        disabled={cancelingId === item.id}
                        className="px-2 py-1 text-[11px] font-medium rounded-sm border border-destructive/40 text-destructive hover:bg-destructive/5 disabled:opacity-50"
                      >
                        {cancelingId === item.id ? "취소 중..." : "예약 취소"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 p-3 border-t border-border text-xs">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-2 py-1 rounded-sm border border-border hover:bg-secondary disabled:opacity-50"
          >
            이전
          </button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-2 py-1 rounded-sm border border-border hover:bg-secondary disabled:opacity-50"
          >
            다음
          </button>
        </div>
      )}

      {selectedItem && (
        <ScheduledDispatchDetailPanel item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
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
  const [group, setGroup] = useState("");
  const [joinedFrom, setJoinedFrom] = useState("");
  const [joinedTo, setJoinedTo] = useState("");
  const [duplicateOnly, setDuplicateOnly] = useState(false);
  const [groupLabels, setGroupLabels] = useState<string[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const pageSize = 20;

  const [colWidths, setColWidths] = useState<number[]>([
    32, 72, 108, 64, 48, 84, 100, 100, 76, 120,
  ]);
  const [adCreativeMap, setAdCreativeMap] = useState<Record<string, KakaoAdCreative>>({});
  const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { index, startX: e.clientX, startWidth: colWidths[index] };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const resizing = resizingRef.current;
      if (!resizing) return;
      const delta = moveEvent.clientX - resizing.startX;
      const newWidth = Math.max(32, resizing.startWidth + delta);
      setColWidths((prev) => {
        const next = [...prev];
        next[resizing.index] = newWidth;
        return next;
      });
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colWidths]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchKakaoLeads({
        source: source || undefined,
        status: status || undefined,
        search: search || undefined,
        group: group || undefined,
        joinedFrom: joinedFrom || undefined,
        joinedTo: joinedTo || undefined,
        duplicateOnly: duplicateOnly || undefined,
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
  }, [source, status, search, group, joinedFrom, joinedTo, duplicateOnly, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadGroupLabels = useCallback(() => {
    fetchKakaoGroupLabels()
      .then(setGroupLabels)
      .catch(() => setGroupLabels([]));
  }, []);

  useEffect(() => {
    loadGroupLabels();
  }, [loadGroupLabels]);

  useEffect(() => {
    fetchKakaoAdCreatives()
      .then((list) => setAdCreativeMap(Object.fromEntries(list.map((c) => [c.adName, c]))))
      .catch(() => setAdCreativeMap({}));
  }, []);

  // 필터/검색/페이지를 바꿔도 선택 상태를 유지한다. 검색으로 특정 인원만
  // 찾아 선택 해제하는 식의 사용을 지원하기 위함. 선택 초기화는 명시적으로
  // "선택 해제" 버튼을 누르거나 발송/삭제가 완료됐을 때만 일어난다.

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allCurrentPageChecked = leads.length > 0 && leads.every((l) => checkedIds.has(l.id));

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSelectAllMatching() {
    setSelectingAll(true);
    try {
      const ids = await fetchKakaoLeadIds({
        source: source || undefined,
        status: status || undefined,
        search: search || undefined,
        group: group || undefined,
        joinedFrom: joinedFrom || undefined,
        joinedTo: joinedTo || undefined,
        duplicateOnly: duplicateOnly || undefined,
      });
      setCheckedIds(new Set(ids));
    } catch (err) {
      alert(err instanceof Error ? err.message : "전체 선택에 실패했습니다.");
    } finally {
      setSelectingAll(false);
    }
  }

  async function handleAssignGroup(groupLabel: string) {
    try {
      await setKakaoLeadGroupBulk(Array.from(checkedIds), groupLabel);
      setGroupModalOpen(false);
      loadGroupLabels();
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "그룹 지정에 실패했습니다.");
    }
  }

  function toggleCheckAll() {
    setCheckedIds((prev) => {
      if (allCurrentPageChecked) {
        const next = new Set(prev);
        leads.forEach((l) => next.delete(l.id));
        return next;
      }
      const next = new Set(prev);
      leads.forEach((l) => next.add(l.id));
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (checkedIds.size === 0) return;
    const input = window.prompt(
      `선택한 고객 ${checkedIds.size}명을 삭제합니다. 되돌릴 수 없습니다.\n계속하려면 인원수(${checkedIds.size})를 정확히 입력해 주세요.`,
    );
    if (input === null) return;
    if (input.trim() !== String(checkedIds.size)) {
      alert("입력한 숫자가 일치하지 않아 삭제를 취소했습니다.");
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

  function handleBulkSendDone() {
    setCheckedIds(new Set());
    void load();
  }

  const [activeTab, setActiveTab] = useState<"basic" | "scheduled" | "advanced">("basic");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">알림톡 관리</h2>
        <p className="text-sm text-muted-foreground mt-1">
          아임웹·인스타그램에서 유입된 고객 DB와 솔라피 알림톡 발송 이력을 관리합니다.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("basic")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "basic"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          기본
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("scheduled")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "scheduled"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          예약
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("advanced")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "advanced"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          세부설정
        </button>
      </div>

      {activeTab === "basic" && (
        <>
          <TemplateSettingsCard />
          <AutoSendControlCard />
          <DailyStatsCard />
        </>
      )}
      {activeTab === "advanced" && (
        <>
          <TestSendCard />
          <InstagramSheetConfigCard />
          <AdCreativeManagerCard />
          <AdvancedSyncCard />
        </>
      )}
      {activeTab === "scheduled" && <ScheduledDispatchesTab />}

      {activeTab !== "scheduled" && (
      <div className="border border-border rounded-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-border">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={source}
            onChange={(e) => {
              setPage(1);
              setSource(e.target.value as KakaoLeadSource | "");
            }}
            className="px-2 py-1.5 text-sm border border-border rounded-sm bg-card"
          >
            <option value="">유입경로</option>
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
            <option value="">상태</option>
            <option value="pending">대기</option>
            <option value="sent">발송성공</option>
            <option value="failed">발송실패</option>
            <option value="skipped_duplicate">중복제외</option>
          </select>
          <select
            value={group}
            onChange={(e) => {
              setPage(1);
              setGroup(e.target.value);
            }}
            className="px-2 py-1.5 text-sm border border-border rounded-sm bg-card"
          >
            <option value="">그룹</option>
            {groupLabels.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="이름 또는 전화번호 검색"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="w-40 px-2 py-1.5 text-sm border border-border rounded-sm bg-card"
          />
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={joinedFrom}
              onChange={(e) => {
                setPage(1);
                setJoinedFrom(e.target.value);
              }}
              className="px-2 py-1.5 text-sm border border-border rounded-sm bg-card"
            />
            <span className="text-xs text-muted-foreground">~</span>
            <input
              type="date"
              value={joinedTo}
              onChange={(e) => {
                setPage(1);
                setJoinedTo(e.target.value);
              }}
              className="px-2 py-1.5 text-sm border border-border rounded-sm bg-card"
            />
            {(joinedFrom || joinedTo) && (
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  setJoinedFrom("");
                  setJoinedTo("");
                }}
                className="px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                초기화
              </button>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={duplicateOnly}
              onChange={(e) => {
                setPage(1);
                setDuplicateOnly(e.target.checked);
              }}
            />
            중복만 보기
          </label>
          <span className="text-xs text-muted-foreground">총 {total}건</span>
          {total > 0 && checkedIds.size < total && (
            <button
              type="button"
              onClick={() => void handleSelectAllMatching()}
              disabled={selectingAll}
              className="px-2 py-1 text-[11px] font-medium rounded-sm border border-primary/40 text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              {selectingAll ? "선택 중..." : "전체선택"}
            </button>
          )}
          {checkedIds.size > 0 && (
            <>
              <span className="text-xs font-medium text-foreground">
                {checkedIds.size}건 선택됨
              </span>
              <button
                type="button"
                onClick={() => setCheckedIds(new Set())}
                className="px-2 py-1 text-[11px] font-medium rounded-sm border border-border hover:bg-secondary"
              >
                선택 해제
              </button>
              <button
                type="button"
                onClick={() => setBulkSendOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground"
              >
                선택 발송 ({checkedIds.size})
              </button>
              <button
                type="button"
                onClick={() => setGroupModalOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-sm border border-border hover:bg-secondary"
              >
                그룹 지정
              </button>
            </>
          )}
        </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground p-6 text-center">불러오는 중...</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">고객 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse table-fixed" style={{ width: colWidths.reduce((a, b) => a + b, 0) }}>
              <colgroup>
                {colWidths.map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead className="bg-secondary/80">
                <tr className="border-b border-border">
                  <th className="relative px-3 py-2.5 text-left overflow-hidden">
                    <input
                      type="checkbox"
                      checked={allCurrentPageChecked}
                      onChange={toggleCheckAll}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  {[
                    "이름",
                    "전화번호",
                    "유입경로",
                    "성별",
                    "생년월일",
                    "주소",
                    "유입소재",
                    "상태",
                    "가입시각",
                  ].map((label, i) => (
                    <th
                      key={label}
                      className="relative px-3 py-2.5 text-left font-semibold whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      {label}
                      <span
                        onMouseDown={(e) => handleResizeStart(i + 1, e)}
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-primary/40"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`border-b border-border hover:bg-secondary/20 cursor-pointer ${
                      lead.excludedFromBulk ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checkedIds.has(lead.id)}
                        onChange={() => toggleChecked(lead.id)}
                      />
                    </td>
                    <td className="px-3 py-2.5 overflow-hidden text-ellipsis whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {lead.name || "-"}
                        {lead.hasDuplicateApplications && (
                          <span
                            title="같은 번호의 다른 신청 이력이 있습니다"
                            className="inline-flex px-1 py-0.5 text-[9px] font-semibold rounded-sm border bg-amber-50 text-amber-700 border-amber-200 shrink-0"
                          >
                            중복
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono whitespace-nowrap">{maskPhone(lead.phone)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{SOURCE_LABELS[lead.source]}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                      {lead.gender || "-"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                      {lead.birthDate || "-"}
                    </td>
                    <td
                      className="px-3 py-2.5 text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap"
                      title={lead.address}
                    >
                      {lead.address || "-"}
                    </td>
                    <td
                      className="px-3 py-2.5 text-muted-foreground relative"
                      onClick={(e) => e.stopPropagation()}
                      title={
                        !lead.adName && lead.utmContent
                          ? `소재ID: ${lead.utmContent} (추정치)`
                          : undefined
                      }
                    >
                      {lead.adName ? (
                        <AdCreativeHoverLabel
                          displayKey={shortenAdName(lead.adName)}
                          displayLabel={shortenAdName(lead.adName)}
                          creative={
                            adCreativeMap[lead.adName] ?? adCreativeMap[shortenAdName(lead.adName)]
                          }
                          onRegistered={(creative) =>
                            setAdCreativeMap((prev) => ({ ...prev, [creative.adName]: creative }))
                          }
                        />
                      ) : lead.utmContent ? (
                        <AdCreativeHoverLabel
                          displayKey={lead.utmContent}
                          displayLabel={adCreativeMap[lead.utmContent]?.label || lead.utmContent}
                          creative={adCreativeMap[lead.utmContent]}
                          onRegistered={(creative) =>
                            setAdCreativeMap((prev) => ({ ...prev, [creative.adName]: creative }))
                          }
                          showNameInput
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold rounded-sm border ${STATUS_STYLES[lead.status]}`}
                      >
                        {STATUS_LABELS[lead.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                      {formatDate(lead.joinedAt)}
                    </td>
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

        {checkedIds.size > 0 && (
          <div className="flex items-center justify-end gap-2 p-3 border-t border-border bg-destructive/[0.03]">
            <span className="text-[11px] text-muted-foreground mr-1">
              선택한 {checkedIds.size}건을 완전히 삭제하려면
            </span>
            <button
              type="button"
              onClick={() => void handleDeleteSelected()}
              disabled={deleting}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm border border-destructive/50 text-destructive hover:bg-destructive/5 disabled:opacity-50"
            >
              {deleting ? "삭제 중..." : `선택 삭제 (${checkedIds.size})`}
            </button>
          </div>
        )}
      </div>
      )}

      {selectedLeadId && (
        <LeadDetailPanel
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onResent={() => void load()}
        />
      )}

      {bulkSendOpen && (
        <BulkSendModal
          leadIds={Array.from(checkedIds)}
          onClose={() => setBulkSendOpen(false)}
          onDone={handleBulkSendDone}
        />
      )}

      {groupModalOpen && (
        <GroupAssignModal
          count={checkedIds.size}
          existingGroups={groupLabels}
          onClose={() => setGroupModalOpen(false)}
          onAssign={(groupLabel) => void handleAssignGroup(groupLabel)}
        />
      )}
    </div>
  );
}
