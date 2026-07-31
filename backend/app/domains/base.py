# -*- coding: utf-8 -*-
"""
此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

各領域（HFSS／Mechanical／Fluent）共用的 adapter 介面。
"""
from __future__ import annotations

from typing import Callable, Protocol

from ..models import RunResult, Scene


class DomainNotAvailableError(RuntimeError):
    """該領域尚未啟用（例如本機尚未安裝／授權對應的 ANSYS 軟體）。"""


class DomainAdapter(Protocol):
    def geometry(self, params: dict) -> Scene:
        """純幾何計算，供前端即時 3D 預覽使用，不連接求解器。"""
        ...

    def run(self, params: dict, log_cb: Callable[[str], None]) -> RunResult:
        """實際呼叫求解器完成模擬，並透過 log_cb 逐行回報進度。"""
        ...
