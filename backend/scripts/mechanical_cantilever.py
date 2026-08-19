# -*- coding: utf-8 -*-
"""
Mechanical Getting Started「懸臂樑靜態結構」參數化端對端求解腳本
================================================================
對齊 Mechanical Getting Started 靜態結構工作流：幾何 → 材料 → 網格 → 固定支撐 →
負載 → 求解 → 應力／變形／安全係數。一端固定、自由端受向下（-Z）集中力的矩形樑。

流程：
  1) 用 PyAnsys Geometry（ansys.geometry.core）以矩形斷面拉伸出樑，並在固定端面與
     受力端面建立命名選集（fixed_face / load_face），匯出 .pmdb。
  2) 用 PyMechanical 嵌入式 App（ansys.mechanical.core）匯入幾何、加靜態結構分析、
     指定網格、固定支撐、集中力，求解取「等效應力（von Mises）最大值」與「總變形最大值」。

材料處理（重要且刻意的簡化，確保穩健）：
  線彈性、單一均質實體、以「外力」加載時：
    - 應力場與楊氏模數 E 無關（von Mises 最大值不隨材料改變）；
    - 變形量與 E 成反比。
  因此本腳本以 Mechanical 內建預設材料「Structural Steel」（E~200 GPa）求解，
  取得「與材料無關的 von Mises 應力」與「鋼的變形」，再依所選材料的 E 以
  δ_material = δ_steel × (E_steel / E_material) 換算變形，並以所選材料降伏強度計算安全係數。
  如此可涵蓋鋼／鋁／鈦三種材料而完全不需外部材料 XML，最不易出錯。

需要預先安裝的套件與環境：
  - Python 套件：ansys-mechanical-core、ansys-geometry-core
      安裝：pip install ansys-mechanical-core ansys-geometry-core
  - 本機需安裝並「已授權」ANSYS Mechanical（本機為 v232 / 2023 R2）。
  - App() 會自動偵測安裝版本；欄位名稱如因版本略有差異，腳本已加防呆與日誌以便微調。

單獨執行（安裝完成後）：
  python backend/scripts/mechanical_cantilever.py --length 200 --width 30 --height 20 \
         --material steel --force 500 --out D:/tmp/cantilever
"""
from __future__ import annotations

import datetime
import os
from typing import Callable, Optional

Logger = Callable[[str], None]

# 與前端 domains/mechanical/params.ts 的材料庫一致。
MATERIALS = {
    "steel": {"label": "結構鋼 Structural Steel", "young_gpa": 200.0, "yield_mpa": 250.0, "density": 7850.0},
    "aluminum": {"label": "鋁合金 Aluminum 6061", "young_gpa": 69.0, "yield_mpa": 276.0, "density": 2700.0},
    "titanium": {"label": "鈦合金 Ti-6Al-4V", "young_gpa": 96.0, "yield_mpa": 880.0, "density": 4430.0},
}
STEEL_YOUNG_GPA = 200.0  # 內建 Structural Steel 的楊氏模數（求解基準）


def _default_log(msg: str) -> None:
    print(msg, flush=True)


def _dominant_normal(face, log: Logger):
    """回傳 (主軸 'x'|'y'|'z', 正負號)。用平面外法向量最大分量判別端面朝向。"""
    n = None
    for attempt in (lambda: face.normal(), lambda: face.normal(0.5, 0.5), lambda: face.face_normal(0.5, 0.5)):
        try:
            n = attempt()
            break
        except Exception:  # noqa: BLE001
            continue
    if n is None:
        return ("?", 0)
    comps = [float(n[0]), float(n[1]), float(n[2])]
    i = max(range(3), key=lambda k: abs(comps[k]))
    return (["x", "y", "z"][i], 1 if comps[i] >= 0 else -1)


def _is_planar(face) -> bool:
    return "PLANE" in str(getattr(face, "surface_type", "")).upper()


