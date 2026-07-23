"use client";

import { useState } from "react";

const LOCAL_AGENT_URL = "http://127.0.0.1:5555";

export function SwimApplyTab() {
  const [sisulId, setSisulId] = useState("");
  const [sisulPw, setSisulPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

  async function handleRun() {
    if (!sisulId || !sisulPw) {
      setMessage("아이디와 비밀번호를 입력해 주세요.");
      setMessageIsError(true);
      return;
    }

    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch(`${LOCAL_AGENT_URL}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sisul_id: sisulId, sisul_pw: sisulPw }),
      });
      const data = await res.json();
      setMessage(data.message ?? "요청을 보냈습니다.");
      setMessageIsError(!data.ok);
    } catch {
      setMessage(
        `이 컴퓨터에서 실행 중인 로컬 프로그램(${LOCAL_AGENT_URL})에 연결할 수 없습니다. run_server.bat을 먼저 실행해 주세요.`,
      );
      setMessageIsError(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-lg font-semibold mb-1">수영신청</h2>
      <p className="text-sm text-muted-foreground mb-6">
        이 버튼을 누르면 <b>이 화면을 보고 있는 컴퓨터</b>에서 브라우저 창이 열리고 로그인부터 수강신청 화면까지
        자동으로 진행됩니다. 캡차 입력과 최종 결제는 브라우저 창에서 직접 진행해 주세요. 실행 전 이 컴퓨터에서
        run_server.bat이 켜져 있어야 합니다.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">아이디</label>
          <input
            type="text"
            value={sisulId}
            onChange={(e) => setSisulId(e.target.value)}
            className="w-full border border-border rounded-md px-3 py-2 text-sm"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">비밀번호</label>
          <div className="flex gap-2">
            <input
              type={showPw ? "text" : "password"}
              value={sisulPw}
              onChange={(e) => setSisulPw(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="px-3 text-sm border border-border rounded-md"
            >
              {showPw ? "숨기기" : "보기"}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="w-full bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {running ? "실행 중..." : "수강신청 실행"}
        </button>

        {message && (
          <p className={`text-sm ${messageIsError ? "text-red-500" : "text-green-600"}`}>{message}</p>
        )}
      </div>
    </div>
  );
}
