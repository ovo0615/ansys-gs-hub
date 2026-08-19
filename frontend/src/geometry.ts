// 共用的圖元(Prim)資料結構，供 Preview3D 與各領域的 geometry.ts 使用。
// 此範本取自 react-vite-3d-preview skill。

export type Vec3 = [number, number, number];

export const COLORS = {
  copper: 0xb87333,
  core: 0x30343a,
  shell: 0xe0a94a,
  airbox: 0x5aa0ff,
};

export type Prim =
  | { kind: "tube"; path: Vec3[]; radius: number; color: number; opacity?: number }
  | { kind: "cylinder"; p0: Vec3; p1: Vec3; radius: number; color: number; opacity?: number }
  | { kind: "box"; center: Vec3; size: Vec3; color: number; opacity?: number }
  | { kind: "ring"; outer: number; inner: number; height: number; color: number; opacity?: number }
  | { kind: "airbox"; min: Vec3; max: Vec3 };

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export interface Scene {
  prims: Prim[];
  bounds: Bounds; // 整體(含計算域)
  fitBounds: Bounds; // ★只含實體本體 → 相機貼合用
}

export function boundsOfPoints(points: Vec3[]): Bounds {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
  return { min, max };
}

export function padBounds(b: Bounds, pad: number): Bounds {
  return {
    min: [b.min[0] - pad, b.min[1] - pad, b.min[2] - pad],
    max: [b.max[0] + pad, b.max[1] + pad, b.max[2] + pad],
  };
}

export const finite = (...xs: number[]) => xs.every((x) => Number.isFinite(x));
