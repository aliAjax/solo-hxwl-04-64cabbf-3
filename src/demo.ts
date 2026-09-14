// 演示数据：覆盖完整追溯链（清洗 → 灭菌监测 → 放行 → 发放 → 隔离/召回/过期）
import type { AppState, InstrumentPackage, IssueRecord, Monitors, SterBatch, WashBatch } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString();
const shift = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * 60 * 60 * 1000);

interface SeedPkg {
  p: Omit<InstrumentPackage, "washBatchId" | "sterBatchId" | "issuedId">;
  wash?: string;
  ster?: string;
  issue?: string;
}

export function buildDemoState(): AppState {
  const packages: InstrumentPackage[] = [];
  const pushPkg = (s: SeedPkg) => {
    packages.push({ ...s.p, washBatchId: s.wash ?? null, sterBatchId: s.ster ?? null, issuedId: s.issue ?? null });
  };

  // 已发放、正常使用（2 天前灭菌，有效期 180 天）
  pushPkg({
    p: { id: "PKG-0001", name: "口腔检查基础包", contents: "口镜×2、探针×2、镊子×1", createdAt: iso(shift(-3, -2)), validDays: 180 },
    wash: "WASH-0001", ster: "STER-0001", issue: "ISS-0001",
  });
  pushPkg({
    p: { id: "PKG-0002", name: "根管治疗专用包", contents: "根管锉、拔髓针、测量尺", createdAt: iso(shift(-3, -1)), validDays: 90 },
    wash: "WASH-0001", ster: "STER-0001", issue: "ISS-0002",
  });
  // 已放行待发放
  pushPkg({
    p: { id: "PKG-0003", name: "牙周洁治包", contents: "洁治器×4、刮治器×2", createdAt: iso(shift(-1, -3)), validDays: 30 },
    wash: "WASH-0002", ster: "STER-0002",
  });
  pushPkg({
    p: { id: "PKG-0004", name: "拔牙器械包", contents: "牙挺×2、牙钳×3、牙龈分离器", createdAt: iso(shift(-1, -2)), validDays: 30 },
    wash: "WASH-0002", ster: "STER-0002",
  });
  // 清洗完成待灭菌
  pushPkg({
    p: { id: "PKG-0005", name: "种植手术包", contents: "种植工具盒、环形刀、扭力扳手", createdAt: iso(shift(0, -4)), validDays: 180 },
    wash: "WASH-0003",
  });
  // 清洗中（未结束批次）
  pushPkg({
    p: { id: "PKG-0006", name: "充填修复包", contents: "充填器、雕刻刀、调拌刀", createdAt: iso(shift(0, -2)), validDays: 90 },
    wash: "WASH-0004",
  });
  // 监测中（生物监测结果待录入）
  pushPkg({
    p: { id: "PKG-0007", name: "外科缝合包", contents: "持针器、组织镊、线剪", createdAt: iso(shift(0, -6)), validDays: 180 },
    wash: "WASH-0003", ster: "STER-0003",
  });
  // 化学监测失败 → 整批隔离
  pushPkg({
    p: { id: "PKG-0008", name: "正畸器械包", contents: "托槽镊、末端切断钳、细丝钳", createdAt: iso(shift(-5)), validDays: 30 },
    wash: "WASH-0005", ster: "STER-0004",
  });
  pushPkg({
    p: { id: "PKG-0009", name: "儿童检查包", contents: "小口镜、乳牙钳、洁治器", createdAt: iso(shift(-5, 0.2)), validDays: 30 },
    wash: "WASH-0005", ster: "STER-0004",
  });
  // 已发放但锅次已召回 → 待追踪
  pushPkg({
    p: { id: "PKG-0010", name: "牙髓活力测试包", contents: "冷测棒、热测牙胶、电活力测试仪头", createdAt: iso(shift(-8)), validDays: 90 },
    wash: "WASH-0006", ster: "STER-0005", issue: "ISS-0003",
  });
  pushPkg({
    p: { id: "PKG-0011", name: "洁牙机手柄包", contents: "超声手柄、工作尖×3", createdAt: iso(shift(-8, 0.3)), validDays: 90 },
    wash: "WASH-0006", ster: "STER-0005", issue: "ISS-0004",
  });
  // 已放行但超过有效期（演示拒发）
  pushPkg({
    p: { id: "PKG-0012", name: "简易换药包", contents: "换药碗、敷料镊", createdAt: iso(shift(-200)), validDays: 7 },
    wash: "WASH-0007", ster: "STER-0006",
  });
  // 新登记，未进入任何批次
  pushPkg({
    p: { id: "PKG-0013", name: "牙片固定包", contents: "胶片持片器、定位圈", createdAt: iso(shift(0, -1)), validDays: 90 },
  });

  const washBatches: WashBatch[] = [
    { id: "WASH-0001", washer: "清洗消毒机 1 号", operator: "李护士", startedAt: iso(shift(-3, -3)), endedAt: iso(shift(-3, -1.5)), packageIds: ["PKG-0001", "PKG-0002"] },
    { id: "WASH-0002", washer: "清洗消毒机 1 号", operator: "李护士", startedAt: iso(shift(-1, -5)), endedAt: iso(shift(-1, -3.5)), packageIds: ["PKG-0003", "PKG-0004"] },
    { id: "WASH-0003", washer: "清洗消毒机 2 号", operator: "王护士", startedAt: iso(shift(0, -7)), endedAt: iso(shift(0, -5.5)), packageIds: ["PKG-0005", "PKG-0007"] },
    { id: "WASH-0004", washer: "清洗消毒机 2 号", operator: "王护士", startedAt: iso(shift(0, -2.5)), endedAt: null, packageIds: ["PKG-0006"] },
    { id: "WASH-0005", washer: "清洗消毒机 1 号", operator: "李护士", startedAt: iso(shift(-5, -2)), endedAt: iso(shift(-5, -0.5)), packageIds: ["PKG-0008", "PKG-0009"] },
    { id: "WASH-0006", washer: "清洗消毒机 2 号", operator: "王护士", startedAt: iso(shift(-8, -2)), endedAt: iso(shift(-8, -0.5)), packageIds: ["PKG-0010", "PKG-0011"] },
    { id: "WASH-0007", washer: "清洗消毒机 1 号", operator: "李护士", startedAt: iso(shift(-200)), endedAt: iso(shift(-200, 1)), packageIds: ["PKG-0012"] },
  ];

  const passAll: Monitors = {
    physical: "pass", chemical: "pass", biological: "pass",
    physicalNote: "温度/压力/时间曲线合格", chemicalNote: "包外、包内指示卡变色合格", biologicalNote: "嗜热脂肪芽孢杆菌培养阴性",
  };

  const sterBatches: SterBatch[] = [
    {
      id: "STER-0001", sterilizer: "高压灭菌器 A", operator: "李护士", cycleAt: iso(shift(-2)), packageIds: ["PKG-0001", "PKG-0002"],
      status: "released", monitors: passAll, releasedAt: iso(shift(-2, 0.5)), quarantinedAt: null, quarantineReason: null, recalledAt: null, recallReason: null,
    },
    {
      id: "STER-0002", sterilizer: "高压灭菌器 A", operator: "李护士", cycleAt: iso(shift(-1, -1)), packageIds: ["PKG-0003", "PKG-0004"],
      status: "released", monitors: passAll, releasedAt: iso(shift(-1)), quarantinedAt: null, quarantineReason: null, recalledAt: null, recallReason: null,
    },
    {
      id: "STER-0003", sterilizer: "高压灭菌器 B", operator: "王护士", cycleAt: iso(shift(0, -5)), packageIds: ["PKG-0007"],
      status: "monitoring",
      monitors: { physical: "pass", chemical: "pass", biological: "pending", physicalNote: "曲线合格", chemicalNote: "指示卡变色合格" },
      releasedAt: null, quarantinedAt: null, quarantineReason: null, recalledAt: null, recallReason: null,
    },
    {
      id: "STER-0004", sterilizer: "高压灭菌器 B", operator: "王护士", cycleAt: iso(shift(-4, -1)), packageIds: ["PKG-0008", "PKG-0009"],
      status: "quarantined",
      monitors: { physical: "pass", chemical: "fail", biological: "pass", chemicalNote: "包内指示卡未达到标准变色" },
      releasedAt: null, quarantinedAt: iso(shift(-4)), quarantineReason: "化学监测不合格", recalledAt: null, recallReason: null,
    },
    {
      id: "STER-0005", sterilizer: "高压灭菌器 A", operator: "李护士", cycleAt: iso(shift(-7)), packageIds: ["PKG-0010", "PKG-0011"],
      status: "released", monitors: passAll, releasedAt: iso(shift(-7, 0.5)), quarantinedAt: null, quarantineReason: null,
      recalledAt: iso(shift(-6, 2)), recallReason: "生物监测复核阳性，院感紧急召回",
    },
    {
      id: "STER-0006", sterilizer: "高压灭菌器 A", operator: "李护士", cycleAt: iso(shift(-200, 2)), packageIds: ["PKG-0012"],
      status: "released", monitors: passAll, releasedAt: iso(shift(-200, 2.5)), quarantinedAt: null, quarantineReason: null, recalledAt: null, recallReason: null,
    },
  ];

  const issues: IssueRecord[] = [
    { id: "ISS-0001", packageId: "PKG-0001", sterBatchId: "STER-0001", chair: "3 号椅位", issuedAt: iso(shift(-1, -2)), returnedAt: null, tracking: "normal", trackedNote: null },
    { id: "ISS-0002", packageId: "PKG-0002", sterBatchId: "STER-0001", chair: "5 号椅位", issuedAt: iso(shift(-1, 1)), returnedAt: null, tracking: "normal", trackedNote: null },
    { id: "ISS-0003", packageId: "PKG-0010", sterBatchId: "STER-0005", chair: "1 号椅位", issuedAt: iso(shift(-6, -2)), returnedAt: null, tracking: "to-track", trackedNote: null },
    { id: "ISS-0004", packageId: "PKG-0011", sterBatchId: "STER-0005", chair: "2 号椅位", issuedAt: iso(shift(-6, 1)), returnedAt: null, tracking: "confirmed", trackedNote: "已收回并重新灭菌" },
  ];

  return { packages, washBatches, sterBatches, issues, seq: 13 };
}
