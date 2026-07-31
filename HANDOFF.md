# ANSYS Getting-Started Hub — 專案交接文件（HANDOFF）

> 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。
> 本文件給「接手的下一位 AI／工程師」，讀完這一份即可無縫接續。最後更新：2026-07。

---

## 0. 一句話目標

做一個 **Web 介面**，讓不同領域（HFSS / Mechanical / Fluent）的人都能在同一個工具裡完成
**基本模擬**（對齊各領域 ANSYS Getting-Started 課程教材），用來**證明「AI agent + skill」能完成簡單模擬**。
使用者本身是 **HFSS 背景**，不熟結構與流體，所以範例要「簡單、不容易出錯、但具代表性」。

---

## 1. 環境與啟動

> **⚠️ 開發模式 vs. 發布模式（讀這份文件前先看這段）**
>
> 這份文件記錄的是**開發過程**，當時的啟動方式是「Vite dev server（5193）+ uvicorn（8017）雙埠」。
> **公開發布版的 `start.ps1` 已經改寫**，與下述開發模式不同：
> - 只用**單一埠 8017**：uvicorn 直接提供已建置的 `frontend/dist`，使用者**不需要安裝 Node.js**。
> - 會自動尋找相容的 64 位元 Python（3.10／3.11／3.12），必要時以 WinGet 使用者層級安裝。
> - 依 `backend/requirements.lock.txt` 安裝**版本鎖定**的套件到 `backend\.venv`。
> - 服務以**前景程序**執行，關閉視窗即結束，不會殘留背景程序佔用連接埠。
>
> 要改動發布用的啟動流程，請以 `start.ps1` 現況為準，不要照抄本節的開發模式描述。
> 開發時仍可用 `cd frontend && npm run dev` 走雙埠模式。

- 技術：**前端** React + Vite + TypeScript + three.js（源自 `react-vite-3d-preview` skill）；**後端** FastAPI + uvicorn。
- 開發模式埠：**前端 5193、後端 8017**（見 `vite.config.ts` 的 proxy）；**發布模式只有 8017**。
- **本機 ANSYS 版本（重要，已依實跑結果更正、三個都已確認）**：
  - AEDT/HFSS：2026 R1。
  - Mechanical：`solve.out` 顯示底層 MAPDL 為 **2026 R1**。
  - Fluent：`get_fluent_version()` 實測回報 **Ansys Fluent 2025 R2**（安裝路徑 `v252`），跟另外兩個**不同版本**。
  - → PyMechanical/PyFluent/PyPrimeMesh 一律用 `App()` / `launch_fluent()` / `launch_prime()` **自動偵測版本**，不要寫死版號。

### 編碼地雷（已踩過，勿再犯）
- `.bat` **一律不能有 BOM**，否則第一行的 `@echo off` 會失效。
  - 開發初期的做法是存成系統原生 ANSI（Big5/CP950）避免中文亂碼；
  - **發布版改為 UTF-8 無 BOM**，並在檔案開頭先跑 `chcp 65001` 切到 UTF-8 字碼頁，
    再設 `PYTHONUTF8=1` 與 `PYTHONIOENCODING=utf-8`。這個做法跨語系 Windows 都正確，優先採用。
- `.ps1` 反而要 **UTF-8 with BOM**（否則 PowerShell 5.1 會用 CP950 讀，中文變亂碼）。兩者相反，別搞混。
  - `start.ps1` 內另外顯式設定 `[Console]::OutputEncoding` / `InputEncoding` / `$OutputEncoding` 為 UTF-8。
### Fluent／Prime 地雷（2026-07-31 重大修正，務必讀完再改）

**先講結論：早期版本的 Fluent 結果完全不可信，HANDOFF 舊版寫的「已實測求解成功、出口 34.78 °C」是錯的。**
那個數字是「從管壁吹風進來」算出來的產物。真正的原因與修法如下。

**1. 絕對不要依賴 `part.get_face_zonelets()` 的回傳順序（主因）**

舊程式假設 Prime 會依 STL 內 solid 的寫入順序回傳 zonelet，於是直接 `zip(zone_names, face_zonelets)`。
**實測完全不是這樣**——Prime 是「先回傳壁面、再回傳開口」：

| zonelet | 包圍盒 | 真實身分 | 舊程式命名 |
| --- | --- | --- | --- |
| 2 | x −0.12~0.12（整段） | 主管壁面 | `inlet_cold` ❌ |
| 3 | z 0~0.12（整段） | 支管壁面 | `inlet_hot` ❌ |
| 4 | x −0.12~−0.12（扁） | 冷側進口 | `outlet` ❌ |
| 5 | z 0.12~0.12（扁） | 熱側進口 | `wall_0` ❌ |
| 6 | x 0.12~0.12（扁） | 出口 | `wall_1` ❌ |

而且 **Prime 匯入 STL 後不保留 solid 名稱**（`part.get_labels()` 回傳 `[]`），
所以「靠名字對應」這條路也走不通。唯一可靠的是**幾何辨識**：三個開口都是平面，
包圍盒必定在某一軸退化（min≈max），退化位置就是建模時的臂長。見 `_classify_zonelets()`。

