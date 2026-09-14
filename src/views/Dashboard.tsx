import { useMemo } from "react";
import { useStore } from "../store";
import { affectedIssuesOfRecall, expiryOf, stageOf } from "../domain";
import { fmtDateTime } from "../utils";

export default function Dashboard() {
  const { state } = useStore();

  const stats = useMemo(() => {
    const now = Date.now();
    let inWash = 0, monitoring = 0, released = 0, issued = 0, quarantined = 0, expired = 0, pendingTrack = 0;
    for (const p of state.packages) {
      const s = stageOf(state, p.id);
      if (s === "washing") inWash++;
      if (s === "sterilizing") monitoring++;
      if (s === "released") released++;
      if (s === "issued") issued++;
      if (s === "quarantined") quarantined++;
      const exp = expiryOf(state, p.id);
      if (exp && new Date(exp).getTime() < now) expired++;
    }
    for (const b of state.sterBatches) {
      if (b.recalledAt) pendingTrack += affectedIssuesOfRecall(state, b.id).filter((i) => i.tracking === "to-track").length;
    }
    return { inWash, monitoring, released, issued, quarantined, expired, pendingTrack };
  }, [state]);

  const cards = [
    { label: "清洗中批次内器械包", value: stats.inWash, cls: "metric-blue" },
    { label: "灭菌监测中", value: stats.monitoring, cls: "metric-amber" },
    { label: "已放行待发放", value: stats.released, cls: "metric-green" },
    { label: "使用中", value: stats.issued, cls: "metric-purple" },
    { label: "隔离器械包", value: stats.quarantined, cls: "metric-red" },
    { label: "已过有效期", value: stats.expired, cls: "metric-red" },
    { label: "待追踪发放", value: stats.pendingTrack, cls: "metric-red" },
    { label: "累计登记器械包", value: state.packages.length, cls: "metric-slate" },
  ];

  const recent = [...state.issues].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).slice(0, 5);
  const recalled = state.sterBatches.filter((b) => b.recalledAt);

  return (
    <div className="stack-gap">
      <div className="metrics-grid metrics-grid-8">
        {cards.map((c) => (
          <article key={c.label} className={`metric-card metric-tile ${c.cls}`}>
            <span>{c.label}</span>
            <strong>{c.value}</strong>
          </article>
        ))}
      </div>

      <div className="two-col">
        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow-sm">发放动态</p><h2>最近发放</h2></div></div>
          {recent.length === 0 && <p className="muted">暂无发放记录</p>}
          <div className="record-list">
            {recent.map((i) => {
              const pkg = state.packages.find((p) => p.id === i.packageId);
              return (
                <article key={i.id} className="record-card">
                  <div className="record-index">{i.chair.replace(/[^0-9０-９]/g, "").slice(0, 2) || "椅"}</div>
                  <div>
                    <h3>{i.packageId} {pkg?.name}</h3>
                    <p>
                      {i.chair} · {fmtDateTime(i.issuedAt)} · 锅次 {i.sterBatchId}
                      {i.tracking === "to-track" && <span className="badge badge-red ml8">待追踪</span>}
                      {i.tracking === "confirmed" && <span className="badge badge-green ml8">已确认</span>}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow-sm">风险看板</p><h2>召回与隔离</h2></div></div>
          {recalled.length === 0 && stats.quarantined === 0 && <p className="muted">当前无召回或隔离事件</p>}
          <div className="record-list">
            {state.sterBatches.filter((b) => b.status === "quarantined").map((b) => (
              <article key={b.id} className="record-card danger-card">
                <div className="record-index record-index-danger">隔</div>
                <div>
                  <h3>{b.id} 整批隔离</h3>
                  <p>{b.quarantineReason} · 涉及 {b.packageIds.length} 个器械包 · {fmtDateTime(b.quarantinedAt)}</p>
                </div>
              </article>
            ))}
            {recalled.map((b) => (
              <article key={b.id} className="record-card danger-card">
                <div className="record-index record-index-danger">召</div>
                <div>
                  <h3>{b.id} 已召回</h3>
                  <p>{b.recallReason} · {fmtDateTime(b.recalledAt)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
