# -*- coding: utf-8 -*-
"""
此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

Fluent 領域 adapter：
- geometry()：前端「混合三通」預覽由前端 geometry.ts 自行計算，這裡僅回傳示意佔位幾何。
- run()：以 subprocess 開子行程執行 backend/scripts/fluent_mixing_tee.py（比照
  mechanical_stub.py 的做法，避免 PyFluent/PyPrimeMesh 的 gRPC 連線與 uvicorn
  同進程互相干擾），逐行讀 stdout 當日誌回傳，完成後讀暫存 JSON 組成
  CfdMixingResult。求解需本機安裝並授權 ANSYS Fluent，且已安裝
  ansys-fluent-core、ansys-geometry-core[graphics]、ansys-meshing-prime；
  未安裝或腳本不存在時回報 DomainNotAvailableError。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from typing import Callable

from ..models import Bounds, CfdMixingResult, PrimAirbox, RunResult, Scene
from .base import DomainNotAvailableError

NOT_AVAILABLE_MESSAGE = (
    "Fluent 求解尚未就緒：需本機安裝並授權 ANSYS Fluent，"
    "並安裝 Python 套件 ansys-fluent-core、ansys-geometry-core[graphics]、ansys-meshing-prime"
    "（pip install ansys-fluent-core \"ansys-geometry-core[graphics]\" ansys-meshing-prime）。"
    "求解腳本已備妥於 backend/scripts/fluent_mixing_tee.py，安裝後即可執行。"
)

# 前端 Mixing Tee 參數（camelCase）→ 求解腳本參數（snake_case）對照。
_PARAM_MAP = {
    "radius_mm": ("radius_mm", "radiusMm"),
    "arm_length_mm": ("arm_length_mm", "armLengthMm"),
    "cold_velocity_ms": ("cold_velocity_ms", "coldVelocityMs"),
    "cold_temp_c": ("cold_temp_c", "coldTempC"),
    "hot_velocity_ms": ("hot_velocity_ms", "hotVelocityMs"),
    "hot_temp_c": ("hot_temp_c", "hotTempC"),
    "output_dir": ("output_dir", "outputDir"),
    "iterations": ("iterations",),
}

_DEFAULTS = {
    "radius_mm": 20.0,
    "arm_length_mm": 120.0,
    "cold_velocity_ms": 3.0,
    "cold_temp_c": 25.0,
    "hot_velocity_ms": 5.0,
    "hot_temp_c": 55.0,
    "iterations": 200,
}


def geometry(params: dict) -> Scene:
    box = PrimAirbox(kind="airbox", min=(-10, -10, -10), max=(10, 10, 10))
    return Scene(
        prims=[box],
        bounds=Bounds(min=box.min, max=box.max),
        fitBounds=Bounds(min=box.min, max=box.max),
    )


def _normalize(params: dict) -> dict:
    """把前端傳來的參數（camelCase 或 snake_case）整理成求解腳本要的 snake_case。"""
    out: dict = {}
    for canonical, aliases in _PARAM_MAP.items():
        for a in aliases:
            if a in params and params[a] is not None:
                out[canonical] = params[a]
                break
        if canonical not in out and canonical in _DEFAULTS:
            out[canonical] = _DEFAULTS[canonical]
    return out


def run(params: dict, log_cb: Callable[[str], None]) -> RunResult:
    norm = _normalize(params)
    script_path = os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "fluent_mixing_tee.py")
    script_path = os.path.abspath(script_path)

    if not os.path.exists(script_path):
        raise DomainNotAvailableError(f"找不到腳本：{script_path}")

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        json_out = tf.name

    cmd = [
        sys.executable, "-u", script_path,
        "--radius", str(norm.get("radius_mm", 20.0)),
        "--arm", str(norm.get("arm_length_mm", 120.0)),
        "--cold-vel", str(norm.get("cold_velocity_ms", 3.0)),
        "--cold-temp", str(norm.get("cold_temp_c", 25.0)),
        "--hot-vel", str(norm.get("hot_velocity_ms", 5.0)),
        "--hot-temp", str(norm.get("hot_temp_c", 55.0)),
        "--iters", str(norm.get("iterations", 200)),
        "--json-out", json_out,
    ]
    if norm.get("output_dir"):
        cmd.extend(["--out", str(norm.get("output_dir"))])

    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"

    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", env=env
        )
        if proc.stdout:
            for line in proc.stdout:
                log_cb(line.rstrip("\r\n"))
        proc.wait()

        if proc.returncode != 0:
            raise RuntimeError(f"Fluent 求解失敗，請檢查日誌 (exit code: {proc.returncode})")

        if os.path.exists(json_out) and os.path.getsize(json_out) > 0:
            with open(json_out, "r", encoding="utf-8") as f:
                result_data = json.load(f)
            return CfdMixingResult(**result_data)
        else:
            raise RuntimeError("Fluent 求解完成，但未產生 JSON 結果檔。")

    finally:
        if os.path.exists(json_out):
            try:
                os.remove(json_out)
            except Exception:
                pass