**當時的防呆為什麼沒擋下來**：它只檢查「zonelet 數量 == zone 名稱數量」（5==5）。
數量相符但名字全貼錯時，求解照跑不誤。**檢查數量是不夠的，要檢查身分。**
現在 `_assert_opening_areas()` 會實際量三個開口的面積並與 πr² 比對，偏離 ±20% 就中止。

**2. `report_definitions.compute` 必須在初始化之後才能用**

在 `hybrid_initialize()` 之前呼叫會回報
`'...report_definitions.compute' is currently inactive`。
第一版的面積健檢就是放太前面，被 `except` 記一行 log 就放行，等於整道把關沒生效——
**這正是「無聲失敗」的典型**。現在放在初始化之後，而且量不到就當作失敗中止。

**3. 表面 facet 尺寸與體網格尺寸必須一致，否則 Prime 會直接崩潰**

只把 `set_global_sizing_params` 調細（2~4 mm）而 STL facet 仍是預設的粗網格（約 10 mm），
`AutoMesh.mesh()` 會讓 Prime server 直接死掉：

```text
grpc._channel._MultiThreadedRendezvous: StatusCode.UNAVAILABLE
"Stream removed (Connection reset ... 10054)"
```

要細就兩邊一起細，共用 `_target_cell_size_m()`。

**4. `face.tessellate()` 一定要傳 `TessellationOptions`**

預設值有兩個問題：圓管只會被切成約 12 邊形；而且 **`watertight` 預設是 `False`**，
相鄰面在共用邊上的三角形不保證對齊，組出來的 STL 可能有裂縫。
現在明確指定 `surface_deviation`、`angle_deviation`、`max_edge_length` 並 `watertight=True`。
注意 docstring 的但書：**選項只在該面「第一次」被三角化時生效**，所以不要在之前先呼叫過無參數版本
（`_is_planar` 與 `_dominant_normal` 用的是 `surface_type` 與 `normal()`，不會觸發三角化，安全）。

**5. 混合溫度要用「質量加權」，不是面積加權**

混合溫度的定義來自能量守恆（`sum(m_i·cp·T_i) / sum(m_i·cp)`），對應 `surface-massavg`。
出口速度剖面不均勻時兩者差很多，同一組解實測：

| 報告類型 | 出口溫度 | 對照理論 43.75 °C |
| --- | --- | --- |
| `surface-areaavg`（舊） | 45.396 °C | 高 1.6 度，容易被誤判成沒收斂 |
| `surface-massavg`（現行） | **43.751 °C** | 幾乎完全一致 |

**6. PyFluent 這兩個 API 的正確寫法（都踩過）**

- 離散階數的值是**小寫連字號**，不是 GUI 顯示字串：
  允許值只有 `first-order-upwind` / `second-order-upwind` / `quick` / `third-order-muscl`。
  鍵值：`pressure, mom, k, epsilon, temperature`。
- 次鬆弛因子在 **`solution.controls.under_relaxation`**，不在 `solution.methods` 底下
  （`methods` 沒有 `under_relaxation` 屬性）。鍵值：
  `pressure, density, body-force, mom, k, epsilon, turb-viscosity, temperature`（**沒有 `energy`**）。

這兩個當初都寫錯，導致「一階暖身 + 鬆弛因子」整段實際上沒生效。
幸好失敗訊息是**大聲印出來**的（連同可用鍵值一起印），才發現得了——
**不要把這類設定包在無聲的 `except` 裡**。

**修正後的實測結果**（冷 3 m/s 25 °C、熱 5 m/s 55 °C、r=20 mm、400 步、13779 格）：

| 項目 | 理論 | 實測 | 誤差 |
| --- | --- | --- | --- |
| 出口混合溫度 | 43.75 °C | 43.751 °C | 0.003 % |
| 出口平均流速 | 8.00 m/s | 8.017 m/s | 0.2 % |
| 質量不平衡 | 0 | 0.0001 % | — |

`reversed flow` / `temperature limited` / `turbulent viscosity limited` 皆 0 次
（修正前分別 300／165／300 次）。`converged` 欄位現在依質量守恆判定，不再永遠回 `None`。

### Python 版本地雷：不要用 `str()` 比對列舉（真實事故）

開發期的 `backend\.venv` 是 **Python 3.10**，但發布版 `start.ps1` 的探測順序是「3.12 → 3.11 → 3.10」，
所以**使用者機器上建出來的是 3.12 的 venv**。使用者第一次跑 Fluent 求解就掛在：

```text
RuntimeError: Prime import_cad 失敗：0
```

「失敗：0」本身就很矛盾——Prime 的 `ErrorCode.NOERROR` 就是 0，代表其實**匯入成功了**。

根因是這行用字串比對列舉：

```python
if str(r.error_code) != "ErrorCode.NOERROR":   # ← 錯
```

**Python 3.11 起 `IntEnum.__str__` 改成與 `int.__str__` 一致**：

| Python | `str(prime.ErrorCode.NOERROR)` | 結果 |
| --- | --- | --- |
| 3.10 | `"ErrorCode.NOERROR"` | 判斷通過 |
| 3.11／3.12 | `"0"` | **誤判為失敗** |

正確寫法是拿列舉本身比對（所有版本都對）：

