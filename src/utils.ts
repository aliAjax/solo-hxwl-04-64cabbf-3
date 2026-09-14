// 时间与编号工具（纯函数，无后端依赖）

export function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** ISO 时间 → yyyy-MM-dd HH:mm */
export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO 时间 → yyyy-MM-dd */
export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 当前本地时间的 datetime-local 值 */
export function nowLocalInput(): string {
  return toLocalInput(new Date().toISOString());
}

/** ISO → datetime-local 输入值 */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 值 → ISO */
export function localInputToIso(v: string): string {
  // 本地时间字符串补秒后按本地时区解析
  const d = new Date(v.length === 16 ? v + ":00" : v);
  return d.toISOString();
}

/** 日期（yyyy-MM-dd）→ ISO */
export function dateInputToIso(v: string): string {
  return new Date(v + "T00:00:00").toISOString();
}

/** 加上指定天数 */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** 生成业务编号，前缀 + 4 位序号 */
export function nextId(prefix: string, seq: number): { id: string; seq: number } {
  const next = seq + 1;
  return { id: `${prefix}-${pad(next, 4)}`, seq: next };
}

/** 今天零点 ISO（用于按天判断） */
export function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
