"use client";

import { useEffect, useState } from "react";
import { fetchJaegebalDeviceSettings, fetchJaegebalEgress, redeployJaegebalServer, saveJaegebalDeviceId, type JaegebalDeviceSettings, type JaegebalEgressInfo } from "@/lib/api";

const POLL_MS = 5000;
const REDEPLOY_TIMEOUT_MS = 6 * 60 * 1000;

/** 구역도 업데이트 탭 맨 위 — 재개발닷컴 호출에 쓰는 디바이스 아이디(x-jdc-device-id). 전체 실행·자동 업데이트·새 구역 경계 받기가 모두 이 값을 쓴다. */
export function RedevelopmentDeviceId({ disabled }: { disabled?: boolean }) {
  const [settings, setSettings] = useState<JaegebalDeviceSettings | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [egress, setEgress] = useState<JaegebalEgressInfo | null>(null);
  /** 재배포를 누르기 전 값 — 재배포가 끝난 뒤 IP가 바뀌었는지 비교한다. */
  const [redeploy, setRedeploy] = useState<{ startedAt: number; prevIp: string | null; prevDeploymentId: string | null } | null>(null);
  const [redeployResult, setRedeployResult] = useState<{ prevIp: string | null; newIp: string | null; changed: boolean } | null>(null);

  const loadEgress = () =>
    fetchJaegebalEgress()
      .then((e) => {
        setEgress(e);
        return e;
      })
      .catch(() => null);

  useEffect(() => {
    void loadEgress();
    fetchJaegebalDeviceSettings()
      .then((s) => {
        setSettings(s);
        setInput(s.deviceId);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "디바이스 아이디를 불러오지 못했습니다."));
  }, []);

  async function save(value: string) {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const s = await saveJaegebalDeviceId(value);
      setSettings(s);
      setInput(s.deviceId);
      setMessage(value ? "저장했습니다. 다음 호출부터 이 값을 씁니다." : "기본값으로 되돌렸습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 재배포 후: 서버가 다시 뜨고 배포 id가 바뀔 때까지 5초마다 확인한다.
  useEffect(() => {
    if (!redeploy) return;
    const timer = setInterval(() => {
      if (Date.now() - redeploy.startedAt > REDEPLOY_TIMEOUT_MS) {
        setRedeploy(null);
        setError("재배포 완료를 확인하지 못했습니다. 잠시 뒤 '다시 확인'을 눌러 보세요.");
        return;
      }
      void loadEgress().then((e) => {
        if (!e || !e.ip || e.deploymentId === redeploy.prevDeploymentId) return; // 아직 이전 서버
        setRedeployResult({ prevIp: redeploy.prevIp, newIp: e.ip, changed: e.ip !== redeploy.prevIp });
        setRedeploy(null);
      });
    }, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redeploy]);

  async function startRedeploy() {
    if (!window.confirm("Railway 서버를 재배포합니다. 서버가 잠시(1~3분) 내려가고 다시 시작됩니다.\n진행 중인 수집이 없는지 확인했나요?")) return;
    setError(null);
    setMessage(null);
    setRedeployResult(null);
    const before = egress ?? (await loadEgress());
    try {
      const r = await redeployJaegebalServer();
      setRedeploy({ startedAt: Date.now(), prevIp: before?.ip ?? null, prevDeploymentId: r.previousDeploymentId ?? before?.deploymentId ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "재배포를 요청하지 못했습니다.");
    }
  }

  const changed = !!settings && input.trim() !== settings.deviceId;

  return (
    <div className="rounded-sm border border-border bg-card px-4 py-3 text-xs space-y-1.5">
      <p className="font-semibold text-foreground">
        디바이스 아이디 <span className="font-normal text-muted-foreground">— 재개발닷컴 호출(전체 실행·자동 업데이트·새 구역 경계 받기)에 공통으로 쓰는 x-jdc-device-id입니다. 막히면 새 값으로 바꿔 진행하세요.</span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">현재 적용</span>
        <b className="text-foreground">{settings?.deviceId ?? "-"}</b>
        {settings && <span className="text-muted-foreground">{settings.custom ? "(직접 지정)" : "(서버 기본값)"}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">변경</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy || disabled}
          placeholder="web;xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="w-80 rounded-sm border border-border bg-background px-1.5 py-1 text-xs"
        />
        <button type="button" disabled={busy || disabled || !changed} onClick={() => void save(input.trim())} className="rounded-sm border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
          {busy ? "저장 중…" : "저장"}
        </button>
        {settings?.custom && (
          <button type="button" disabled={busy || disabled} onClick={() => void save("")} className="rounded-sm border border-border px-2 py-1 text-xs disabled:opacity-40">
            기본값으로
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-1.5">
        <span className="text-muted-foreground">서버 현재 IP</span>
        <b className="text-foreground">{egress?.ip ?? (egress?.ipError ? `확인 실패(${egress.ipError})` : "-")}</b>
        <button type="button" onClick={() => void loadEgress()} disabled={!!redeploy} className="rounded-sm border border-border px-2 py-0.5 text-xs disabled:opacity-40">
          다시 확인
        </button>
        <button
          type="button"
          onClick={() => void startRedeploy()}
          disabled={!!redeploy || disabled || !egress?.redeployConfigured}
          title={egress && !egress.redeployConfigured ? "서버 환경변수 RAILWAY_API_TOKEN(프로젝트 토큰)이 없어 재배포할 수 없습니다." : undefined}
          className="rounded-sm border border-border px-3 py-1 text-xs font-semibold text-foreground disabled:opacity-40"
        >
          {redeploy ? "재배포 중…" : "Railway 재배포"}
        </button>
        {egress && !egress.redeployConfigured && <span className="text-muted-foreground">(재배포하려면 서버 환경변수 RAILWAY_API_TOKEN 필요)</span>}
      </div>
      {redeploy && <p className="text-muted-foreground">재배포 중입니다… 서버가 다시 뜰 때까지 자동으로 확인합니다(이전 IP: {redeploy.prevIp ?? "-"}).</p>}
      {redeployResult && (
        <p className={redeployResult.changed ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
          {redeployResult.changed ? `IP가 변경되었습니다: ${redeployResult.prevIp ?? "-"} → ${redeployResult.newIp}` : `재배포했지만 IP는 그대로입니다: ${redeployResult.newIp}`}
        </p>
      )}
      {error && <p className="text-destructive">{error}</p>}
      {message && <p className="text-muted-foreground">{message}</p>}
    </div>
  );
}
