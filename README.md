# ANSYS Getting-Started Hub

一個整合式網頁介面：左側調整參數、中間即時顯示 3D 幾何預覽（React + Vite + three.js），
按下「開始求解」後，後端會**真正呼叫本機已安裝且已授權的 ANSYS 軟體**完成建模、網格與求解，
求解過程的訊息即時串流回瀏覽器，完成後直接在頁面上呈現結果曲線與雲圖。

目的是讓不同背景的工程師（不熟電磁、不熟結構、不熟流體都可以）在瀏覽器上完整跑過一次
基本模擬流程，不必先學會各家求解器的操作介面。

## 三個領域現況

| 領域 | 範例模型 | 求解器 | 結果輸出 | 實測狀態 |
| --- | --- | --- | --- | --- |
| **HFSS** | 半波長偶極天線 | PyAEDT → AEDT／HFSS | S11 掃頻曲線、共振頻率、−10 dB 頻寬、遠場輻射方向圖 | ✅ 已實測求解成功 |
| **Mechanical** | 懸臂樑靜態結構 | PyMechanical → MAPDL | von Mises 最大應力、總變形、安全係數、應力雲圖 | ✅ 已實測求解成功 |
| **Fluent** | 混合三通 Mixing Tee | PyAnsys Geometry → PyPrimeMesh → PyFluent | 出口混合溫度、出口流速、溫度雲圖 | ✅ 已實測求解成功，與守恆理論值相差 < 0.3 % |

三個領域也都內建**理論估算**（閉式解），即使還沒安裝求解器，也能完整操作介面、看到參數怎麼影響結果。

## 系統需求

### 必要

| 項目 | 需求 | 說明 |
| --- | --- | --- |
| 作業系統 | **Windows 10／11（64 位元）** | 啟動腳本為 `.bat` + PowerShell 5.1，且 PyAEDT 需要 Windows COM |
| Python | **64 位元 3.10／3.11／3.12** | 若機器上完全沒有相容版本，`start.ps1` 會用 WinGet 以「使用者層級」安裝 3.12，**不會移除或降級**你既有的任何 Python |
| 網路 | 第一次啟動時需要 | 用來下載 Python 套件到專案自己的虛擬環境；之後離線也能執行 |

> **不需要安裝 Node.js。** 發布內容已包含建置好的前端（`frontend/dist`），由後端直接提供。

### 商業軟體與授權（依你要用的領域擇一或全部）

以下都是 **ANSYS 商業軟體，需自行安裝並持有有效授權**，本專案不含也不提供任何 ANSYS 元件：

| 領域 | 需要的軟體 | 本專案實測版本 |
| --- | --- | --- |
| HFSS | ANSYS Electronics Desktop（AEDT，含 HFSS） | **2026 R1** |
| Mechanical | ANSYS Mechanical（底層 MAPDL 求解器） | **2026 R1** |
| Fluent | ANSYS Fluent（PyPrimeMesh 隨 Fluent 一併安裝，不需額外授權） | **2025 R2** |

沒有安裝或授權逾時的話，該分頁按下求解會顯示清楚的中文錯誤訊息，不會卡住轉圈。

### 會自動安裝的 Python 套件

第一次執行 `start.bat` 時，會在 `backend\.venv` 建立**專屬虛擬環境**並安裝以下套件。
所有套件都裝在這個資料夾裡，**不會污染系統 Python，也不會動到你其他專案的環境**。
版本已鎖定在實測過的組合（見 `backend/requirements.lock.txt`）：

| 套件 | 用途 |
| --- | --- |
| `fastapi` | 後端 Web 框架，提供 `/api` 路由 |
| `uvicorn[standard]` | ASGI 伺服器，並支援 WebSocket 串流求解日誌 |
| `pydantic` | 參數驗證與資料模型 |
| `pyaedt` | 驅動 AEDT／HFSS（匯入名稱是 `ansys.aedt.core`，PyPI 名稱才是 `pyaedt`） |
| `pywin32` | Windows COM 初始化，PyAEDT 連線 AEDT 時需要 |
| `ansys-mechanical-core` | 驅動 Mechanical 做靜態結構分析 |
| `ansys-fluent-core` | 驅動 Fluent solver |
| `ansys-geometry-core[graphics]` | 建立幾何、逐面三角化並輸出 STL／PMDB |
| `ansys-meshing-prime` | PyPrimeMesh 網格引擎，產生 Fluent 體網格 |

