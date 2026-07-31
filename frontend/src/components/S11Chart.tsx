// 輕量 SVG 折線圖，繪製 S11(dB) vs 頻率(GHz)，標示 -10dB 線與共振頻率。
// 刻意不引入圖表套件，維持前端相依最小化。
// 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

interface Props {
  freqGhz: number[];
  s11Db: number[];
  resonantFreqGhz?: number | null;
  bandwidthGhz?: number | null;
  bandwidthPct?: number | null;
}

const W = 640;
const H = 260;
const PAD_L = 52;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 34;

export default function S11Chart({ freqGhz, s11Db, resonantFreqGhz, bandwidthGhz, bandwidthPct }: Props) {
  if (freqGhz.length === 0 || s11Db.length === 0) {
    return (
      <div style={{ color: "var(--muted)", padding: 12 }}>尚無結果，完成模擬後這裡會顯示 S11 曲線。</div>
    );
  }

  const fMin = Math.min(...freqGhz);
  const fMax = Math.max(...freqGhz);
  const yMinData = Math.min(...s11Db, -10);
  const yMax = Math.max(0, Math.max(...s11Db) + 1);
  const yMin = Math.min(yMinData - 2, -15);

  const x = (f: number) => PAD_L + ((f - fMin) / Math.max(fMax - fMin, 1e-9)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - yMin) / Math.max(yMax - yMin, 1e-9)) * (H - PAD_T - PAD_B);

  const pathD = freqGhz.map((f, i) => `${i === 0 ? "M" : "L"} ${x(f).toFixed(2)} ${y(s11Db[i]).toFixed(2)}`).join(" ");

  const yTicks = 5;
  const xTicks = 5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" role="img" aria-label="S11 掃頻結果">
      {/* 格線與座標刻度 */}
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const v = yMin + ((yMax - yMin) * i) / yTicks;
        return (
          <g key={`y-${i}`}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="rgba(140,160,200,0.16)" strokeWidth={1} />
            <text x={PAD_L - 8} y={y(v) + 4} fontSize={11} fill="#93a1bb" textAnchor="end">
              {v.toFixed(0)}
            </text>
          </g>
        );
      })}
      {Array.from({ length: xTicks + 1 }).map((_, i) => {
        const f = fMin + ((fMax - fMin) * i) / xTicks;
        return (
          <g key={`x-${i}`}>
            <text x={x(f)} y={H - PAD_B + 18} fontSize={11} fill="#93a1bb" textAnchor="middle">
              {f.toFixed(2)}
            </text>
          </g>
        );
      })}
      <text x={W / 2} y={H - 4} fontSize={11} fill="#93a1bb" textAnchor="middle">
        頻率（GHz）
      </text>
      <text x={14} y={PAD_T + 4} fontSize={11} fill="#93a1bb">
        S11（dB）
      </text>

      {/* -10dB 參考線 */}
      <line x1={PAD_L} x2={W - PAD_R} y1={y(-10)} y2={y(-10)} stroke="#ff6b6b" strokeDasharray="4 4" strokeWidth={1} />
      <text x={W - PAD_R} y={y(-10) - 4} fontSize={10} fill="#ff6b6b" textAnchor="end">
        -10 dB
      </text>

      {/* S11 曲線 */}
      <path d={pathD} fill="none" stroke="#5b8cff" strokeWidth={2.2} />

      {/* 共振頻率標記 */}
      {resonantFreqGhz != null && (
        <g>
          <line
            x1={x(resonantFreqGhz)}
            x2={x(resonantFreqGhz)}
            y1={PAD_T}
            y2={H - PAD_B}
            stroke="#40d18a"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          <circle cx={x(resonantFreqGhz)} cy={y(Math.min(...s11Db))} r={4} fill="#40d18a" />
        </g>
      )}
    </svg>
  );
}

export function S11Summary({ resonantFreqGhz, bandwidthGhz, bandwidthPct }: Props) {
  return (
    <div style={{ display: "flex", gap: 20, fontSize: 13, color: "var(--text)" }}>
      <div>
        <div style={{ color: "var(--muted)" }}>共振頻率</div>
        <div style={{ fontWeight: 600 }}>{resonantFreqGhz != null ? `${resonantFreqGhz.toFixed(3)} GHz` : "—"}</div>
      </div>
      <div>
        <div style={{ color: "var(--muted)" }}>-10dB 頻寬</div>
        <div style={{ fontWeight: 600 }}>
          {bandwidthGhz != null ? `${(bandwidthGhz * 1000).toFixed(0)} MHz` : "—"}
          {bandwidthPct != null ? `（${bandwidthPct.toFixed(1)}%）` : ""}
        </div>
      </div>
    </div>
  );
}
