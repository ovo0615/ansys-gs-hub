// Mechanical Getting Started（靜態結構）：懸臂樑／支架參數、材料庫與理論估算。
// 理論估算＝端點受力懸臂樑的閉式解（材料力學），非有限元求解，供介面預覽與教學用。
// 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

export type MaterialKey = "steel" | "aluminum" | "titanium";

export interface Material {
  label: string;
  youngGpa: number; // 楊氏模數 E（GPa）
  yieldMpa: number; // 降伏強度（MPa）
  densityKgM3: number; // 密度（kg/m³）
  color: number;
}

export const MATERIALS: Record<MaterialKey, Material> = {
  steel: { label: "結構鋼 Structural Steel", youngGpa: 200, yieldMpa: 250, densityKgM3: 7850, color: 0x8b95a7 },
  aluminum: { label: "鋁合金 Aluminum 6061", youngGpa: 69, yieldMpa: 276, densityKgM3: 2700, color: 0xc9d2de },
  titanium: { label: "鈦合金 Ti-6Al-4V", youngGpa: 96, yieldMpa: 880, densityKgM3: 4430, color: 0xa9b2bf },
};

export interface BracketParams {
  lengthMm: number; // 懸臂長度 L
  widthMm: number; // 截面寬 b
  heightMm: number; // 截面高 h（受力方向）
  material: MaterialKey;
  forceN: number; // 自由端向下集中力 F
  outputDir: string; // 求解檔案輸出資料夾；空字串 = 後端預設 projects 目錄
}

export const DEFAULT_PARAMS: BracketParams = {
  lengthMm: 200,
  widthMm: 30,
  heightMm: 20,
  material: "steel",
  forceN: 500,
  outputDir: "",
};

export interface Estimate {
  inertiaMm4: number; // 截面慣性矩 I
  maxStressMpa: number; // 最大彎曲應力 σ_max
  maxDeflectionMm: number; // 自由端最大撓度 δ_max
  safetyFactor: number; // 安全係數 = 降伏 / σ_max
  massG: number; // 質量（g）
  utilization: number; // 應力利用率 σ_max / 降伏（0–1+）
}

export function estimate(p: BracketParams): Estimate | null {
  const { lengthMm: L, widthMm: b, heightMm: h, forceN: F } = p;
  if (![L, b, h, F].every((x) => Number.isFinite(x)) || L <= 0 || b <= 0 || h <= 0) return null;

  const mat = MATERIALS[p.material];
  const I = (b * h ** 3) / 12; // mm^4
  const eMpa = mat.youngGpa * 1000; // GPa → MPa (N/mm²)
  const mMax = F * L; // N·mm
  const sigma = (mMax * (h / 2)) / I; // MPa
  const delta = (F * L ** 3) / (3 * eMpa * I); // mm
  const massG = (mat.densityKgM3 * (L * b * h) * 1e-9) * 1000; // 體積 mm³→m³, kg→g
  return {
    inertiaMm4: I,
    maxStressMpa: sigma,
    maxDeflectionMm: delta,
    safetyFactor: sigma > 0 ? mat.yieldMpa / sigma : Infinity,
    massG,
    utilization: sigma / mat.yieldMpa,
  };
}

export function validateParams(p: BracketParams): { ok: boolean; message?: string } {
  if (!(p.lengthMm > 0)) return { ok: false, message: "懸臂長度必須大於 0" };
  if (!(p.widthMm > 0)) return { ok: false, message: "截面寬必須大於 0" };
  if (!(p.heightMm > 0)) return { ok: false, message: "截面高必須大於 0" };
  if (!Number.isFinite(p.forceN)) return { ok: false, message: "施加力必須為數值" };
  return { ok: true };
}
