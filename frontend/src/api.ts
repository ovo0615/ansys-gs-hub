// 與後端溝通：幾何預覽用一般 fetch，長時間求解用 WebSocket 串流日誌。
// 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

import type { Scene } from "./geometry";

export interface RunResult {
  freq_ghz: number[];
  s11_db: number[];
  resonant_freq_ghz: number | null;
  bandwidth_ghz: number | null;
  bandwidth_pct: number | null;
  project_path: string | null;
  theta_deg?: number[];
  gain_db?: number[];
}

export type RunMessage =
  | { type: "log"; message: string }
  | { type: "result"; result: RunResult }
  | { type: "error"; message: string };

export async function fetchGeometry(domain: string, params: Record<string, unknown>): Promise<Scene> {
  const res = await fetch(`/api/${domain}/geometry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`後端回應錯誤（${res.status}）：${detail}`);
  }
  return res.json();
}

// ── 輸出資料夾相關 ─────────────────────────────────────
export async function getDefaultDir(): Promise<string> {
  const res = await fetch("/api/fs/default-dir");
  if (!res.ok) return "";
  const data = await res.json();
  return data.path ?? "";
}

export interface PickDirResult {
  path: string | null;
  available: boolean;
  message?: string;
}

export async function pickDirectory(current: string): Promise<PickDirResult> {
  const res = await fetch("/api/fs/pick-dir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: current }),
  });
  if (!res.ok) return { path: null, available: false, message: `後端回應錯誤（${res.status}）` };
  return res.json();
}

export interface ValidateDirResult {
  ok: boolean;
  path?: string;
  created?: boolean;
  message?: string;
}

export async function validateDirectory(path: string): Promise<ValidateDirResult> {
  const res = await fetch("/api/fs/validate-dir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) return { ok: false, message: `後端回應錯誤（${res.status}）` };
  return res.json();
}

export interface RunHandlers {
  onLog: (message: string) => void;
  onResult: (result: RunResult) => void;
  onError: (message: string) => void;
  onClose?: () => void;
}

export function runSimulation(domain: string, params: Record<string, unknown>, handlers: RunHandlers): () => void {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${window.location.host}/ws/${domain}/run`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ params }));
  };

  ws.onmessage = (event) => {
    try {
      const msg: RunMessage = JSON.parse(event.data);
      if (msg.type === "log") handlers.onLog(msg.message);
      else if (msg.type === "result") handlers.onResult(msg.result);
      else if (msg.type === "error") handlers.onError(msg.message);
    } catch {
      handlers.onError("收到無法解析的訊息");
    }
  };

  ws.onerror = () => {
    handlers.onError("WebSocket 連線發生錯誤，請確認後端服務是否已啟動");
  };

  ws.onclose = () => {
    handlers.onClose?.();
  };

  return () => ws.close();
}
