// 混合三通「參數 → 幾何」：T 形流體域（冷側直管 + 頂部熱側支管 + 出口），
// 三個開口以彩色薄圓盤標記、附流向箭頭。供瀏覽器端即時 3D 預覽，不連接求解器。

import type { Bounds, Prim, Scene, Vec3 } from "../../geometry";
import { finite } from "../../geometry";
import type { TeeParams } from "./params";

const FLUID_COLOR = 0x3aa6c2; // 流體域（半透明青）
const COLD_COLOR = 0x5aa0ff; // 冷側進口
const HOT_COLOR = 0xff6b6b; // 熱側進口
const OUTLET_COLOR = 0x9aa4b4; // 出口
const ARROW_COLD = 0x8fc9ff;
const ARROW_HOT = 0xffb0a3;

export function buildTeeScene(p: TeeParams): Scene | null {
  const { radiusMm: r, armLengthMm: L } = p;
  if (!finite(r, L) || r <= 0 || L <= 0) return null;

  const prims: Prim[] = [];
  const op = 0.32;
  const capT = Math.max(r * 0.18, 2);
  const arrowR = Math.max(r * 0.14, 1.4);

  // 流體域三臂（半透明）：冷側直管 −X→0、出口 0→+X、熱側支管 +Z→0。
  prims.push({ kind: "cylinder", p0: [-L, 0, 0], p1: [0, 0, 0], radius: r, color: FLUID_COLOR, opacity: op });
  prims.push({ kind: "cylinder", p0: [0, 0, 0], p1: [L, 0, 0], radius: r, color: FLUID_COLOR, opacity: op });
  prims.push({ kind: "cylinder", p0: [0, 0, L], p1: [0, 0, 0], radius: r, color: FLUID_COLOR, opacity: op });

  // 三個開口的彩色薄圓盤標記。
  prims.push({ kind: "cylinder", p0: [-L, 0, 0], p1: [-L + capT, 0, 0], radius: r, color: COLD_COLOR });
  prims.push({ kind: "cylinder", p0: [0, 0, L], p1: [0, 0, L - capT], radius: r, color: HOT_COLOR });
  prims.push({ kind: "cylinder", p0: [L - capT, 0, 0], p1: [L, 0, 0], radius: r, color: OUTLET_COLOR });

  // 流向箭頭：冷側沿 +X、熱側沿 −Z。
  prims.push({ kind: "tube", path: [[-L * 0.82, 0, 0], [-L * 0.45, 0, 0]], radius: arrowR, color: ARROW_COLD });
  prims.push({ kind: "box", center: [-L * 0.4, 0, 0], size: [arrowR * 4, arrowR * 3.2, arrowR * 3.2], color: ARROW_COLD });
  prims.push({ kind: "tube", path: [[0, 0, L * 0.82], [0, 0, L * 0.45]], radius: arrowR, color: ARROW_HOT });
  prims.push({ kind: "box", center: [0, 0, L * 0.4], size: [arrowR * 3.2, arrowR * 3.2, arrowR * 4], color: ARROW_HOT });

  const bounds: Bounds = { min: [-L, -r, -r], max: [L, r, L] };
  const fitBounds: Bounds = { min: [-L, -r * 1.4, -r * 1.4], max: [L, r * 1.4, L] };
  return { prims, bounds, fitBounds };
}