```python
if r.error_code != prime.ErrorCode.NOERROR:
    code_name = getattr(r.error_code, "name", r.error_code)
    raise RuntimeError(f"Prime import_cad 失敗：{code_name}")
```

**通用教訓**：`.venv` 釘住的是**開發者的** Python 版本，`start.ps1` 的探測清單決定的是**使用者的**版本。
兩者不同時，本機所有驗證都會通過，卻讓使用者去踩一個從沒執行過的直譯器。
改動探測清單時，要嘛限縮成真的跑過的版本，要嘛用清單裡最新的版本把**完整求解流程**跑過一次。
（本次已補做：修正後用 Python 3.12 實跑完整 Fluent 流程驗證。）

### 啟動腳本地雷（真實事故，勿改回去）

**1. 不要用 `Start-Job` 開瀏覽器——會被防毒軟體攔截，而且是無聲失敗。**

發布首版的 `start.ps1` 用 `Start-Job` 開背景工作輪詢連接埠、就緒後 `Start-Process $url` 開瀏覽器。
`Start-Job` 會另外啟動一個 PowerShell 子程序執行序列化的 script block，這正是防毒軟體的行為特徵。
**實測**：裝有 **WithSecure Client Security Premium** 的機器上，該子程序被判定為
`Trojan:AMSI/SuspiciousExecute.A` 直接攔下，uvicorn 正常啟動、日誌一切正常，**但瀏覽器完全沒開**；
又因為當時 `catch { }` 是空的，使用者連一個錯誤訊息都看不到，只能自己猜。

正確作法（現行版本）：
- uvicorn 改用 `Start-Process -NoNewWindow -PassThru` 以**子程序**執行（啟動的是 `python.exe`，不是 PowerShell）。
- 主程序自己用 `Invoke-WebRequest` 輪詢 `/api/health`（比只檢查連接埠有無被綁定更準），
  就緒後在**完整互動 session** 裡直接 `Start-Process $url`。
- 全程**不產生任何 PowerShell 子程序**，不用 `-EncodedCommand`、不用隱藏視窗、不用 `Invoke-Expression`。
- 開啟失敗一律把網址明顯印出來，**絕不無聲失敗**。

**2. 收尾要用 `taskkill /T` 收整棵程序樹，不能只 `Kill()` 最上層。**

實測發現 `Start-Process` 拿到的 PID 與 uvicorn 自己印的 `Started server process [PID]` **可能不同**
（測試中是 20576 vs 21444）。原因是某些虛擬環境（例如 `uv` 建立的）的 `.venv\Scripts\python.exe`
只是轉發用的 trampoline，會再開一個真正的直譯器程序。只 `Kill()` 最上層會留下真正在監聽連接埠的孤兒程序。
現行 `finally` 先 `taskkill /PID <id> /T /F`，再 fallback 到 `Kill()`，最後**實際檢查連接埠是否真的釋放**並回報。

**3. PowerShell 5.1 的 stderr 陷阱（發布阻擋級）**：在 `$ErrorActionPreference = "Stop"` 下，
  對原生指令做 `2>$null` 重導向**攔不住例外**——PS 5.1 會先把 stderr 包成終止用的 `NativeCommandError`，
  之後才套用重導向。所以 `py "-3.11-64" -c "exit()" 2>$null` 只要沒包在 `try { } catch { }` 裡，
  在缺少該版本的機器上會直接讓整個腳本崩潰。`start.ps1` 的 `Get-PythonInfo` 已全數包在 try/catch 內。

---

## 2. 目錄結構與職責

```
ansys-gs-hub/
├─ start.bat / start.ps1          啟動腳本（bat 為 Big5 編碼）
├─ backend/
│  ├─ app/
│  │  ├─ main.py                  FastAPI 入口、CORS、掛載 dist、路由註冊
│  │  ├─ models.py                Pydantic 模型：Scene/Prim、各領域參數與結果
│  │  ├─ domains/
│  │  │  ├─ base.py               DomainAdapter 介面 + DomainNotAvailableError
│  │  │  ├─ hfss_dipole.py        ★HFSS 真求解（PyAEDT）
│  │  │  ├─ mechanical_stub.py    run()：subprocess 執行 scripts/mechanical_cantilever.py + 讀 JSON 結果
│  │  │  └─ fluent_stub.py        run()：subprocess 執行 scripts/fluent_mixing_tee.py + 讀 JSON 結果
│  │  └─ routers/
│  │     ├─ geometry.py           POST /api/{domain}/geometry（前端即時預覽用）
│  │     ├─ run.py                WebSocket /ws/{domain}/run（串流日誌 + 回結果）
│  │     └─ fs.py                 輸出資料夾：default-dir / pick-dir / validate-dir
│  └─ scripts/
│     ├─ fluent_mixing_tee.py     ★Fluent 混合三通求解（PyAnsys Geometry 建幾何 → PyPrimeMesh 產生體網格 → PyFluent 求解）
│     └─ mechanical_cantilever.py ★Mechanical 懸臂樑求解（PyMechanical + PyAnsys Geometry）
└─ frontend/src/
   ├─ App.tsx                     選單列（檢視／說明）+ 三領域分頁；showLogs 狀態提升到此層共用
   ├─ api.ts                      fetch/WebSocket + fs API（getDefaultDir/pickDirectory/validateDirectory）
   ├─ geometry.ts                 共用 Prim 型別（tube/cylinder/box/ring/airbox）與 COLORS
   ├─ styles.css                  現代淺色主題（CSS 變數）+ .menubar 選單列樣式，已最佳化字體大小與版面色彩
   ├─ components/
   │  ├─ Preview3D.tsx            three.js 即時預覽（拖曳旋轉、滾輪縮放、自動貼合、「重置視角」按鈕）
   │  ├─ Fields.tsx               NumberField / SelectField（含滾輪防呆）
   │  ├─ OutputDirField.tsx       共用「輸出資料夾」欄位（三領域共用）
   │  ├─ LogConsole.tsx           求解日誌視窗
   │  └─ S11Chart.tsx             HFSS S11 折線圖 + 摘要
   └─ domains/
      ├─ hfss/       params.ts, geometry.ts, DipolePanel.tsx（接受 showLogs/setShowLogs props）
      ├─ mechanical/ params.ts, geometry.ts, BracketPanel.tsx（接受 showLogs/setShowLogs props，真求解已接上）
      └─ fluent/     params.ts, geometry.ts, TeePanel.tsx（接受 showLogs/setShowLogs props，真求解已接上）
```

