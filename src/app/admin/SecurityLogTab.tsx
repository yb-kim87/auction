"use client";

import { useEffect, useState } from "react";
import {
  analyzeSecurityLogNow,
  fetchRecentSecurityLog,
  fetchSecurityLogIpExclusions,
  addSecurityLogIpExclusion,
  removeSecurityLogIpExclusion,
  type SecurityLogIpExclusion,
} from "@/lib/api";

type LogEntry = {
  ts: string;
  ip: string;
  method: string;
  path: string;
  username: string;
  status: number;
  durationMs: number;
  userAgent: string;
};

function parseLine(line: string): LogEntry | null {
  try {
    return JSON.parse(line) as LogEntry;
  } catch {
    return null;
  }
}

export function SecurityLogTab() {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [exclusions, setExclusions] = useState<SecurityLogIpExclusion[]>([]);
  const [exclusionsLoading, setExclusionsLoading] = useState(true);
  const [newIp, setNewIp] = useState("");
  const [newNote, setNewNote] = useState("");
  const [addingIp, setAddingIp] = useState(false);
  const [exclusionMessage, setExclusionMessage] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetchRecentSecurityLog()
      .then((res) => setLines(res.lines))
      .catch((err) => setMessage(err instanceof Error ? err.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }

  function loadExclusions() {
    setExclusionsLoading(true);
    fetchSecurityLogIpExclusions()
      .then(setExclusions)
      .catch((err) =>
        setExclusionMessage(err instanceof Error ? err.message : "예외 IP 목록을 불러오지 못했습니다."),
      )
      .finally(() => setExclusionsLoading(false));
  }

  useEffect(load, []);
  useEffect(loadExclusions, []);

  async function handleAddExclusion() {
    if (!newIp.trim()) {
      setExclusionMessage("IP를 입력해 주세요.");
      return;
    }
    setAddingIp(true);
    setExclusionMessage(null);
    try {
      await addSecurityLogIpExclusion(newIp.trim(), newNote.trim());
      setNewIp("");
      setNewNote("");
      loadExclusions();
    } catch (err) {
      setExclusionMessage(err instanceof Error ? err.message : "예외 IP 추가에 실패했습니다.");
    } finally {
      setAddingIp(false);
    }
  }

  async function handleRemoveExclusion(id: string) {
    try {
      await removeSecurityLogIpExclusion(id);
      loadExclusions();
    } catch (err) {
      setExclusionMessage(err instanceof Error ? err.message : "예외 IP 삭제에 실패했습니다.");
    }
  }

  async function handleAnalyzeNow() {
    setAnalyzing(true);
    setMessage(null);
    try {
      const result = await analyzeSecurityLogNow();
      setMessage(
        result.ran
          ? "분석을 실행했습니다. 의심 패턴이 있으면 텔레그램으로 알림이 전송됩니다."
          : `분석을 실행할 수 없습니다: ${result.reason}`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "분석 실행 실패");
    } finally {
      setAnalyzing(false);
    }
  }

  const entries = lines.map(parseLine).filter((e): e is LogEntry => e !== null).reverse();

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg font-bold text-foreground">로그 감지 시스템 (이상행위 알림)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          모든 API 요청을 DB(request_logs, 30일 보관)에 기록하고, 10분마다 AI가 대량요청·
          크롤링·자동화 스크립트로 의심되는 패턴이 있는지 분석합니다. 의심되면 텔레그램으로
          관리자에게 자동 알림이 전송됩니다. OPENAI_API_KEY, TELEGRAM_BOT_TOKEN,
          TELEGRAM_CHAT_ID 환경변수가 설정되어 있어야 동작합니다.
        </p>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleAnalyzeNow()}
        disabled={analyzing}
        className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
      >
        {analyzing ? "분석 중..." : "지금 바로 분석 실행"}
      </button>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">알림 제외 IP 관리</h3>
        <p className="text-xs text-muted-foreground mb-3">
          구글 서비스 계정 등 정상 연동으로 확인된 IP를 등록하면, 해당 IP의 요청은 이상행위
          분석·알림 대상에서 제외됩니다. 대역이 아니라 정확한 IP 단위로만 등록하세요.
        </p>
        {exclusionMessage && (
          <div className="text-sm px-3 py-2 mb-3 rounded-sm border border-border bg-secondary/30">
            {exclusionMessage}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            placeholder="IP (예: 35.187.134.139)"
            className="px-3 py-1.5 text-sm border border-border rounded-sm bg-background w-56"
          />
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="메모 (선택, 예: 구글시트 연동)"
            className="px-3 py-1.5 text-sm border border-border rounded-sm bg-background w-64"
          />
          <button
            type="button"
            onClick={() => void handleAddExclusion()}
            disabled={addingIp}
            className="px-4 py-1.5 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            {addingIp ? "추가 중..." : "IP 추가"}
          </button>
        </div>
        <div className="border border-border rounded-sm overflow-x-auto max-h-64 overflow-y-auto">
          {exclusionsLoading ? (
            <p className="text-sm text-muted-foreground p-4">불러오는 중...</p>
          ) : exclusions.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">등록된 예외 IP가 없습니다.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-secondary/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">IP</th>
                  <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">메모</th>
                  <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">등록일</th>
                  <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody>
                {exclusions.map((ex) => (
                  <tr key={ex.id} className="border-t border-border">
                    <td className="px-3 py-1.5 whitespace-nowrap font-mono">{ex.ip}</td>
                    <td className="px-3 py-1.5">{ex.note || "-"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                      {new Date(ex.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => void handleRemoveExclusion(ex.id)}
                        className="text-xs text-destructive hover:underline"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-foreground">최근 요청 로그 (최대 200건)</p>
          <button type="button" onClick={load} className="text-xs text-primary hover:underline">
            새로고침
          </button>
        </div>
        <div className="border border-border rounded-sm overflow-x-auto max-h-[32rem] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground p-4">불러오는 중...</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">로그가 없습니다.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-secondary/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">시각</th>
                  <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">IP</th>
                  <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">메서드/경로</th>
                  <th className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">사용자</th>
                  <th className="px-3 py-2 font-semibold text-foreground text-right whitespace-nowrap">상태</th>
                  <th className="px-3 py-2 font-semibold text-foreground text-right whitespace-nowrap">ms</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, idx) => (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                      {new Date(e.ts).toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap font-mono">{e.ip}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {e.method} {e.path}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{e.username || "-"}</td>
                    <td
                      className={`px-3 py-1.5 text-right whitespace-nowrap ${
                        e.status >= 400 ? "text-destructive font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      {e.status}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap text-muted-foreground">
                      {e.durationMs}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
