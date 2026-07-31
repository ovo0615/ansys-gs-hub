// WebSocket 求解日誌捲動視窗。
// 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

import { useEffect, useRef } from "react";

interface Props {
  lines: string[];
}

export default function LogConsole({ lines }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={boxRef}
      style={{
        background: "transparent",
        color: "var(--text)",
        borderRadius: 8,
        padding: "10px 12px",
        height: "100%",
        overflowY: "auto",
        fontFamily: "Cascadia Mono, Consolas, monospace",
        fontSize: 12.5,
        lineHeight: 1.6,
        border: "1px solid var(--border)",
      }}
    >
      {lines.length === 0 ? (
        <div style={{ color: "var(--muted)" }}>尚未開始模擬，日誌會顯示在這裡。</div>
      ) : (
        lines.map((line, i) => <div key={i}>{line}</div>)
      )}
    </div>
  );
}
