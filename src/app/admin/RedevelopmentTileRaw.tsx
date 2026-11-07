"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchJaegebalTileRawDetail,
  fetchJaegebalTileRawList,
  fetchJaegebalTileRawStatus,
  startJaegebalTileRaw,
  type JaegebalTileRawDetail,
  type JaegebalTileRawRow,
  type JaegebalTileRawStatus,
} from "@/lib/api";

const POLL_MS = 5000;
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(iso));

/** 구역도 업데이트 탭 — 타일 원본 수집: device-id를 넣고 1~21번 타일을 서버가 받아 DB에 저장하고 결과를 보여준다(기존 구역 업데이트와 별개). */
export function RedevelopmentTileRaw() {
  const [deviceId, setDeviceId] = useState("");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("5");
  const [status, setStatus] = useState<JaegebalTileRawStatus | null>(null);
  const [rows, setRows] = useState<JaegebalTileRawRow[]>([]);
  const [total, setTotal] = useState(21);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<JaegebalTileRawDetail | null>(null);

  const running = !!status?.running;

  const loadList = useCallback(() => {
    fetchJaegebalTileRawList()
      .then((r) => {
        setRows(r.tiles);
        setTotal(r.total);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchJaegebalTileRawStatus().then(setStatus).catch(() => undefined);
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      fetchJaegebalTileRawStatus()
        .then((s) => {
          setStatus(s);
          loadList();
        })
        .catch((e) => setError(e instanceof Error ? e.message : "상태 확인 실패"));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, loadList]);

  async function start() {
    setError(null);
    const f = Number(from);
    const t = Number(to);
    if (!Number.isInteger(f) || !Number.isInteger(t) || f < 1 || t < f || t > total) {
      setError(`타일 번호는 1~${total} 범위이고, 끝 번호가 시작 번호 이상이어야 합니다.`);
      return;
    }
    setStarting(true);
    try {
      setStatus(await startJaegebalTileRaw(deviceId, f, t));
    } catch (e) {
      setError(e instanceof Error ? e.message : "시작하지 못했습니다.");
    } finally {
      setStarting(false);
    }
  }

  async function show(no: number) {
    setError(null);
    try {
      setDetail(await fetchJaegebalTileRawDetail(no));
    } catch (e) {
      setError(e instanceof Error ? e.message : "결과를 불러오지 못했습니다.");
    }
  }

  const byTile = new Map(rows.map((r) => [r.tileNo, r]));
  const resultByTile = new Map((status?.results ?? []).map((r) => [r.tile, r]));

  return (
    <div className="rounded-sm border border-border bg-card px-4 py-3 text-xs space-y-2">
      <p className="font-semibold text-foreground">
        타일 원본 수집 <span className="font-normal text-muted-foreground">— device-id를 넣고 1~{total}번 타일을 서버가 받아 DB에 저장합니다(한 번에 최대 5개, 요청 사이 30초, 막히면 즉시 중단). 위 구역 업데이트와는 별개입니다.</span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">x-jdc-device-id</span>
        <input
          type="text"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          disabled={running || starting}
          placeholder="web;xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="w-80 rounded-sm border border-border bg-background px-1.5 py-1 text-xs"
        />
        <span className="text-muted-foreground">타일</span>
        <input type="number" min={1} max={total} value={from} onChange={(e) => setFrom(e.target.value)} disabled={running || starting} className="w-14 rounded-sm border border-border bg-background px-1.5 py-1 text-xs" />
        <span>~</span>
        <input type="number" min={1} max={total} value={to} onChange={(e) => setTo(e.target.value)} disabled={running || starting} className="w-14 rounded-sm border border-border bg-background px-1.5 py-1 text-xs" />
        <span className="text-muted-foreground">번</span>
        <button
          type="button"
          disabled={running || starting || !deviceId.trim()}
          onClick={() => void start()}
          className="rounded-sm border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {running ? "수집 중…" : starting ? "시작 중…" : "타일 수집"}
        </button>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      {status?.blocked && <p className="text-destructive">중단됨: {status.blocked}</p>}
      {running && status && <p className="text-muted-foreground">타일 {status.from}~{status.to}번 수집 중… ({status.results.length}/{(status.to ?? 0) - (status.from ?? 0) + 1}개 처리)</p>}

      <table className="w-full max-w-2xl border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-1 pr-3">타일</th>
            <th className="py-1 pr-3">건수</th>
            <th className="py-1 pr-3">저장 시각</th>
            <th className="py-1 pr-3">결과</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
            const saved = byTile.get(n);
            const cur = resultByTile.get(n);
            return (
              <tr key={n} className="border-b border-border/50">
                <td className="py-1 pr-3 font-semibold">{n}번</td>
                <td className="py-1 pr-3">{saved?.itemCount != null ? `${saved.itemCount.toLocaleString("ko-KR")}건` : "-"}</td>
                <td className="py-1 pr-3 text-muted-foreground">{saved ? dateTime(saved.fetchedAt) : "-"}</td>
                <td className={`py-1 pr-3 ${cur?.error ? "text-destructive" : "text-muted-foreground"}`}>{cur?.error ?? (cur ? "이번 실행 저장" : saved ? "저장됨" : "미수집")}</td>
                <td className="py-1">
                  {saved && (
                    <button type="button" onClick={() => void show(n)} className="rounded-sm border border-border px-2 py-0.5 text-xs">
                      결과 보기
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {detail && (
        <div className="rounded-sm border border-border bg-background p-2">
          <div className="mb-1 flex items-center justify-between">
            <b>{detail.tileNo}번 타일 — {detail.itemCount ?? 0}건</b>
            <button type="button" onClick={() => setDetail(null)} className="rounded-sm border border-border px-2 py-0.5 text-xs">닫기</button>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-0.5 pr-2">id</th>
                  <th className="py-0.5 pr-2">이름</th>
                  <th className="py-0.5 pr-2">지역코드</th>
                  <th className="py-0.5 pr-2">사업유형</th>
                  <th className="py-0.5">단계</th>
                </tr>
              </thead>
              <tbody>
                {(detail.raw ?? []).map((it, i) => (
                  <tr key={`${String(it.id)}-${i}`} className="border-b border-border/40">
                    <td className="py-0.5 pr-2">{String(it.id ?? "")}</td>
                    <td className="py-0.5 pr-2">{String(it.title ?? "")}</td>
                    <td className="py-0.5 pr-2">{String(it.region_code ?? "")}</td>
                    <td className="py-0.5 pr-2">{String(it.type_display_name ?? "")}</td>
                    <td className="py-0.5">{String(it.detail_stage ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
