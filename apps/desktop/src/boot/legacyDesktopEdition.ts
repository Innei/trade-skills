import { DesktopEdition } from '@kansoku/core/edition/desktopEdition';
import type { IpcRegistry } from '@kansoku/core/edition/ipcRegistry';
import type { RealtimeChannelRegistry } from '@kansoku/core/edition/realtimeRegistry';
import { getPro } from '@kansoku/core/pro/registry';

export class LegacyCompatDesktopEdition extends DesktopEdition {
  override configureIpc(registry: IpcRegistry): void {
    registry.register(...(getPro()?.ipcServiceClasses ?? []));
  }

  override configureRealtime(registry: RealtimeChannelRegistry): void {
    registry.register(...(getPro()?.channels ?? []));
  }
}
