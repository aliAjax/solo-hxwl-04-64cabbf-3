// 领域规则（纯函数，可被 node 脚本直接验证）
// 全部操作返回新状态与提示消息，不触碰 localStorage / DOM。
import type { AppState, IssueRecord, Monitors, SterBatch } from "./types";
import { addDaysIso, localInputToIso, nextId, startOfTodayIso } from "./utils";

export interface Result {
  ok: boolean;
  message: string;
}

export const emptyState = (): AppState => ({ packages: [], washBatches: [], sterBatches: [], issues: [], seq: 0 });

// ---------- 查询 ----------

/** 器械包当前是否处于一个未结束清洗批次中 */
export function openWashBatchOf(state: AppState, packageId: string) {
  return state.washBatches.find((b) => b.endedAt === null && b.packageIds.includes(packageId)) ?? null;
}

/** 器械包当前所在灭菌批次 */
export function sterBatchOf(state: AppState, packageId: string) {
  return state.sterBatches.find((b) => b.packageIds.includes(packageId)) ?? null;
}

/** 全部监测均已录入（无 pending） */
export function allMonitorsRecorded(m: Monitors): boolean {
  return m.physical !== "pending" && m.chemical !== "pending" && m.biological !== "pending";
}

/** 三项均通过才可放行 */
export function allMonitorsPass(m: Monitors): boolean {
  return m.physical === "pass" && m.chemical === "pass" && m.biological === "pass";
}

export type PackageStage =
  | "registered" // 已登记，待清洗
  | "washing" // 清洗中（在未结束批次）
  | "washed" // 清洗完成待灭菌
  | "sterilizing" // 灭菌监测中
  | "quarantined" // 隔离
  | "released" // 已放行待发放
  | "issued" // 已发放使用中
  | "returned"; // 已归还（待再处理）

export function stageOf(state: AppState, packageId: string): PackageStage {
  const p = state.packages.find((x) => x.id === packageId);
  if (!p) return "registered";
  const openWash = openWashBatchOf(state, packageId);
  if (openWash) return "washing";
  const currentIssue = p.issuedId ? state.issues.find((i) => i.id === p.issuedId) : null;
  if (currentIssue && !currentIssue.returnedAt) return "issued";
  if (currentIssue?.returnedAt) return "returned";
  const sb = p.sterBatchId ? state.sterBatches.find((b) => b.id === p.sterBatchId) : null;
  if (sb) {
    if (sb.status === "quarantined") return "quarantined";
    if (sb.status === "released") return "released";
    return "sterilizing";
  }
  if (p.washBatchId) return "washed";
  return "registered";
}

/** 灭菌有效期截止时间（灭菌时间 + 有效天数） */
export function expiryOf(state: AppState, packageId: string): string | null {
  const p = state.packages.find((x) => x.id === packageId);
  if (!p || !p.sterBatchId) return null;
  const sb = state.sterBatches.find((b) => b.id === p.sterBatchId);
  if (!sb) return null;
  return addDaysIso(sb.cycleAt, p.validDays);
}

export function isExpired(state: AppState, packageId: string, nowIso = new Date().toISOString()): boolean {
  const exp = expiryOf(state, packageId);
  return exp !== null && new Date(nowIso).getTime() > new Date(exp).getTime();
}

/** 同锅次在该发放之后发放、且尚未归还的记录（召回时的“后续发放”） */
export function laterIssuesInSameCycle(state: AppState, sterBatchId: string, afterIssueId: string): IssueRecord[] {
  const anchor = state.issues.find((i) => i.id === afterIssueId);
  const anchorTime = anchor ? new Date(anchor.issuedAt).getTime() : 0;
  return state.issues
    .filter((i) => i.sterBatchId === sterBatchId && new Date(i.issuedAt).getTime() >= anchorTime && i.id !== afterIssueId)
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
}

/** 受召回影响的全部发放记录（含触发记录本身） */
export function affectedIssuesOfRecall(state: AppState, sterBatchId: string): IssueRecord[] {
  return state.issues
    .filter((i) => i.sterBatchId === sterBatchId)
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
}

/** 隔离批次的影响范围：全部锅次内器械包 + 已发放记录 */
export function quarantineImpact(state: AppState, batchId: string) {
  const sb = state.sterBatches.find((b) => b.id === batchId);
  if (!sb) return { packages: [], issues: [] };
  return {
    packages: sb.packageIds.map((id) => state.packages.find((p) => p.id === id)).filter(Boolean),
    issues: state.issues.filter((i) => i.sterBatchId === batchId),
  };
}

// ---------- 变更操作（不可变更新） ----------

