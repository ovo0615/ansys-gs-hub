// Mechanical Getting Started（靜態結構）前端介面：懸臂樑參數 → 即時 3D 預覽 + 理論估算。
// 本機尚未安裝／授權 ANSYS Mechanical，故「開始求解」停用；理論估算為材料力學閉式解，非 FEA。
// 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

import { useMemo, useState, useRef, useEffect } from "react";
import { Allotment } from "allotment";
import Preview3D from "../../components/Preview3D";
import LogConsole from "../../components/LogConsole";
import { NumberField, SelectField } from "../../components/Fields";
import OutputDirField from "../../components/OutputDirField";
import { runSimulation, type RunResult } from "../../api";
import { buildBracketScene } from "./geometry";
import {
  DEFAULT_PARAMS,
  MATERIALS,
  estimate,
  validateParams,
  type BracketParams,
  type MaterialKey,
} from "./params";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "var(--muted)", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 15 }}>{value}</div>
    </div>
  );
}

interface Props {
  showLogs: boolean;
  setShowLogs: (v: boolean) => void;
}

export default function BracketPanel({ showLogs, setShowLogs }: Props) {
  const [params, setParams] = useState<BracketParams>(DEFAULT_PARAMS);
  const [running, setRunning] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => closeRef.current?.(), []);

  const scene = useMemo(() => buildBracketScene(params), [params]);
  const est = estimate(params);
  const validation = validateParams(params);
  const mat = MATERIALS[params.material];

  const util = est ? Math.min(est.utilization, 1.4) : 0;
  const utilColor =
    !est || est.utilization < 0.6 ? "var(--ok)" : est.utilization < 1 ? "var(--warn)" : "var(--danger)";

  function handleRun() {
    if (!validation.ok) return;
    closeRef.current?.();
    setRunning(true);
    setShowLogs(true);
    setLogLines([]);
    setResult(null);
    setError(null);

    closeRef.current = runSimulation("mechanical", params as unknown as Record<string, unknown>, {
      onLog: (message) => setLogLines((prev) => [...prev, message]),
      onResult: (res) => {
        setResult(res);
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
              <h3 className="panel-title">懸臂樑靜態結構參數</h3>
              <p className="panel-hint">
                一端固定、自由端受向下集中力的矩形懸臂樑——對應 Mechanical Getting Started 靜態結構流程
                （幾何 → 材料 → 網格 → 固定支撐 → 負載 → 求解 → 應力／變形／安全係數）。
                調整參數後右側 3D 預覽即時更新。
              </p>

              <NumberField
                label="懸臂長度 L"
                value={params.lengthMm}
                suffix="mm"
                step={5}
                onChange={(v) => setParams((p) => ({ ...p, lengthMm: v === "" ? p.lengthMm : v }))}
              />
              <NumberField
                label="截面寬 b"
                value={params.widthMm}
                suffix="mm"
                step={1}
                onChange={(v) => setParams((p) => ({ ...p, widthMm: v === "" ? p.widthMm : v }))}
              />
              <NumberField
                label="截面高 h（受力方向）"
                value={params.heightMm}
                suffix="mm"
                step={1}
                onChange={(v) => setParams((p) => ({ ...p, heightMm: v === "" ? p.heightMm : v }))}
              />
              <SelectField<MaterialKey>
                label="材料"
                value={params.material}
                onChange={(v) => setParams((p) => ({ ...p, material: v }))}
                options={(Object.keys(MATERIALS) as MaterialKey[]).map((k) => ({ value: k, label: MATERIALS[k].label }))}
              />
              <NumberField
                label="自由端集中力 F"
                value={params.forceN}
                suffix="N"
                step={50}
                onChange={(v) => setParams((p) => ({ ...p, forceN: v === "" ? p.forceN : v }))}
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
                按下後會呼叫本機已安裝的 PyMechanical 與 ANSYS Mechanical 進行求解（需具備授權），完成後專案檔會存到上方指定資料夾。
              </p>
            </div>
          </div>
        </Allotment.Pane>

        {/* 右側 */}
        <Allotment.Pane>
          <div style={{ paddingLeft: 7, height: "100%" }}>
            <Allotment vertical>
              {/* 上：3D預覽 + 應力雲圖並排。這裡刻意不用巢狀 <Allotment>——測試發現
                   allotment 套件在「父層 Pane 靠 flex 撐滿剩餘空間（無 preferredSize）」時，
                   若裡面再放一個子層 <Allotment>，父層 Pane 本身的高度會被算成 0（已用瀏覽器
                   實測、逐層量測 getBoundingClientRect 確認）。改用一般 flexbox 排版即可穩定運作。 */}
              <Allotment.Pane minSize={200}>
                <div style={{ paddingBottom: 7, height: "100%", display: "flex", gap: 7 }}>
                  <div style={{ flex: "1 1 58%", minWidth: 0, height: "100%" }}>
                    <div
                      className="panel"
                      style={{
                        overflow: "hidden",
                        position: "relative",
                        background:
                          "radial-gradient(120% 100% at 50% 0%, rgba(91,140,255,0.10), transparent 60%), var(--panel)",
                        height: "100%",
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
                        3D 結構預覽 · 灰=固定端、紅=施力 · 拖曳旋轉、滾輪縮放
                      </div>
                      <Preview3D scene={scene} fitKey="bracket" />
                    </div>
                  </div>

                  <div style={{ flex: "1 1 42%", minWidth: 0, height: "100%" }}>
                    <div
                      className="panel"
                      style={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ padding: "12px 16px 6px", fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
                        應力雲圖（von Mises，MPa）
                      </div>
                      <div style={{ flex: 1, minHeight: 0, padding: "0 16px 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {result?.image_path ? (
                          <img
                            src={`/api/fs/img?path=${encodeURIComponent(result.image_path)}`}
                            alt="Stress Contour"
                            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 4, border: "1px solid var(--border)" }}
                          />
                        ) : (
                          <div style={{ color: "var(--muted)", fontSize: 12.5, textAlign: "center" }}>
                            尚無結果。按左側「開始求解」後，
                            <br />
                            完成求解會在這裡顯示應力雲圖。
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Allotment.Pane>

              {/* 下：邊界條件摘要與理論估算 */}
              <Allotment.Pane preferredSize={264} minSize={150}>
                <div style={{ paddingTop: 7, height: "100%" }}>
                  <Allotment>
                    <Allotment.Pane preferredSize="65%" minSize={200}>
                      <div style={{ paddingRight: 7, height: "100%" }}>
                        <div className="panel" style={{ padding: 14, overflowY: "auto", height: "100%" }}>
                          <div className="field-label" style={{ marginBottom: 8 }}>邊界條件與模型摘要</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.9, color: "var(--text)" }}>
                            <li>固定支撐：樑左端面（Fixed Support）</li>
                            <li>負載：自由端 {params.forceN} N，方向 −Z</li>
                            <li>材料：{mat.label}</li>
                            <li>E = {mat.youngGpa} GPa、降伏 = {mat.yieldMpa} MPa</li>
                            <li>
                              截面：{params.widthMm} × {params.heightMm} mm，I ={" "}
                              {est ? est.inertiaMm4.toFixed(0) : "—"} mm⁴
                            </li>
                          </ul>
                        </div>
                      </div>
                    </Allotment.Pane>

                    <Allotment.Pane>
                      <div style={{ paddingLeft: 7, height: "100%" }}>
                        <Allotment vertical>
                          {/* 理論估算 */}
                          <Allotment.Pane preferredSize="50%" minSize={100}>
                            <div style={{ paddingBottom: 7, height: "100%" }}>
                              <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", height: "100%" }}>
                                <h3 className="panel-title" style={{ marginBottom: 4 }}>理論估算</h3>
                                <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 12 }}>
                                  端點受力懸臂樑閉式解（σ=FLc/I、δ=FL³/3EI）。
                                </div>
                                {est ? (
                                  <div style={{ overflowY: "auto", flex: 1 }}>
                                    <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 14 }}>
                                      <Metric label="最大彎曲應力 σ_max" value={`${est.maxStressMpa.toFixed(1)} MPa`} />
                                      <Metric label="自由端撓度 δ_max" value={`${est.maxDeflectionMm.toFixed(3)} mm`} />
                                      <Metric label="安全係數" value={Number.isFinite(est.safetyFactor) ? est.safetyFactor.toFixed(2) : "∞"} />
                                    </div>
                                    {est.utilization >= 1 && (
                                      <div className="status status--err" style={{ marginTop: 10 }}>
                                        ⚠ 應力已達／超過降伏強度，結構會塑性降伏。
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{ color: "var(--muted)", margin: "auto" }}>參數不完整，無法估算。</div>
                                )}
                              </div>
                            </div>
                          </Allotment.Pane>
                          {/* 求解日誌與模擬結果 */}
                          <Allotment.Pane>
                            <div style={{ paddingTop: 7, height: "100%" }}>
                              <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", height: "100%" }}>
                                <h3 className="panel-title" style={{ margin: "0 0 4px" }}>求解日誌與模擬結果</h3>
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
                                      <h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text)" }}>有限元素分析 (FEA) 結果</h4>
                                      <Metric label="von Mises 最大應力" value={`${result.von_mises_max_mpa?.toFixed(1)} MPa`} />
                                      <div style={{ height: 8 }} />
                                      <Metric label="最大總變形" value={`${result.deformation_max_mm?.toFixed(4)} mm`} />
                                      <div style={{ height: 8 }} />
                                      <Metric label="FEA 安全係數" value={result.safety_factor?.toFixed(2) ?? "—"} />
                                      {result.image_path && (
                                        <div style={{ marginTop: 10, fontSize: 11, color: "var(--faint)" }}>
                                          應力雲圖已顯示於上方 3D 預覽右側。
                                        </div>
                                      )}
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
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}
