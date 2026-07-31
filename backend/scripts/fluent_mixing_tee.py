# -*- coding: utf-8 -*-
"""
此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

Fluent Getting Started「混合三通 Mixing Tee」參數化端對端求解腳本
==================================================================
對齊 Ansys Fluent Getting Started 課程 Demo：兩股空氣（冷 25°C／熱 55°C）在 T 形管
混合，評估出口混合溫度。本腳本為「參數化」版本——幾何由參數即時產生，不需外部 CAD 檔。

流程（重要：網格改用 PyPrimeMesh，繞開 Fluent Meshing 的 CAD 匯入問題，見下方說明）：
  1) 用 PyAnsys Geometry（ansys.geometry.core）以三段圓柱組出流體域 T 形管、布林聯集，
     逐面分類（inlet_cold / inlet_hot / outlet / wall_N），逐面 tessellate 三角化，
     寫成「多重具名 solid」的 ASCII STL（每個開口/壁面各自一個具名 solid 區塊）。
  2) 用 PyPrimeMesh（ansys.meshing.prime）匯入該 STL，依 solid 名稱建立對應的具名
     face zone，辨識封閉體積，AutoMesh 產生 poly 體網格，匯出 Fluent case（.cas.h5）。
  3) 用 PyFluent（ansys.fluent.core）solver 模式直接讀入該 case，把 Prime 預設的
     wall 類型 zone 轉成 velocity-inlet / pressure-outlet，cell zone 轉成 fluid，
     設能量方程、realizable k-epsilon、兩個 velocity-inlet（含溫度）與
     pressure-outlet，初始化並疊代求解。
  4) 取出口面積加權平均「溫度」與「速度」，存 case 與溫度雲圖 PNG。

為什麼不直接用 Fluent Meshing（重要，避免日後走回頭路）：
  本機 Fluent（2025 R2）的 Discovery/PartMgr CAD 附加流程對所有 BREP 格式
  （.scdocx/.pmdb/.dsco/.x_t/.step/.iges）系統性失敗（AttachAssembly 逾時或
  「not implemented」）。改用網格化的 .stl 格式雖然可被 Fluent Meshing 的
  classic TUI（file/import/cad-geometry）成功匯入並正確分區，但這個 Fluent
  版本已把「體網格生成」完全收斂到 guided Workflow 系統，經典 TUI 沒有暴露
  對應指令；而 Workflow 自己的 Import Geometry 任務在 FileFormat="Mesh" 下有
  明確的參數驗證 bug（無論用屬性賦值／set_state()／update_dict() 賦值，一律
  回報「File Names 未提供」，即使讀回的狀態確實已正確設定）。
  改用獨立的 PyPrimeMesh 網格引擎完全繞開上述 Fluent Meshing 的問題：
  import_cad → 逐面建具名 zone → compute_closed_volumes → AutoMesh →
  export_fluent_case，全程不經過 Fluent Meshing 的 CAD reader。
  唯一要注意：Prime 匯出的 face zone 預設一律是 wall 類型、cell zone 預設是
  solid 類型，讀進 Fluent solver 後必須用 set_zone_type() 手動轉正確類型
  （見 _fix_zone_types）。

需要預先安裝的套件與環境（重要）：
  - Python 套件：ansys-fluent-core、ansys-geometry-core[graphics]（含 pyvista，
    tessellate() 三角化需要）、ansys-meshing-prime。
      安裝：pip install ansys-fluent-core "ansys-geometry-core[graphics]" ansys-meshing-prime
  - 本機需安裝並「已授權」ANSYS（本機 Fluent 為 v252 / 2025 R2；Prime 隨 Fluent
    安裝一併提供，不需額外授權）。
  - 首次於本機實跑時，個別 settings 欄位名稱可能因 Fluent 版本略有差異，
    腳本已加上防呆與日誌以便微調。

單獨執行（安裝完成後）：
  python backend/scripts/fluent_mixing_tee.py --radius 20 --arm 120 \
         --cold-vel 3 --cold-temp 25 --hot-vel 5 --hot-temp 55 --out D:/tmp/tee
"""
from __future__ import annotations

import datetime
import os
from typing import Callable, List, Optional, Tuple

Logger = Callable[[str], None]


def _default_log(msg: str) -> None:
    print(msg, flush=True)


def _is_planar(face) -> bool:
    return "PLANE" in str(getattr(face, "surface_type", "")).upper()


