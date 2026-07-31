# =============================================================================
# ANSYS Getting-Started Hub 一鍵啟動腳本（Windows 發布版）
#
# 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。
#
# 本腳本會依序完成：
#   1. 檢查 production 前端（frontend\dist）與套件鎖定檔是否齊全
#   2. 尋找相容的 64 位元 Python（必要時以 WinGet 使用者層級安裝，不會動到既有版本）
#   3. 在 backend\.venv 建立獨立虛擬環境，並依 requirements.lock.txt 安裝套件
#   4. 以前景程序啟動 uvicorn，服務就緒後才開啟瀏覽器
#
# 參數：
#   -CheckOnly   只做環境檢查，不啟動服務（封裝測試用，不會佔用連接埠）
# =============================================================================

[CmdletBinding()]
param(
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

# --- 主控台編碼：固定 UTF-8，避免繁體中文 Windows 的 CP950 讀錯訊息 --------------
$utf8 = New-Object System.Text.UTF8Encoding($false)
try { [Console]::InputEncoding = $utf8 } catch { }
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

$root     = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend  = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$venv     = Join-Path $backend ".venv"
$py       = Join-Path $venv "Scripts\python.exe"
$lockFile = Join-Path $backend "requirements.lock.txt"
$distIndex = Join-Path $frontend "dist\index.html"

$BACKEND_PORT = 8017
$APP_URL      = "http://127.0.0.1:$BACKEND_PORT"

# 支援的 64 位元 Python 版本（新到舊）。本專案完整實測版本為 Python 3.10.11。
$SUPPORTED_VERSIONS = @("3.12", "3.11", "3.10")
# 機器上完全沒有相容版本時，改以 WinGet 安裝這一版（使用者層級，不影響既有 Python）。
$WINGET_PYTHON_ID = "Python.Python.3.12"

function Write-Step  ([string]$m) { Write-Host $m -ForegroundColor Yellow }
function Write-Ok    ([string]$m) { Write-Host $m -ForegroundColor Green }
function Write-Bad   ([string]$m) { Write-Host $m -ForegroundColor Red }

Write-Host ""
Write-Host "==== ANSYS Getting-Started Hub ====" -ForegroundColor Cyan
Write-Host "此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。" -ForegroundColor DarkGray
Write-Host ""

# --- [1/5] 檢查發布內容是否完整 ------------------------------------------------
Write-Step "[1/5] 檢查發布內容..."

if (-not (Test-Path $lockFile)) {
    Write-Bad "找不到套件鎖定檔：$lockFile"
    Write-Bad "請確認已完整解壓縮整個資料夾，不要只取出單一檔案。"
    Read-Host "按 Enter 結束"
    exit 1
}
if (-not (Test-Path $distIndex)) {
    Write-Bad "找不到已建置的前端：$distIndex"
    Write-Bad "請改由 GitHub 的 Source ZIP 或 Release ZIP 下載完整內容，不要只複製原始碼資料夾。"
    Read-Host "按 Enter 結束"
    exit 1
}
Write-Ok "      前端 dist 與套件鎖定檔齊全。"

# --- Python 探測 ---------------------------------------------------------------
# 重要：py.exe 找不到指定版本時會把訊息寫到 stderr；在 $ErrorActionPreference = "Stop"
# 之下，Windows PowerShell 5.1 會先把該行 stderr 包成終止例外，之後才套用 2>$null 重導向，
# 所以「2>$null」根本攔不住例外。以下每一個原生指令呼叫都必須包在 try/catch 內。
function Get-PythonInfo {
    param(
        [Parameter(Mandatory = $true)][string]$Exe,
        [string[]]$Prefix = @()
    )
    $probe = "import sys,struct;print('{0}.{1} {2}'.format(sys.version_info[0], sys.version_info[1], struct.calcsize('P')*8))"
    try {
        $global:LASTEXITCODE = 0
        $out = & $Exe @Prefix -c $probe 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $out) { return $null }
        $parts = ("$out".Trim() -split "\s+")
        if ($parts.Count -lt 2) { return $null }
        return [pscustomobject]@{
            Exe     = $Exe
            Prefix  = $Prefix
            Version = $parts[0]
            Bits    = [int]$parts[1]
        }
    } catch {
        return $null
    }
}

