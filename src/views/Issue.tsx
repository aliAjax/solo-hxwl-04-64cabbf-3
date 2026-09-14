import { useMemo, useState } from "react";
import { useStore } from "../store";
import { checkIssue, expiryOf, issuePackage, returnPackage, stageOf } from "../domain";
import { fmtDate, fmtDateTime, localInputToIso, nowLocalInput } from "../utils";
import { Empty, Field, ToastBar, useToast } from "../ui";

export default function Issue() {
  const { state, commit } = useStore();
  const { toast, notify } = useToast();
  const [packageId, setPackageId] = useState("");
  const [chair, setChair] = useState("");
  const [issuedAt, setIssuedAt] = useState(nowLocalInput());

  // 可发放：已放行（含已过期，用于现场演示拒绝）；选择时实时给出校验原因
  const releasable = useMemo(
    () => state.packages.filter((p) => stageOf(state, p.id) === "released"),
    [state]
  );
  // 实时校验以“填写的发放时间”为准，避免录入时间晚于有效期仍可保存
  const checkTime = issuedAt ? localInputToIso(issuedAt) : new Date().toISOString();
  const check = packageId ? checkIssue(state, packageId, checkTime) : null;
  const exp = packageId ? expiryOf(state, packageId) : null;

  const submit = () => {
    const r = issuePackage(state, { packageId, chair, issuedAt });
    notify(r.result.ok, r.result.message);
    if (r.result.ok) {
      commit(r.state);
      setPackageId("");
      setChair("");
      setIssuedAt(nowLocalInput());
    }
  };

  const giveBack = (id: string) => {
    const r = returnPackage(state, id);
    notify(r.result.ok, r.result.message);
    if (r.result.ok) commit(r.state);
  };

  const rows = [...state.issues].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

  return (
    <div className="stack-gap">
      <ToastBar toast={toast} />
      <section className="panel">
        <div className="section-heading">
          <div><p className="eyebrow-sm">放行发放</p><h2>器械包发放登记</h2></div>
        </div>
        <div className="field-grid field-grid-3">
          <Field label="选择已放行器械包">
            <select value={packageId} onChange={(e) => setPackageId(e.target.value)}>
              <option value="">请选择…</option>
              {releasable.map((p) => {
                const c = checkIssue(state, p.id);
                return (
                  <option key={p.id} value={p.id}>
                    {p.id} {p.name}{c.allowed ? "" : "（不可发放）"}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="椅位（诊疗单元）">
            <input value={chair} onChange={(e) => setChair(e.target.value)} placeholder="如 3 号椅位" />
          </Field>
          <Field label="发放时间">
            <input type="datetime-local" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
          </Field>
        </div>

        {packageId && (
          <div className={`check-box ${check?.allowed ? "check-ok" : "check-bad"}`}>
            {check?.allowed ? (
              <span>✓ 校验通过：锅次已放行，有效期至 {fmtDate(exp)}，可发放</span>
            ) : (
              <ul className="plain-list">
                <li><b>⛔ 拒绝发放：</b></li>
                {check?.reasons.map((r) => <li key={r}>· {r}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="form-actions">
          <button className="primary-action" onClick={submit} disabled={!packageId || !chair}>确认发放</button>
        </div>
        {releasable.length === 0 && <Empty title="暂无可发放器械包" desc="需先在灭菌监测中取得三项通过并放行。" />}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div><p className="eyebrow-sm">发放记录（{state.issues.length}）</p><h2>椅位去向</h2></div>
        </div>
        {rows.length === 0 ? (
          <Empty title="暂无发放记录" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>发放号</th><th>器械包</th><th>锅次</th><th>椅位</th><th>发放时间</th><th>归还</th><th>追踪</th><th>操作</th></tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const pkg = state.packages.find((p) => p.id === i.packageId);
                  const sb = state.sterBatches.find((b) => b.id === i.sterBatchId);
                  return (
                    <tr key={i.id} className={i.tracking === "to-track" ? "row-danger" : ""}>
                      <td data-label="发放号" className="mono strong">{i.id}</td>
                      <td data-label="器械包">{i.packageId}<br /><span className="muted">{pkg?.name}</span></td>
                      <td data-label="锅次" className="mono">{i.sterBatchId}</td>
                      <td data-label="椅位" className="strong">{i.chair}</td>
                      <td data-label="发放时间" className="nowrap">{fmtDateTime(i.issuedAt)}</td>
                      <td data-label="归还" className="nowrap">{i.returnedAt ? fmtDateTime(i.returnedAt) : <span className="badge badge-purple">使用中</span>}</td>
                      <td data-label="追踪">
                        {i.tracking === "normal" && <span className="muted">正常</span>}
                        {i.tracking === "to-track" && <span className="badge badge-red">待追踪</span>}
                        {i.tracking === "confirmed" && <span className="badge badge-green" title={i.trackedNote ?? ""}>已确认</span>}
                        {sb?.recalledAt && <div className="small muted">锅次已召回</div>}
                      </td>
                      <td data-label="操作">{!i.returnedAt && <button onClick={() => giveBack(i.id)}>使用归还</button>}</td>
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