def _dominant_normal(face, log: Logger):
    """回傳 (主軸 'x'|'y'|'z', 正負號)。以平面外法向量最大分量判別開口朝向。"""
    n = None
    for attempt in (lambda: face.normal(), lambda: face.normal(0.5, 0.5), lambda: face.face_normal(0.5, 0.5)):
        try:
            n = attempt()
            break
        except Exception:  # noqa: BLE001 - 逐一嘗試不同版本的取法
            continue
    if n is None:
        log("! 無法取得面法向量，該面歸為 wall。")
        return ("?", 0)
    comps = [float(n[0]), float(n[1]), float(n[2])]
    i = max(range(3), key=lambda k: abs(comps[k]))
    return (["x", "y", "z"][i], 1 if comps[i] >= 0 else -1)


def _write_solid_block(f, name: str, mesh) -> None:
    """把一個 pyvista PolyData（單一面的三角化結果）寫成 ASCII STL 的一個具名 solid 區塊。"""
    import numpy as np

    tri = mesh.triangulate()
    pts = tri.points
    faces = tri.faces.reshape(-1, 4)[:, 1:4]  # 每列 [3, i0, i1, i2] -> 取頂點索引
    f.write(f"solid {name}\n")
    for i0, i1, i2 in faces:
        p0, p1, p2 = pts[i0], pts[i1], pts[i2]
        nvec = np.cross(p1 - p0, p2 - p0)
        norm = np.linalg.norm(nvec)
        nvec = nvec / norm if norm > 1e-12 else np.array([0.0, 0.0, 0.0])
        f.write(f"  facet normal {nvec[0]:.6e} {nvec[1]:.6e} {nvec[2]:.6e}\n")
        f.write("    outer loop\n")
        for p in (p0, p1, p2):
            f.write(f"      vertex {p[0]:.6e} {p[1]:.6e} {p[2]:.6e}\n")
        f.write("    endloop\n")
        f.write("  endfacet\n")
    f.write(f"endsolid {name}\n")