function Find-CompatiblePython {
    # 1) Python Launcher 版本選擇器
    foreach ($ver in $SUPPORTED_VERSIONS) {
        $info = Get-PythonInfo -Exe "py" -Prefix @("-$ver-64")
        if ($null -ne $info -and $info.Bits -eq 64 -and $SUPPORTED_VERSIONS -contains $info.Version) {
            return $info
        }
    }

    # 2) 具名 Python 命令
    foreach ($name in @("python3.12", "python3.11", "python3.10", "python")) {
        $resolved = $null
        try { $resolved = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue } catch { }
        if ($null -eq $resolved) { continue }
        $exePath = $resolved | Select-Object -First 1 -ExpandProperty Source
        $info = Get-PythonInfo -Exe $exePath
        if ($null -ne $info -and $info.Bits -eq 64 -and $SUPPORTED_VERSIONS -contains $info.Version) {
            return $info
        }
    }

    # 3) 已知的使用者安裝路徑
    foreach ($ver in $SUPPORTED_VERSIONS) {
        $tag = $ver.Replace(".", "")
        $candidates = @(
            (Join-Path $env:LOCALAPPDATA "Programs\Python\Python$tag\python.exe"),
            (Join-Path $env:ProgramFiles "Python$tag\python.exe")
        )
        foreach ($candidate in $candidates) {
            if (-not (Test-Path $candidate)) { continue }
            $info = Get-PythonInfo -Exe $candidate
            if ($null -ne $info -and $info.Bits -eq 64 -and $SUPPORTED_VERSIONS -contains $info.Version) {
                return $info
            }
        }
    }

    return $null
}

