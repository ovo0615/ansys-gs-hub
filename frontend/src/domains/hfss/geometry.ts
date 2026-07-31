// 偶極天線「參數 → 幾何」：與後端 backend/app/domains/hfss_dipole.py 的數學一致，
// 供瀏覽器端即時預覽用，不連接後端。
// 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

import type { Bounds, Prim, Scene, Vec3 } from "../../geometry";
import { finite } from "../../geometry";
import type { DipoleParams } from "./params";

const C_MM_PER_S = 299_792_458 * 1000; // 光速，單位 mm/s
const WIRE_COLOR = 0xb87333;

export function wavelengthMm(frequencyGhz: number): number {
  const freqHz = frequencyGhz * 1e9;
  return C_MM_PER_S / freqHz;
}

export function defaultTotalLengthMm(frequencyGhz: number): number {
  return 0.48 * wavelengthMm(frequencyGhz);
}

export interface DipoleDimensions {
  wireRadiusMm: number;
  gapMm: number;
  totalLengthMm: number;
  armLengthMm: number;
  wavelengthMm: number;
}

export function dipoleDimensions(p: DipoleParams): DipoleDimensions | null {
  if (!finite(p.frequencyGhz, p.wireRadiusMm, p.gapMm) || p.frequencyGhz <= 0 || p.wireRadiusMm <= 0 || p.gapMm <= 0) {
    return null;
  }
  const totalLengthMm = p.totalLengthMm && p.totalLengthMm > 0 ? p.totalLengthMm : defaultTotalLengthMm(p.frequencyGhz);
  const armLengthMm = (totalLengthMm - p.gapMm) / 2;
  if (armLengthMm <= 0) return null;

  return {
    wireRadiusMm: p.wireRadiusMm,
    gapMm: p.gapMm,
    totalLengthMm,
    armLengthMm,
    wavelengthMm: wavelengthMm(p.frequencyGhz),
  };
}

export interface ResonanceInfo {
  effectiveLengthMm: number; // 實際採用的總長度（含自動估算）
  wavelengthMm: number;
  electricalLengthLambda: number; // 總長度 / λ
  resonantLengthMm: number; // 此頻率的共振長度（0.48 λ）
  naturalResonantFreqGhz: number; // 此長度自身會共振的頻率
  ratio: number; // 總長度 / 共振長度
  status: "ok" | "short" | "long";
}

// 依「總長度 vs. 頻率」評估天線電性長度，用來提醒使用者電性短／長導致的失配。
// 饋入埠（lumped port）只隨導線半徑與間隙變化，與此無關；此處判斷的是天線本體是否共振。
export function resonanceInfo(p: DipoleParams): ResonanceInfo | null {
  if (!finite(p.frequencyGhz) || p.frequencyGhz <= 0) return null;
  const lam = wavelengthMm(p.frequencyGhz);
  const eff = p.totalLengthMm && p.totalLengthMm > 0 ? p.totalLengthMm : defaultTotalLengthMm(p.frequencyGhz);
  const res = defaultTotalLengthMm(p.frequencyGhz);
  const ratio = eff / res;
  const status: ResonanceInfo["status"] = ratio < 0.85 ? "short" : ratio > 1.15 ? "long" : "ok";
  return {
    effectiveLengthMm: eff,
    wavelengthMm: lam,
    electricalLengthLambda: eff / lam,
    resonantLengthMm: res,
    naturalResonantFreqGhz: (0.48 * C_MM_PER_S) / eff / 1e9,
    ratio,
    status,
  };
}

export function buildDipoleScene(p: DipoleParams): Scene | null {
  const dims = dipoleDimensions(p);
  if (!dims) return null;

  const { wireRadiusMm: r, gapMm: gap, armLengthMm: arm, wavelengthMm: lam } = dims;

  const topPath: Vec3[] = [
    [0, 0, gap / 2],
    [0, 0, gap / 2 + arm],
  ];
  const bottomPath: Vec3[] = [
    [0, 0, -gap / 2],
    [0, 0, -gap / 2 - arm],
  ];

  const prims: Prim[] = [
    { kind: "tube", path: topPath, radius: r, color: WIRE_COLOR },
    { kind: "tube", path: bottomPath, radius: r, color: WIRE_COLOR },
  ];

  const pad = lam / 4;
  const totalHalf = gap / 2 + arm;
  const airMin: Vec3 = [-(r + pad), -(r + pad), -(totalHalf + pad)];
  const airMax: Vec3 = [r + pad, r + pad, totalHalf + pad];
  prims.push({ kind: "airbox", min: airMin, max: airMax });

  const fitPad = r * 2;
  const fitBounds: Bounds = {
    min: [-(r + fitPad), -(r + fitPad), -totalHalf],
    max: [r + fitPad, r + fitPad, totalHalf],
  };

  return {
    prims,
    bounds: { min: airMin, max: airMax },
    fitBounds,
  };
}
