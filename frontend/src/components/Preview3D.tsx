// 即時 3D 結構預覽(Three.js)：滑鼠拖曳旋轉、滾輪縮放，參數變動即時重繪。
// 取自 react-vite-3d-preview skill 範本，由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Scene as GeoScene, Prim, Vec3 } from "../geometry";
import { COLORS } from "../geometry";

function v3(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]);
}

function makeMaterial(color: number, opacity?: number): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.55,
    roughness: 0.45,
    transparent: opacity !== undefined && opacity < 1,
    opacity: opacity ?? 1,
  });
}

function primToObject(prim: Prim): THREE.Object3D | null {
  switch (prim.kind) {
    case "tube": {
      if (prim.path.length < 2) return null;
      const curve = new THREE.CatmullRomCurve3(prim.path.map(v3), false, "catmullrom", 0);
      const seg = Math.max(24, prim.path.length * 6);
      const geo = new THREE.TubeGeometry(curve, seg, Math.max(prim.radius, 1e-4), 14, false);
      return new THREE.Mesh(geo, makeMaterial(prim.color, prim.opacity));
    }
    case "cylinder": {
      const a = v3(prim.p0);
      const b = v3(prim.p1);
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      if (len < 1e-6) return null;
      const geo = new THREE.CylinderGeometry(prim.radius, prim.radius, len, 20);
      const mesh = new THREE.Mesh(geo, makeMaterial(prim.color, prim.opacity));
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      return mesh;
    }
    case "box": {
      const geo = new THREE.BoxGeometry(prim.size[0], prim.size[1], prim.size[2]);
      const mesh = new THREE.Mesh(geo, makeMaterial(prim.color, prim.opacity));
      mesh.position.set(prim.center[0], prim.center[1], prim.center[2]);
      return mesh;
    }
    case "ring": {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, prim.outer, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, Math.max(prim.inner, 1e-4), 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: prim.height,
        bevelEnabled: false,
        curveSegments: 64,
      });
      geo.translate(0, 0, -prim.height / 2);
      return new THREE.Mesh(geo, makeMaterial(prim.color, prim.opacity));
    }
    case "airbox": {
      const sx = prim.max[0] - prim.min[0];
      const sy = prim.max[1] - prim.min[1];
      const sz = prim.max[2] - prim.min[2];
      const box = new THREE.BoxGeometry(sx, sy, sz);
      const edges = new THREE.EdgesGeometry(box);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: COLORS.airbox, transparent: true, opacity: 0.6 })
      );
      line.position.set(
        (prim.min[0] + prim.max[0]) / 2,
        (prim.min[1] + prim.max[1]) / 2,
        (prim.min[2] + prim.max[2]) / 2
      );
      box.dispose();
      return line;
    }
    default:
      return null;
  }
}

function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
  });
  group.clear();
}

interface Props {
  scene: GeoScene | null;
  fitKey: string; // 改變時重置視角(例如切換模型型態)
}

export default function Preview3D({ scene, fitKey }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const lastFitDiagRef = useRef(0);
  const lastFitKeyRef = useRef("");

  // 初始化(僅一次)
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 100000);
    camera.up.set(0, 0, 1); // Z 軸朝上
    camera.position.set(30, -30, 20);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.9);
    d1.position.set(1, -1, 1.4);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.4);
    d2.position.set(-1, 1, 0.6);
    scene.add(d2);

    // 依使用者要求，移除 3D 結構的網格線
    // const grid = new THREE.GridHelper(200, 40, 0x99a4b5, 0xd3d9e2);
    // grid.rotation.x = Math.PI / 2; // 置於 XY 平面
    // (grid.material as THREE.Material).transparent = true;
    // (grid.material as THREE.Material).opacity = 0.35;
    // scene.add(grid);

    const group = new THREE.Group();
    groupRef.current = group;
    scene.add(group);

    // ★ 容器剛掛載時，CSS Grid／Flexbox 版面可能尚未穩定，clientHeight 常量到 0；
    // 用獨立的 syncSize() 而非只在掛載當下讀一次，並在下一個影格再校正一次。
    const syncSize = () => {
      const w = Math.max(mount.clientWidth, 1);
      const h = Math.max(mount.clientHeight, 1);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    syncSize();

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    // 版面穩定後再校正一次尺寸，避免初次量測到 0 高度時畫面停在錯誤大小。
    requestAnimationFrame(syncSize);

    const ro = new ResizeObserver(syncSize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      if (groupRef.current) disposeGroup(groupRef.current);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  const fitCamera = () => {
    if (!scene || !cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    const { min, max } = scene.fitBounds;
    const center = new THREE.Vector3(
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2
    );
    const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    
    const radius = Math.max(diag / 2, 1e-4);
    const fov = (camera.fov * Math.PI) / 180;
    const fitH = radius / Math.sin(fov / 2);
    const fitW = radius / Math.sin(Math.atan(Math.tan(fov / 2) * camera.aspect));
    const dist = 1.3 * Math.max(fitH, fitW);
    const dir = new THREE.Vector3(0.9, -1.0, 0.7).normalize();
    
    camera.position.copy(center).add(dir.multiplyScalar(dist));
    camera.near = Math.max(dist / 1000, 0.0002);
    camera.far = dist * 100;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
    
    lastFitDiagRef.current = diag;
    lastFitKeyRef.current = fitKey;
  };

  // 資料變動 → 重建幾何 + 視角貼合本體
  useEffect(() => {
    const group = groupRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!group || !camera || !controls) return;

    disposeGroup(group);
    if (!scene) return;
    for (const prim of scene.prims) {
      const obj = primToObject(prim);
      if (obj) group.add(obj);
    }

    // ★ 以 fitBounds(實體本體)貼合，而非整個計算域，避免本體縮成一點
    const { min, max } = scene.fitBounds;
    const center = new THREE.Vector3(
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2
    );
    const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const ratio = lastFitDiagRef.current > 0 ? diag / lastFitDiagRef.current : Infinity;
    const drift = center.distanceTo(controls.target);
    const keyChanged = fitKey !== lastFitKeyRef.current;

    // 只在必要時重置視角，避免打斷使用者的旋轉/縮放
    if (keyChanged || ratio > 1.4 || ratio < 0.7 || drift > 0.4 * Math.max(diag, 1e-6)) {
      fitCamera();
    }
  }, [scene, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div style={{ width: "100%", height: "100%" }} ref={mountRef} />
      <button
        type="button"
        onClick={fitCamera}
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          zIndex: 10,
          background: "rgba(255, 255, 255, 0.1)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          color: "var(--text)",
          padding: "6px 12px",
          borderRadius: 6,
          fontSize: 12,
          cursor: "pointer",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 600,
          transition: "background 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)")}
        title="重置視角 (Fit All)"
      >
        <span style={{ fontSize: 14 }}>⛶</span> Fit All
      </button>
    </div>
  );
}
