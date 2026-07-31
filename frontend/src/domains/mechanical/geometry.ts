// 懸臂樑「參數 → 幾何」：一段矩形樑 + 固定端牆板 + 自由端向下受力箭頭。
// 供瀏覽器端即時 3D 預覽，不連接求解器。
// 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

import type { Bounds, Prim, Scene, Vec3 } from "../../geometry";
import { finite } from "../../geometry";
import { MATERIALS, type BracketParams } from "./params";

const WALL_COLOR = 0x4a5163;
const FORCE_COLOR = 0xff6b6b;

export function buildBracketScene(p: BracketParams): Scene | null {
  const { lengthMm: L, widthMm: b, heightMm: h } = p;
  if (!finite(L, b, h) || L <= 0 || b <= 0 || h <= 0) return null;

  const beamColor = MATERIALS[p.material].color;
  const prims: Prim[] = [];

  // 樑：沿 +X，固定端在原點，自由端在 x=L。
  prims.push({ kind: "box", center: [L / 2, 0, 0], size: [L, b, h], color: beamColor });

  // 固定端牆板：x<0 的一片略大於截面的板，示意固定支撐。
  const wallT = Math.max(h * 0.5, 6);
  prims.push({
    kind: "box",
    center: [-wallT / 2, 0, 0],
    size: [wallT, b * 1.7, h * 1.9],
    color: WALL_COLOR,
  });

  // 自由端受力箭頭：由上往下（-Z）指向樑上表面。
  const arrowLen = Math.max(h * 2.2, L * 0.18);
  const arrowR = Math.max(h * 0.08, 1.2);
  const zTop = h / 2;
  prims.push({
    kind: "tube",
    path: [
      [L, 0, zTop + arrowLen],
      [L, 0, zTop + arrowLen * 0.28],
    ],
    radius: arrowR,
    color: FORCE_COLOR,
  });
  // 箭頭頭部：用一個逐漸靠近表面的小方塊示意。
  prims.push({
    kind: "box",
    center: [L, 0, zTop + arrowLen * 0.14],
    size: [arrowR * 3.2, arrowR * 3.2, arrowLen * 0.28],
    color: FORCE_COLOR,
  });

  const pts: Vec3[] = [
    [-wallT, -b, -h],
    [L, b, zTop + arrowLen],
  ];
  const bounds: Bounds = { min: pts[0], max: pts[1] };
  const fitBounds: Bounds = {
    min: [-wallT, (-b * 1.7) / 2, -h * 1.1],
    max: [L, (b * 1.7) / 2, zTop + arrowLen],
  };

  return { prims, bounds, fitBounds };
}
