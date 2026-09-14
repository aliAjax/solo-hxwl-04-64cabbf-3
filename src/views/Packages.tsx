import { useState } from "react";
import { useStore } from "../store";
import { registerPackage, stageOf } from "../domain";
import { fmtDateTime } from "../utils";
import { Empty, Field, StageBadge, ToastBar, useToast } from "../ui";

export default function Packages() {
  const { state, commit } = useStore();
  const { toast, notify } = useToast();
  const [name, setName] = useState("");
  const [contents, setContents] = useState("");
  const [validDays, setValidDays] = useState("90");
  const [filter, setFilter] = useState("all");

  const submit = () => {
    const r = registerPackage(state, { name, contents, validDays: Number(validDays) });
    notify(r.result.ok, r.result.message);
    if (r.result.ok) {
      commit(r.state);
      setName("");
      setContents("");
    }
  };

  const rows = [...state.packages]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((p) => filter === "all" || stageOf(state, p.id) === filter);

  return (
    <div className="stack-gap">
      <ToastBar toast={toast} />
      <section className="panel">
        <div className="section-heading">
          <div><p className="eyebrow-sm">器械包登记</p><h2>新增器械包</h2></div>
        </div>
        <div className="field-grid field-grid-3">
          <Field label="器械包名称">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 口腔检查基础包" />
          </Field>
          <Field label="包内器械">
            <input value={contents} onChange={(e) => setContents(e.target.value)} placeholder="如 口镜×2、探针×2" />
          </Field>
          <Field label="灭菌有效期（天）" hint="自灭菌时间起算，发放时校验">
            <input type="number" min={1} value={validDays} onChange={(e) => setValidDays(e.target.value)} />
          </Field>
        </div>
        <div className="form-actions">
          <button className="primary-action" onClick={submit}>登记器械包</button>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div><p className="eyebrow-sm">台账（{state.packages.length}）</p><h2>器械包清单</h2></div>
          <div className="chips chips-filter">
            {[["all", "全部"], ["registered", "已登记"], ["washing", "清洗中"], ["washed", "待灭菌"], ["sterilizing", "监测中"], ["released", "已放行"], ["quarantined", "已隔离"], ["issued", "使用中"]].map(([k, t]) => (
              <button key={k} className={filter === k ? "chip-on" : ""} onClick={() => setFilter(k)}>{t}</button>
            ))}
          </div>
        </div>
        {state.packages.length === 0 ? (
          <Empty title="暂无器械包" desc="在上方登记第一个器械包，或恢复演示数据。" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>编号</th><th>名称 / 包内器械</th><th>有效期</th><th>登记时间</th><th>状态</th></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td data-label="编号" className="mono strong">{p.id}</td>
                    <td data-label="名称 / 包内器械"><b>{p.name}</b><br /><span className="muted">{p.contents}</span></td>
                    <td data-label="有效期">{p.validDays} 天</td>
                    <td data-label="登记时间" className="nowrap">{fmtDateTime(p.createdAt)}</td>
                    <td data-label="状态"><StageBadge stage={stageOf(state, p.id)} /></td>
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
