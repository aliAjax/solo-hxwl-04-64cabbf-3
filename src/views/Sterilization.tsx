import { useMemo, useState } from "react";
import { useStore } from "../store";
import { allMonitorsRecorded, createSterBatch, recordMonitors, stageOf, quarantineImpact } from "../domain";
import type { MonitorResult, Monitors, SterBatch } from "../types";
import { MONITOR_LABELS } from "../types";
import { fmtDateTime, nowLocalInput } from "../utils";
import { Empty, Field, MonitorBadge, ToastBar, useToast } from "../ui";

type Form = { physical: MonitorResult; chemical: MonitorResult; biological: MonitorResult; physicalNote: string; chemicalNote: string; biologicalNote: string };
const blankForm: Form = { physical: "pending", chemical: "pending", biological: "pending", physicalNote: "", chemicalNote: "", biologicalNote: "" };

function BatchDetail({ batch }: { batch: SterBatch }) {
  const { state, commit } = useStore();
  const { toast, notify } = useToast();
  const [form, setForm] = useState<Form>({
    physical: batch.monitors.physical,
    chemical: batch.monitors.chemical,
    biological: batch.monitors.biological,
    physicalNote: batch.monitors.physicalNote ?? "",
    chemicalNote: batch.monitors.chemicalNote ?? "",
    biologicalNote: batch.monitors.biologicalNote ?? "",
  });
  const [impact, setImpact] = useState<ReturnType<typeof quarantineImpact> | null>(
    batch.status === "quarantined" ? quarantineImpact(state, batch.id) : null
  );

  const monitors: Monitors = {
    physical: form.physical,
    chemical: form.chemical,
    biological: form.biological,
    physicalNote: form.physicalNote || undefined,
    chemicalNote: form.chemicalNote || undefined,
    biologicalNote: form.biologicalNote || undefined,
  };
  const allRecorded = allMonitorsRecorded(monitors);
  const allPass = form.physical === "pass" && form.chemical === "pass" && form.biological === "pass";

  const submit = () => {
    const r = recordMonitors(state, batch.id, monitors);
    notify(r.result.ok, r.result.message);
    if (r.result.ok) {
      commit(r.state);
      if (r.affected) setImpact(r.affected);
    }
  };

  return (
    <article className={`batch-card ${batch.status === "quarantined" ? "batch-danger" : batch.status === "released" ? "batch-ok" : ""}`}>
      <ToastBar toast={toast} />
      <header className="batch-head">
        <div>
          <h3>{batch.id} <span className="muted">· {batch.sterilizer} · {batch.operator}</span></h3>
          <p className="muted">灭菌时间 {fmtDateTime(batch.cycleAt)} · 装载 {batch.packageIds.length} 个器械包</p>
        </div>
        <div>
          {batch.status === "monitoring" && <span className="badge badge-amber">监测中</span>}
          {batch.status === "released" && <span className="badge badge-green">已放行 {fmtDateTime(batch.releasedAt)}</span>}
          {batch.status === "quarantined" && <span className="badge badge-red">整批隔离 {fmtDateTime(batch.quarantinedAt)}</span>}
        </div>
      </header>

      <div className="pkg-tags">
        {batch.packageIds.map((id) => {
          const p = state.packages.find((x) => x.id === id);
          return <span key={id} className="mini-tag">{id} {p?.name ?? ""}</span>;
        })}
      </div>

      {batch.status === "monitoring" && (
        <>
          <div className="monitor-grid">
            {MONITOR_LABELS.map(({ key, label }) => {
              const noteKey = `${key}Note` as "physicalNote" | "chemicalNote" | "biologicalNote";
              return (
                <div key={key} className="monitor-cell">
                  <div className="monitor-label">
                    <b>{label}</b>
                    <MonitorBadge value={form[key]} />
                  </div>
                  <select value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value as MonitorResult }))}>
                    <option value="pending">待录入</option>
                    <option value="pass">通过</option>
                    <option value="fail">不合格</option>
                  </select>
                  <input placeholder="监测备注（温度曲线 / 指示卡 / 培养）" value={form[noteKey]} onChange={(e) => setForm((f) => ({ ...f, [noteKey]: e.target.value }))} />
                </div>
              );
            })}
          </div>
          {!allRecorded && <p className="warn-text">三项监测均需录入后才能判定；当前有“待录入”项，整批保持隔离不可发放。</p>}
          {allRecorded && !allPass && (
            <p className="danger-text">存在不合格项：提交后整批立即隔离，{batch.packageIds.length} 个器械包禁止发放，并生成影响范围。</p>
          )}
          {allRecorded && allPass && <p className="ok-text">三项监测全部通过：提交后放行，本锅器械包可发放。</p>}
          <div className="form-actions">
            <button className="primary-action" onClick={submit} disabled={!allRecorded}>提交监测结果判定</button>
          </div>
        </>
      )}

      {batch.status !== "monitoring" && (
        <div className="monitor-grid monitor-grid-readonly">
          {MONITOR_LABELS.map(({ key, label }) => {
            const noteKey = `${key}Note` as "physicalNote" | "chemicalNote" | "biologicalNote";
            return (
              <div key={key} className="monitor-cell">
                <div className="monitor-label"><b>{label}</b><MonitorBadge value={batch.monitors[key]} /></div>
                <p className="muted small">{batch.monitors[noteKey] || "—"}</p>
              </div>
            );
          })}
        </div>
      )}

      {batch.status === "quarantined" && (
        <div className="impact-box">
          <h4>⛔ 隔离影响范围（{batch.quarantineReason}）</h4>
          <p><b>禁止发放器械包 {impact?.packages.length ?? 0} 个：</b></p>
          <ul>
            {(impact?.packages ?? []).map((p) => p && <li key={p.id}>{p.id} {p.name}（{p.contents}）— 当前状态：{stageOf(state, p.id) === "quarantined" ? "已隔离" : "随批冻结"}</li>)}
          </ul>
          <p><b>关联发放记录 {impact?.issues.length ?? 0} 条</b>（未放行前无法发放，故正常为空；如有存量则自动转待追踪）。</p>
        </div>
      )}
    </article>
  );
}

