// HFSS Getting Started（M01 Dipole workshop）精簡版面板：
// 左：參數輸入（含輸出資料夾）；中：大型即時 3D 預覽（主角）；下：求解日誌 + S11 結果。

import { useEffect, useMemo, useRef, useState } from "react";
import { Allotment } from "allotment";
import Preview3D from "../../components/Preview3D";
import LogConsole from "../../components/LogConsole";
import S11Chart, { S11Summary } from "../../components/S11Chart";
import RadiationChart, { RadiationSummary } from "../../components/RadiationChart";
import OutputDirField from "../../components/OutputDirField";
import { runSimulation, type RunResult } from "../../api";
import { buildDipoleScene, defaultTotalLengthMm, resonanceInfo } from "./geometry";
import { DEFAULT_PARAMS, toApiParams, validateParams, type DipoleParams } from "./params";

function NumberField({
  label,
  value,
  onChange,
  step,
  suffix,
  placeholder,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  step?: number;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <div className="field-label">{label}</div>
      <div className="field-row">
        <input
          className="input"
          type="number"
          value={value}
          step={step ?? "any"}
          placeholder={placeholder}
          onWheel={(e) => e.currentTarget.blur()}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? "" : Number(raw));
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
    </label>
  );
}

interface Props {
  showLogs: boolean;
  setShowLogs: (v: boolean) => void;
}