function Install-PythonWithWinGet {
    $winget = $null
    try { $winget = Get-Command winget -CommandType Application -ErrorAction SilentlyContinue } catch { }
    if ($null -eq $winget) {
        Write-Bad "本機找不到 WinGet，無法自動安裝 Python。"
        Write-Bad "請手動安裝 64 位元 Python（3.10 / 3.11 / 3.12 皆可）："
        Write-Bad "    https://www.python.org/downloads/windows/"
        Write-Bad "安裝時請勾選『Add python.exe to PATH』，完成後重新執行 start.bat。"
        return $false
    }

    Write-Step "      使用 WinGet 以「使用者層級」安裝 $WINGET_PYTHON_ID（不會移除或降級既有 Python）..."
    try {
        & winget install `
            --id $WINGET_PYTHON_ID `
            --exact `
            --source winget `
            --scope user `
            --architecture x64 `
            --silent `
            --accept-package-agreements `
            --accept-source-agreements `
            --disable-interactivity
    } catch {
        Write-Bad "      WinGet 安裝過程發生錯誤：$($_.Exception.Message)"
        return $false
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Bad "      WinGet 安裝失敗（結束代碼 $LASTEXITCODE）。"
        Write-Bad "      若貴公司政策封鎖 WinGet，請洽 IT 或改用官方安裝程式："
        Write-Bad "          https://www.python.org/downloads/windows/"
        return $false
    }
    return $true
}

# --- [2/5] 尋找相容 Python -----------------------------------------------------
Write-Step "[2/5] 尋找相容的 64 位元 Python（支援 $($SUPPORTED_VERSIONS -join " / ")）..."

$pythonInfo = $null
if (-not (Test-Path $py)) {
    $pythonInfo = Find-CompatiblePython

    if ($null -eq $pythonInfo) {
        Write-Bad "      找不到相容的 64 位元 Python。"
        if (-not (Install-PythonWithWinGet)) {
            Read-Host "按 Enter 結束"
            exit 1
        }
        # 安裝後重新偵測：不能假設目前程序的 PATH 已經更新。
        $pythonInfo = Find-CompatiblePython
        if ($null -eq $pythonInfo) {
            Write-Bad "      安裝完成但仍偵測不到 Python，請關閉本視窗後重新執行 start.bat。"
            Read-Host "按 Enter 結束"
            exit 1
        }
    }

    Write-Ok "      使用 Python $($pythonInfo.Version)（$($pythonInfo.Bits) 位元）：$($pythonInfo.Exe) $($pythonInfo.Prefix -join ' ')"
} else {
    Write-Ok "      已存在虛擬環境，沿用 backend\.venv。"
}

# --- 連接埠檢查 ----------------------------------------------------------------
function Get-PortOwner {
    param([Parameter(Mandatory = $true)][int]$Port)
    $lines = cmd /c "netstat -ano -p tcp"
    foreach ($line in $lines) {
        if ($line -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
            $ownerId = [int]$Matches[1]
            $ownerName = "(未知程序)"
            try {
                $proc = Get-Process -Id $ownerId -ErrorAction Stop
                $ownerName = $proc.ProcessName
            } catch { }
            return [pscustomobject]@{ ProcessId = $ownerId; Name = $ownerName }
        }
    }
    return $null
}

$owner = Get-PortOwner -Port $BACKEND_PORT
if ($null -ne $owner) {
    Write-Bad ""
    Write-Bad "【警告】連接埠 $BACKEND_PORT 已被佔用："
    Write-Bad "        程序名稱：$($owner.Name)"
    Write-Bad "        程序 PID：$($owner.ProcessId)"
    Write-Bad "        本腳本不會自動結束未知程序，請自行確認後關閉，再重新執行 start.bat。"
    Read-Host "按 Enter 結束"
    exit 1
}

# -CheckOnly 供封裝測試使用：在「不建立虛擬環境、不下載套件、不啟動服務、不佔用連接埠」的
# 前提下，驗證發布內容完整、Python 可用、連接埠可用。刻意放在安裝步驟之前，讓封裝測試能快速完成。
if ($CheckOnly) {
    Write-Host ""
    Write-Ok "-CheckOnly：環境檢查全部通過。"
    Write-Ok "  * 發布內容完整（frontend\dist 與 requirements.lock.txt 皆存在）"
    if ($null -ne $pythonInfo) {
        Write-Ok "  * 相容 Python：$($pythonInfo.Version)（$($pythonInfo.Bits) 位元）"
    } else {
        Write-Ok "  * 已存在 backend\.venv，沿用既有虛擬環境"
    }
    Write-Ok "  * 連接埠 $BACKEND_PORT 目前未被佔用"
    Write-Ok "  未建立虛擬環境、未安裝套件、未啟動服務、未佔用任何連接埠。"
    exit 0
}

# --- [3/5] 建立虛擬環境 --------------------------------------------------------
Write-Step "[3/5] 準備獨立虛擬環境 backend\.venv..."

if (-not (Test-Path $py)) {
    Write-Step "      建立中（第一次執行需要數十秒）..."
    & $pythonInfo.Exe @($pythonInfo.Prefix) -m venv $venv
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $py)) {
        Write-Bad "      建立虛擬環境失敗。"
        Read-Host "按 Enter 結束"
        exit 1
    }
    Write-Ok "      虛擬環境建立完成。"
} else {
    Write-Ok "      虛擬環境已存在。"
}

# --- [4/5] 安裝套件 ------------------------------------------------------------
Write-Step "[4/5] 依 requirements.lock.txt 安裝後端套件（第一次執行需要網路，可能數分鐘）..."

& $py -m pip install --upgrade pip --quiet --disable-pip-version-check
& $py -m pip install --require-virtualenv -r $lockFile --disable-pip-version-check
if ($LASTEXITCODE -ne 0) {
    Write-Bad "      套件安裝失敗，請確認網路連線或公司 Proxy 設定後重試。"
    Read-Host "按 Enter 結束"
    exit 1
}
Write-Ok "      套件安裝完成（全部安裝在 backend\.venv，不影響系統 Python）。"

# --- [5/5] 啟動服務 ------------------------------------------------------------
Write-Step "[5/5] 啟動服務：$APP_URL"
Write-Host ""
Write-Host "      所有計算都在本機執行，資料不會上傳。" -ForegroundColor DarkGray
Write-Host "      要結束服務：在本視窗按 Ctrl+C，或直接關閉本視窗。" -ForegroundColor DarkGray
Write-Host ""

# ---------------------------------------------------------------------------
# 為什麼不用 Start-Job 開瀏覽器（實際事故，勿改回去）
#
# 舊版是用 Start-Job 開一個背景工作輪詢連接埠、就緒後呼叫 Start-Process 開瀏覽器。
# Start-Job 會另外啟動一個 PowerShell 子程序並在其中執行序列化的 script block，
# 這正是防毒軟體的行為偵測特徵。實測在裝有 WithSecure Client Security 的機器上，
# 該子程序被判定為 Trojan:AMSI/SuspiciousExecute.A 直接攔截，瀏覽器完全沒開，
# 而且因為當時 catch 區塊是空的，使用者連一個錯誤訊息都看不到。
#
# 現在改成：uvicorn 以「子程序」執行（啟動的是 python.exe，不是 PowerShell），
# 主程序自己輪詢 /api/health、就緒後在完整互動 session 裡直接開瀏覽器。
# 全程不產生任何 PowerShell 子程序，也不使用 -EncodedCommand 或隱藏視窗。
# 開啟失敗時一律把網址明顯印出來，絕不再無聲失敗。
# ---------------------------------------------------------------------------

Push-Location $backend
$server = $null
try {
    # -NoNewWindow：與本視窗共用主控台，uvicorn 日誌照樣顯示；
    # 按 Ctrl+C 或關閉視窗時，主控台會一併通知子程序結束，不會殘留佔用連接埠。
    $server = Start-Process -FilePath $py `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$BACKEND_PORT") `
        -NoNewWindow -PassThru

    # 等待服務真的能回應（不只是連接埠被綁定），最多約 60 秒
    $ready = $false
    for ($i = 0; $i -lt 120; $i++) {
        if ($server.HasExited) { break }
        Start-Sleep -Milliseconds 500
        try {
            $health = Invoke-WebRequest -Uri "$APP_URL/api/health" -UseBasicParsing -TimeoutSec 2
            if ($health.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
    }

    if ($ready) {
        $opened = $false
        try {
            Start-Process $APP_URL
            $opened = $true
        } catch { }

        Write-Host ""
        if ($opened) {
            Write-Ok "服務已就緒，已開啟瀏覽器：$APP_URL"
        } else {
            Write-Bad "服務已就緒，但無法自動開啟瀏覽器。"
            Write-Bad "請自行在瀏覽器輸入下列網址："
            Write-Host "    $APP_URL" -ForegroundColor Cyan
        }
    } elseif (-not $server.HasExited) {
        Write-Host ""
        Write-Bad "服務啟動逾時，仍未回應健康檢查。請自行在瀏覽器輸入下列網址確認："
        Write-Host "    $APP_URL" -ForegroundColor Cyan
    }
    Write-Host ""

    if (-not $server.HasExited) {
        Wait-Process -Id $server.Id
    }
} finally {
    Pop-Location

    # 收尾備援：正常情況下按 Ctrl+C 或關閉視窗時，主控台已經通知子程序結束了，
    # 這裡只是保險。用 taskkill /T 連同子孫程序一起收——某些虛擬環境（例如 uv 建立的）
    # 的 python.exe 只是轉發用的 trampoline，會再開一個真正的直譯器程序，
    # 只 Kill() 最上層會留下真正在監聽連接埠的孤兒程序。
    if ($null -ne $server) {
        try {
            if (-not $server.HasExited) {
                & taskkill /PID $server.Id /T /F | Out-Null
                Start-Sleep -Milliseconds 500
            }
        } catch { }
        try {
            if (-not $server.HasExited) { $server.Kill() }
        } catch { }
    }

    Write-Host ""
    $leftover = Get-NetTCPConnection -LocalPort $BACKEND_PORT -State Listen -ErrorAction SilentlyContinue
    if ($leftover) {
        Write-Bad "服務已結束，但連接埠 $BACKEND_PORT 仍被佔用（PID $($leftover[0].OwningProcess)）。"
        Write-Bad "下次啟動若顯示連接埠被佔用，請先結束該程序。"
    } else {
        Write-Ok "服務已結束，連接埠 $BACKEND_PORT 已釋放。"
    }
}
