# -*- coding: utf-8 -*-
"""
共用資料模型：3D 預覽用的 Scene/Prim、HFSS 偶極天線的參數與求解結果。
"""
from __future__ import annotations

from typing import List, Literal, Optional, Tuple, Union

from pydantic import BaseModel, Field

Vec3 = Tuple[float, float, float]


class Bounds(BaseModel):
    min: Vec3
    max: Vec3


class PrimTube(BaseModel):
    kind: Literal["tube"] = "tube"
    path: List[Vec3]
    radius: float
    color: int
    opacity: Optional[float] = None


class PrimAirbox(BaseModel):
    kind: Literal["airbox"] = "airbox"
    min: Vec3
    max: Vec3


Prim = Union[PrimTube, PrimAirbox]


class Scene(BaseModel):
    prims: List[Prim]
    bounds: Bounds
    fitBounds: Bounds


class DipoleParams(BaseModel):
    """半波長偶極天線參數（HFSS Getting Started：M01 Dipole workshop 的精簡版）。"""

    frequency_ghz: float = Field(2.4, gt=0, le=100, description="中心（目標）頻率，單位 GHz")
    wire_radius_mm: float = Field(0.5, gt=0, le=20, description="導線半徑，單位 mm")
    gap_mm: float = Field(1.0, gt=0, le=50, description="中央饋入間隙，單位 mm")
    total_length_mm: Optional[float] = Field(
        None, gt=0, le=2000, description="天線總長度，單位 mm；留空則依中心頻率自動估算"
    )
    freq_span_pct: float = Field(
        40.0, gt=0, le=200, description="頻率掃描範圍，以中心頻率的百分比表示"
    )
    output_dir: Optional[str] = Field(
        None, description="模擬專案（.aedt）輸出資料夾；留空則存到後端預設 projects 目錄"
    )


class RunResult(BaseModel):
    freq_ghz: List[float]
    s11_db: List[float]
    resonant_freq_ghz: Optional[float] = None
    bandwidth_ghz: Optional[float] = None
    bandwidth_pct: Optional[float] = None
    project_path: Optional[str] = None
    theta_deg: List[float] = []
    gain_db: List[float] = []


class CfdMixingResult(BaseModel):
    """Fluent 混合三通求解結果（對應 backend/scripts/fluent_mixing_tee.py）。"""

    outlet_temp_c: Optional[float] = None
    outlet_velocity_ms: Optional[float] = None
    iterations: Optional[int] = None
    converged: Optional[bool] = None
    geometry_path: Optional[str] = None
    case_path: Optional[str] = None
    contour_path: Optional[str] = None


class MechStaticResult(BaseModel):
    """Mechanical 懸臂樑靜態結構求解結果（對應 backend/scripts/mechanical_cantilever.py）。"""

    von_mises_max_mpa: Optional[float] = None
    deformation_max_mm: Optional[float] = None
    deformation_steel_mm: Optional[float] = None
    safety_factor: Optional[float] = None
    material: Optional[str] = None
    geometry_path: Optional[str] = None
    mechdat_path: Optional[str] = None
    image_path: Optional[str] = None
