# -*- coding: utf-8 -*-
"""
長時間求解任務（HFSS 建模＋求解常需數十秒到數分鐘）用 WebSocket 串流日誌，
背景 thread 執行 domain.run()，主協程輪詢 queue 逐行送給前端。
"""
from __future__ import annotations

import asyncio
import queue
import threading

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..domains import get_domain
from ..domains.base import DomainNotAvailableError

router = APIRouter()


@router.websocket("/ws/{domain}/run")
async def ws_run(websocket: WebSocket, domain: str):
    await websocket.accept()
    try:
        adapter = get_domain(domain)
    except KeyError:
        await websocket.send_json({"type": "error", "message": f"未知的領域：{domain}"})
        await websocket.close()
        return

    try:
        req = await websocket.receive_json()
    except WebSocketDisconnect:
        return

    params = req.get("params", {})
    log_queue: "queue.Queue[str]" = queue.Queue()
    result_box: dict = {}

    def work():
        try:
            result = adapter.run(params, log_queue.put)
            result_box["result"] = result
        except DomainNotAvailableError as exc:
            result_box["error"] = str(exc)
        except Exception as exc:  # noqa: BLE001 - 需要把任何求解器例外回報給前端
            result_box["error"] = f"模擬失敗：{exc}"

    worker = threading.Thread(target=work, daemon=True)
    worker.start()

    try:
        while True:
            try:
                msg = log_queue.get_nowait()
            except queue.Empty:
                if not worker.is_alive() and log_queue.empty():
                    break
                await asyncio.sleep(0.08)
                continue
            await websocket.send_json({"type": "log", "message": msg})

        if "error" in result_box:
            await websocket.send_json({"type": "error", "message": result_box["error"]})
        elif "result" in result_box:
            await websocket.send_json({"type": "result", "result": result_box["result"].model_dump()})
        else:
            await websocket.send_json({"type": "error", "message": "模擬未回傳結果，請檢查後端日誌"})
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()
