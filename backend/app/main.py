# -*- coding: utf-8 -*-
"""
此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

ANSYS Getting-Started Hub 後端入口：FastAPI + WebSocket。
開發期前端（Vite）與後端不同源，這裡放寬 CORS 供本機開發使用。
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import fs, geometry, run

app = FastAPI(title="ANSYS Getting-Started Hub")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(geometry.router)
app.include_router(run.router)
app.include_router(fs.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


_DIST_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "frontend", "dist")
if os.path.isdir(_DIST_DIR):
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=_DIST_DIR, html=True), name="frontend")
