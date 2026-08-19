# -*- coding: utf-8 -*-
"""
HFSS Getting Started（M01 Dipole workshop）的精簡版：
半波長偶極天線 —— 兩段圓柱形導線 + 中央饋入間隙，求 S11 掃頻。

geometry() 只做純幾何計算（給前端即時 3D 預覽用），不會連接 AEDT。
run() 才會真正呼叫 ansys.aedt.core（pip 套件名稱仍是 pyaedt）驅動本機已安裝
且已授權的 HFSS 完成建模／求解／取結果。

注意：新版 pyaedt（>=1.0）套件的匯入名稱是 `ansys.aedt.core`，
不是 `import pyaedt`；`pyaedt` 只是 PyPI 上的發行套件名稱。
"""
from __future__ import annotations

import datetime
import math
import os
from typing import Callable, List, Tuple

from ..models import Bounds, DipoleParams, PrimAirbox, PrimTube, RunResult, Scene

C_MM_PER_S = 299_792_458.0 * 1000.0  # 光速，單位 mm/s
WIRE_COLOR = 0xB87333  # 銅色
AIRBOX_COLOR = 0x3080FF

PROJECTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "projects")


def resolve_output_dir(params: dict) -> str:
    """決定專案輸出資料夾：優先採用使用者指定的 output_dir，否則用後端預設 projects。"""
    raw = params.get("output_dir")
    if raw is not None and str(raw).strip():
        return os.path.abspath(str(raw).strip())
    return PROJECTS_DIR


def wavelength_mm(frequency_ghz: float) -> float:
    freq_hz = frequency_ghz * 1e9
    return C_MM_PER_S / freq_hz


def default_total_length_mm(frequency_ghz: float) -> float:
    """細線偶極天線的實務經驗值：略小於半波長（末端效應），約 0.48 * lambda。"""
    return 0.48 * wavelength_mm(frequency_ghz)


def dipole_dimensions(params: dict) -> dict:
    """算出偶極天線的關鍵尺寸，前端 geometry.ts 需採用相同公式。"""
    frequency_ghz = float(params["frequency_ghz"])
    wire_radius_mm = float(params["wire_radius_mm"])
    gap_mm = float(params["gap_mm"])
    total_length_mm = params.get("total_length_mm")
    if not total_length_mm:
        total_length_mm = default_total_length_mm(frequency_ghz)
    else:
        total_length_mm = float(total_length_mm)

    arm_length_mm = (total_length_mm - gap_mm) / 2
    if arm_length_mm <= 0:
        raise ValueError("天線總長度必須大於饋入間隙，請縮小間隙或增加天線長度")

    lam = wavelength_mm(frequency_ghz)
    return {
        "frequency_ghz": frequency_ghz,
        "wire_radius_mm": wire_radius_mm,
        "gap_mm": gap_mm,
        "total_length_mm": total_length_mm,
        "arm_length_mm": arm_length_mm,
        "wavelength_mm": lam,
    }


def geometry(params: dict) -> Scene:
    dims = dipole_dimensions(params)
    r = dims["wire_radius_mm"]
    gap = dims["gap_mm"]
    arm = dims["arm_length_mm"]
    lam = dims["wavelength_mm"]

    top_path: List[Tuple[float, float, float]] = [
        (0.0, 0.0, gap / 2),
        (0.0, 0.0, gap / 2 + arm),
    ]
    bottom_path: List[Tuple[float, float, float]] = [
        (0.0, 0.0, -gap / 2),
        (0.0, 0.0, -gap / 2 - arm),
    ]

    prims = [
        PrimTube(kind="tube", path=top_path, radius=r, color=WIRE_COLOR),
        PrimTube(kind="tube", path=bottom_path, radius=r, color=WIRE_COLOR),
    ]

    pad = lam / 4
    total_half = gap / 2 + arm
    airbox = PrimAirbox(
        kind="airbox",
        min=(-(r + pad), -(r + pad), -(total_half + pad)),
        max=(r + pad, r + pad, total_half + pad),
    )
    prims.append(airbox)

    fit_pad = r * 2
    fit_bounds = Bounds(
        min=(-(r + fit_pad), -(r + fit_pad), -(total_half)),
        max=(r + fit_pad, r + fit_pad, total_half),
    )
    full_bounds = Bounds(min=airbox.min, max=airbox.max)

    return Scene(prims=prims, bounds=full_bounds, fitBounds=fit_bounds)