**架構模式**：每個領域 = `params.ts`（參數/驗證/理論估算，Fluent 另有 `toApiParams()`）+ `geometry.ts`（參數→3D Scene）+ `Panel.tsx`（版面，使用 `allotment` 實作可自由拖曳調整大小的分割視窗）。
後端每領域 = 一個 adapter 模組，實作 `geometry(params)` 與 `run(params, log_cb)`。新增領域照抄這個模式即可。

**Allotment 巢狀陷阱（重要，寫版面時務必記住）**：`allotment` 這個套件有個已知毛病——在**沒有固定尺寸**的 Allotment.Pane（例如 `minSize` 而非 `preferredSize` 的那種、要靠 flex 分配剩餘空間的 pane）裡面，如果**再巢狀一層 `<Allotment>`**，外層那個 pane 的尺寸會被算成 0（寬或高視方向而定），導致內容整個消失。這是在 Mechanical 面板要把應力雲圖擺到 3D 預覽旁邊時實測踩到的。**解法：這種「頂層大面積、需要跟另一塊內容並排」的情況一律改用普通 CSS flexbox（`<div style={{display:"flex", height:"100%", gap:7}}>`），不要用巢狀 Allotment**——`BracketPanel.tsx` 的 3D 預覽/應力雲圖、`TeePanel.tsx` 的 3D 預覽/溫度雲圖都是這樣處理。只有在**固定 `preferredSize` 的 pane 裡面**巢狀 Allotment 才是安全的（例如三個面板下方那塊 264px 高的摘要/估算/日誌區域，因為外層有固定高度，這樣巢狀沒問題）。

**選單列（View menu）**：`App.tsx` 有一個「檢視」選單（樣式取自另一個專案 `D:\AI Development\PCB SI 3D Simulation Toolkit\web_app`），可切換「隱藏/顯示系統日誌」，`showLogs` 狀態在 App 層級共用，切換分頁不會重置。三個領域面板現在都接了這個 prop。

---

## 3. 三領域狀態（關鍵）

| 領域 | 前端＋即時3D預覽 | 結果 | 後端真求解 | 已實跑驗證 |
|---|---|---|---|---|
| **HFSS 偶極天線** | ✅ | S11 曲線＋遠場輻射方向圖 | ✅ PyAEDT | ✅ **是** |
| **Mechanical 懸臂樑** | ✅ | 真求解結果＋理論估算 | ✅ PyMechanical | ✅ **是（見下）** |
| **Fluent 混合三通** | ✅ | 真求解結果＋理論估算 | ✅ PyAnsys Geometry + PyPrimeMesh + PyFluent | ✅ **是（2026-07-31 修正 zone 對應後，與理論值差 < 0.3%）** |

**三個領域現在全部端到端跑通。** 這是本專案「AI agent + skill 能完成簡單模擬」的核心驗證目標，已經達成。