/** 登记器械包 */
export function registerPackage(
  state: AppState,
  input: { name: string; contents: string; validDays: number }
): { state: AppState; result: Result } {
  const name = input.name.trim();
  const contents = input.contents.trim();
  if (!name) return { state, result: { ok: false, message: "请填写器械包名称" } };
  if (!Number.isFinite(input.validDays) || input.validDays <= 0) {
    return { state, result: { ok: false, message: "有效期天数需为大于 0 的整数" } };
  }
  const { id, seq } = nextId("PKG", state.seq);
  return {
    state: {
      ...state,
      seq,
      packages: [
        ...state.packages,
        { id, name, contents: contents || "—", createdAt: new Date().toISOString(), validDays: Math.floor(input.validDays), washBatchId: null, sterBatchId: null, issuedId: null },
      ],
    },
    result: { ok: true, message: `器械包 ${id} 已登记` },
  };
}

/** 登记清洗批次；同一器械包只能进入一个未结束批次；归还后的包可再次进入再处理 */
export function createWashBatch(
  state: AppState,
  input: { washer: string; operator: string; packageIds: string[]; startedAt: string }
): { state: AppState; result: Result } {
  if (input.packageIds.length === 0) return { state, result: { ok: false, message: "请至少选择一个器械包" } };
  // 仅“已登记”（首次）与“已归还”（再处理）可入批；清洗中/待灭菌/监测中/隔离/放行/使用中一律拒绝
  const reprocessable: PackageStage[] = ["registered", "returned"];
  const conflict = input.packageIds.find((id) => !reprocessable.includes(stageOf(state, id)));
  if (conflict) {
    const p = state.packages.find((x) => x.id === conflict)!;
    return { state, result: { ok: false, message: `器械包 ${p.id}（${p.name}）当前为「${stageLabel(stageOf(state, conflict))}」，不能进入新批次（同一器械包只能在一个未结束批次中）` } };
  }
  const { id, seq } = nextId("WASH", state.seq);
  const batch = {
    id,
    washer: input.washer.trim() || "清洗消毒机 1 号",
    operator: input.operator.trim() || "消毒员",
    startedAt: input.startedAt ? localInputToIso(input.startedAt) : new Date().toISOString(),
    endedAt: null,
    packageIds: input.packageIds,
  };
  const next: AppState = {
    ...state,
    seq,
    washBatches: [...state.washBatches, batch],
    // 再处理：解除与上一轮灭菌锅次/发放记录的当前指针（历史记录保留，追溯链不断）
    packages: state.packages.map((p) =>
      input.packageIds.includes(p.id) ? { ...p, washBatchId: id, sterBatchId: null, issuedId: null } : p
    ),
  };
  return { state: next, result: { ok: true, message: `清洗批次 ${id} 已登记，含 ${input.packageIds.length} 个器械包` } };
}

/** 结束清洗批次 */
export function endWashBatch(state: AppState, batchId: string): { state: AppState; result: Result } {
  const batch = state.washBatches.find((b) => b.id === batchId);
  if (!batch) return { state, result: { ok: false, message: "批次不存在" } };
  if (batch.endedAt) return { state, result: { ok: false, message: "批次已结束" } };
  return {
    state: { ...state, washBatches: state.washBatches.map((b) => (b.id === batchId ? { ...b, endedAt: new Date().toISOString() } : b)) },
    result: { ok: true, message: `清洗批次 ${batchId} 已结束，器械包待灭菌` },
  };
}

/** 登记灭菌锅次（装载），只能取已清洗完成、未进灭菌流程的包 */
export function createSterBatch(
  state: AppState,
  input: { sterilizer: string; operator: string; packageIds: string[]; cycleAt: string }
): { state: AppState; result: Result } {
  if (input.packageIds.length === 0) return { state, result: { ok: false, message: "请至少选择一个器械包" } };
  const bad = input.packageIds.find((id) => stageOf(state, id) !== "washed");
  if (bad) {
    const p = state.packages.find((x) => x.id === bad)!;
    return { state, result: { ok: false, message: `器械包 ${p.id} 当前不可装载灭菌（需先完成清洗）` } };
  }
  const { id, seq } = nextId("STER", state.seq);
  const batch: SterBatch = {
    id,
    sterilizer: input.sterilizer.trim() || "高压灭菌器 A",
    operator: input.operator.trim() || "消毒员",
    cycleAt: input.cycleAt ? localInputToIso(input.cycleAt) : new Date().toISOString(),
    packageIds: input.packageIds,
    status: "monitoring",
    monitors: { physical: "pending", chemical: "pending", biological: "pending" },
    releasedAt: null,
    quarantinedAt: null,
    quarantineReason: null,
    recalledAt: null,
    recallReason: null,
  };
  return {
    state: {
      ...state,
      seq,
      sterBatches: [...state.sterBatches, batch],
      packages: state.packages.map((p) => (input.packageIds.includes(p.id) ? { ...p, sterBatchId: id } : p)),
    },
    result: { ok: true, message: `灭菌锅次 ${id} 已装载，等待三项监测结果` },
  };
}