## 下載與安裝

### 方式 A：Source ZIP（最簡單）

1. 在本頁面按綠色的 **Code → Download ZIP**。
2. 把 ZIP **完整解壓縮**到一個路徑不含特殊字元的資料夾，例如 `C:\ansys-gs-hub`。
   - ⚠️ 請務必「解壓縮」，不要直接在壓縮檔裡按 `start.bat`，那樣一定會失敗。
3. 連按兩下 **`start.bat`**。

### 方式 B：Release ZIP

到 **Releases** 頁面下載版本化的 ZIP，同樣完整解壓縮後執行 `start.bat`。
Release 頁面附有 `SHA256SUMS.txt`，可用以下指令核對檔案完整性：

```powershell
Get-FileHash .\ansys-gs-hub-vX.Y.Z.zip -Algorithm SHA256
```

### 第一次啟動會發生什麼

```
start.bat → start.ps1 → backend\.venv\Scripts\python.exe → uvicorn
```

1. 檢查前端 `dist` 與套件鎖定檔是否齊全。
2. 尋找相容的 64 位元 Python（找不到才會詢問 WinGet 安裝）。
3. 建立 `backend\.venv` 虛擬環境並安裝套件（**需要網路，約數分鐘**）。
4. 啟動服務並在就緒後自動開啟瀏覽器：**http://127.0.0.1:8017**

第二次之後啟動只需要幾秒鐘，因為虛擬環境已經建好了。

## 使用方式

每個分頁的操作邏輯一致：**左側調參數 → 中間看 3D 預覽 → 按「開始求解」→ 下方看日誌 → 完成後看結果**。

### HFSS · 偶極天線

1. 調整中心頻率、導線半徑、饋入間隙、天線總長度（留空自動依頻率估算）、掃頻範圍。
2. 若長度與頻率不匹配，介面會直接警告是「電性短／長天線」而非饋入埠問題，並提供一鍵設為共振長度。
3. 按「開始模擬」→ 後端建立幾何、lumped port、輻射邊界、求解設定與掃頻，送 AEDT 求解。
4. 完成後顯示：**S11 曲線**（含共振頻率與 −10 dB 頻寬）與 **遠場輻射方向圖**（極座標，標示峰值增益與角度）。

驗證輸出是否合理：2.4 GHz 的半波長偶極，共振頻率應落在 2.2～2.5 GHz，峰值增益約 2～2.2 dBi
且出現在 Theta = 90°（天線側向），Theta = 0°／180°（天線軸向）應為深零點。

### Mechanical · 懸臂樑

1. 設定樑的長／寬／高、材料（鋼／鋁／鈦）、自由端集中力。
2. 左側同步顯示理論值：σ = FLc/I、δ = FL³/3EI、安全係數。
3. 求解完成後顯示 von Mises 最大應力、總變形、安全係數與應力雲圖，可與理論值對照。

### Fluent · 混合三通

1. 設定管半徑、臂長，以及冷／熱兩側的流速與溫度。
2. 左側顯示理論估算：質量守恆 + 能量守恆的混合溫度、出口流速、雷諾數與流態。
3. 求解流程：PyAnsys Geometry 建幾何 → PyPrimeMesh 產生體網格 → Fluent solver 求解（能量方程 + k-ε 紊流）。
4. 完成後顯示出口混合溫度、出口流速與溫度雲圖。

## 結束服務

在啟動視窗按 **Ctrl+C**，或直接**關閉該視窗**即可。服務是前景程序，視窗關掉就一併結束，
不會留下背景程序繼續佔用連接埠 8017。

