# -*- coding: utf-8 -*-
"""此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..domains import get_domain
from ..models import Scene

router = APIRouter(prefix="/api", tags=["geometry"])


@router.post("/{domain}/geometry", response_model=Scene)
def compute_geometry(domain: str, params: dict) -> Scene:
    try:
        adapter = get_domain(domain)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        return adapter.geometry(params)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