const failLabel: Record<string, string> = { physical: "物理监测", chemical: "化学监测", biological: "生物监测" };

/**
 * 录入监测结果：
 *  - 三项全部通过 → 放行
 *  - 任一失败 → 整批隔离（已发放的记录同时进入待追踪）
 */
export function recordMonitors(
  state: AppState,
  batchId: string,
  monitors: Monitors
): { state: AppState; result: Result; affected?: ReturnType<typeof quarantineImpact> } {
  const sb = state.sterBatches.find((b) => b.id === batchId);
  if (!sb) return { state, result: { ok: false, message: "锅次不存在" } };
  if (sb.status !== "monitoring") return { state, result: { ok: false, message: "该锅次已结束监测流程" } };
  if (!allMonitorsRecorded(monitors)) return { state, result: { ok: false, message: "物理、化学、生物三项监测均需录入" } };

  if (allMonitorsPass(monitors)) {
    const updated: SterBatch = { ...sb, monitors, status: "released", releasedAt: new Date().toISOString() };
    return {
      state: { ...state, sterBatches: state.sterBatches.map((b) => (b.id === batchId ? updated : b)) },
      result: { ok: true, message: `锅次 ${batchId} 三项监测全部通过，已放行，可发放` },
    };
  }

  const failed = (["physical", "chemical", "biological"] as const).filter((k) => monitors[k] === "fail");
  const reason = `${failed.map((k) => failLabel[k]).join("、")}不合格`;
  const quarantined: SterBatch = {
    ...sb,
    monitors,
    status: "quarantined",
    quarantinedAt: new Date().toISOString(),
    quarantineReason: reason,
  };
  // 理论上隔离前不应有发放（未放行不能发放），仍统一把锅次内存量记录标为待追踪
  const next: AppState = {
    ...state,
    sterBatches: state.sterBatches.map((b) => (b.id === batchId ? quarantined : b)),
    issues: state.issues.map((i) => (i.sterBatchId === batchId && i.tracking === "normal" ? { ...i, tracking: "to-track" } : i)),
  };
  return {
    state: next,
    result: { ok: true, message: `锅次 ${batchId} ${reason}，整批已隔离，共 ${quarantined.packageIds.length} 个器械包禁止发放` },
    affected: quarantineImpact(next, batchId),
  };
}

export interface IssueCheck {
  allowed: boolean;
  reasons: string[];
}

/** 发放前校验：已放行、未过期、锅次未召回/隔离、包未在使用 */
export function checkIssue(state: AppState, packageId: string, nowIso = new Date().toISOString()): IssueCheck {
  const reasons: string[] = [];
  const p = state.packages.find((x) => x.id === packageId);
  if (!p) return { allowed: false, reasons: ["器械包不存在"] };
  const stage = stageOf(state, packageId);
  if (stage !== "released") reasons.push(`当前状态为「${stageLabel(stage)}」，仅已放行器械包可发放`);
  if (!p.sterBatchId) {
    reasons.push("缺少灭菌锅次信息");
  } else {
    const sb = state.sterBatches.find((b) => b.id === p.sterBatchId)!;
    if (sb.recalledAt) reasons.push(`锅次 ${sb.id} 已被召回，禁止发放`);
    if (sb.status === "quarantined") reasons.push(`锅次 ${sb.id} 处于隔离状态`);
  }
  const exp = expiryOf(state, packageId);
  if (exp && new Date(nowIso).getTime() > new Date(exp).getTime()) {
    reasons.push(`已超过灭菌有效期（${exp.slice(0, 10)}）`);
  }
  return { allowed: reasons.length === 0, reasons };
}

