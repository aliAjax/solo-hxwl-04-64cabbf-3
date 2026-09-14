// 牙科器械再处理追溯台：领域模型
// 追溯链：器械包 → 清洗批次 → 灭菌锅次 → 监测结果 → 发放（椅位/时间）→ 召回追踪

export type MonitorResult = "pass" | "fail" | "pending";

/** 器械包 */
export interface InstrumentPackage {
  id: string; // 器械包编号
  name: string; // 器械包名称（如 口腔检查基础包）
  contents: string; // 包内器械
  createdAt: string; // 登记时间 ISO
  validDays: number; // 灭菌有效期（天）
  washBatchId: string | null; // 当前所在清洗批次
  sterBatchId: string | null; // 当前所在灭菌锅次
  issuedId: string | null; // 当前发放记录
}

/** 清洗批次 */
export interface WashBatch {
  id: string; // 清洗批次号
  washer: string; // 清洗机/清洗设备
  operator: string; // 登记人
  startedAt: string; // 登记时间 ISO
  endedAt: string | null; // 结束时间，未结束为 null
  packageIds: string[]; // 包内容
}

/** 物理/化学/生物监测结果 */
export interface Monitors {
  physical: MonitorResult;
  chemical: MonitorResult;
  biological: MonitorResult;
  physicalNote?: string;
  chemicalNote?: string;
  biologicalNote?: string;
}

/** 灭菌批次（同锅次） */
export interface SterBatch {
  id: string; // 锅次/灭菌批次号
  sterilizer: string; // 灭菌器
  operator: string; // 装载/登记人
  cycleAt: string; // 灭菌时间 ISO
  packageIds: string[]; // 本锅器械包
  status: "monitoring" | "released" | "quarantined";
  monitors: Monitors;
  releasedAt: string | null;
  quarantinedAt: string | null;
  quarantineReason: string | null;
  recalledAt: string | null; // 召回时间
  recallReason: string | null;
}

/** 发放记录 */
export interface IssueRecord {
  id: string;
  packageId: string;
  sterBatchId: string;
  chair: string; // 椅位（诊疗单元）
  issuedAt: string; // 发放时间
  returnedAt: string | null; // 使用归还时间（归还后可重新进入再处理流程）
  tracking: "normal" | "to-track" | "confirmed"; // 待追踪 / 已确认
  trackedNote: string | null;
}

export interface AppState {
  packages: InstrumentPackage[];
  washBatches: WashBatch[];
  sterBatches: SterBatch[];
  issues: IssueRecord[];
  seq: number; // 自增序号（不依赖随机数）
}

export const MONITOR_LABELS: { key: keyof Omit<Monitors, "physicalNote" | "chemicalNote" | "biologicalNote">; label: string }[] = [
  { key: "physical", label: "物理监测" },
  { key: "chemical", label: "化学监测" },
  { key: "biological", label: "生物监测" },
];