# ──────────────────────────────────────────────────────────────────────────
# 1) 幾何：以 PyAnsys Geometry 產生流體域 T 形管，逐面寫成具名多 solid STL
# ──────────────────────────────────────────────────────────────────────────
def build_geometry(params: dict, out_dir: str, log: Logger) -> Tuple[str, List[str]]:
    """依參數產生混合三通「流體域」實體，逐面三角化寫成具名多 solid ASCII STL。

    回傳 (stl_path, zone_names)：zone_names 是依寫入順序排列的 solid 名稱清單，
    後續 mesh_with_prime() 必須依「相同順序」把 Prime 匯入後的 face_zonelets
    對應到這些名稱（Prime 匯入 STL 時會依檔案內 solid 出現順序回傳 zonelet）。
    """
    from ansys.geometry.core import launch_modeler
    from ansys.geometry.core.math import Plane, Point2D, Point3D, Vector3D
    from ansys.geometry.core.misc import UNITS
    from ansys.geometry.core.sketch import Sketch

    r = float(params["radius_mm"])
    L = float(params["arm_length_mm"])

    log("啟動 PyAnsys Geometry 服務（launch_modeler）...")
    modeler = launch_modeler()
    try:
        design = modeler.create_design("MixingTee")

        # 三個平面：法向量分別為 +X（冷臂、出口臂）與 +Z（熱側支管）。
        plane_x0 = Plane(Point3D([0, 0, 0], unit=UNITS.mm), direction_x=Vector3D([0, 1, 0]), direction_y=Vector3D([0, 0, 1]))
        plane_cold = Plane(Point3D([-L, 0, 0], unit=UNITS.mm), direction_x=Vector3D([0, 1, 0]), direction_y=Vector3D([0, 0, 1]))
        plane_z0 = Plane(Point3D([0, 0, 0], unit=UNITS.mm), direction_x=Vector3D([1, 0, 0]), direction_y=Vector3D([0, 1, 0]))

        def circle_sketch(plane: "Plane") -> "Sketch":
            sk = Sketch(plane)
            sk.circle(Point2D([0, 0], unit=UNITS.mm), radius=r * UNITS.mm)
            return sk

        log("建立三段圓柱（冷臂 -X→0、出口臂 0→+X、熱側支管 +Z→0）...")
        cold = design.extrude_sketch("cold_arm", circle_sketch(plane_cold), distance=L * UNITS.mm)   # x=-L..0
        out_arm = design.extrude_sketch("outlet_arm", circle_sketch(plane_x0), distance=L * UNITS.mm)  # x=0..L
        hot = design.extrude_sketch("hot_branch", circle_sketch(plane_z0), distance=L * UNITS.mm)      # z=0..L

        log("布林聯集成單一流體域實體...")
        cold.unite(out_arm)  # 消耗 out_arm
        cold.unite(hot)      # 消耗 hot
        # 聯集後重新自 design 取回實體，避免使用到失效的快取參考。
        body = design.bodies[0]
        log(f"聯集完成：faces={len(body.faces)}、volume={getattr(body, 'volume', '?')}")

        # 分類面：聯集後僅存三個「平面」開口（其餘為圓柱壁面）。以外法向量判別。
        cold_face = out_face = hot_face = None
        wall_faces = []
        for f in body.faces:
            if not _is_planar(f):
                wall_faces.append(f)
                continue
            axis, sign = _dominant_normal(f, log)
            if axis == "x" and sign < 0:
                cold_face = f
            elif axis == "x" and sign > 0:
                out_face = f
            elif axis == "z" and sign > 0:
                hot_face = f
            else:
                wall_faces.append(f)

        missing = [n for n, v in [("inlet_cold", cold_face), ("inlet_hot", hot_face), ("outlet", out_face)] if v is None]
        if missing:
            raise RuntimeError(
                "開口面辨識失敗：" + ", ".join(missing) +
                "。請於實跑日誌檢查各平面外法向量方向，必要時調整 _dominant_normal 判別。"
            )

        zone_names = ["inlet_cold", "inlet_hot", "outlet"] + [f"wall_{i}" for i in range(len(wall_faces))]
        ordered_faces = [cold_face, hot_face, out_face] + wall_faces

        log(f"逐面三角化並寫入具名多 solid STL（{len(zone_names)} 個 zone：{', '.join(zone_names)}）...")
        os.makedirs(out_dir, exist_ok=True)
        stl_path = os.path.join(out_dir, "MixingTee.stl")
        with open(stl_path, "w", encoding="ascii") as sf:
            for name, face in zip(zone_names, ordered_faces):
                mesh = face.tessellate()
                _write_solid_block(sf, name, mesh)
                log(f"  {name}: {mesh.n_cells} 個三角面")

        log(f"幾何已匯出：{stl_path}")
        return stl_path, zone_names
    finally:
        modeler.close()


# ──────────────────────────────────────────────────────────────────────────
# 2) 網格：PyPrimeMesh 匯入 STL → 具名 zone → 體網格 → 匯出 Fluent case
# ──────────────────────────────────────────────────────────────────────────
def mesh_with_prime(stl_path: str, zone_names: List[str], out_dir: str, log: Logger) -> str:
    """用 PyPrimeMesh 把具名多 solid STL 轉成 Fluent 可讀的 case 檔，回傳 case 路徑。"""
    import ansys.meshing.prime as prime

    log("啟動 Prime 網格引擎（launch_prime）...")
    prime_client = prime.launch_prime()
    try:
        model = prime_client.model
        file_io = prime.FileIO(model)

        log(f"匯入 STL：{stl_path} ...")
        r = file_io.import_cad(file_name=stl_path, params=prime.ImportCadParams(model=model))
        # 一定要拿列舉本身比對，不要用 str(r.error_code) 去比字串。
        # Python 3.11 起 IntEnum.__str__ 改成與 int.__str__ 一致：
        #   Python 3.10 → str(ErrorCode.NOERROR) == "ErrorCode.NOERROR"
        #   Python 3.11+ → str(ErrorCode.NOERROR) == "0"
        # 舊版寫成字串比對，因此在 3.11/3.12 上即使匯入成功（error_code 為 NOERROR）
        # 也會被誤判成失敗，錯誤訊息還會出現莫名其妙的「失敗：0」。
        if r.error_code != prime.ErrorCode.NOERROR:
            code_name = getattr(r.error_code, "name", r.error_code)
            raise RuntimeError(f"Prime import_cad 失敗：{code_name}")

        part = model.parts[0]
        face_zonelets = part.get_face_zonelets()
        if len(face_zonelets) != len(zone_names):
            raise RuntimeError(
                f"匯入後的面 zonelet 數量（{len(face_zonelets)}）與預期 zone 數量"
                f"（{len(zone_names)}）不符，STL 的 solid 順序可能與 zone_names 不一致。"
            )

        log("依 STL 寫入順序建立具名邊界 zone ...")
        for name, zonelet in zip(zone_names, face_zonelets):
            zr = model.create_zone(name, prime.ZoneType.FACE)
            part.add_zonelets_to_zone(zr.zone_id, [zonelet])

        log("辨識封閉體積（compute_closed_volumes）...")
        part.compute_closed_volumes(prime.ComputeVolumesParams(model=model))

        log("產生體網格（AutoMesh，poly-fill）...")
        automesh_params = prime.AutoMeshParams(
            model=model,
            size_field_type=prime.SizeFieldType.GEOMETRIC,
            volume_fill_type=prime.VolumeFillType.POLY,
        )
        prime.AutoMesh(model).mesh(part_id=part.id, automesh_params=automesh_params)
        summary = part.get_summary(prime.PartSummaryParams(model=model))
        log(f"網格產生完成。{summary.message.strip().splitlines()[-1] if summary.message else ''}")

        os.makedirs(out_dir, exist_ok=True)
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        case_path = os.path.join(out_dir, f"mixing_tee_{stamp}.cas.h5")
        log(f"匯出 Fluent case：{case_path} ...")
        file_io.export_fluent_case(case_path, prime.ExportFluentCaseParams(model=model, cff_format=True))
        if not os.path.exists(case_path):
            raise RuntimeError("Prime export_fluent_case 未產生 case 檔。")
        log("Prime 網格與匯出完成。")
        return case_path
    finally:
        prime_client.exit()