# ──────────────────────────────────────────────────────────────────────────
# 1) 幾何：矩形斷面拉伸成樑，命名固定端／受力端
# ──────────────────────────────────────────────────────────────────────────
def build_geometry(params: dict, out_dir: str, log: Logger) -> str:
    from ansys.geometry.core import launch_modeler
    from ansys.geometry.core.math import Plane, Point2D, Point3D, Vector3D
    from ansys.geometry.core.misc import UNITS
    from ansys.geometry.core.sketch import Sketch

    L = float(params["length_mm"])
    b = float(params["width_mm"])
    h = float(params["height_mm"])

    log("啟動 PyAnsys Geometry 服務 ...")
    modeler = launch_modeler()
    try:
        design = modeler.create_design("Cantilever")

        # 斷面平面：法向量 +X（dir_x=Y、dir_y=Z）；斷面寬 b 沿 Y、高 h 沿 Z。
        plane = Plane(Point3D([0, 0, 0], unit=UNITS.mm), direction_x=Vector3D([0, 1, 0]), direction_y=Vector3D([0, 0, 1]))
        sk = Sketch(plane)
        sk.box(Point2D([0, 0], unit=UNITS.mm), width=b * UNITS.mm, height=h * UNITS.mm)

        log(f"拉伸樑：長 {L} × 寬 {b} × 高 {h} mm ...")
        beam = design.extrude_sketch("beam", sk, distance=L * UNITS.mm)  # x=0..L
        log(f"樑建立完成：faces={len(beam.faces)}、volume={getattr(beam, 'volume', '?')}")

        # 找出兩個 X 向端面：x=0（法向 -X）為固定端、x=L（法向 +X）為受力端。
        fixed_face = load_face = None
        for f in beam.faces:
            if not _is_planar(f):
                continue
            axis, sign = _dominant_normal(f, log)
            if axis == "x" and sign < 0:
                fixed_face = f
            elif axis == "x" and sign > 0:
                load_face = f
        if fixed_face is None or load_face is None:
            raise RuntimeError("端面辨識失敗，請於實跑日誌檢查各面外法向量後調整 _dominant_normal。")

        log("建立命名選集：fixed_face（固定端）、load_face（受力端）...")
        design.create_named_selection("fixed_face", faces=[fixed_face])
        design.create_named_selection("load_face", faces=[load_face])

        os.makedirs(out_dir, exist_ok=True)
        log("匯出 .pmdb ...")
        design.export_to_pmdb(out_dir)
        pmdb = os.path.join(out_dir, "Cantilever.pmdb")
        if not os.path.exists(pmdb):
            cands = [os.path.join(out_dir, f) for f in os.listdir(out_dir) if f.lower().endswith(".pmdb")]
            pmdb = max(cands, key=os.path.getmtime) if cands else pmdb
        log(f"幾何已匯出：{pmdb}")
        return pmdb
    finally:
        modeler.close()


# ──────────────────────────────────────────────────────────────────────────
# 2) 求解：PyMechanical 嵌入式 App
# ──────────────────────────────────────────────────────────────────────────
def solve_static(pmdb: str, params: dict, out_dir: str, log: Logger) -> dict:
    from ansys.mechanical.core import App

    force_n = float(params["force_n"])
    mat_key = params.get("material", "steel")
    mat = MATERIALS.get(mat_key, MATERIALS["steel"])
    h = float(params["height_mm"])
    b = float(params["width_mm"])

    log("啟動 PyMechanical 嵌入式 App（自動偵測本機版本）...")
    app = App(globals=globals())
    log(str(app))
    try:
        log("匯入幾何（含命名選集）...")
        gi = app.helpers.import_geometry(pmdb, process_named_selections=True)
        try:
            assert gi.ObjectState == ObjectState.Solved  # noqa: F821 - enum 由 App(globals=) 注入
        except Exception:  # noqa: BLE001 - 不同版本狀態列舉略異，僅記錄
            log("（幾何匯入狀態未能斷言，續行）")

        model = app.Model
        model.AddStaticStructuralAnalysis()
        static = model.Analyses[0]
        solution = static.Solution

        # 單位系統：Standard NMM（mm / N / MPa），與前端一致。
        app.ExtAPI.Application.ActiveUnitSystem = MechanicalUnitSystem.StandardNMM  # noqa: F821
        log("採用預設材料 Structural Steel（E~200 GPa）求解；變形後續依所選材料 E 換算。")

        # 網格：以斷面較小邊的 1/3 當元素尺寸，兼顧精度與速度。
        elem = max(min(b, h) / 3.0, 2.0)
        mesh = model.Mesh
        try:
            mesh.ElementSize = Quantity(elem, "mm")  # noqa: F821
        except Exception as exc:  # noqa: BLE001
            log(f"（網格尺寸設定略過：{exc}）")
        log(f"產生網格（元素尺寸約 {elem:.1f} mm）...")
        mesh.GenerateMesh()

        # 固定支撐（固定端面）。
        log("加入固定支撐（fixed_face）...")
        fixed = static.AddFixedSupport()
        fixed.Location = app.DataModel.GetObjectsByName("fixed_face")[0]

        # 集中力：作用於受力端面，方向 -Z，量值 force_n（N）。
        log(f"加入自由端集中力：{force_n} N（-Z）...")
        force = static.AddForce()
        force.Location = app.DataModel.GetObjectsByName("load_face")[0]
        try:
            force.DefineBy = LoadDefineBy.Components  # noqa: F821
            force.ZComponent.Output.DiscreteValues = [Quantity(-force_n, "N")]  # noqa: F821
        except Exception as exc:  # noqa: BLE001
            log(f"⚠ 以分量定義力時欄位不符：{exc}（請以 dir()/help() 核對後微調）")

        # 結果物件。
        total_def = solution.AddTotalDeformation()
        eqv_stress = solution.AddEquivalentStress()

        log("開始求解 ...")
        solution.Solve(True)
        status_ok = True
        try:
            status_ok = solution.Status == SolutionStatusType.Done  # noqa: F821
        except Exception:  # noqa: BLE001
            pass
        if not status_ok:
            log("⚠ 求解狀態非 Done，請檢查 solve.out。")
        try:
            solution.EvaluateAllResults()
        except Exception:  # noqa: BLE001
            pass
        app.messages.show()

        vm_max = _result_max(eqv_stress, log)        # MPa（NMM 單位制）
        def_steel = _result_max(total_def, log)      # mm（以鋼求得）

        # 依所選材料 E 換算變形；安全係數用所選材料降伏強度。
        def_material = None
        if def_steel is not None:
            def_material = def_steel * (STEEL_YOUNG_GPA / mat["young_gpa"])
        sf = (mat["yield_mpa"] / vm_max) if (vm_max and vm_max > 0) else None

        if vm_max is not None:
            log(f"★ von Mises 最大應力 ~ {vm_max:.2f} MPa（與材料無關）")
        if def_material is not None:
            log(f"★ 自由端最大變形 ~ {def_material:.4f} mm（{mat['label']}，由鋼 {def_steel:.4f} mm 換算）")
        if sf is not None:
            log(f"★ 安全係數（降伏 {mat['yield_mpa']} MPa）~ {sf:.2f}")

        # 存檔與應力雲圖。
        os.makedirs(out_dir, exist_ok=True)
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        image_path = os.path.join(out_dir, f"cantilever_stress_{stamp}.png")
        try:
            app.Graphics.Camera.SetFit()
            app.helpers.export_image(eqv_stress, image_path)
            log(f"應力雲圖已存：{image_path}")
        except Exception as exc:  # noqa: BLE001
            log(f"（雲圖輸出略過：{exc}）")
            image_path = None

        mechdat_path = os.path.join(out_dir, f"cantilever_{stamp}.mechdat")
        try:
            app.save_as(mechdat_path, overwrite=True)
            log(f"已儲存專案：{mechdat_path}")
        except Exception as exc:  # noqa: BLE001
            log(f"（專案存檔略過：{exc}）")
            mechdat_path = None

        return {
            "von_mises_max_mpa": vm_max,
            "deformation_max_mm": def_material,
            "deformation_steel_mm": def_steel,
            "safety_factor": sf,
            "material": mat["label"],
            "mechdat_path": mechdat_path if mechdat_path and os.path.exists(mechdat_path) else None,
            "image_path": image_path if image_path and os.path.exists(image_path) else None,
        }
    finally:
        try:
            app.close()
        except Exception:  # noqa: BLE001
            pass