### HFSS 偶極天線（完整可用）
- 半波長偶極，`hfss_dipole.py` 用 PyAEDT 建模＋求 S11 掃頻，回共振頻率/頻寬。
- 有輸出資料夾選擇（`fs.py`）；有「電性長度防呆」：天線長度與頻率不匹配時警告（S11 全反射是天線太短、非饋入埠問題），並提供一鍵設為共振長度。饋入埠尺寸 = 2×導線半徑 × 間隙，隨參數變化。
- **遠場輻射方向圖（新增）**：S11 求解完成、存檔前，額外用 `hfss.insert_infinite_sphere(theta_start=0, theta_stop=180, theta_step=2, phi_start=0, phi_stop=0, phi_step=1, ...)` 建一個 Phi=0 切面的無限大球，再用 `hfss.post.get_solution_data(expressions="GainTotal", ..., report_category="Far Fields", primary_sweep_variable="Theta")` 取資料。**這步整包用 try/except 包住**，失敗只記 log、不影響 S11 結果回傳（`RunResult.theta_deg`/`gain_db` 保持空陣列）。
  - **關鍵踩坑**：PyAEDT 1.2.0 這個版本的 `SolutionData` **沒有** `data_real()`/`data_magnitude()`/`data_db20()` 這些方法（`dir(data)` 裡完全不存在，呼叫會直接 `AttributeError`）。正確作法是 `real_part, imag_part = data.full_matrix_real_imag`，回傳兩個 dict（key 是 expression 名稱），值是 `(N,4)` 的 numpy array，欄位依序是 `[frequency, phi, theta, value]`。取 `real_part["GainTotal"][:, 2]` 當 theta、`[:, 3]` 當增益（**線性值**，不是 dB，需自行 `10*log10()` 換算成 dBi）。imag_part 全為 0（GainTotal 是純實數量）。
  - `insert_infinite_sphere()` 的參數名稱是 `theta_start`/`theta_stop`/`theta_step`/`phi_start`/`phi_stop`/`phi_step`（不是 `x_start`/`y_start` 這種猜測的名字）。
  - 前端新增 `RadiationChart.tsx`（極座標圖，手繪 SVG，風格比照 `S11Chart.tsx`）：因偶極方向圖只與 Theta 有關（軸對稱），把 Theta 0~180° 的資料鏡射到左側即可畫出完整 360° 的「花生／甜甜圈剖面」，不需要額外再求 Phi=180° 的資料。`DipolePanel.tsx` 的 3D 預覽區改成 flexbox 並排（不是巢狀 Allotment），有遠場資料時右側顯示 `RadiationChart`，比照 `TeePanel.tsx`/`BracketPanel.tsx` 已用過的模式。
  - 已用既有已求解專案（`dipole_20260721_100756.aedt`）驗證：峰值增益 2.47 dBi @ Theta=90°（天線側向，符合偶極天線物理預期），Theta=0°/180°（天線軸向）增益趨近負無限大（實際 -55.5 dB，符合偶極天線軸向零輻射的預期）。

### Mechanical 懸臂樑（完整可用，已實跑成功）
- 一端固定、自由端 −Z 集中力的矩形樑。參數：長/寬/高、材料（鋼/鋁/鈦）、力。
- 理論估算（前端）：σ=FLc/I、δ=FL³/3EI、安全係數、質量、應力利用率條。
- 求解腳本 `mechanical_cantilever.py`：PyAnsys Geometry 建樑＋命名 `fixed_face`/`load_face` → 匯出 `.pmdb` → PyMechanical 嵌入式 `App()` 匯入、靜態結構、網格、固定支撐、力、求 von Mises 最大應力與總變形。
- **執行架構已改為 subprocess**：`mechanical_stub.py` 的 `run()` 不再是同進程呼叫 `solve()`，而是用 `subprocess.Popen` 開子行程跑 `mechanical_cantilever.py --json-out <tmpfile>`，逐行讀 stdout 當日誌回傳，完成後讀暫存 JSON 組成 `MechStaticResult`。這樣做是為了避免 PyMechanical 內嵌的 .NET runtime 跟 uvicorn 同進程互相干擾——**新增領域或改這支腳本時請沿用這個 subprocess 模式，不要改回同進程呼叫**。
- **已驗證**：`backend/projects/` 下有兩組真實求解產出（`cantilever_20260713_114405` 與 `_115658`，各含 `.mechdat`、`.rst`、`solve.out`、應力雲圖 PNG）。`solve.out` 顯示 `RUN COMPLETED`，底層求解器為 **Ansys MAPDL 2026 R1**（非先前記載的 v232）。前端 `BracketPanel.tsx` 已接上真求解 WebSocket，顯示 von Mises 應力／變形／安全係數／應力雲圖，「介面預覽」標籤也已拿掉。

### Fluent 混合三通 Mixing Tee（完整可用，已實跑成功）
- **原廠課程 Demo 模型**：兩股空氣（冷 3 m/s 25°C、熱 5 m/s 55°C，管半徑 20 mm）在 T 形管混合，看出口溫度。
- 理論估算（前端）：質量守恆 ṁ=ρVA + 能量守恆混合溫度（≈43°C）、出口流速、雷諾數/流態。
- **已驗證（2026-07-31 修正後）**：`python backend/scripts/fluent_mixing_tee.py --cold-vel 3 --cold-temp 25 --hot-vel 5 --hot-temp 55 --iters 400` 端到端成功跑完，出口混合溫度 **43.751 °C**（理論 43.75）、出口平均流速 **8.017 m/s**（理論 8.00）、質量不平衡 0.0001%，並產出 `.cas.h5` 與溫度雲圖 PNG。前端 `TeePanel.tsx` 已接上真求解 WebSocket。
  > ⚠️ 舊版此處記載的「出口溫度 34.78 °C」**不是有效結果**，當時邊界 zone 名稱貼錯（把管壁當成進口）。
  > 完整原因與修法見上方「Fluent／Prime 地雷」一節。

#### 為什麼原本的做法完全走不通、最終怎麼解決的（重要，別走回頭路）

這是這個專案除錯最久的一段，完整記錄診斷過程供未來參考：

