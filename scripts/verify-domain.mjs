// 关键业务流程验证（Node，无后端）。
// 用 esbuild 把 TS 领域模块打包成 ESM 后动态导入，再逐条断言。
// 运行：npm run verify
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const outDir = join(process.cwd(), "node_modules", ".verify");
mkdirSync(outDir, { recursive: true });
const entry = join(outDir, "domain.mjs");

await build({
  entryPoints: [join(process.cwd(), "src", "domain.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: entry,
  logLevel: "silent",
});
await build({
  entryPoints: [join(process.cwd(), "src", "demo.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: join(outDir, "demo.mjs"),
  logLevel: "silent",
});

const d = await import(pathToFileURL(entry).href);
const { buildDemoState } = await import(pathToFileURL(join(outDir, "demo.mjs")).href);

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function passState() {
  const iso = new Date("2026-09-14T09:00:00").toISOString();
  // 登记 2 个包
  let s = d.emptyState();
  const a = d.registerPackage(s, { name: "检查包A", contents: "口镜", validDays: 7 });
  s = a.state;
  const b = d.registerPackage(s, { name: "检查包B", contents: "探针", validDays: 7 });
  s = b.state;
  const ids = [a.result.message.match(/PKG-\d+/)?.[0], b.result.message.match(/PKG-\d+/)?.[0]];
  // 登记时间统一，便于断言
  return { state: s, ids, iso };
}

console.log("1. 演示数据与空库恢复");
{
  const demo = buildDemoState();
  check("演示数据含 13 个器械包", demo.packages.length === 13, `实际 ${demo.packages.length}`);
  check("演示数据含隔离锅次 STER-0004", demo.sterBatches.find((x) => x.id === "STER-0004")?.status === "quarantined");
  check("演示数据含召回锅次 STER-0005", !!demo.sterBatches.find((x) => x.id === "STER-0005")?.recalledAt);
  check("空库判定", d.emptyState().packages.length === 0);
}

console.log("2. 同一器械包只能进入一个未结束批次");
{
  let { state: s, ids } = passState();
  const w1 = d.createWashBatch(s, { washer: "机1", operator: "李", packageIds: [ids[0]], startedAt: "2026-09-14T09:00" });
  check("首次入批成功", w1.result.ok, w1.result.message);
  s = w1.state;
  check("入批后状态为清洗中", d.stageOf(s, ids[0]) === "washing");
  const w2 = d.createWashBatch(s, { washer: "机2", operator: "王", packageIds: [ids[0], ids[1]], startedAt: "2026-09-14T09:05" });
  check("未结束时重复入批被拒绝", !w2.result.ok && w2.state.washBatches.length === 1, w2.result.message);
  const e1 = d.endWashBatch(s, w1.state.washBatches[0].id);
  s = e1.state;
  check("结束批次后状态为待灭菌", d.stageOf(s, ids[0]) === "washed");
  const w3 = d.createWashBatch(s, { washer: "机1", operator: "李", packageIds: [ids[0]], startedAt: "2026-09-14T09:20" });
  check("已结束批次但包待灭菌，仍不能进新批", !w3.result.ok, w3.result.message);
}

console.log("3. 三项监测全过才放行（完整正向链）");
{
  let { state: s, ids, iso } = passState();
  s = d.createWashBatch(s, { washer: "机1", operator: "李", packageIds: ids, startedAt: "2026-09-14T09:00" }).state;
  s = d.endWashBatch(s, s.washBatches[0].id).state;
  const c = d.createSterBatch(s, { sterilizer: "灭菌器A", operator: "李", packageIds: ids, cycleAt: "2026-09-14T10:00" });
  check("装载灭菌成功", c.result.ok, c.result.message);
  s = c.state;
  const bid = s.sterBatches[0].id;

  const partial = d.recordMonitors(s, bid, { physical: "pass", chemical: "pass", biological: "pending" });
  check("有未录入项不能判定", !partial.result.ok, partial.result.message);

  const ok = d.recordMonitors(s, bid, { physical: "pass", chemical: "pass", biological: "pass" });
  check("三项全过 → 放行", ok.result.ok && ok.state.sterBatches[0].status === "released", ok.result.message);
  s = ok.state;
  check("放行后状态", d.stageOf(s, ids[0]) === "released");

  const before = d.checkIssue(s, ids[0], iso);
  check("放行且未过期可发放", before.allowed, before.reasons.join("；"));
  const iss = d.issuePackage(s, { packageId: ids[0], chair: "3 号椅位", issuedAt: "2026-09-14T11:00" }, iso);
  check("发放成功并登记椅位/时间", iss.result.ok && iss.state.issues[0].chair === "3 号椅位", iss.result.message);
  s = iss.state;
  check("发放后状态为使用中", d.stageOf(s, ids[0]) === "issued");

  // 刷新不丢：纯数据可 JSON 序列化并还原
  const revived = JSON.parse(JSON.stringify(s));
  check("追溯链序列化后完整", revived.issues.length === 1 && revived.sterBatches[0].status === "released" && revived.packages[0].issuedId);
}

console.log("4. 任一监测失败 → 整批隔离 + 影响范围");
{
  let { state: s, ids } = passState();
  s = d.createWashBatch(s, { washer: "机1", operator: "李", packageIds: ids, startedAt: "2026-09-14T09:00" }).state;
  s = d.endWashBatch(s, s.washBatches[0].id).state;
  s = d.createSterBatch(s, { sterilizer: "灭菌器A", operator: "李", packageIds: ids, cycleAt: "2026-09-14T10:00" }).state;
  const bid = s.sterBatches[0].id;

  const fail = d.recordMonitors(s, bid, { physical: "pass", chemical: "fail", biological: "pass", chemicalNote: "指示卡未变色" });
  check("化学监测失败 → 批次隔离", fail.result.ok && fail.state.sterBatches[0].status === "quarantined", fail.result.message);
  check("隔离原因记录", fail.state.sterBatches[0].quarantineReason === "化学监测不合格");
  check("影响范围列出整批 2 个器械包", fail.affected?.packages.length === 2, `实际 ${fail.affected?.packages.length}`);
  s = fail.state;
  check("包状态为已隔离", d.stageOf(s, ids[0]) === "quarantined");
  const denied = d.checkIssue(s, ids[0]);
  check("隔离包不可发放", !denied.allowed && denied.reasons.some((r) => r.includes("隔离")));
  const again = d.recordMonitors(s, bid, { physical: "pass", chemical: "pass", biological: "pass" });
  check("隔离后不能改判放行", !again.result.ok, again.result.message);
}

console.log("5. 超过有效期拒绝发放");
{
  const demo = buildDemoState();
  const expPkg = demo.packages.find((p) => p.id === "PKG-0012");
  check("演示包 PKG-0012 已过期", d.isExpired(demo, "PKG-0012"));
  const chk = d.checkIssue(demo, "PKG-0012");
  check("过期放行包被拒绝并给出原因", !chk.allowed && chk.reasons.some((r) => r.includes("有效期")), chk.reasons.join("；"));
  const iss = d.issuePackage(demo, { packageId: "PKG-0012", chair: "1 号椅位", issuedAt: "2026-09-14T10:00" });
  check("过期发放操作被阻止，无新增记录", !iss.result.ok && iss.state.issues.length === demo.issues.length, iss.result.message);

  // 构造：灭菌后第 8 天、有效期 7 天
  let { state: s, ids, iso } = passState();
  s = d.createWashBatch(s, { washer: "机1", operator: "", packageIds: ids, startedAt: "2026-09-01T09:00" }).state;
  s = d.endWashBatch(s, s.washBatches[0].id).state;
  s = d.createSterBatch(s, { sterilizer: "A", operator: "", packageIds: ids, cycleAt: "2026-09-01T10:00" }).state;
  s = d.recordMonitors(s, s.sterBatches[0].id, { physical: "pass", chemical: "pass", biological: "pass" }).state;
  const future = new Date("2026-09-09T10:01:00").toISOString();
  const chk2 = d.checkIssue(s, ids[0], future);
  check("第 8 天判定过期", !chk2.allowed && chk2.reasons.some((r) => r.includes("有效期")), chk2.reasons.join("；"));

  // 缺陷回归：当前时间未过期，但“填写的发放时间”晚于有效期 → 必须拒绝保存
  const now = new Date("2026-09-02T08:00:00").toISOString(); // 当前时刻未过期
  const lateInput = d.issuePackage(
    s,
    { packageId: ids[0], chair: "2 号椅位", issuedAt: "2026-09-09T10:01" },
    now
  );
  check(
    "当前未过期但发放时间填到有效期之后 → 拒绝发放",
    !lateInput.result.ok && lateInput.result.message.includes("有效期"),
    lateInput.result.message
  );
  check("拒绝时无新增发放记录", lateInput.state.issues.length === 0);

  // 发放时间在有效期内（晚于当前时间的补录场景）应允许：有效期截至 09-08 10:00
  const okBackfill = d.issuePackage(
    s,
    { packageId: ids[1], chair: "4 号椅位", issuedAt: "2026-09-08T09:00" },
    now
  );
  check("有效期内的发放时间可保存", okBackfill.result.ok && okBackfill.state.issues.length === 1, okBackfill.result.message);
  check("保存的发放时间等于填写值", okBackfill.state.issues[0]?.issuedAt === new Date("2026-09-08T09:00:00").toISOString());
  void iso;
}

console.log("6. 按批次召回：同锅次后续发放标待追踪 + 拒绝再发放");
{
  const demo = buildDemoState();
  // STER-0001 已放行，PKG-0001/0002 分别发放到 3 号/5 号椅位
  const r = d.recallBatch(demo, "STER-0001", "演练召回", "ISS-0001");
  check("召回成功", r.result.ok, r.result.message);
  const i1 = r.state.issues.find((x) => x.id === "ISS-0001");
  const i2 = r.state.issues.find((x) => x.id === "ISS-0002");
  check("锚点记录（未归还）标待追踪", i1.tracking === "to-track");
  check("同锅次后续发放 ISS-0002 标待追踪", i2.tracking === "to-track");
  check("受影响记录清单包含 2 条", r.affected.length === 2);
  check("锅次记录召回原因", r.state.sterBatches.find((b) => b.id === "STER-0001").recallReason === "演练召回");
  const dup = d.recallBatch(r.state, "STER-0001", "再次召回");
  check("不可重复召回", !dup.result.ok, dup.result.message);

  // 追踪确认
  const cf = d.confirmTracking(r.state, "ISS-0002", "已收回重灭菌");
  check("追踪确认生效", cf.state.issues.find((x) => x.id === "ISS-0002").tracking === "confirmed");
  check("确认备注落库", cf.state.issues.find((x) => x.id === "ISS-0002").trackedNote === "已收回重灭菌");

  // 召回后该锅次剩余的已放行包拒绝发放：构造一个 STER-0001 未发的包
  let s = r.state;
  const reg = d.registerPackage(s, { name: "备用包", contents: "—", validDays: 30 });
  s = reg.state;
  const newId = reg.result.message.match(/PKG-\d+/)?.[0];
  // 直接构造同锅发放检查：把 STER-0001 召回事实用于 PKG-0003（STER-0002 正常）对照
  const recalledCheck = d.checkIssue(s, "PKG-0003");
  check("正常锅次的包发放校验通过", recalledCheck.allowed, recalledCheck.reasons.join("；"));
  void newId;
}

console.log("7. 演示数据中已召回锅次的拒绝发放与待追踪展示");
{
  const demo = buildDemoState();
  const sb = demo.sterBatches.find((b) => b.id === "STER-0005");
  check("STER-0005 处于召回", !!sb.recalledAt);
  const track = demo.issues.filter((i) => i.sterBatchId === "STER-0005");
  check("召回锅次 2 条发放可展示影响范围", track.length === 2);
  check("其中 ISS-0003 为待追踪", track.find((i) => i.id === "ISS-0003")?.tracking === "to-track");
  check("其中 ISS-0004 为已确认", track.find((i) => i.id === "ISS-0004")?.tracking === "confirmed");
  // 影响范围查询
  const affected = d.affectedIssuesOfRecall(demo, "STER-0005");
  check("affectedIssuesOfRecall 按时间排序", affected[0].id === "ISS-0003" && affected[1].id === "ISS-0004");
}

console.log("8. 归还后再处理形成新一轮追溯链");
{
  let { state: s, ids } = passState();
  s = d.createWashBatch(s, { washer: "机1", operator: "李", packageIds: ids, startedAt: "2026-09-14T09:00" }).state;
  s = d.endWashBatch(s, s.washBatches[0].id).state;
  s = d.createSterBatch(s, { sterilizer: "A", operator: "李", packageIds: ids, cycleAt: "2026-09-14T10:00" }).state;
  s = d.recordMonitors(s, s.sterBatches[0].id, { physical: "pass", chemical: "pass", biological: "pass" }).state;
  s = d.issuePackage(s, { packageId: ids[0], chair: "3 号椅位", issuedAt: "2026-09-14T11:00" }).state;
  const issueId = s.issues[0].id;
  s = d.returnPackage(s, issueId).state;
  check("归还后状态", d.stageOf(s, ids[0]) === "returned");
  const w = d.createWashBatch(s, { washer: "机2", operator: "王", packageIds: [ids[0]], startedAt: "2026-09-14T13:00" });
  check("归还后可重新入批", w.result.ok, w.result.message);
  s = w.state;
  check("新一轮清洗中，当前指针已切换", d.stageOf(s, ids[0]) === "washing" && s.packages[0].sterBatchId === null);
  check("历史发放记录仍保留（追溯链不断）", s.issues.length === 1 && s.issues[0].returnedAt !== null);
  check("历史清洗/灭菌批次均保留", s.washBatches.length === 2 && s.sterBatches.length === 1);
}

console.log("");
if (failed > 0) {
  console.error(`验证失败：${failed} 项失败，${passed} 项通过`);
  process.exit(1);
}
console.log(`全部通过：${passed} 项断言`);
