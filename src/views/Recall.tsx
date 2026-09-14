import { useMemo, useState } from "react";
import { useStore } from "../store";
import { affectedIssuesOfRecall, confirmTracking, laterIssuesInSameCycle, recallBatch } from "../domain";
import { fmtDateTime } from "../utils";
import { Empty, Field, ToastBar, useToast } from "../ui";

export default function Recall() {
  const { state, commit } = useStore();
  const { toast, notify } = useToast();
  const [batchId, setBatchId] = useState("");
  const [anchorIssueId, setAnchorIssueId] = useState("");
  const [reason, setReason] = useState("");
  const [lastBatch, setLastBatch] = useState<string | null>(null);

  const batch = state.sterBatches.find((b) => b.id === batchId) ?? null;
  const batchIssues = useMemo(() => (batchId ? affectedIssuesOfRecall(state, batchId) : []), [state, batchId]);
  const later = useMemo(() => (batchId && anchorIssueId ? laterIssuesInSameCycle(state, batchId, anchorIssueId) : []), [state, batchId, anchorIssueId]);
  const unreturned = useMemo(() => batchIssues.filter((i) => !i.returnedAt), [batchIssues]);

  const submit = () => {
    if (!batchId) {
      notify(false, "请选择要召回的灭菌锅次");
      return;
    }
    const r = recallBatch(state, batchId, reason, anchorIssueId || undefined);
    notify(r.result.ok, r.result.message);
    if (r.result.ok) {
      commit(r.state);
      setLastBatch(batchId);
      setReason("");
    }
  };

  const confirmOne = (id: string) => {
    const r = confirmTracking(state, id, "已联系椅位收回并停用");
    notify(r.result.ok, r.result.message);
    if (r.result.ok) commit(r.state);
  };

  const pending = state.issues.filter((i) => i.tracking === "to-track");
  const shownAffected = lastBatch ? affectedIssuesOfRecall(state, lastBatch) : [];

  return (
    <div className="stack-gap">
      <ToastBar toast={toast} />
      <section className="panel">
        <div className="section-heading">
          <div><p className="eyebrow-sm">按批次召回</p><h2>灭菌锅次召回</h2></div>
        </div>
        <div className="field-grid field-grid-3">
          <Field label="召回锅次">
            <select value={batchId} onChange={(e) => { setBatchId(e.target.value); setAnchorIssueId(""); }}>
              <option value="">请选择…</option>
              {state.sterBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} · {b.sterilizer} · {fmtDateTime(b.cycleAt)}{b.recalledAt ? "（已召回）" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="起始发放（可选）" hint="设置后，同锅次该发放之后的发放全部标为待追踪">
            <select value={anchorIssueId} onChange={(e) => setAnchorIssueId(e.target.value)} disabled={!batchId || batchIssues.length === 0}>
              <option value="">不指定（全部未归还发放）</option>
              {batchIssues.map((i) => <option key={i.id} value={i.id}>{i.id} · {i.chair} · {fmtDateTime(i.issuedAt)}</option>)}
            </select>
          </Field>
          <Field label="召回原因">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如 生物监测复核阳性" />
          </Field>
        </div>

        {batch && (
          <div className="impact-box impact-warn">
            <h4>预览：锅次 {batch.id} 影响范围</h4>
            <p>锅次内器械包 {batch.packageIds.length} 个：{batch.packageIds.join("、")}</p>
            <p>关联发放记录 {batchIssues.length} 条，其中：</p>
            <ul>
              <li>未归还（必定标待追踪）{unreturned.length} 条</li>
              {anchorIssueId && <li>相对 {anchorIssueId} 的同锅次后续发放 {later.length} 条：{later.map((i) => i.id).join("、") || "无"}</li>}
              {batch.recalledAt && <li className="danger-text">该锅次已召回，不能重复操作</li>}
            </ul>
          </div>
        )}

        <div className="form-actions">
          <button className="danger-action" onClick={submit} disabled={!batchId || !!batch?.recalledAt}>执行批次召回</button>
        </div>
      </section>

      {lastBatch && (
        <section className="panel">
          <div className="section-heading">
            <div><p className="eyebrow-sm">最近一次召回</p><h2>{lastBatch} 受影响记录</h2></div>
          </div>
          <RecallTable issues={shownAffected} state={state} onConfirm={confirmOne} />
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div><p className="eyebrow-sm">追踪队列（{pending.length}）</p><h2>待追踪发放</h2></div>
        </div>
        {pending.length === 0 ? (
          <Empty title="暂无待追踪记录" desc="召回后，同锅次的后续发放会自动进入此队列。" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>发放号</th><th>器械包</th><th>锅次</th><th>椅位</th><th>发放时间</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {pending.map((i) => {
                  const pkg = state.packages.find((p) => p.id === i.packageId);
                  return (
                    <tr key={i.id} className="row-danger">
                      <td className="mono strong">{i.id}</td>
                      <td>{i.packageId} <span className="muted">{pkg?.name}</span></td>
                      <td className="mono">{i.sterBatchId}</td>
                      <td className="strong">{i.chair}</td>
                      <td className="nowrap">{fmtDateTime(i.issuedAt)}</td>
                      <td><span className="badge badge-red">待追踪</span></td>
                      <td><button className="primary-action" onClick={() => confirmOne(i.id)}>确认已追踪</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function RecallTable({ issues, state, onConfirm }: {
  issues: { id: string; packageId: string; sterBatchId: string; chair: string; issuedAt: string; returnedAt: string | null; tracking: "normal" | "to-track" | "confirmed"; trackedNote: string | null }[];
  state: ReturnType<typeof useStore>["state"];
  onConfirm: (id: string) => void;
}) {
  if (issues.length === 0) return <Empty title="该锅次暂无发放记录" desc="锅次内器械包仍处于库存冻结状态。" />;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>发放号</th><th>器械包</th><th>椅位</th><th>发放时间</th><th>归还</th><th>追踪状态</th><th>操作</th></tr></thead>
        <tbody>
          {issues.map((i) => (
            <tr key={i.id} className={i.tracking === "to-track" ? "row-danger" : ""}>
              <td className="mono strong">{i.id}</td>
              <td>{i.packageId} <span className="muted">{state.packages.find((p) => p.id === i.packageId)?.name}</span></td>
              <td className="strong">{i.chair}</td>
              <td className="nowrap">{fmtDateTime(i.issuedAt)}</td>
              <td>{i.returnedAt ? "已归还" : "使用中"}</td>
              <td>
                {i.tracking === "normal" && <span className="muted">未受影响</span>}
                {i.tracking === "to-track" && <span className="badge badge-red">待追踪</span>}
                {i.tracking === "confirmed" && <span className="badge badge-green">已确认</span>}
              </td>
              <td>{i.tracking === "to-track" && <button onClick={() => onConfirm(i.id)}>确认追踪</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