## 隱私與資料

- 服務只綁定 **127.0.0.1（本機迴路位址）**，同網段的其他電腦連不進來。
- 所有幾何、網格、求解與後處理都在你自己的電腦上執行，**不會上傳任何資料到外部**。
- 唯一需要網路的時機是第一次安裝 Python 套件。
- 模擬產出的專案檔存放在你自行指定的輸出資料夾（介面上可選），預設是 `backend\projects`，
  這個資料夾已被 `.gitignore` 排除，不會意外進到版控。

## 已修正的重大問題（2026-07-31）

早期版本的 Fluent 結果**完全不可信**，出口流速會出現 10723 m/s 這種離譜數值。
當時把原因誤判為「網格太粗＋疊代未收斂」，實際上是**邊界 zone 的名稱貼到了錯誤的面**：

- `mesh_with_prime()` 假設 Prime 的 `get_face_zonelets()` 會依 STL 內 solid 的寫入順序回傳 zonelet。
  **這個假設是錯的**——Prime 實際上是「先回傳壁面、再回傳開口」，而且 Prime 匯入 STL 後
  **不會保留 solid 名稱**（`part.get_labels()` 回傳空陣列）。
- 結果是求解器把 3 m/s 與 5 m/s **從管壁吹進來**，而兩個真正的開口被當成牆封死。
  當時的防呆只檢查「zonelet 數量是否相符」（5 個對 5 個），完全沒擋下來。
- 連帶地，早期記載的「出口溫度 34.78 °C」也**從來不是有效的混合溫度**。

已修正的內容：

| 問題 | 修法 |
| --- | --- |
| zone 名稱張冠李戴（主因） | 改用**包圍盒幾何辨識**（開口在某一軸退化、位置等於臂長），不依賴任何順序 |
| STL 非 watertight、圓管只有約 12 邊 | `TessellationOptions(watertight=True, max_edge_length=r/4)` |
| 只調體網格尺寸會讓 Prime 崩潰 | 表面與體網格共用同一目標尺寸（`_target_cell_size_m()`） |
| 混合溫度用面積加權（定義就錯） | 改用**質量加權平均**（`surface-massavg`） |
| 沒有任何物理健檢 | 新增開口面積健檢與質量守恆檢查，不通過就中止 |

修正後實測（冷 3 m/s 25 °C、熱 5 m/s 55 °C、r=20 mm、400 步）：

| 項目 | 理論值 | 實測 | 誤差 |
| --- | --- | --- | --- |
| 出口混合溫度 | 43.75 °C | **43.751 °C** | 0.003 % |
| 出口平均流速 | 8.00 m/s | **8.017 m/s** | 0.2 % |
| 質量不平衡 | 0 | **0.0001 %** | — |

`reversed flow`、`temperature limited`、`turbulent viscosity limited` 警告皆為 0 次（修正前分別是 300／165／300 次）。

## 已知限制（誠實說明）

- 網格為約 13800 個格點、管徑方向約 8 格，**沒有邊界層**。用於教學示範與趨勢判讀足夠，
  但壁面剪應力、壓損等對近壁解析敏感的量不建議直接引用。
- 出口距離 T 型接合處僅約 3 倍管徑，屬於偏短的出口段。目前設定下已無回流警告，
  但若大幅提高流速或改變幾何比例，建議把「管臂長度」調大以避免回流影響出口讀值。
- Mechanical 使用內建 `Structural Steel` 求解後再依所選材料的 E 換算變形（線彈性下 von Mises 應力與 E 無關），
  刻意避開最容易出錯的外部材料 XML。

## 常見問題

**Q：按了 `start.bat` 視窗一閃就關掉？**
A：請確認已把 ZIP **完整解壓縮**，而不是在壓縮檔內直接執行。另外請確認 `start.ps1` 與 `start.bat` 在同一層資料夾。