1. **根本原因：本機 Fluent（2025 R2）的 Discovery/PartMgr CAD 附加流程系統性故障。** 依序試過 6 種 BREP/CAD 格式匯出＋匯入：`.scdocx`、`.pmdb`、`.dsco`（官方課程教材原生格式！）、`.x_t`（Parasolid text）、`.step`、`.iges`——**全部失敗**。其中 `.step`/`.iges` 在 PyAnsys Geometry **匯出階段**就失敗（本機這套「local Geometry Service」backend 沒實作這兩種匯出，回報 "not implemented"）；其餘 4 種格式**匯出成功**，但 Fluent Meshing 匯入時卡在 `PartMgr->AttachAssembly()` 逾時（35 秒後失敗），連官方教材同款的 `.dsco` 都一樣失敗——證實不是格式選錯，是本機 Discovery CAD reader 附加環節本身壞了。
2. **改用 STL（網格化格式）繞過 CAD reader，但撞上 Fluent Meshing 版本限制。** `.stl` 可被 Fluent Meshing 的經典 TUI（`file/import/cad-geometry`）成功匯入（0.02～0.09 秒，遠快於 CAD 格式，因為不需要 BREP 轉換）。用 `body.tessellate(merge=True)` 或逐面 `face.tessellate()` + 手寫多重具名 `solid` 區塊的 ASCII STL，能讓 Fluent 依 solid 名稱自動切出對應的具名 zone（實測：5 個 solid → 5 個正確命名的 zone）。**但這個 Fluent 版本已經把「體網格生成」完全收斂到 guided Workflow 系統，經典 TUI 沒有暴露任何體網格指令**（`dir(meshing.tui)` 只有 file/boundary/display/parallel/preferences/server，`meshing.tui.boundary` 也只有畫框線的工具，完全沒有 mesh 相關指令）；而 Workflow 自己的 Import Geometry 任務在 `FileFormat="Mesh"` 底下有明確 bug——無論用屬性賦值／`set_state()`／`update_dict()`，一律回報「File Names 未提供」，即使讀回的狀態確實已正確設定。CAD 格式（`FileName` 單數）又會直接拒絕 `.stl` 副檔名，要求切到 Mesh 格式——形成死鎖。
3. **最終解法：改用獨立的 `ansys-meshing-prime`（PyPrimeMesh）套件，完全繞開 Fluent Meshing。** Prime 是隨 Fluent 一起安裝、但完全獨立的次世代網格引擎，不需要另外授權，`launch_prime()` 即可啟動，且 `import_cad()` 本身就支援 `.stl`（連 `.fmd`/`.tgf` 都支援，比 Fluent Meshing 寬鬆很多）。完整流程：
   - `file_io.import_cad(file_name=stl_path, params=prime.ImportCadParams(model=model))` 匯入具名多 solid STL。
   - 依 STL 寫入順序，逐一 `model.create_zone(name, prime.ZoneType.FACE)` + `part.add_zonelets_to_zone(zone_id, [zonelet])`，把匯入後的匿名 `face_zonelets`（順序與檔案內 solid 順序一致）對應回正確名稱。
   - `part.compute_closed_volumes(prime.ComputeVolumesParams(model=model))`——**這一步是關鍵**，沒有它 AutoMesh 會直接失敗（"Auto meshing failed"，因為 Prime 不知道這 5 個面圍成的是一個封閉體積）。
   - `prime.AutoMesh(model).mesh(part_id=part.id, automesh_params=prime.AutoMeshParams(model=model, size_field_type=prime.SizeFieldType.GEOMETRIC, volume_fill_type=prime.VolumeFillType.POLY))` 產生 poly 體網格（實測：644 個三角面 → 4223 個 poly cell）。
   - `file_io.export_fluent_case(case_path, prime.ExportFluentCaseParams(model=model, cff_format=True))` 匯出 `.cas.h5`（注意：`.cas.h5` 副檔名**必須**搭配 `cff_format=True`，否則會報「檔案副檔名不合法」）。
   - `prime_client.exit()` 關閉 Prime，改用 `pyfluent.launch_fluent(mode="solver")` **直接 `read_case()` 讀入這個 case 檔**，完全不經過 Fluent Meshing。
4. **Prime 匯出的 zone 類型還要手動修正一次（`_fix_zone_types()`）。** Prime 的 `ZoneType.FACE` 只是「一般面 zone」，讀進 Fluent solver 後**全部預設是 `wall`**（`bc.velocity_inlet`/`bc.pressure_outlet` 一開始都是空的），必須用 `bc.set_zone_type(zone_list=["inlet_cold"], new_type="velocity-inlet")` 之類的呼叫逐一轉型。同理，Prime 產生的 cell zone **預設是 `solid`**（不是 `fluid`！），第一次疊代時會報 `"Flow boundary zone found adjacent to solid zone"` 直接中止，必須先用 `czc.set_zone_type(zone_list=[cell_zone_name], new_type="fluid")` 轉成流體才能求解。這兩步都已經寫進 `_fix_zone_types()`，用**動態偵測**（`czc.solid.keys()`）而非寫死 zone 名稱，避免以後改幾何時 zone 名稱不同就失效。