def _resonance_and_bandwidth(freqs: List[float], s11_db: List[float]):
    if not freqs:
        return None, None, None
    min_idx = min(range(len(s11_db)), key=lambda i: s11_db[i])
    f0 = freqs[min_idx]

    below = [i for i, v in enumerate(s11_db) if v <= -10.0]
    if not below:
        return f0, None, None
    f_lo = freqs[min(below)]
    f_hi = freqs[max(below)]
    bw = f_hi - f_lo
    bw_pct = (bw / f0 * 100.0) if f0 else None
    return f0, bw, bw_pct


def run(params: dict, log_cb: Callable[[str], None]) -> RunResult:
    dims = dipole_dimensions(params)
    freq_span_pct = float(params.get("freq_span_pct", 40.0))
    freq0 = dims["frequency_ghz"]
    f_lo = max(freq0 * (1 - freq_span_pct / 200.0), freq0 * 0.05)
    f_hi = freq0 * (1 + freq_span_pct / 200.0)

    # 電性長度檢查：提醒使用者「天線長度 vs. 頻率」是否共振（與饋入埠無關）。
    resonant_len = default_total_length_mm(freq0)
    elec_lambda = dims["total_length_mm"] / dims["wavelength_mm"]
    ratio = dims["total_length_mm"] / resonant_len
    if ratio < 0.85 or ratio > 1.15:
        natural_f = 0.48 * C_MM_PER_S / dims["total_length_mm"] / 1e9
        log_cb(
            f"⚠ 注意：總長度 {dims['total_length_mm']:.1f} mm 在 {freq0} GHz 下僅約 "
            f"{elec_lambda:.2f} λ（共振長度約 {resonant_len:.1f} mm），屬電性"
            f"{'短' if ratio < 1 else '長'}天線，S11 會嚴重失配／接近全反射；"
            f"此長度約在 {natural_f:.2f} GHz 才共振。若要在 {freq0} GHz 共振，"
            f"請將總長度設為約 {resonant_len:.1f} mm 或留空自動估算。"
        )

    log_cb("匯入 ansys.aedt.core（pyaedt）...")
    try:
        import pythoncom

        pythoncom.CoInitialize()
    except Exception:
        pass

    from ansys.aedt.core import Hfss

    projects_dir = resolve_output_dir(params)
    os.makedirs(projects_dir, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    project_path = os.path.join(projects_dir, f"dipole_{stamp}.aedt")
    log_cb(f"專案將輸出至：{project_path}")

    log_cb("啟動／連接本機 AEDT（若已開啟會直接沿用）...")
    hfss = Hfss(
        project=project_path,
        design="Dipole",
        solution_type="Modal",
        version=None,
        non_graphical=False,
        new_desktop=False,
        close_on_exit=False,
    )

    try:
        log_cb(f"已連接 AEDT，版本 {hfss.aedt_version_id}")
        hfss.modeler.model_units = "mm"

        log_cb("建立偶極天線幾何（兩段圓柱導線）...")
        arm_top = hfss.modeler.create_cylinder(
            orientation="Z",
            origin=[0, 0, dims["gap_mm"] / 2],
            radius=dims["wire_radius_mm"],
            height=dims["arm_length_mm"],
            name="dipole_arm_top",
            material="copper",
        )
        arm_bottom = hfss.modeler.create_cylinder(
            orientation="Z",
            origin=[0, 0, -dims["gap_mm"] / 2],
            radius=dims["wire_radius_mm"],
            height=-dims["arm_length_mm"],
            name="dipole_arm_bottom",
            material="copper",
        )

        log_cb("建立饋入埠（lumped port，跨中央間隙）...")
        # 不採用「兩物件最近邊」的自動貼片（對兩個同軸圓柱端面會生成彎曲的管狀面，
        # 導致 HFSS 回報 port 網格 non-planar）。改為在間隙中央自行建立一個平面矩形
        # 貼片（位於 XZ 平面、寬度等於導線直徑、高度等於間隙），並沿 Z 方向設定
        # 積分線，這是薄導線偶極天線常見的簡化饋入埠做法。
        r = dims["wire_radius_mm"]
        gap = dims["gap_mm"]
        port_sheet = hfss.modeler.create_rectangle(
            orientation="XZ",
            origin=[-r, 0, -gap / 2],
            sizes=[2 * r, gap],
            name="feed_sheet",
        )
        hfss.lumped_port(
            assignment=port_sheet,
            create_port_sheet=False,
            integration_line=hfss.axis_directions.ZPos,
            impedance=50,
            name="Feed",
        )

        log_cb("建立輻射邊界（open region）...")
        hfss.create_open_region(frequency=f"{freq0}GHz")

        log_cb("建立求解設定與頻率掃描...")
        setup = hfss.create_setup(
            name="Setup1",
            Frequency=f"{freq0}GHz",
            MaximumPasses=8,
            MaxDeltaS=0.02,
        )
        sweep = setup.create_frequency_sweep(
            unit="GHz",
            start_frequency=f_lo,
            stop_frequency=f_hi,
            name="Sweep1",
            sweep_type="Interpolating",
        )

        log_cb("開始求解，這可能需要數分鐘，請耐心等候...")
        setup.analyze()
        log_cb("求解完成，擷取 S11 資料...")

        sol = hfss.post.get_solution_data(
            expressions="S(1,1)",
            setup_sweep_name=f"{setup.name} : {sweep.name}",
        )
        freqs_arr, s11_arr = sol.get_expression_data(expression="S(1,1)", formula="db20")
        freqs = [float(v) for v in freqs_arr]
        s11_db = [float(v) for v in s11_arr]

        f0, bw, bw_pct = _resonance_and_bandwidth(freqs, s11_db)

        theta_deg: List[float] = []
        gain_db: List[float] = []
        try:
            log_cb("計算遠場輻射方向圖（Theta 0~180 度，Phi=0 切面）...")
            hfss.insert_infinite_sphere(
                theta_start=0,
                theta_stop=180,
                theta_step=2,
                phi_start=0,
                phi_stop=0,
                phi_step=1,
                name="Infinite Sphere1",
            )
            ff_data = hfss.post.get_solution_data(
                expressions="GainTotal",
                setup_sweep_name=f"{setup.name} : LastAdaptive",
                context="Infinite Sphere1",
                report_category="Far Fields",
                primary_sweep_variable="Theta",
            )
            real_part, _imag_part = ff_data.full_matrix_real_imag
            gain_rows = real_part["GainTotal"]
            theta_deg = [float(row[2]) for row in gain_rows]
            gain_db = [10.0 * math.log10(max(float(row[3]), 1e-12)) for row in gain_rows]
            log_cb(f"遠場方向圖計算完成，峰值增益約 {max(gain_db):.2f} dBi")
        except Exception as exc:  # noqa: BLE001
            log_cb(f"! 遠場輻射方向圖計算失敗（不影響 S11 結果）：{exc}")
            theta_deg = []
            gain_db = []

        log_cb("已完成，正在儲存專案...")
        hfss.save_project()

        return RunResult(
            freq_ghz=freqs,
            s11_db=s11_db,
            resonant_freq_ghz=f0,
            bandwidth_ghz=bw,
            bandwidth_pct=bw_pct,
            project_path=project_path,
            theta_deg=theta_deg,
            gain_db=gain_db,
        )
    finally:
        hfss.release_desktop(close_projects=False, close_desktop=False)
