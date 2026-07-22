import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Badge, Button, openModal, Switch } from '@web/ui';
import { AgentKitConflictDialog } from './AgentKitConflictDialog';
import { AgentKitUpdateDialog } from './AgentKitUpdateDialog';
import {
  getDesktopAgentKitBridge,
  type AgentKitStatus,
  type PendingConflict,
  type PendingUpdate,
} from './desktopAgentKit';

const pendingRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const locationRowStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };

const pathStyle: CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: '0.85em',
  wordBreak: 'break-all',
};

export function AgentKitSection() {
  const [bridge] = useState(() => getDesktopAgentKitBridge());
  const [status, setStatus] = useState<AgentKitStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!bridge) return;
    try {
      const next = await bridge.getStatus();
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [bridge]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!bridge) return null;

  const withBusy = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (enabled: boolean) => void withBusy(() => bridge.setEnabled({ enabled }));
  const follow = () => void withBusy(() => bridge.followDataRoot());
  const pick = () => void withBusy(() => bridge.pickCustomLocation());
  const forceSync = () => void withBusy(() => bridge.forceSync());
  const clean = () => {
    if (
      !window.confirm('确定要清理 Agent Kit 吗？这会删除本地生成的引导文件与 kansoku-cli 入口。')
    )
      return;
    void withBusy(() => bridge.clean());
  };

  const openConflict = (conflict: PendingConflict) =>
    openModal({
      title: <>处理冲突 · {conflict.dest}</>,
      body: (close) => (
        <AgentKitConflictDialog
          conflict={conflict}
          bridge={bridge}
          onResolved={reload}
          close={close}
        />
      ),
    });

  const openUpdate = (update: PendingUpdate) =>
    openModal({
      title: <>新模板可用 · {update.dest}</>,
      body: (close) => (
        <AgentKitUpdateDialog update={update} bridge={bridge} onResolved={reload} close={close} />
      ),
    });

  return (
    <section className="settings-conn-section settings-conn-longbridge">
      <div className="settings-conn-title">
        <span>Agent Kit</span>
        {status ? (
          <Badge tone={status.enabled ? 'accent' : undefined}>
            {status.enabled ? '已启用' : '已停用'}
          </Badge>
        ) : null}
      </div>

      <div className="note-block">
        为外部 Claude Code / Codex 打开数据目录时提供 skill 引导 + kansoku-cli 入口
      </div>

      <div className="settings-cred-actions">
        <Switch
          ariaLabel="启用 Agent Kit"
          checked={status?.enabled ?? false}
          disabled={busy || !status}
          onCheckedChange={(checked) => toggle(checked)}
        />
      </div>

      {status ? (
        <div className="settings-provider-meta">
          位置：
          {status.location.kind === 'follow-data-root'
            ? `跟随数据目录（${status.dataRoot}）`
            : status.location.path}
          {status.resolvedPath === null ? '（未生效）' : null}
        </div>
      ) : null}

      {status ? (
        <div className="settings-cred-actions" style={locationRowStyle}>
          <Button
            disabled={busy || status.location.kind === 'follow-data-root' || status.followBlocked}
            onClick={follow}
          >
            跟随数据目录
          </Button>
          <Button disabled={busy} onClick={pick}>
            选择目录…
          </Button>
        </div>
      ) : null}

      {status?.followBlocked ? (
        <div className="note-block">
          数据目录是 App 默认位置（Application Support），跟随不可用——请选择一个自定义目录，或先切换数据目录。
        </div>
      ) : null}

      {status ? (
        <div className="settings-provider-meta">
          当前 Kit 版本：{status.kitVersion ?? '—'} · 上次同步：{status.lastSyncAt ?? '—'}
        </div>
      ) : (
        <div className="note-block">加载中…</div>
      )}

      {status?.pendingConflicts?.map((conflict) => (
        <div key={conflict.dest} style={pendingRowStyle}>
          <span>⚠ {conflict.dest}</span>
          <Button onClick={() => openConflict(conflict)}>处理</Button>
        </div>
      ))}

      {status?.pendingUpdates?.map((update) => (
        <div key={update.dest} style={pendingRowStyle}>
          <span>ℹ {update.dest}</span>
          <Button onClick={() => openUpdate(update)}>查看</Button>
        </div>
      ))}

      {status?.enabled && status.resolvedPath ? (
        <div className="settings-provider-meta" style={pathStyle}>
          生效路径：{status.resolvedPath}
        </div>
      ) : null}

      {error ? (
        <div className="settings-test-result settings-test-result--fail">{error}</div>
      ) : null}

      <div className="settings-cred-actions">
        <Button disabled={busy || !status?.resolvedPath} onClick={forceSync}>
          重刷 Agent Kit
        </Button>
        <Button disabled={busy} onClick={clean}>
          清理 Agent Kit
        </Button>
      </div>
    </section>
  );
}
