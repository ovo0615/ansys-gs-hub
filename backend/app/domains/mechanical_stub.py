# -*- coding: utf-8 -*-
"""
此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

Mechanical 領域 adapter：
- geometry()：前端「懸臂樑」預覽由前端 geometry.ts 自行計算，這裡僅回傳示意佔位幾何。
- run()：委派給 backend/scripts/mechanical_cantilever.py 的 solve()，用 PyMechanical +
  PyAnsys Geometry 端對端求解靜態結構。求解需本機安裝並授權 ANSYS Mechanical，且已安裝
  ansys-mechanical-core 與 ansys-geometry-core；未安裝時回報 DomainNotAvailableError。
"""
from __future__ import annotations

from typing import Callable

from ..models import Bounds, MechStaticResult, PrimAirbox, RunResult, Scene
from .base import DomainNotAvailableError

NOT_AVAILABLE_MESSAGE = (
    "Mechanical 求解尚未就緒：需本機安裝並授權 ANSYS Mechanical，"
    "並安裝 Python 套件 ansys-mechanical-core 與 ansys-geometry-core"
    "（pip install ansys-mechanical-core ansys-geometry-core）。"
    "求解腳本已備妥於 backend/scripts/mechanical_cantilever.py，安裝後即可執行。"
)

# 前端懸臂樑參數（camelCase）→ 求解腳本參數（snake_case）對照。
_PARAM_MAP = {
    "length_mm": ("length_mm", "lengthMm"),
    "width_mm": ("width_mm", "widthMm"),
    "height_mm": ("height_mm", "heightMm"),
    "material": ("material",),
    "force_n": ("force_n", "forceN"),
    "output_dir": ("output_dir", "outputDir"),
}

_DEFAULTS = {
    "length_mm": 200.0,
    "width_mm": 30.0,
    "height_mm": 20.0,
    "material": "steel",
    "force_n": 500.0,
}


def geometry(params: dict) -> Scene:
    box = PrimAirbox(kind="airbox", min=(-10, -10, -10), max=(10, 10, 10))
    return Scene(
        prims=[box],
        bounds=Bounds(min=box.min, max=box.max),
        fitBounds=Bounds(min=box.min, max=box.max),
    )


def _normalize(params: dict) -> dict:
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
    import os
    import sys
    import json
    import subprocess
    import tempfile

    norm = _normalize(params)
    script_path = os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "mechanical_cantilever.py")
    script_path = os.path.abspath(script_path)

    if not os.path.exists(script_path):
        raise DomainNotAvailableError(f"找不到腳本：{script_path}")

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        json_out = tf.name

    cmd = [
        sys.executable, "-u", script_path,
        "--length", str(norm.get("length_mm", 200)),
        "--width", str(norm.get("width_mm", 30)),
        "--height", str(norm.get("height_mm", 20)),
        "--material", str(norm.get("material", "steel")),
        "--force", str(norm.get("force_n", 500)),
        "--json-out", json_out
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
            raise RuntimeError(f"Mechanical 求解失敗，請檢查日誌 (exit code: {proc.returncode})")

        if os.path.exists(json_out) and os.path.getsize(json_out) > 0:
            with open(json_out, "r", encoding="utf-8") as f:
                result_data = json.load(f)
            return MechStaticResult(**result_data)
        else:
            raise RuntimeError("Mechanical 求解完成，但未產生 JSON 結果檔。")

    finally:
        if os.path.exists(json_out):
            try:
                os.remove(json_out)
            except Exception:
                pass
