import type { IpcServiceConstructor } from 'electron-ipc-decorator';
import type { ProChannel } from '@kansoku/pro-api';

export interface DesktopProComposition {
  ipcServices: readonly IpcServiceConstructor[];
  realtimeChannels: readonly ProChannel[];
  start?: () => Promise<void> | void;
  dispose?: () => Promise<void> | void;
}