**Q：服務起來了，但瀏覽器沒有自動開啟？**
A：先確認命令視窗最後有沒有印出綠色的「服務已就緒，已開啟瀏覽器」。
若印的是紅色訊息，下面會直接列出網址，複製到瀏覽器即可（<http://127.0.0.1:8017>）。
早期版本曾因為用 `Start-Job` 開瀏覽器，被防毒軟體（實測 WithSecure Client Security）
判定為 `Trojan:AMSI/SuspiciousExecute.A` 而攔截，導致瀏覽器無聲無息不開；
目前版本已改為不產生任何 PowerShell 子程序的作法，並且失敗時一定會把網址印出來。

**Q：出現「連接埠 8017 已被佔用」？**
A：訊息會一併列出佔用的程序名稱與 PID。請自行確認那個程序是什麼再決定是否關閉——
本腳本刻意**不會**自動終止未知程序。最常見的原因是上一次的服務沒關乾淨。

**Q：公司政策封鎖 WinGet，無法自動安裝 Python？**
A：請手動安裝 64 位元 Python 3.10／3.11／3.12（<https://www.python.org/downloads/windows/>），
安裝時勾選「Add python.exe to PATH」，然後重新執行 `start.bat`。

**Q：套件安裝失敗？**
A：多半是公司 Proxy 或防火牆擋住 PyPI。請洽 IT 取得 Proxy 設定，或在有網路的環境完成第一次啟動後再帶著整個資料夾離線使用。

**Q：求解按下去顯示找不到 ANSYS？**
A：本工具不含 ANSYS 本體。請確認對應的商業軟體已安裝且授權有效（見「系統需求」）。

## 專案結構

```
ansys-gs-hub/
├─ start.bat                     一鍵啟動（UTF-8 無 BOM）
├─ start.ps1                     實際的啟動邏輯（UTF-8 with BOM）
├─ backend/
│  ├─ app/
│  │  ├─ main.py                 FastAPI 入口，並掛載 frontend/dist
│  │  ├─ models.py               Pydantic 資料模型
│  │  ├─ domains/                三個領域的 adapter（幾何計算 + 求解驅動）
│  │  └─ routers/                geometry / run(WebSocket) / fs 路由
│  ├─ scripts/                   以子行程執行的求解腳本（Mechanical、Fluent）
│  └─ requirements.lock.txt      實測鎖定的套件版本
├─ frontend/
│  ├─ src/                       React + TypeScript 原始碼
│  └─ dist/                      已建置的 production 前端（已進版控，故不需 Node.js）
├─ docs/
│  └─ 操作說明.md                 完整中文操作說明
└─ HANDOFF.md                    開發交接文件：技術決策、踩過的坑與完整診斷紀錄
```

## 開發者（需要改程式碼時）

改前端原始碼需要 Node.js 18 以上：

```powershell
cd frontend
npm ci
npm run dev
```

開發模式前端在 5193 埠、後端在 8017 埠（Vite 會代理 `/api` 與 `/ws`）。
**改完後務必重新 `npm run build`**，因為發布用的是 `frontend/dist` 而不是原始碼。

`HANDOFF.md` 記錄了完整的技術決策脈絡與踩過的坑（特別是 Fluent 為什麼不用 Fluent Meshing、
PyAEDT 遠場資料的正確取值方式、以及 allotment 巢狀導致面板塌陷的陷阱），改動前建議先讀。

## 字型

介面中文使用微軟正黑體（Microsoft JhengHei），英數使用 Calibri，設定於 `frontend/src/styles.css`。

---

本 Repository 為 Jeff Hong 個人技術作品集之公開展示內容，非 Taiwan Auto-Design Co.（TADC，虎門科技）官方帳號，亦非 Ansys, Inc. 官方合作項目；Ansys、HFSS、SIwave 為 Ansys, Inc. 之商標。原始碼與內容僅供技術展示，未經授權不得商業使用、散布或製作衍生作品，詳見 [LICENSE](LICENSE)。如需授權或合作，請洽 jeff.hong@cadmen.com。
