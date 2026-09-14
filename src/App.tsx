import { useState } from "react";
import "./styles.css";
import { StoreProvider, useStore, isEmptyState } from "./store";
import Dashboard from "./views/Dashboard";
import Packages from "./views/Packages";
import Wash from "./views/Wash";
import Sterilization from "./views/Sterilization";
import Issue from "./views/Issue";
import Recall from "./views/Recall";
import Trace from "./views/Trace";

const TABS = [
  { key: "dashboard", label: "总览" },
  { key: "packages", label: "器械包登记" },
  { key: "wash", label: "清洗批次" },
  { key: "ster", label: "灭菌与监测" },
  { key: "issue", label: "放行发放" },
  { key: "recall", label: "召回追踪" },
  { key: "trace", label: "追溯查询" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function DataBar() {
  const { state, resetDemo, clearAll } = useStore();
  const [confirmClear, setConfirmClear] = useState(false);
  const empty = isEmptyState(state);

  return (
    <div className="data-bar">
      <span className="muted small">数据仅保存在本机浏览器（localStorage），刷新不丢失，无后端</span>
      <div className="data-actions">
        {empty && <button className="primary-action" onClick={resetDemo}>恢复演示数据</button>}
        {!empty && !confirmClear && <button onClick={() => setConfirmClear(true)}>清空数据</button>}
        {!empty && confirmClear && (
          <>
            <span className="warn-text small">确认清空全部台账？</span>
            <button className="danger-action" onClick={() => { clearAll(); setConfirmClear(false); }}>确认清空</button>
            <button onClick={() => setConfirmClear(false)}>取消</button>
          </>
        )}
        <button onClick={resetDemo} title="用内置演示数据覆盖当前数据">重置为演示数据</button>
      </div>
    </div>
  );
}

function Shell() {
  const [tab, setTab] = useState<TabKey>("dashboard");

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-04 · 口腔消毒供应中心（CSSD）· port 5104</p>
          <h1>牙科器械再处理追溯台</h1>
          <p className="subtitle">
            器械包登记 → 清洗批次（同包不得重复入批）→ 灭菌锅次物理/化学/生物三项监测，全过放行、任一失败整批隔离 →
            发放登记椅位与时间（过期/召回拒绝）→ 按批次召回并追踪同锅次后续去向。
          </p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>React 19 + Vite + TypeScript + CSS</strong>
          <span className="muted small">localStorage 持久化 · 无后端依赖</span>
        </div>
      </section>

      <DataBar />

      <nav className="tab-bar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "tab-on" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && <Dashboard />}
      {tab === "packages" && <Packages />}
      {tab === "wash" && <Wash />}
      {tab === "ster" && <Sterilization />}
      {tab === "issue" && <Issue />}
      {tab === "recall" && <Recall />}
      {tab === "trace" && <Trace />}

      <footer className="app-footer">
        追溯链：器械包 → 清洗批次 → 灭菌锅次 → 三项监测 → 放行/隔离 → 发放椅位 → 召回追踪
      </footer>
    </main>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
