import { useMemo, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { expiryOf, stageOf } from "../domain";
import { fmtDateTime } from "../utils";
import { Empty, MonitorBadge, StageBadge } from "../ui";
import { MONITOR_LABELS } from "../types";

export default function Trace() {
  const { state } = useStore();
  const [q, setQ] = useState("");
  // 支持通过 ?pkg=PKG-0001 直接打开某器械包追溯链（便于分享链接）
  const [pkgId, setPkgId] = useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("pkg") ?? "" : ""
  );

  const query = q.trim().toUpperCase();
  const results = useMemo(() => {
    if (!query) return [];
    return state.packages.filter((p) => p.id.toUpperCase().includes(query) || p.name.toUpperCase().includes(query)).slice(0, 8);
  }, [state, query]);

  const p = state.packages.find((x) => x.id === pkgId) ?? null;
  const wash = p?.washBatchId ? state.washBatches.find((b) => b.id === p.washBatchId) ?? null : null;
  const ster = p?.sterBatchId ? state.sterBatches.find((b) => b.id === p.sterBatchId) ?? null : null;
  const issues = p ? state.issues.filter((i) => i.packageId === p.id).sort((a, b) => a.issuedAt.localeCompare(b.issuedAt)) : [];

  const steps: { title: string; done: boolean; node: ReactNode }[] = p
    ? [
        {
          title: "器械包登记",
          done: true,
          node: <p className="muted">{p.id} · {p.name} · {p.contents}<br />登记时间 {fmtDateTime(p.createdAt)} · 灭菌有效期 {p.validDays} 天</p>,
        },
        {
          title: "清洗批次",
          done: !!wash,
          node: wash ? (
            <p className="muted">{wash.id} · {wash.washer} · {wash.operator}<br />登记 {fmtDateTime(wash.startedAt)} · {wash.endedAt ? `结束 ${fmtDateTime(wash.endedAt)}` : "未结束"}</p>
          ) : <p className="muted">尚未进入清洗批次</p>,
        },
        {
          title: "灭菌锅次",
          done: !!ster,
          node: ster ? (
            <div className="muted">
              <p>{ster.id} · {ster.sterilizer} · {ster.operator} · 灭菌 {fmtDateTime(ster.cycleAt)}</p>
              <div className="monitor-inline">
                {MONITOR_LABELS.map(({ key, label }) => (
                  <span key={key} className="monitor-chip">{label} <MonitorBadge value={ster.monitors[key]} /></span>
                ))}
              </div>
              {ster.status === "quarantined" && <p className="danger-text">⛔ {ster.quarantineReason}，{fmtDateTime(ster.quarantinedAt)} 整批隔离</p>}
              {ster.status === "released" && <p className="ok-text">✓ 三项通过，{fmtDateTime(ster.releasedAt)} 放行{ster.recalledAt ? `；后于 ${fmtDateTime(ster.recalledAt)} 召回（${ster.recallReason}）` : ""}</p>}
              {ster.status === "monitoring" && <p className="warn-text">监测结果录入中，未放行</p>}
            </div>
          ) : <p className="muted">尚未装载灭菌</p>,
        },
        {
          title: "发放去向",
          done: issues.length > 0,
          node: issues.length === 0 ? (
            <p className="muted">{ster?.status === "released" ? "已放行，尚未发放" : "未放行，不能发放"}</p>
          ) : (
            <div className="issue-chain">
              {issues.map((i) => (
                <div key={i.id} className="issue-chain-item">
                  <b>{i.id}</b> → {i.chair} · 发放 {fmtDateTime(i.issuedAt)}
                  {i.returnedAt ? ` · 归还 ${fmtDateTime(i.returnedAt)}` : " · 使用中"}
                  {i.tracking === "to-track" && <span className="badge badge-red ml8">待追踪</span>}
                  {i.tracking === "confirmed" && <span className="badge badge-green ml8">已确认追踪</span>}
                  {i.trackedNote && <span className="muted">（{i.trackedNote}）</span>}
                </div>
              ))}
            </div>
          ),
        },
      ]
    : [];

  return (
    <div className="stack-gap">
      <section className="panel">
        <div className="section-heading">
          <div><p className="eyebrow-sm">单包追溯</p><h2>器械包追溯链查询</h2></div>
        </div>
        <div className="trace-search">
          <input placeholder="输入器械包编号或名称，如 PKG-0010 / 根管" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {query && (
          <div className="trace-results">
            {results.length === 0 && <p className="muted">未找到匹配器械包</p>}
            {results.map((r) => (
              <button key={r.id} type="button" className={`pick-card ${r.id === pkgId ? "pick-on" : ""}`} onClick={() => { setPkgId(r.id); setQ(""); }}>
                <b>{r.id}</b><span>{r.name}</span><StageBadge stage={stageOf(state, r.id)} />
              </button>
            ))}
          </div>
        )}
        {!p && <Empty title="选择一个器械包查看完整追溯链" desc="登记 → 清洗 → 灭菌与三项监测 → 放行 → 发放椅位 → 召回追踪，刷新页面后链条仍在。" />}
      </section>

      {p && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow-sm">{p.id}</p>
              <h2>{p.name} <StageBadge stage={stageOf(state, p.id)} /></h2>
            </div>
            <div className="muted">
              {ster ? (() => {
                const exp = expiryOf(state, p.id);
                return exp ? <>有效期至 {fmtDateTime(exp)} {new Date(exp).getTime() < Date.now() && <span className="badge badge-red ml8">已过期</span>}</> : null;
              })() : "尚未灭菌"}
            </div>
          </div>
          <ol className="trace-timeline">
            {steps.map((s, idx) => (
              <li key={idx} className={s.done ? "tl-done" : "tl-todo"}>
                <div className="tl-dot">{idx + 1}</div>
                <div className="tl-body">
                  <h3>{s.title}</h3>
                  {s.node}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