export default function DipolePanel({ showLogs, setShowLogs }: Props) {
  const [params, setParams] = useState<DipoleParams>(DEFAULT_PARAMS);
  const [running, setRunning] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => closeRef.current?.(), []);

  const scene = useMemo(() => buildDipoleScene(params), [params]);
  const validation = validateParams(params);
  const estimatedLengthMm = defaultTotalLengthMm(params.frequencyGhz || 1);
  const res = resonanceInfo(params);

  function handleRun() {
    if (!validation.ok) return;
    closeRef.current?.();
    setRunning(true);
    setShowLogs(true);
    setLogLines([]);
    setResult(null);
    setError(null);

    closeRef.current = runSimulation("hfss", toApiParams(params), {
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
              <h3 className="panel-title">偶極天線參數</h3>
              <p className="panel-hint">
                半波長偶極天線：兩段圓柱導線 + 中央饋入間隙。調整參數後右側 3D 預覽會即時更新。
              </p>

              <NumberField
                label="中心頻率"
                value={params.frequencyGhz}
                suffix="GHz"
                step={0.1}
                onChange={(v) => setParams((p) => ({ ...p, frequencyGhz: v === "" ? p.frequencyGhz : v }))}
              />
              <NumberField
                label="導線半徑"
                value={params.wireRadiusMm}
                suffix="mm"
                step={0.1}
                onChange={(v) => setParams((p) => ({ ...p, wireRadiusMm: v === "" ? p.wireRadiusMm : v }))}
              />
              <NumberField
                label="饋入間隙"
                value={params.gapMm}
                suffix="mm"
                step={0.1}
                onChange={(v) => setParams((p) => ({ ...p, gapMm: v === "" ? p.gapMm : v }))}
              />
              <NumberField
                label="天線總長度（留空自動估算）"
                value={params.totalLengthMm ?? ""}
                suffix="mm"
                step={1}
                placeholder={estimatedLengthMm.toFixed(1)}
                onChange={(v) => setParams((p) => ({ ...p, totalLengthMm: v === "" ? null : v }))}
              />
              {res && (
                <div style={{ marginTop: -6, marginBottom: 14, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>
                  在 {params.frequencyGhz} GHz 下：λ ≈ {res.wavelengthMm.toFixed(1)} mm，共振長度約{" "}
                  {res.resonantLengthMm.toFixed(1)} mm；目前總長度 ≈ {res.electricalLengthLambda.toFixed(2)} λ。
                </div>
              )}
              {res && res.status !== "ok" && (
                <div className="status status--warn" style={{ marginBottom: 14, lineHeight: 1.65 }}>
                  ⚠ 目前總長度 {res.effectiveLengthMm.toFixed(1)} mm 在 {params.frequencyGhz} GHz 下僅約{" "}
                  {res.electricalLengthLambda.toFixed(2)} λ，屬{res.status === "short" ? "電性短" : "電性長"}天線；輸入阻抗嚴重失配，
                  S11 會接近全反射（此為天線長度與頻率不匹配所致，並非饋入埠問題）。此長度約在{" "}
                  {res.naturalResonantFreqGhz.toFixed(2)} GHz 才會共振。
                  <button
                    className="btn"
                    type="button"
                    style={{ marginTop: 8, width: "100%", padding: "6px 0" }}
                    onClick={() => setParams((p) => ({ ...p, totalLengthMm: Number(res.resonantLengthMm.toFixed(1)) }))}
                  >
                    設為 {params.frequencyGhz} GHz 共振長度（{res.resonantLengthMm.toFixed(1)} mm）
                  </button>
                </div>
              )}
              <NumberField
                label="掃頻範圍（中心頻率百分比）"
                value={params.freqSpanPct}
                suffix="%"
                step={5}
                onChange={(v) => setParams((p) => ({ ...p, freqSpanPct: v === "" ? p.freqSpanPct : v }))}
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
                {running ? "求解中…" : "開始模擬"}
              </button>
              <p style={{ marginTop: 10, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>
                饋入埠（lumped port）尺寸：{(params.wireRadiusMm * 2).toFixed(2)} × {params.gapMm.toFixed(2)} mm，
                會隨「導線半徑」與「饋入間隙」自動更新（不隨頻率／長度變化）。
                <br />
                按下後會呼叫本機已安裝並授權的 AEDT，實際建立 HFSS 模型並求解，完成後專案（.aedt）會存到上方指定資料夾，可能需要數分鐘。
              </p>
            </div>
          </div>
        </Allotment.Pane>

        {/* 右側 */}
        <Allotment.Pane>
          <div style={{ paddingLeft: 7, height: "100%" }}>
            <Allotment vertical>
              {/* 上：3D預覽（有遠場結果時，用 flexbox 而非巢狀 Allotment 在右側並排顯示輻射方向圖，
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
                          "radial-gradient(120% 100% at 50% 0%, rgba(91,140,255,0.10), transparent 60%), var(--panel)",
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
                        3D 結構預覽 · 拖曳旋轉、滾輪縮放
                      </div>
                      <Preview3D scene={scene} fitKey="dipole" />
                    </div>

                    {result && result.theta_deg && result.theta_deg.length > 0 && (
                      <div
                        className="panel"
                        style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
                      >
                        <div style={{ padding: "12px 16px 0", fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
                          遠場輻射方向圖（Theta，Phi=0 切面）
                        </div>
                        <div style={{ padding: "4px 16px 0" }}>
                          <RadiationSummary thetaDeg={result.theta_deg} gainDb={result.gain_db ?? []} />
                        </div>
                        <div style={{ flex: 1, minHeight: 0, padding: "0 12px 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <RadiationChart thetaDeg={result.theta_deg} gainDb={result.gain_db ?? []} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Allotment.Pane>

              {/* 下：日誌與結果 */}
              <Allotment.Pane preferredSize={264} minSize={150}>
                <div style={{ paddingTop: 7, height: "100%" }}>
                  <Allotment>
                    {showLogs && (
                      <Allotment.Pane preferredSize="35%" minSize={150}>
                        <div style={{ paddingRight: 7, height: "100%" }}>
                          <div className="panel" style={{ padding: 12, display: "flex", flexDirection: "column", height: "100%" }}>
                            <div className="field-label" style={{ marginBottom: 8 }}>求解日誌</div>
                            {error && (
                              <div className="status status--err" style={{ marginBottom: 8 }}>
                                {error}
                              </div>
                            )}
                            <div style={{ flex: 1, minHeight: 0 }}>
                              <LogConsole lines={logLines} />
                            </div>
                          </div>
                        </div>
                      </Allotment.Pane>
                    )}

                    <Allotment.Pane>
                      <div style={{ paddingLeft: 7, height: "100%" }}>
                        <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", height: "100%" }}>
                          <h3 className="panel-title" style={{ marginBottom: 8 }}>S11 掃頻結果</h3>
                          {!showLogs && error && (
                            <div className="status status--err" style={{ marginBottom: 8 }}>
                              {error}
                            </div>
                          )}
                          {result ? (
                            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                              <S11Summary
                                freqGhz={result.freq_ghz}
                                s11Db={result.s11_db}
                                resonantFreqGhz={result.resonant_freq_ghz}
                                bandwidthGhz={result.bandwidth_ghz}
                                bandwidthPct={result.bandwidth_pct}
                              />
                              <div style={{ flex: 1, minHeight: 0, marginTop: 6 }}>
                                <S11Chart
                                  freqGhz={result.freq_ghz}
                                  s11Db={result.s11_db}
                                  resonantFreqGhz={result.resonant_freq_ghz}
                                  bandwidthGhz={result.bandwidth_ghz}
                                  bandwidthPct={result.bandwidth_pct}
                                />
                              </div>
                              {result.project_path && (
                                <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--faint)", wordBreak: "break-all" }}>
                                  專案檔：{result.project_path}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div style={{ color: "var(--muted)", fontSize: 12.5, margin: "auto", textAlign: "center" }}>
                              尚未有結果。按左側「開始模擬」後，
                              <br />
                              完成求解會在這裡顯示 S11 曲線。
                            </div>
                          )}
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
