// Fluent Getting Started「混合三通 Mixing Tee」前端介面：對齊原廠課程 Demo 模型。
// 兩股空氣（冷/熱）在 T 形管混合 → 即時 3D 預覽 + 理論估算（質量/能量守恆，非 CFD）+ 真求解。
// 真求解：後端用 PyAnsys Geometry 逐面三角化 → PyPrimeMesh 產生體網格 → PyFluent solver 求解。

import { useEffect, useMemo, useRef, useState } from "react";
import { Allotment } from "allotment";
import Preview3D from "../../components/Preview3D";
import LogConsole from "../../components/LogConsole";
import { NumberField } from "../../components/Fields";
import OutputDirField from "../../components/OutputDirField";
import { runSimulation } from "../../api";
import { buildTeeScene } from "./geometry";
import { DEFAULT_PARAMS, airDensity, estimate, toApiParams, validateParams, type TeeParams } from "./params";

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ color: "var(--muted)", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: accent ? 20 : 15, color: accent ? "var(--accent-2)" : "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

interface CfdResult {
  outlet_temp_c?: number | null;
  outlet_velocity_ms?: number | null;
  iterations?: number | null;
  case_path?: string | null;
  contour_path?: string | null;
}

interface Props {
  showLogs: boolean;
  setShowLogs: (v: boolean) => void;
}

