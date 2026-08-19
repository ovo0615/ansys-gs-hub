# -*- coding: utf-8 -*-
"""
檔案系統輔助 API：讓前端能為模擬結果選擇／驗證輸出資料夾。
因本工具為「本機」使用（前後端同一台電腦），故：
  - /api/fs/pick-dir  以原生資料夾對話框（tkinter）讓使用者用滑鼠挑選；
  - /api/fs/validate-dir  驗證使用者手動輸入的路徑是否存在、可寫入，並可代為建立；
  - /api/fs/default-dir  回傳後端預設 projects 目錄，供前端預先填入。
瀏覽器基於資安無法取得使用者選擇資料夾的真實絕對路徑，故改由後端提供上述能力。
"""
from __future__ import annotations

import os

from fastapi import APIRouter
from pydantic import BaseModel

from ..domains.hfss_dipole import PROJECTS_DIR

router = APIRouter(prefix="/api/fs", tags=["fs"])


class DirPath(BaseModel):
    path: str = ""


def _pick_directory_native(initial: str | None = None) -> str | None:
    """在後端主機彈出原生資料夾選擇對話框，回傳所選路徑；取消或無 GUI 時回傳 None。"""
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        chosen = filedialog.askdirectory(
            title="選擇模擬檔案輸出資料夾",
            initialdir=initial if initial and os.path.isdir(initial) else None,
        )
    finally:
        root.destroy()
    return chosen or None


@router.get("/default-dir")
def default_dir() -> dict:
    return {"path": PROJECTS_DIR}


@router.post("/pick-dir")
def pick_dir(body: DirPath) -> dict:
    """開啟原生資料夾對話框讓使用者挑選。回傳 {path, available}。"""
    try:
        chosen = _pick_directory_native(body.path or None)
        return {"path": chosen, "available": True}
    except Exception as exc:  # noqa: BLE001 - 無 GUI／tkinter 不可用時，讓前端改用手動輸入
        return {"path": None, "available": False, "message": f"無法開啟資料夾對話框：{exc}"}


@router.post("/validate-dir")
def validate_dir(body: DirPath) -> dict:
    """驗證路徑：是否存在、是否可寫入；不存在時嘗試建立。"""
    path = (body.path or "").strip()
    if not path:
        return {"ok": False, "message": "尚未輸入路徑"}

    path = os.path.abspath(path)
    created = False
    if not os.path.exists(path):
        try:
            os.makedirs(path, exist_ok=True)
            created = True
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "path": path, "message": f"無法建立資料夾：{exc}"}

    if not os.path.isdir(path):
        return {"ok": False, "path": path, "message": "此路徑不是資料夾"}

    if not os.access(path, os.W_OK):
        return {"ok": False, "path": path, "message": "資料夾無法寫入（權限不足）"}

    msg = "已建立並可寫入" if created else "資料夾存在且可寫入"
    return {"ok": True, "path": path, "created": created, "message": msg}


@router.get("/img")
def get_image(path: str):
    """回傳絕對路徑的圖片（供前端顯示）。"""
    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    if not os.path.exists(path) or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="圖片不存在")
    return FileResponse(path)
