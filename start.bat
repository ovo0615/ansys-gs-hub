@echo off
REM ============================================================================
REM  ANSYS Getting-Started Hub 一鍵啟動（Windows）
REM  此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。
REM
REM  用法：直接用滑鼠連按兩下本檔案即可。
REM  本檔案必須是「UTF-8 無 BOM」，否則第一行的 @echo off 會失效。
REM ============================================================================

chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*

echo.
pause
