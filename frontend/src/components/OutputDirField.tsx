// 共用「模擬檔案輸出資料夾」欄位：文字輸入 + 瀏覽（原生對話框）+ 驗證／建立 + 狀態顯示。
// 三個領域面板共用；後端 fs 路由不需安裝求解軟體即可運作。

import { useEffect, useState } from "react";
import { getDefaultDir, pickDirectory, validateDirectory } from "../api";

type DirStatus = { kind: "idle" | "ok" | "err" | "info"; message: string };

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function OutputDirField({ value, onChange }: Props) {
  const [status, setStatus] = useState<DirStatus>({ kind: "idle", message: "" });
  const [defaultDir, setDefaultDir] = useState<string>("");

  // 載入後端預設 projects 目錄，若欄位為空則預先填入。
  useEffect(() => {
    getDefaultDir().then((d) => {
      setDefaultDir(d);
      if (!value) onChange(d);
    });
    // 僅在掛載時執行一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBrowse() {
    setStatus({ kind: "info", message: "已在本機開啟資料夾選擇視窗，請於該視窗中挑選…" });
    const res = await pickDirectory(value || defaultDir);
    if (res.available && res.path) {
      onChange(res.path);
      setStatus({ kind: "ok", message: `已選擇：${res.path}` });
    } else if (res.available && !res.path) {
      setStatus({ kind: "idle", message: "已取消選擇" });
    } else {
      setStatus({ kind: "err", message: res.message || "無法開啟對話框，請直接於欄位手動輸入路徑" });
    }
  }

  async function handleValidate() {
    setStatus({ kind: "info", message: "驗證中…" });
    const res = await validateDirectory(value || defaultDir);
    setStatus({ kind: res.ok ? "ok" : "err", message: res.message || (res.ok ? "可寫入" : "無法使用") });
    if (res.ok && res.path) onChange(res.path);
  }

  return (
    <label className="field">
      <div className="field-label">模擬檔案輸出資料夾</div>
      <input
        className="input"
        type="text"
        value={value}
        placeholder={defaultDir || "留空使用後端預設 projects 目錄"}
        onChange={(e) => {
          onChange(e.target.value);
          setStatus({ kind: "idle", message: "" });
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={handleBrowse} type="button">
          瀏覽…
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={handleValidate} type="button">
          驗證／建立
        </button>
      </div>
      {status.message && (
        <div
          className={
            status.kind === "ok"
              ? "status status--ok"
              : status.kind === "err"
              ? "status status--err"
              : "status status--warn"
          }
          style={{ wordBreak: "break-all" }}
        >
          {status.message}
        </div>
      )}
    </label>
  );
}
