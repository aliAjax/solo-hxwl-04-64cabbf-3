// 共享 UI：状态徽标、提示条、表单字段、空态
import { useEffect, useState, type ReactNode } from "react";
import type { MonitorResult } from "./types";
import { stageLabel, type PackageStage } from "./domain";

export type Toast = { ok: boolean; text: string; key: number } | null;

export function useToast(): { toast: Toast; notify: (ok: boolean, text: string) => void } {
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  return { toast, notify: (ok, text) => setToast({ ok, text, key: Date.now() }) };
}

export function ToastBar({ toast }: { toast: Toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.ok ? "toast-ok" : "toast-err"}`}>{toast.ok ? "✓ " : "⚠ "}{toast.text}</div>;
}

const stageClass: Record<PackageStage, string> = {
  registered: "badge-muted",
  washing: "badge-blue",
  washed: "badge-blue",
  sterilizing: "badge-amber",
  quarantined: "badge-red",
  released: "badge-green",
  issued: "badge-purple",
  returned: "badge-muted",
};

export function StageBadge({ stage }: { stage: PackageStage }) {
  return <span className={`badge ${stageClass[stage]}`}>{stageLabel(stage)}</span>;
}

const monitorMeta: Record<MonitorResult, { text: string; cls: string }> = {
  pass: { text: "通过", cls: "badge-green" },
  fail: { text: "不合格", cls: "badge-red" },
  pending: { text: "待录入", cls: "badge-amber" },
};

export function MonitorBadge({ value }: { value: MonitorResult }) {
  const m = monitorMeta[value];
  return <span className={`badge ${m.cls}`}>{m.text}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function Empty({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {desc && <p>{desc}</p>}
      {action}
    </div>
  );
}

export function KeyVal({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <b className={strong ? "kv-strong" : ""}>{v}</b>
    </div>
  );
}