# ──────────────────────────────────────────────────────────────────────────
# 3) 求解：PyFluent solver 直接讀入 Prime 匯出的 case
# ──────────────────────────────────────────────────────────────────────────
def solve_case(case_path: str, params: dict, out_dir: str, log: Logger) -> dict:
    import ansys.fluent.core as pyfluent

    cold_v = float(params["cold_velocity_ms"])
    cold_t = float(params["cold_temp_c"]) + 273.15
    hot_v = float(params["hot_velocity_ms"])
    hot_t = float(params["hot_temp_c"]) + 273.15
    r_m = float(params["radius_mm"]) / 1000.0
    hyd_dia = f"{2 * r_m} [m]"
    iters = int(params.get("iterations", 200))

    log("啟動 Fluent solver 並讀入網格 ...")
    solver = pyfluent.launch_fluent(precision="double", processor_count=2, mode="solver", cleanup_on_exit=True)
    log("Fluent 版本：" + str(solver.get_fluent_version()))
    solver.settings.file.read_case(file_name=case_path)
    s = solver.settings

    _fix_zone_types(s, log)

    # ---- 物理模型（順序：模型 → 材料 → 邊界條件）----
    log("開啟能量方程與 realizable k-epsilon 紊流模型 ...")
    s.setup.models.energy.enabled = True
    s.setup.models.viscous.model = "k-epsilon"
    try:
        s.setup.models.viscous.k_epsilon_model = "realizable"
    except Exception as exc:  # noqa: BLE001
        log(f"（k-epsilon 子模型設定略過：{exc}）")

    log("設定邊界條件：兩個 velocity-inlet（含溫度）與 pressure-outlet ...")
    _set_velocity_inlet(s, "inlet_cold", cold_v, cold_t, hyd_dia, log)
    _set_velocity_inlet(s, "inlet_hot", hot_v, hot_t, hyd_dia, log)
    _set_pressure_outlet(s, "outlet", (cold_t + hot_t) / 2.0, log)

    # ---- 報告定義 ----
    log("建立出口溫度／速度報告定義 ...")
    _make_surface_report(s, "outlet-temp", "temperature", "outlet")
    _make_surface_report(s, "outlet-vel", "velocity-magnitude", "outlet")

    log("Hybrid 初始化 ...")
    s.solution.initialization.hybrid_initialize()
    log(f"開始疊代求解（{iters} 步）...")
    s.solution.run_calculation.iterate(iter_count=iters)

    # ---- 取結果 ----
    outlet_temp_k = _compute_report(s, "outlet-temp", log)
    outlet_vel = _compute_report(s, "outlet-vel", log)
    outlet_temp_c = (outlet_temp_k - 273.15) if outlet_temp_k is not None else None
    if outlet_temp_c is not None:
        log(f"* 出口面積加權平均溫度 ~ {outlet_temp_c:.2f} degC")
    if outlet_vel is not None:
        log(f"* 出口面積加權平均速度 ~ {outlet_vel:.3f} m/s")

    # ---- 存檔與雲圖 ----
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    final_case_path = os.path.join(out_dir, f"mixing_tee_{stamp}.cas.h5")
    log(f"儲存 case/data：{final_case_path}")
    try:
        s.file.write(file_type="case-data", file_name=final_case_path)
    except Exception as exc:  # noqa: BLE001
        log(f"（存檔略過：{exc}）")
        final_case_path = case_path

    contour_path = _save_temperature_contour(s, out_dir, stamp, log)

    log("關閉 Fluent 工作階段 ...")
    solver.exit()

    return {
        "outlet_temp_c": outlet_temp_c,
        "outlet_velocity_ms": outlet_vel,
        "iterations": iters,
        "converged": None,  # 收斂與否可由殘差判定，此處留待日後擴充
        "case_path": final_case_path if os.path.exists(final_case_path) else None,
        "contour_path": contour_path,
    }


