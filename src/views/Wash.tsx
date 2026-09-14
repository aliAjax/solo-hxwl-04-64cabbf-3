import { useMemo, useState } from "react";
import { useStore } from "../store";
import { createWashBatch, endWashBatch, stageOf } from "../domain";
import { fmtDateTime, nowLocalInput } from "../utils";
import { Empty, Field, StageBadge, ToastBar, useToast } from "../ui";

export default function Wash() {
  const { state, commit } = useStore();
  const { toast, notify } = useToast();
  const [washer, setWasher] = useState("清洗消毒机 1 号");
  const [operator, setOperator] = useState("");
  const [startedAt, setStartedAt] = useState(nowLocalInput());
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  // 只有“已登记 / 已归还”的器械包可入新批
  const available = useMemo(
    () => state.packages.filter((p) => ["registered", "returned"].includes(stageOf(state, p.id))),
    [state]
  );
  const chosen = state.packages.filter((p) => picked[p.id]);

  const toggle = (id: string) => setPicked((m) => ({ ...m, [id]: !m[id] }));

  const submit = () => {
    const ids = chosen.map((p) => p.id);
    const r = createWashBatch(state, { washer, operator, packageIds: ids, startedAt });
    notify(r.result.ok, r.result.message);
    if (r.result.ok) {
      commit(r.state);
      setPicked({});
    }
  };

  const finish = (id: string) => {
    const r = endWashBatch(state, id);
    notify(r.result.ok, r.result.message);
    if (r.result.ok) commit(r.state);
  };

  const batches = [...state.washBatches].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return (
    <div className="stack-gap">
      <ToastBar toast={toast} />
      <section className="panel">
        <div className="section-heading">
          <div><p className="eyebrow-sm">清洗批次登记</p><h2>新建清洗批次</h2></div>
        </div>
        <div className="field-grid field-grid-3">
          <Field label="清洗设备"><input value={washer} onChange={(e) => setWasher(e.target.value)} /></Field>
          <Field label="登记人"><input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="如 李护士" /></Field>
          <Field label="登记时间"><input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} /></Field>
        </div>

        <p className="picker-title">选择入批器械包（{chosen.length} 个已选）——同一器械包在未结束批次中不会再次出现：</p>
        {available.length === 0 ? (
          <Empty title="暂无可入批器械包" desc="需先登记器械包，或等待使用中的器械包归还。" />
        ) : (
          <div className="pick-grid">
            {available.map((p) => (
              <button key={p.id} type="button" className={`pick-card ${picked[p.id] ? "pick-on" : ""}`} onClick={() => toggle(p.id)}>
                <b>{p.id}</b>
                <span>{p.name}</span>
                <StageBadge stage={stageOf(state, p.id)} />
              </button>
            ))}
          </div>
        )}

        <div className="form-actions">
          <button className="primary-action" onClick={submit} disabled={chosen.length === 0}>登记清洗批次</button>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div><p className="eyebrow-sm">清洗台账（{state.washBatches.length}）</p><h2>批次列表</h2></div>
        </div>
        {batches.length === 0 ? (
          <Empty title="暂无清洗批次" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>批次号</th><th>设备 / 登记人</th><th>登记时间</th><th>结束时间</th><th>器械包</th><th>操作</th></tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className={b.endedAt ? "" : "row-open"}>
                    <td data-label="批次号" className="mono strong">{b.id}</td>
                    <td data-label="设备 / 登记人">{b.washer}<br /><span className="muted">{b.operator}</span></td>
                    <td data-label="登记时间" className="nowrap">{fmtDateTime(b.startedAt)}</td>
                    <td data-label="结束时间" className="nowrap">{b.endedAt ? fmtDateTime(b.endedAt) : <span className="badge badge-amber">未结束</span>}</td>
                    <td data-label="器械包">{b.packageIds.map((id) => <span key={id} className="mini-tag">{id}</span>)}</td>
                    <td data-label="操作">
                      {!b.endedAt && <button onClick={() => finish(b.id)}>结束批次</button>}
                      {b.endedAt && <span className="muted">已完成</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
