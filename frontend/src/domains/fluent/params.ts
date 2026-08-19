// Fluent Getting Started「混合三通 Mixing Tee」：對齊原廠課程 Demo 模型。
// 兩股空氣（冷 25°C / 熱 55°C）在 T 形管中混合，評估出口混合溫度。
// 課程預設：管半徑 20 mm、冷側 3 m/s 25°C、熱側 5 m/s 55°C、出口 0 Pa 表壓。
// 理論估算＝質量＋能量守恆的閉式解（非 CFD 求解），供介面預覽與教學用。

// 空氣視為理想氣體：ρ = P /(R·T)，動力黏度取常溫值。
const P_ATM = 101325; // Pa
const R_AIR = 287.05; // J/(kg·K)
const MU_AIR = 1.849e-5; // Pa·s
// 註：能量守恆中 cp 視為定值，於質量加權平均會約分，故不需帶入 cp 常數。

export interface TeeParams {
  radiusMm: number; // 管半徑（三個開口同徑）
  armLengthMm: number; // 各管臂長度（僅影響 3D 預覽尺度）
  coldVelocityMs: number; // 冷側入口流速
  coldTempC: number; // 冷側入口溫度
  hotVelocityMs: number; // 熱側入口流速
  hotTempC: number; // 熱側入口溫度
  outputDir: string; // 求解檔案輸出資料夾；空字串 = 後端預設 projects 目錄
}

export const DEFAULT_PARAMS: TeeParams = {
  radiusMm: 20,
  armLengthMm: 120,
  coldVelocityMs: 3,
  coldTempC: 25,
  hotVelocityMs: 5,
  hotTempC: 55,
  outputDir: "",
};

export function toApiParams(p: TeeParams) {
  return {
    radius_mm: p.radiusMm,
    arm_length_mm: p.armLengthMm,
    cold_velocity_ms: p.coldVelocityMs,
    cold_temp_c: p.coldTempC,
    hot_velocity_ms: p.hotVelocityMs,
    hot_temp_c: p.hotTempC,
    output_dir: p.outputDir.trim() || null,
  };
}

export function airDensity(tempC: number): number {
  return P_ATM / (R_AIR * (tempC + 273.15));
}

export interface Estimate {
  areaM2: number;
  massColdKgS: number;
  massHotKgS: number;
  massOutKgS: number;
  outletTempC: number; // 混合後出口平均溫度（headline 結果）
  outletVelocityMs: number;
  reynolds: number;
  regime: "laminar" | "transition" | "turbulent";
  regimeLabel: string;
}

export function estimate(p: TeeParams): Estimate | null {
  const vals = [p.radiusMm, p.coldVelocityMs, p.coldTempC, p.hotVelocityMs, p.hotTempC];
  if (!vals.every((x) => Number.isFinite(x)) || p.radiusMm <= 0) return null;

  const r = p.radiusMm / 1000; // m
  const area = Math.PI * r * r;

  const rhoCold = airDensity(p.coldTempC);
  const rhoHot = airDensity(p.hotTempC);
  const mCold = rhoCold * p.coldVelocityMs * area;
  const mHot = rhoHot * p.hotVelocityMs * area;
  const mOut = mCold + mHot;
  if (mOut <= 0) return null;

  // 能量守恆（cp 定值）：出口混合溫度為質量加權平均。
  const tOutK = (mCold * (p.coldTempC + 273.15) + mHot * (p.hotTempC + 273.15)) / mOut;
  const tOutC = tOutK - 273.15;

  const rhoOut = airDensity(tOutC);
  const vOut = mOut / (rhoOut * area);
  const Re = (rhoOut * vOut * (2 * r)) / MU_AIR;

  let regime: Estimate["regime"];
  let regimeLabel: string;
  if (Re < 2300) {
    regime = "laminar";
    regimeLabel = "層流 Laminar";
  } else if (Re < 4000) {
    regime = "transition";
    regimeLabel = "過渡 Transitional";
  } else {
    regime = "turbulent";
    regimeLabel = "紊流 Turbulent";
  }

  return {
    areaM2: area,
    massColdKgS: mCold,
    massHotKgS: mHot,
    massOutKgS: mOut,
    outletTempC: tOutC,
    outletVelocityMs: vOut,
    reynolds: Re,
    regime,
    regimeLabel,
  };
}

export function validateParams(p: TeeParams): { ok: boolean; message?: string } {
  if (!(p.radiusMm > 0)) return { ok: false, message: "管半徑必須大於 0" };
  if (!(p.armLengthMm > 0)) return { ok: false, message: "管臂長度必須大於 0" };
  if (!Number.isFinite(p.coldVelocityMs) || !Number.isFinite(p.hotVelocityMs))
    return { ok: false, message: "入口流速必須為數值" };
  if (p.coldVelocityMs < 0 || p.hotVelocityMs < 0) return { ok: false, message: "入口流速不可為負" };
  return { ok: true };
}
