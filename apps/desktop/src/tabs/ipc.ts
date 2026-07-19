import { ipcMain } from 'electron';
import { TABS_GET_CHANNEL, TABS_MUTATE_CHANNEL } from './channels.js';
import type { TabsService } from './service.js';
import type { MutateOp } from './store.js';

export function registerTabsIpc(tabs: TabsService): void {
  ipcMain.handle(TABS_GET_CHANNEL, () => tabs.snapshot());
  ipcMain.handle(TABS_MUTATE_CHANNEL, (_event, payload: MutateOp) => tabs.mutate(payload));
}
