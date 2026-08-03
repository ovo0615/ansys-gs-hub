// ANSYS Getting-Started Hub：領域分頁（HFSS / Mechanical / Fluent）+ 選單列（檢視：隱藏/顯示系統日誌）。
// 選單列樣式與互動模式取自「PCB SI 3D 模擬分析工具」的前端。
// 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

import { useState } from "react";
import DipolePanel from "./domains/hfss/DipolePanel";
import BracketPanel from "./domains/mechanical/BracketPanel";
import TeePanel from "./domains/fluent/TeePanel";

type DomainKey = "hfss" | "mechanical" | "fluent";

const TABS: { key: DomainKey; label: string; badge?: string }[] = [
  { key: "hfss", label: "HFSS · 偶極天線" },
  { key: "mechanical", label: "Mechanical · 懸臂樑靜態結構" },
  { key: "fluent", label: "Fluent · 混合三通" },
];

export default function App() {
  const [active, setActive] = useState<DomainKey>("hfss");
  const [showLogs, setShowLogs] = useState(true);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const menus: Record<string, { label: string; action: () => void; disabled?: boolean }[]> = {
    "檢視": [
      { label: showLogs ? "隱藏系統日誌" : "顯示系統日誌", action: () => setShowLogs(!showLogs) },
    ],
    "說明": [
      {
        label: "關於本工具",
        action: () =>
          alert(
            "ANSYS Getting-Started Hub\n\n" +
              "HFSS 偶極天線、Mechanical 懸臂樑靜態結構、Fluent 混合三通三個領域的入門模擬示範。\n\n" +
              "此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供"
          ),
      },
    ],
  };

  return (
    <div className="app-shell" onClick={() => setOpenMenu(null)}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 className="app-title">ANSYS Getting-Started Hub</h1>
          <p className="app-sub">
            即時 3D 預覽 + 本機求解器驅動的基本模擬示範。此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。
          </p>
        </div>
        <img
          src="/logo.png"
          alt="虎門科技"
          style={{ height: "80px", objectFit: "contain", marginLeft: "24px", display: "block", mixBlendMode: "multiply" }}
        />
      </header>

      {/* 選單列 */}
      <nav className="menubar" onClick={(e) => e.stopPropagation()}>
        {Object.entries(menus).map(([name, entries]) => (
          <div key={name} className="menubar__item">
            <button
              className={"menubar__btn" + (openMenu === name ? " menubar__btn--open" : "")}
              onClick={() => setOpenMenu(openMenu === name ? null : name)}
              onMouseEnter={() => {
                if (openMenu) setOpenMenu(name);
              }}
            >
              {name}
            </button>
            {openMenu === name && (
              <div className="menubar__dropdown">
                {entries.map((entry) => (
                  <button
                    key={entry.label}
                    className="menubar__entry"
                    disabled={entry.disabled}
                    onClick={() => {
                      setOpenMenu(null);
                      entry.action();
                    }}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <nav className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`tab ${active === tab.key ? "tab--active" : ""}`}
          >
            {tab.label}
            {tab.badge && <span className="tab__badge">{tab.badge}</span>}
          </button>
        ))}
      </nav>

      <main style={{ flex: 1, minHeight: 0 }}>
        {active === "hfss" && <DipolePanel showLogs={showLogs} setShowLogs={setShowLogs} />}
        {active === "mechanical" && <BracketPanel showLogs={showLogs} setShowLogs={setShowLogs} />}
        {active === "fluent" && <TeePanel showLogs={showLogs} setShowLogs={setShowLogs} />}
      </main>
    </div>
  );
}
