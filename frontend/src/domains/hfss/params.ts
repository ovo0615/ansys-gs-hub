// 偶極天線參數定義與防呆，對應後端 DipoleParams（backend/app/models.py）。

export interface DipoleParams {
  frequencyGhz: number;
  wireRadiusMm: number;
  gapMm: number;
  totalLengthMm: number | null; // null = 依頻率自動估算
  freqSpanPct: number;
  outputDir: string; // 模擬專案輸出資料夾；空字串 = 後端預設 projects 目錄
}

export const DEFAULT_PARAMS: DipoleParams = {
  frequencyGhz: 2.4,
  wireRadiusMm: 0.5,
  gapMm: 1.0,
  totalLengthMm: null,
  freqSpanPct: 40,
  outputDir: "",
};

export function toApiParams(p: DipoleParams) {
  return {
    frequency_ghz: p.frequencyGhz,
    wire_radius_mm: p.wireRadiusMm,
    gap_mm: p.gapMm,
    total_length_mm: p.totalLengthMm,
    freq_span_pct: p.freqSpanPct,
    output_dir: p.outputDir.trim() || null,
  };
}

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

export function validateParams(p: DipoleParams): ValidationResult {
  if (!Number.isFinite(p.frequencyGhz) || p.frequencyGhz <= 0) {
    return { ok: false, message: "中心頻率必須大於 0" };
  }
  if (!Number.isFinite(p.wireRadiusMm) || p.wireRadiusMm <= 0) {
    return { ok: false, message: "導線半徑必須大於 0" };
  }
  if (!Number.isFinite(p.gapMm) || p.gapMm <= 0) {
    return { ok: false, message: "饋入間隙必須大於 0" };
  }
  if (p.totalLengthMm != null && p.totalLengthMm <= p.gapMm) {
    return { ok: false, message: "天線總長度必須大於饋入間隙" };
  }
  if (!Number.isFinite(p.freqSpanPct) || p.freqSpanPct <= 0) {
    return { ok: false, message: "頻率掃描範圍必須大於 0" };
  }
  return { ok: true };
}