#### 已知限制（誠實說明，供未來優化）
> ~~**收斂精度**：150 步疊代跑出 34.78°C…~~
> ~~**出口速度數值目前不合理**（10723 m/s）：收斂未完全 + 網格偏粗導致…是典型 CFD 調校問題，不是管線本身的錯誤~~
>
> **以上兩條是 2026-07-31 之前的錯誤診斷，保留於此以免有人重蹈覆轍。**
> 真正的原因不是收斂或網格密度，而是**邊界 zone 名稱貼到錯誤的面**——求解器一直在從管壁吹風進來。
> 詳見上方「Fluent／Prime 地雷」。修正後溫度與速度都落在理論值 0.3% 內。

- **沒有邊界層**：目前約 13800 格、管徑方向約 8 格，`AutoMesh` 未加 prism layer。
  教學示範與趨勢判讀足夠，但壁面剪應力、壓損等對近壁解析敏感的量不建議直接引用。
  要更準可在 Prime 加 `PrismParams` 產生邊界層。
- **出口段偏短**：出口距 T 型接合處僅約 3 倍管徑。目前設定下已無回流警告，
  但若大幅提高流速或改變幾何比例，建議調大「管臂長度」避免回流影響出口讀值。
- 前端「CFD 求解結果」目前仍會把這個速度值原樣顯示出來，沒有做合理性檢查/警示；可以考慮在 `TeePanel.tsx` 加一個簡單的範圍檢查（例如速度 > 100 m/s 時顯示「可能未收斂」提示）。

---

## 4. 關鍵設計決策（非顯而易見，務必理解再改）

1. **Fluent 選 Mixing Tee**：它是 Fluent GS 課程 M02 的正式 Demo，簡單、代表性高、可用守恆閉式解驗證。（原本的直管已淘汰。）
2. **Mechanical 選懸臂樑，不用課程原模型**：課程真正模型是軸承/轉軸總成（含接觸、螺栓、皮帶張力），太複雜易錯，不適合「證明可行」的第一個案例。懸臂樑是靜態結構最精簡、最不會壞的版本，工作流一一對應。
3. **Mechanical 避開材料 XML 的做法（重要）**：線彈性單一實體、外力加載時，**von Mises 應力與 E 無關、變形 ∝ 1/E**。故用 Mechanical 內建預設 `Structural Steel`（E≈200 GPa）求解，取得與材料無關的應力 + 鋼的變形，再依所選材料 E 換算變形（δ_mat = δ_steel × 200/E_mat）、用該材料降伏強度算安全係數。**三材料全部不需外部材料 XML**（材料 XML 是最容易寫錯的部分，刻意繞開）。
4. **理論估算 vs 真求解**：三領域前端都有「理論估算」（閉式解，非 FEA/CFD），讓沒裝軟體也能完整操作介面；三個領域的「開始求解」按鈕現在**全部啟用**，真求解完成後會額外顯示真實結果供對照理論估算。
5. **求解腳本三保險**：都做了 camelCase→snake_case 參數正規化、未裝套件時 graceful `raise DomainNotAvailableError`、可獨立 CLI 執行。
6. **Fluent 不用 Fluent Meshing、改用獨立的 ansys-meshing-prime**：本機 Fluent（2025 R2）的 Discovery CAD reader 對所有 BREP 格式系統性故障，且這個版本的 Fluent Meshing 無論經典 TUI 或 guided Workflow 都無法妥善處理具名 STL 的體網格生成。改用隨 Fluent 一起安裝、但完全獨立的 PyPrimeMesh 網格引擎（`ansys-meshing-prime`），import_cad → 逐面建 zone → compute_closed_volumes → AutoMesh → export_fluent_case，全程不經過 Fluent Meshing，Fluent solver 直接 `read_case()` 讀取。詳見下方 Fluent 小節的完整診斷過程。

---

## 5. 已驗證 vs. 未驗證（誠實說明）

**已驗證**：
- 前端介面已全面升級：支援 `allotment` 可拖曳分割視窗、淺灰主題配色優化、移除 3D 網格線、新增「檢視」選單（隱藏/顯示系統日誌，狀態跨分頁共用），且 `npx tsc --noEmit` 全通過、無 console 錯誤。
- 三領域即時 3D 預覽正常；理論估算數值經手算核對正確
  （Mech 鋼：σ=50 MPa、δ=0.333 mm、SF=5.0；Fluent：出口 43.1°C、Re 19319）。
- 後端 `py_compile` 通過、import 正常。
- `fs` 輸出資料夾端點實測正常（validate-dir 會建資料夾並回綠色狀態）。
- **HFSS 端對端真求解已實跑成功。**
- **Mechanical 端對端真求解已實跑成功兩次**（`backend/projects/cantilever_20260713_*`，`solve.out` 顯示 `RUN COMPLETED`，底層為 Ansys MAPDL 2026 R1）。`_dominant_normal`/`_is_planar` 的端面辨識與 PyMechanical settings 欄位在本機環境下都跑得通，不需要再調整。
- **Fluent 端對端真求解已實跑成功**（`--iters 400`，出口混合溫度 43.751 °C／流速 8.017 m/s／質量不平衡 0.0001%，見上方 Fluent 小節完整診斷）。**注意：2026-07-31 之前記載的 34.78 °C 是 zone 對應錯誤下的無效結果。**三個領域的求解腳本、後端 subprocess+JSON 接線、前端 WebSocket 求解 UI 全部完成並通過 `npx tsc --noEmit` / `py_compile`。

