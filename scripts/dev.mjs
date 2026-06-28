import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEV_PORT = 3000;

function killPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING")) continue;
      const pid = line.trim().split(/\s+/).pop();
      if (pid && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
      console.log(`stopped PID ${pid} on port ${port}`);
    }
  } catch {
    // no process on port
  }
}

const cacheDirs = [
  path.join(root, ".next"),
  path.join(root, "..", "..", "..", "..", "auction-next-cache"),
];

if (process.env.CLEAN_NEXT === "1") {
  for (const dir of cacheDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`removed: ${dir}`);
    } catch (err) {
      console.warn(`skip: ${dir} (${err.code ?? err.message})`);
    }
  }
}

// 프론트는 3000, API는 3001 — 3001은 건드리지 않음
killPort(DEV_PORT);

async function checkApi() {
  try {
    const res = await fetch("http://127.0.0.1:3001/", { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

console.log(`\nStarting Next.js on http://localhost:${DEV_PORT}`);

const apiUp = await checkApi();
if (apiUp) {
  console.log("API 서버(3001) 연결 확인됨\n");
} else {
  console.warn(
    "⚠ API 서버(3001)가 실행 중이 아닙니다. 로그인/목록이 503으로 실패합니다.",
  );
  console.warn("  → 다른 터미널에서: cd auction-api && npm run start:dev\n");
}

const child = spawn("npx", ["next", "dev", "-p", String(DEV_PORT)], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PORT: String(DEV_PORT) },
});

child.on("exit", (code) => process.exit(code ?? 0));