export default function Sterilization() {
  const { state, commit } = useStore();
  const { toast, notify } = useToast();
  const [sterilizer, setSterilizer] = useState("高压灭菌器 A");
  const [operator, setOperator] = useState("");
  const [cycleAt, setCycleAt] = useState(nowLocalInput());
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const available = useMemo(() => state.packages.filter((p) => stageOf(state, p.id) === "washed"), [state]);
  const chosen = state.packages.filter((p) => picked[p.id]);

  const submit = () => {
    const r = createSterBatch(state, { sterilizer, operator, packageIds: chosen.map((p) => p.id), cycleAt });
    notify(r.result.ok, r.result.message);
    if (r.result.ok) {
      commit(r.state);
      setPicked({});
    }
  };

  const batches = [...state.sterBatches].sort((a, b) => b.cycleAt.localeCompare(a.cycleAt));

  return (
    <div className="stack-gap">
      <ToastBar toast={toast} />
      <section className="panel">
        <div className="section-heading">
          <div><p className="eyebrow-sm">灭菌装载</p><h2>新建灭菌锅次</h2></div>
        </div>
        <div className="field-grid field-grid-3">
          <Field label="灭菌器"><input value={sterilizer} onChange={(e) => setSterilizer(e.target.value)} /></Field>
          <Field label="装载人"><input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="如 王护士" /></Field>
          <Field label="灭菌时间"><input type="datetime-local" value={cycleAt} onChange={(e) => setCycleAt(e.target.value)} /></Field>
        </div>
        <p className="picker-title">选择已完成清洗待灭菌的器械包（{chosen.length} 个已选）：</p>
        {available.length === 0 ? (
          <Empty title="暂无待灭菌器械包" desc="请先在“清洗批次”中结束一个批次。" />
        ) : (
          <div className="pick-grid">
            {available.map((p) => (
              <button key={p.id} type="button" className={`pick-card ${picked[p.id] ? "pick-on" : ""}`} onClick={() => setPicked((m) => ({ ...m, [p.id]: !m[p.id] }))}>
                <b>{p.id}</b><span>{p.name}</span>
                <span className="muted small">来自清洗批次 {p.washBatchId}</span>
              </button>
            ))}
          </div>
        )}
        <div className="form-actions">
          <button className="primary-action" onClick={submit} disabled={chosen.length === 0}>装载并创建锅次</button>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div><p className="eyebrow-sm">灭菌锅次（{state.sterBatches.length}）</p><h2>物理 / 化学 / 生物监测</h2></div>
        </div>
        {batches.length === 0 ? (
          <Empty title="暂无灭菌锅次" />
        ) : (
          <div className="batch-list">
            {batches.map((b) => <BatchDetail key={b.id} batch={b} />)}
          </div>
        )}
      </section>
    </div>
  );
}