def _fix_zone_types(settings, log: Logger) -> None:
    """Prime 匯出的 face zone 一律預設 wall、cell zone 一律預設 solid，
    這裡依名稱轉成正確的 velocity-inlet / pressure-outlet / fluid。"""
    bc = settings.setup.boundary_conditions
    log("修正邊界 zone 類型（Prime 匯出預設全部是 wall）...")
    try:
        bc.set_zone_type(zone_list=["inlet_cold"], new_type="velocity-inlet")
        bc.set_zone_type(zone_list=["inlet_hot"], new_type="velocity-inlet")
        bc.set_zone_type(zone_list=["outlet"], new_type="pressure-outlet")
    except Exception as exc:  # noqa: BLE001
        log(f"! 邊界 zone 類型設定失敗：{exc}")

    czc = settings.setup.cell_zone_conditions
    log("修正 cell zone 類型（Prime 匯出預設是 solid，需轉 fluid）...")
    try:
        solid_zones = list(czc.solid.keys()) if hasattr(czc, "solid") else []
        for z in solid_zones:
            czc.set_zone_type(zone_list=[z], new_type="fluid")
        log(f"  已轉為 fluid：{solid_zones}")
    except Exception as exc:  # noqa: BLE001
        log(f"! cell zone 類型設定失敗：{exc}")


def _set_velocity_inlet(settings, name: str, vel: float, temp_k: float, hyd_dia: str, log: Logger) -> None:
    try:
        inlet = settings.setup.boundary_conditions.velocity_inlet[name]
        inlet.momentum.velocity_magnitude.value = vel
        inlet.turbulence.turbulence_specification = "Intensity and Hydraulic Diameter"
        inlet.turbulence.turbulent_intensity = 0.05
        inlet.turbulence.hydraulic_diameter = hyd_dia
        inlet.thermal.temperature.value = temp_k
        log(f"  {name}: V={vel} m/s, T={temp_k - 273.15:.1f} degC")
    except Exception as exc:  # noqa: BLE001 - 欄位名稱可能因版本不同，留下明確日誌
        log(f"! 設定 velocity-inlet「{name}」時有欄位不符：{exc}（請以 dir()/help() 核對後微調）")


def _set_pressure_outlet(settings, name: str, backflow_temp_k: float, log: Logger) -> None:
    try:
        po = settings.setup.boundary_conditions.pressure_outlet[name]
        try:
            po.thermal.backflow_total_temperature.value = backflow_temp_k
        except Exception:  # noqa: BLE001 - 回流溫度為選用
            pass
        log(f"  {name}: 0 Pa 表壓（pressure-outlet）")
    except Exception as exc:  # noqa: BLE001
        log(f"! 設定 pressure-outlet「{name}」時有欄位不符：{exc}")


def _make_surface_report(settings, rep_name: str, field: str, surface: str) -> None:
    settings.solution.report_definitions.surface[rep_name] = {}
    rd = settings.solution.report_definitions.surface[rep_name]
    rd.report_type = "surface-areaavg"
    rd.field = field
    rd.surface_names = [surface]