**未驗證 / 待優化**：
- Fluent 目前**沒有邊界層網格**，出口段僅約 3 倍管徑（見上方 Fluent 小節「已知限制」）。核心守恆量已驗證正確。
- 前端 `TeePanel.tsx` 的視覺排版（3D 預覽＋溫度雲圖並排）因自動化測試工具在這個環境下的量測異常，**未能用自動化截圖確認**，但採用的是跟已經人工確認過可正常運作的 `BracketPanel.tsx` 相同的 flexbox 並排寫法（刻意避開已知的 allotment 巢狀陷阱），程式碼邏輯上應該一致；建議下一位接手者實際在瀏覽器重新整理頁面看一次。

---

## 6. 下一步（給下個 AI 的具體任務，依優先序）

**三個領域都已經完整跑通並接上前端了**，核心目標達成。剩下的都是優化/打磨項目，優先序供參考：

1. **（建議優先）Fluent 求解收斂與網格品質優化**：目前出口溫度數值方向正確但未完全收斂（見上方 Fluent 小節「已知限制」），出口速度數值不合理。可嘗試：
   - 加大預設 `iterations`（目前 200）或前端讓使用者可調。
   - `mesh_with_prime()` 的 `AutoMeshParams` 加密網格（目前用 `SizeFieldType.GEOMETRIC` 沒有額外指定 `min_size`/`max_size`，體網格只有 4223 cell，對這個尺度的幾何偏粗）。
   - 檢查 `AutoMesh` 前後是否有退化/品質差的面導致局部數值不穩定（`prime.SurfaceQualitySummaryParams`、`VolumeQualitySummaryParams` 可用來檢查）。
   - 完成後在前端 `TeePanel.tsx` 加一個簡單的結果合理性檢查（例如速度超過某個門檻就顯示「可能未收斂」提示）。
2. **實機驗證前端排版**：在瀏覽器實際重新整理頁面，確認 `TeePanel.tsx` 的 3D 預覽＋溫度雲圖並排顯示正常（自動化測試工具在這次除錯的最後階段出現量測異常，未能用截圖確認，詳見上方「未驗證/待優化」）。
3. （選）把後端 `run.py` 的結果型別放寬：目前回 `RunResult`(HFSS)，Mech/Fluent 分別回 `MechStaticResult`/`CfdMixingResult`（都已透過 subprocess+JSON 模式運作，繞過了型別問題，這項純粹是程式碼整潔度考量，不影響功能）。
4. （選）三領域的求解按鈕目前都會整個流程跑完才回結果；若要更即時的進度回饋，可以在各腳本內加更細緻的 log_cb 呼叫頻率，或前端加進度條估算。

---

## 7. 要用到的 skill（下個 AI 請善用）

- `react-vite-3d-preview` / `simgui-skill`：前端 + FastAPI 骨架、三視窗版面、three.js 預覽。
- `hfss3d-skill`（PyAEDT）：HFSS。
- `mechanical-skill`（`ansys.mechanical.core.App` 嵌入式）：Mechanical。**注意用 `App()` 自動偵測版本。**
- `fluent-skill`（`ansys.fluent.core`）＋`geometry-skill`（`ansys.geometry.core`）：Fluent 求解物理模型/邊界條件設定。
- **`ansys.meshing.prime`（PyPrimeMesh）沒有對應的 anthropic-skills 條目**，是這次除錯過程中直接查官方 API（`help()`/`dir()`）摸索出來的，用法見 `backend/scripts/fluent_mixing_tee.py` 的 `mesh_with_prime()`。若之後要擴充其他 Fluent 幾何（不只 Mixing Tee），這是目前唯一驗證過能穩定繞開本機 Discovery CAD reader 故障的網格生成路徑。
- 寫 PyAnsys 腳本時務必照 skill 的 `dir()` → `help()` → `type()` 迭代法核對 API。

## 8. 套件與環境需求彙整

- 前端：Node.js（`npm --prefix frontend run dev`）。
- 後端基礎：FastAPI、uvicorn、pydantic（venv 已建）。
- HFSS 求解：`pyaedt`（匯入名稱是 `ansys.aedt.core`）+ 授權 AEDT。
- Mechanical 求解：`ansys-mechanical-core` + `ansys-geometry-core` + 授權 Mechanical。
- Fluent 求解：`ansys-fluent-core` + `ansys-geometry-core[graphics]`（`[graphics]` 是**必要**的，`Face.tessellate()`/`Body.tessellate()` 靠它附帶的 pyvista 才能用）+ `ansys-meshing-prime` + 授權 Fluent。
  安裝：`pip install ansys-fluent-core "ansys-geometry-core[graphics]" ansys-meshing-prime`

---

## 9. 使用者偏好（務必遵守）

- 所有產出用**繁體中文**、全形標點；字型 `"Calibri", "Microsoft JhengHei", sans-serif`。
- 每份文件/腳本/工具附署名：「此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供」。
- 操作說明要列出需預先安裝的套件（名稱、用途、安裝指令）。
- 使用者在同時執行 `start.bat`（前端 5193 / 後端 8017 常駐）；AI 若要起預覽伺服器會撞埠，
  請改用型別檢查/對執行中後端 curl 來驗證，或請使用者先關掉。
