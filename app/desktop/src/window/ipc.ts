import { ipcMain } from "electron";
import { WINDOWS_ACTIVE_TAB_CHANNEL, WINDOWS_CONTEXT_CHANNEL } from "./channels.js";

export interface WindowsContext {
  windowId: string;
  activeTabId: string;
}

export interface WindowsIpcDeps {
  getContext(senderId: number): WindowsContext | undefined;
  reportActiveTab(senderId: number, activeTabId: string): void;
}

export function registerWindowsIpc(deps: WindowsIpcDeps): void {
  ipcMain.handle(WINDOWS_CONTEXT_CHANNEL, (event) => deps.getContext(event.sender.id));

  ipcMain.on(WINDOWS_ACTIVE_TAB_CHANNEL, (event, activeTabId: string) => {
    deps.reportActiveTab(event.sender.id, activeTabId);
  });
}
