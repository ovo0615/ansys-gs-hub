// 輕量 SVG 極座標圖，繪製 HFSS 遠場輻射方向圖（Gain vs Theta，Phi=0 切面）。
// 偶極天線方向圖僅與 Theta 有關（軸對稱），故將 Theta 0~180 度的資料鏡射到左側，
// 即可拼出完整 360 度的「花生／甜甜圈剖面」形狀，不需額外求 Phi=180 度的資料。
// 刻意不引入圖表套件，維持前端相依最小化（風格與 S11Chart.tsx 一致）。

interface Props {
  thetaDeg: number[];
  gainDb: number[];
}

const SIZE = 320;
const CENTER = SIZE / 2;
const R_MAX = SIZE / 2 - 36;
const FLOOR_DB = -20; // 相對峰值增益的顯示下限（低於此值一律貼齊圓心）

function toXY(thetaDegVal: number, r: number, mirror: boolean): [number, number] {
  const rad = (thetaDegVal * Math.PI) / 180;
  const x = CENTER + (mirror ? -1 : 1) * r * Math.sin(rad);
  const y = CENTER - r * Math.cos(rad);
  return [x, y];
}

export default function RadiationChart({ thetaDeg, gainDb }: Props) {
  if (thetaDeg.length === 0 || gainDb.length === 0) {
    return (
      <div style={{ color: "var(--muted)", padding: 12 }}>尚無結果，完成模擬後這裡會顯示輻射方向圖。</div>
    );
  }

  const peakDb = Math.max(...gainDb);
  const peakIdx = gainDb.indexOf(peakDb);
  const peakTheta = thetaDeg[peakIdx];

  const radius = (db: number) => {
    const rel = Math.max(db - peakDb, FLOOR_DB);
    return ((rel - FLOOR_DB) / -FLOOR_DB) * R_MAX;
  };

  const rightPts = thetaDeg.map((t, i) => toXY(t, radius(gainDb[i]), false));
  const leftPts = thetaDeg.map((t, i) => toXY(t, radius(gainDb[i]), true)).reverse();
  const allPts = [...rightPts, ...leftPts];
  const pathD = `${allPts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ")} Z`;

  const dbRings = [0, -5, -10, -15, -20];
  const angleTicks = [0, 30, 60, 90, 120, 150, 180];
  const [peakX, peakY] = toXY(peakTheta, R_MAX, false);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%" role="img" aria-label="遠場輻射方向圖">
      {/* 同心圓網格（相對峰值增益，單位 dB） */}
      {dbRings.map((db) => {
        const r = Math.max(((db - FLOOR_DB) / -FLOOR_DB) * R_MAX, 0);
        return <circle key={db} cx={CENTER} cy={CENTER} r={r} fill="none" stroke="rgba(140,160,200,0.16)" strokeWidth={1} />;
      })}
      {dbRings.map((db) => {
        const r = Math.max(((db - FLOOR_DB) / -FLOOR_DB) * R_MAX, 0);
        return (
          <text key={`lbl-${db}`} x={CENTER + 4} y={CENTER - r - 3} fontSize={9.5} fill="#93a1bb">
            {db === 0 ? "峰值" : `${db}dB`}
          </text>
        );
      })}

      {/* 角度刻度線（Theta，天線軸方向為 0°/180°，即正上／正下方） */}
      {angleTicks.map((t) => {
        const [x2, y2] = toXY(t, R_MAX, false);
        const [x3, y3] = toXY(t, R_MAX, true);
        const [lx, ly] = toXY(t, R_MAX + 14, false);
        return (
          <g key={`ang-${t}`}>
            <line x1={CENTER} y1={CENTER} x2={x2} y2={y2} stroke="rgba(140,160,200,0.14)" strokeWidth={1} />
            {t !== 0 && t !== 180 && (
              <line x1={CENTER} y1={CENTER} x2={x3} y2={y3} stroke="rgba(140,160,200,0.14)" strokeWidth={1} />
            )}
            <text x={lx} y={ly} fontSize={10} fill="#93a1bb" textAnchor="middle" dominantBaseline="middle">
              {t}°
            </text>
          </g>
        );
      })}

      {/* 天線軸示意線（z 軸，Theta = 0°/180° 方向） */}
      <line
        x1={CENTER}
        y1={CENTER - R_MAX - 6}
        x2={CENTER}
        y2={CENTER + R_MAX + 6}
        stroke="#b87333"
        strokeWidth={2}
        strokeDasharray="2 3"
        opacity={0.55}
      />

      {/* 輻射方向圖曲線 */}
      <path d={pathD} fill="rgba(91,140,255,0.16)" stroke="#5b8cff" strokeWidth={2} strokeLinejoin="round" />

      {/* 峰值增益標記 */}
      <circle cx={peakX} cy={peakY} r={4} fill="#40d18a" />
      <text x={peakX} y={peakY - 8} fontSize={10.5} fill="#40d18a" textAnchor="middle">
        {peakDb.toFixed(2)} dBi
      </text>
    </svg>
  );
}

export function RadiationSummary({ thetaDeg, gainDb }: Props) {
  if (thetaDeg.length === 0 || gainDb.length === 0) return null;
  const peakDb = Math.max(...gainDb);
  const peakTheta = thetaDeg[gainDb.indexOf(peakDb)];
  return (
    <div style={{ display: "flex", gap: 20, fontSize: 13, color: "var(--text)" }}>
      <div>
        <div style={{ color: "var(--muted)" }}>峰值增益</div>
        <div style={{ fontWeight: 600 }}>{peakDb.toFixed(2)} dBi</div>
      </div>
      <div>
        <div style={{ color: "var(--muted)" }}>峰值角度（Theta）</div>
        <div style={{ fontWeight: 600 }}>{peakTheta.toFixed(0)}°</div>
      </div>
    </div>
  );
}