/** 发放：登记椅位与发放时间；有效期按“填写的发放时间”校验（而非当前时间） */
export function issuePackage(
  state: AppState,
  input: { packageId: string; chair: string; issuedAt: string },
  nowIso = new Date().toISOString()
): { state: AppState; result: Result } {
  const chair = input.chair.trim();
  if (!chair) return { state, result: { ok: false, message: "请登记椅位" } };
  const issuedAtIso = input.issuedAt ? localInputToIso(input.issuedAt) : nowIso;
  // 过期/召回等时间相关判断以实际登记的发放时间为准，避免把发放时间填到有效期之后仍能保存
  const check = checkIssue(state, input.packageId, issuedAtIso);
  if (!check.allowed) return { state, result: { ok: false, message: "拒绝发放：" + check.reasons.join("；") } };
  const p = state.packages.find((x) => x.id === input.packageId)!;
  const { id, seq } = nextId("ISS", state.seq);
  const rec: IssueRecord = {
    id,
    packageId: p.id,
    sterBatchId: p.sterBatchId!,
    chair,
    issuedAt: issuedAtIso,
    returnedAt: null,
    tracking: "normal",
    trackedNote: null,
  };
  return {
    state: { ...state, seq, issues: [...state.issues, rec], packages: state.packages.map((x) => (x.id === p.id ? { ...x, issuedId: id } : x)) },
    result: { ok: true, message: `${p.id} 已发放至 ${chair}` },
  };
}

/** 使用归还：包回到可再处理状态（清洗后的闭环可再次走流程，演示中保持追溯链不变） */
export function returnPackage(state: AppState, issueId: string): { state: AppState; result: Result } {
  const rec = state.issues.find((i) => i.id === issueId);
  if (!rec) return { state, result: { ok: false, message: "发放记录不存在" } };
  if (rec.returnedAt) return { state, result: { ok: false, message: "该记录已归还" } };
  return {
    state: { ...state, issues: state.issues.map((i) => (i.id === issueId ? { ...i, returnedAt: new Date().toISOString() } : i)) },
    result: { ok: true, message: `${rec.packageId} 已归还` },
  };
}

/**
 * 按批次召回：
 *  - 锅次标记召回，整批禁止再发放；
 *  - 同锅次“后续发放”（相对指定发放记录）以及全部未归还记录标记为待追踪；
 *  - 返回受影响记录清单用于展示。
 */
export function recallBatch(
  state: AppState,
  batchId: string,
  reason: string,
  fromIssueId?: string
): { state: AppState; result: Result; affected: IssueRecord[] } {
  const sb = state.sterBatches.find((b) => b.id === batchId);
  if (!sb) return { state, result: { ok: false, message: "锅次不存在" }, affected: [] };
  if (sb.recalledAt) return { state, result: { ok: false, message: `锅次 ${batchId} 已处于召回状态` }, affected: affectedIssuesOfRecall(state, batchId) };

  // 待追踪范围：同锅次后续发放；未指定锚点时，覆盖全部未归还发放
  const markIds = new Set<string>();
  if (fromIssueId) {
    laterIssuesInSameCycle(state, batchId, fromIssueId).forEach((i) => markIds.add(i.id));
  }
  state.issues.filter((i) => i.sterBatchId === batchId && !i.returnedAt).forEach((i) => markIds.add(i.id));

  const next: AppState = {
    ...state,
    sterBatches: state.sterBatches.map((b) =>
      b.id === batchId ? { ...b, recalledAt: new Date().toISOString(), recallReason: reason.trim() || "院感追踪召回" } : b
    ),
    issues: state.issues.map((i) => (markIds.has(i.id) && i.tracking !== "confirmed" ? { ...i, tracking: "to-track" as const } : i)),
  };
  const affected = affectedIssuesOfRecall(next, batchId);
  const pending = affected.filter((i) => i.tracking === "to-track").length;
  return {
    state: next,
    result: { ok: true, message: `锅次 ${batchId} 已召回，${pending} 条发放记录标记为待追踪` },
    affected,
  };
}

/** 追踪确认 */
export function confirmTracking(state: AppState, issueId: string, note: string): { state: AppState; result: Result } {
  const rec = state.issues.find((i) => i.id === issueId);
  if (!rec) return { state, result: { ok: false, message: "记录不存在" } };
  if (rec.tracking !== "to-track") return { state, result: { ok: false, message: "该记录无需追踪" } };
  return {
    state: {
      ...state,
      issues: state.issues.map((i) => (i.id === issueId ? { ...i, tracking: "confirmed", trackedNote: note.trim() || "已联系椅位确认停用" } : i)),
    },
    result: { ok: true, message: `${issueId} 追踪已确认` },
  };
}

export function stageLabel(s: PackageStage): string {
  const map: Record<PackageStage, string> = {
    registered: "已登记",
    washing: "清洗中",
    washed: "待灭菌",
    sterilizing: "监测中",
    quarantined: "已隔离",
    released: "已放行",
    issued: "使用中",
    returned: "已归还",
  };
  return map[s];
}

export { startOfTodayIso };
