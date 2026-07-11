import type { SettingsViewModel } from "./settingsViewModel";

type Summary = SettingsViewModel["summary"];

function StatusCell({
  label,
  value,
  meta,
  tone,
  action,
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: "up" | "accent" | "down";
  action?: () => void;
}) {
  const valueClass = tone ? "settings-status-value settings-status-value--" + tone : "settings-status-value";

  return (
    <div className="settings-status-cell">
      <div className="settings-status-label">{label}</div>
      <div className={valueClass}>{value}</div>
      {meta ? <div className="settings-status-meta">{meta}</div> : null}
      {action ? (
        <button className="settings-status-retry" type="button" onClick={action}>
          重试
        </button>
      ) : null}
    </div>
  );
}

export function SettingsStatusStrip({
  summary,
  usageError,
  onRetryUsage,
}: {
  summary: Summary;
  usageError: string | null;
  onRetryUsage: () => void;
}) {
  return (
    <section className="settings-status-strip" aria-label="设置状态总览">
      <StatusCell
        label="配置状态"
        value={summary.statusLabel}
        meta={summary.enabledLabel}
        tone={summary.statusTone}
      />
      <StatusCell label="主模型" value={summary.primaryLabel} />
      <StatusCell label="Provider 配置" value={summary.providerLabel} />
      <StatusCell
        label="今日用量"
        value={summary.usageLabel}
        meta={usageError ?? undefined}
        action={usageError ? onRetryUsage : undefined}
      />
    </section>
  );
}
