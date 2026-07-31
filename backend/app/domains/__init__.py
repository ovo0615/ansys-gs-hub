# -*- coding: utf-8 -*-
"""此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。"""
from __future__ import annotations

from . import fluent_stub, hfss_dipole, mechanical_stub

REGISTRY = {
    "hfss": hfss_dipole,
    "mechanical": mechanical_stub,
    "fluent": fluent_stub,
}


def get_domain(name: str):
    domain = REGISTRY.get(name)
    if domain is None:
        raise KeyError(f"未知的領域：{name}")
    return domain