export default function TeePanel({ showLogs, setShowLogs }: Props) {
  const [params, setParams] = useState<TeeParams>(DEFAULT_PARAMS);
  const [running, setRunning] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [result, setResult] = useState<CfdResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => closeRef.current?.(), []);

  const scene = useMemo(() => buildTeeScene(params), [params]);
  const est = estimate(params);
  const validation = validateParams(params);

  const regimeColor =
    est?.regime === "laminar" ? "var(--ok)" : est?.regime === "turbulent" ? "var(--danger)" : "var(--warn)";

  function handleRun() {
    if (!validation.ok) return;
    closeRef.current?.();
    setRunning(true);
    setShowLogs(true);
    setLogLines([]);
    setResult(null);
    setError(null);

    closeRef.current = runSimulation("fluent", toApiParams(params), {
      onLog: (message) => setLogLines((prev) => [...prev, message]),
      onResult: (res) => {
        setResult(res as CfdResult);
        setRunning(false);
      },
      onError: (message) => {
        setError(message);
        setRunning(false);
      },
    });
  }

  return (
    <div style={{ height: "100%" }}>
      <Allotment>
        {/* 左：參數 */}
        <Allotment.Pane preferredSize={340} minSize={280}>
          <div style={{ paddingRight: 7, height: "100%" }}>
            <div className="panel" style={{ padding: 18, overflowY: "auto", height: "100%" }}>
              <h3 className="panel-title">混合三通 Mixing Tee 參數</h3>
              <p className="panel-hint">
                兩股空氣（冷、熱）在 T 形管中混合的穩態流場——Fluent Getting Started 課程 Demo 模型。
                目標是評估出口的混合溫度是否均勻。調整參數後右側 3D 流體域即時更新。
              </p>

              <NumberField
                label="管半徑 r（三開口同徑）"
                value={params.radiusMm}
                suffix="mm"
                step={1}
                onChange={(v) => setParams((p) => ({ ...p, radiusMm: v === "" ? p.radiusMm : v }))}
              />
              <NumberField
                label="管臂長度（預覽尺度）"
                value={params.armLengthMm}
                suffix="mm"
                step={10}
                onChange={(v) => setParams((p) => ({ ...p, armLengthMm: v === "" ? p.armLengthMm : v }))}
              />

              <div style={{ margin: "6px 0 8px", fontSize: 12.5, fontWeight: 600, color: "var(--accent)" }}>冷側進口</div>
              <NumberField
                label="冷側流速"
                value={params.coldVelocityMs}
                suffix="m/s"
                step={0.5}
                onChange={(v) => setParams((p) => ({ ...p, coldVelocityMs: v === "" ? p.coldVelocityMs : v }))}
              />
              <NumberField
                label="冷側溫度"
                value={params.coldTempC}
                suffix="°C"
                step={1}
                onChange={(v) => setParams((p) => ({ ...p, coldTempC: v === "" ? p.coldTempC : v }))}
              />

              <div style={{ margin: "6px 0 8px", fontSize: 12.5, fontWeight: 600, color: "var(--danger)" }}>熱側進口</div>
              <NumberField
                label="熱側流速"
                value={params.hotVelocityMs}
                suffix="m/s"
                step={0.5}
                onChange={(v) => setParams((p) => ({ ...p, hotVelocityMs: v === "" ? p.hotVelocityMs : v }))}
              />
              <NumberField
                label="熱側溫度"
                value={params.hotTempC}
                suffix="°C"
                step={1}
                onChange={(v) => setParams((p) => ({ ...p, hotTempC: v === "" ? p.hotTempC : v }))}
              />

              <OutputDirField value={params.outputDir} onChange={(v) => setParams((p) => ({ ...p, outputDir: v }))} />

              {!validation.ok && (
                <div className="status status--err" style={{ marginBottom: 10 }}>
                  {validation.message}
                </div>
              )}

              <button
                className="btn--primary"
                onClick={handleRun}
                disabled={!validation.ok || running}
                style={{ marginTop: 4 }}
              >
                {running ? "求解中…" : "開始求解"}
              </button>
              <p style={{ marginTop: 10, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>
                按下後會在本機依序執行：PyAnsys Geometry 建幾何 → PyPrimeMesh 產生體網格 →
                PyFluent 求解（能量方程 + k-epsilon 紊流），完成後專案檔會存到上方指定資料夾，
                可能需要數分鐘。
              </p>
            </div>
          </div>
        </Allotment.Pane>

        {/* 右側 */}
        <Allotment.Pane>
          <div style={{ paddingLeft: 7, height: "100%" }}>
            <Allotment vertical>
              {/* 上：3D 預覽（有結果時右側並排顯示溫度雲圖，用 flexbox 而非巢狀 Allotment，
                   避免 allotment 在無固定尺寸的 pane 裡巢狀第二層時把尺寸算成 0 的已知問題） */}
              <Allotment.Pane minSize={200}>
                <div style={{ paddingBottom: 7, height: "100%" }}>
                  <div style={{ display: "flex", height: "100%", gap: 7 }}>
                    <div
                      className="panel"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        position: "relative",
                        background:
                          "radial-gradient(120% 100% at 50% 0%, rgba(56,208,214,0.10), transparent 60%), var(--panel)",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          top: 12,
                          left: 16,
                          zIndex: 1,
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: "var(--muted)",
                          pointerEvents: "none",
                        }}
                      >
                        3D 流體域預覽 · 藍=冷側、紅=熱側、灰=出口 · 拖曳旋轉、滾輪縮放
                      </div>
                      <Preview3D scene={scene} fitKey="tee" />
                    </div>

                    {result?.contour_path && (
                      <div
                        className="panel"
                        style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
                      >
                        <div style={{ padding: "12px 16px 6px", fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
                          溫度雲圖（K）
                        </div>
                        <div style={{ flex: 1, minHeight: 0, padding: "0 16px 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <img
                            src={`/api/fs/img?path=${encodeURIComponent(result.contour_path)}`}
                            alt="Temperature Contour"
                            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 4, border: "1px solid var(--border)" }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Allotment.Pane>

              {/* 下：邊界條件摘要 + 理論估算 + 求解日誌/結果 */}
              <Allotment.Pane preferredSize={264} minSize={150}>
                <div style={{ paddingTop: 7, height: "100%" }}>
                  <Allotment>
                    <Allotment.Pane preferredSize="40%" minSize={200}>
                      <div style={{ paddingRight: 7, height: "100%" }}>
                        <div className="panel" style={{ padding: 14, overflowY: "auto", height: "100%" }}>
                          <div className="field-label" style={{ marginBottom: 8 }}>邊界條件與模型摘要</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.9, color: "var(--text)" }}>
                            <li>冷側進口：Velocity Inlet，{params.coldVelocityMs} m/s、{params.coldTempC} °C</li>
                            <li>熱側進口：Velocity Inlet，{params.hotVelocityMs} m/s、{params.hotTempC} °C</li>
                            <li>出口：Pressure Outlet（0 Pa 表壓）</li>
                            <li>管壁：No-slip Wall</li>
                            <li>流體：空氣（理想氣體）</li>
                            <li>
                              進口密度：冷 {airDensity(params.coldTempC).toFixed(3)}、熱{" "}
                              {airDensity(params.hotTempC).toFixed(3)} kg/m³
                            </li>
                          </ul>
                        </div>
                      </div>
                    </Allotment.Pane>

                    <Allotment.Pane preferredSize="30%" minSize={180}>
                      <div style={{ paddingLeft: 7, paddingRight: 7, height: "100%" }}>
                        <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", height: "100%" }}>
                          <h3 className="panel-title" style={{ marginBottom: 4 }}>理論估算</h3>
                          <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 12 }}>
                            質量守恆 ṁ=ρVA + 能量守恆（cp 定值）之混合溫度，非 CFD 結果。
                          </div>
                          {est ? (
                            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start", overflowY: "auto", flex: 1 }}>
                              <Metric label="出口混合溫度" value={`${est.outletTempC.toFixed(1)} °C`} accent />
                              <Metric label="出口平均流速" value={`${est.outletVelocityMs.toFixed(2)} m/s`} />
                              <Metric label="冷 : 熱 質量比" value={`${(est.massColdKgS / est.massHotKgS).toFixed(2)} : 1`} />
                              <div>
                                <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 4 }}>出口流態（Re {est.reynolds.toFixed(0)}）</div>
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "5px 12px",
                                    borderRadius: 999,
                                    background: "rgba(120,140,180,0.12)",
                                    color: regimeColor,
                                    fontWeight: 600,
                                    fontSize: 13,
                                  }}
                                >
                                  <span style={{ width: 9, height: 9, borderRadius: 999, background: regimeColor }} />
                                  {est.regimeLabel}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ color: "var(--muted)", margin: "auto" }}>參數不完整，無法估算。</div>
                          )}
                        </div>
                      </div>
                    </Allotment.Pane>

                    <Allotment.Pane>
                      <div style={{ paddingLeft: 7, height: "100%" }}>
                        <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", height: "100%" }}>
                          <h3 className="panel-title" style={{ margin: "0 0 4px" }}>求解日誌與 CFD 結果</h3>
                          {error && (
                            <div className="status status--err" style={{ marginBottom: 8 }}>{error}</div>
                          )}
                          <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 10 }}>
                            {showLogs && (
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <LogConsole lines={logLines} />
                              </div>
                            )}
                            {result && (
                              <div style={{ flex: 1, minWidth: 0, borderLeft: showLogs ? "1px solid var(--border)" : "none", paddingLeft: showLogs ? 10 : 0, overflowY: "auto" }}>
                                <h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text)" }}>CFD 求解結果</h4>
                                <Metric label="出口混合溫度" value={result.outlet_temp_c != null ? `${result.outlet_temp_c.toFixed(1)} °C` : "—"} accent />
                                <div style={{ height: 8 }} />
                                <Metric label="出口速度" value={result.outlet_velocity_ms != null ? `${result.outlet_velocity_ms.toFixed(2)} m/s` : "—"} />
                                <div style={{ height: 8 }} />
                                <Metric label="疊代步數" value={result.iterations != null ? `${result.iterations}` : "—"} />
                              </div>
                            )}
                            {!showLogs && !result && (
                              <div style={{ color: "var(--muted)", fontSize: 12.5, margin: "auto", textAlign: "center" }}>
                                尚無結果。按左側「開始求解」後，
                                <br />
                                完成求解會在這裡顯示結果。
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </Allotment.Pane>
                  </Allotment>
                </div>
              </Allotment.Pane>
            </Allotment>
          </div>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}