def _result_max(result_obj, log: Logger) -> Optional[float]:
    """取結果物件 Maximum 的數值（active unit system 單位）。"""
    try:
        mx = result_obj.Maximum
        log(f"結果 Maximum 原始值：{mx}")
        try:
            return float(mx.Value)
        except Exception:  # noqa: BLE001 - 某些版本 Maximum 直接是數值
            return float(mx)
    except Exception as exc:  # noqa: BLE001
        log(f"⚠ 讀取結果 Maximum 失敗：{exc}")
        return None


# ──────────────────────────────────────────────────────────────────────────
# 對外主入口
# ──────────────────────────────────────────────────────────────────────────
def solve(params: dict, log: Optional[Logger] = None) -> dict:
    """端對端：幾何 → 匯入 → 靜態結構求解 → 後處理。params 對應前端懸臂樑參數。"""
    log = log or _default_log
    out_dir = params.get("output_dir") or os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "projects", "mechanical"
    )
    out_dir = os.path.abspath(out_dir)
    log(f"輸出資料夾：{out_dir}")

    pmdb = build_geometry(params, out_dir, log)
    result = solve_static(pmdb, params, out_dir, log)
    result["geometry_path"] = pmdb
    return result


def _cli() -> None:
    import argparse

    p = argparse.ArgumentParser(description="Mechanical 懸臂樑靜態結構參數化求解")
    p.add_argument("--length", type=float, default=200.0, help="懸臂長度 mm")
    p.add_argument("--width", type=float, default=30.0, help="斷面寬 mm")
    p.add_argument("--height", type=float, default=20.0, help="斷面高 mm")
    p.add_argument("--material", type=str, default="steel", choices=list(MATERIALS.keys()))
    p.add_argument("--force", type=float, default=500.0, help="自由端集中力 N")
    p.add_argument("--out", type=str, default="", help="輸出資料夾（留空用預設）")
    p.add_argument("--json-out", type=str, default="", help="輸出 JSON 檔案")
    a = p.parse_args()

    params = {
        "length_mm": a.length,
        "width_mm": a.width,
        "height_mm": a.height,
        "material": a.material,
        "force_n": a.force,
        "output_dir": a.out or None,
    }
    res = solve(params)
    print("\n=== 結果 ===")
    for k, v in res.items():
        print(f"{k}: {v}")

    if a.json_out:
        import json
        with open(a.json_out, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    _cli()