def _compute_report(settings, rep_name: str, log: Logger) -> Optional[float]:
    try:
        raw = settings.solution.report_definitions.compute(report_defs=[rep_name])
        log(f"report[{rep_name}] 原始回傳：{raw}")
        return _extract_first_float(raw)
    except Exception as exc:  # noqa: BLE001
        log(f"! 讀取報告「{rep_name}」失敗：{exc}")
        return None


def _extract_first_float(raw) -> Optional[float]:
    """report_definitions.compute 的回傳結構在不同版本略有差異，遞迴取第一個數值。"""
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, dict):
        for v in raw.values():
            r = _extract_first_float(v)
            if r is not None:
                return r
    if isinstance(raw, (list, tuple)):
        for v in raw:
            r = _extract_first_float(v)
            if r is not None:
                return r
    return None


def _save_temperature_contour(settings, out_dir: str, stamp: str, log: Logger) -> Optional[str]:
    """在 y=0 中剖面畫溫度雲圖並存 PNG；失敗不影響求解結果。"""
    png = os.path.join(out_dir, f"mixing_tee_temp_{stamp}.png")
    try:
        try:
            # 幾何位於 X-Z 平面（冷/出口臂沿 X、熱側支管沿 Z、管徑方向為 Y），
            # 故取法向量為 Y 的中剖面用 "zx-plane"（Fluent 有效列舉值：
            # yz-plane/zx-plane/xy-plane/point-and-normal/three-points）。
            settings.results.surfaces.plane_surface["mid_y"] = {}
            ps = settings.results.surfaces.plane_surface["mid_y"]
            ps.method = "zx-plane"
            ps.y = 0.0
            surfaces = ["mid_y"]
        except Exception:  # noqa: BLE001 - 建剖面失敗則退回用 outlet 面
            surfaces = ["outlet"]

        settings.results.graphics.contour["temp_contour"] = {}
        c = settings.results.graphics.contour["temp_contour"]
        c.field = "temperature"
        c.surfaces_list = surfaces
        c.display()

        g = settings.results.graphics
        if g.picture.use_window_resolution.is_active():
            g.picture.use_window_resolution = False
        g.picture.x_resolution = 1600
        g.picture.y_resolution = 1000
        g.views.auto_scale()
        g.picture.save_picture(file_name=png)
        log(f"溫度雲圖已存：{png}")
        return png if os.path.exists(png) else None
    except Exception as exc:  # noqa: BLE001
        log(f"（雲圖輸出略過：{exc}）")
        return None


# ──────────────────────────────────────────────────────────────────────────
# 對外主入口
# ──────────────────────────────────────────────────────────────────────────
def solve(params: dict, log: Optional[Logger] = None) -> dict:
    """端對端求解：幾何 → Prime 網格 → Fluent 求解 → 後處理。params 對應前端 Mixing Tee 參數。"""
    log = log or _default_log
    out_dir = params.get("output_dir") or os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "projects", "fluent"
    )
    out_dir = os.path.abspath(out_dir)
    log(f"輸出資料夾：{out_dir}")

    stl_path, zone_names = build_geometry(params, out_dir, log)
    case_path = mesh_with_prime(stl_path, zone_names, out_dir, log)
    result = solve_case(case_path, params, out_dir, log)
    result["geometry_path"] = stl_path
    return result


def _cli() -> None:
    import argparse

    p = argparse.ArgumentParser(description="Fluent 混合三通參數化求解")
    p.add_argument("--radius", type=float, default=20.0, help="管半徑 mm")
    p.add_argument("--arm", type=float, default=120.0, help="各管臂長度 mm")
    p.add_argument("--cold-vel", type=float, default=3.0, help="冷側流速 m/s")
    p.add_argument("--cold-temp", type=float, default=25.0, help="冷側溫度 °C")
    p.add_argument("--hot-vel", type=float, default=5.0, help="熱側流速 m/s")
    p.add_argument("--hot-temp", type=float, default=55.0, help="熱側溫度 °C")
    p.add_argument("--iters", type=int, default=200, help="疊代步數")
    p.add_argument("--out", type=str, default="", help="輸出資料夾（留空用預設）")
    p.add_argument("--json-out", type=str, default="", help="輸出 JSON 檔案")
    a = p.parse_args()

    params = {
        "radius_mm": a.radius,
        "arm_length_mm": a.arm,
        "cold_velocity_ms": a.cold_vel,
        "cold_temp_c": a.cold_temp,
        "hot_velocity_ms": a.hot_vel,
        "hot_temp_c": a.hot_temp,
        "iterations": a.iters,
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
