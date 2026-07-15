import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TabsFileStore, TabsState } from "../../src/tabs/store.js";
import { defaultTabsState, openTab } from "../../src/tabs/store.js";

type Handler = (event: unknown, payload?: unknown) => unknown;

const handlers = new Map<string, Handler>();
const ipcMain = {
  handle: vi.fn((channel: string, handler: Handler) => {
    handlers.set(channel, handler);
  }),
};

class FakeWindow {
  webContents = { send: vi.fn() };
}

let windows: FakeWindow[] = [];
const BrowserWindow = {
  getAllWindows: vi.fn(() => windows),
};

vi.mock("electron", () => ({ ipcMain, BrowserWindow }));

const { registerTabsIpc } = await import("../../src/tabs/ipc.js");
const { TABS_GET_CHANNEL, TABS_MUTATE_CHANNEL, TABS_SNAPSHOT_CHANNEL } = await import(
  "../../src/tabs/channels.js"
);

function fakeFileStore(initial: TabsState): TabsFileStore & { saved: TabsState[] } {
  const saved: TabsState[] = [];
  return {
    saved,
    load: vi.fn(async () => initial),
    scheduleSave: vi.fn((state: TabsState) => {
      saved.push(state);
    }),
    flush: vi.fn(async () => {}),
  };
}

describe("registerTabsIpc", () => {
  beforeEach(() => {
    handlers.clear();
    windows = [new FakeWindow(), new FakeWindow()];
    ipcMain.handle.mockClear();
    BrowserWindow.getAllWindows.mockClear();
  });

  it("returns the loaded snapshot on get", async () => {
    const seeded = openTab(defaultTabsState(), "/symbol/NVDA.US");
    registerTabsIpc(fakeFileStore(seeded));

    const result = await handlers.get(TABS_GET_CHANNEL)?.({});
    expect(result).toEqual(seeded);
  });

  it("applies a mutation, persists it, and broadcasts to every window", async () => {
    const initial = defaultTabsState();
    const fileStore = fakeFileStore(initial);
    registerTabsIpc(fileStore);

    const result = (await handlers.get(TABS_MUTATE_CHANNEL)?.({}, {
      op: "open",
      route: "/symbol/NVDA.US",
    })) as TabsState;

    expect(result.tabs).toHaveLength(2);
    expect(fileStore.scheduleSave).toHaveBeenCalledWith(result);
    for (const win of windows) {
      expect(win.webContents.send).toHaveBeenCalledWith(TABS_SNAPSHOT_CHANNEL, result);
    }
  });

  it("does not persist or broadcast a no-op mutation", async () => {
    const initial = defaultTabsState();
    const fileStore = fakeFileStore(initial);
    registerTabsIpc(fileStore);

    const result = await handlers.get(TABS_MUTATE_CHANNEL)?.({}, { op: "close", id: "missing" });

    expect(result).toEqual(initial);
    expect(fileStore.scheduleSave).not.toHaveBeenCalled();
    for (const win of windows) {
      expect(win.webContents.send).not.toHaveBeenCalled();
    }
  });
});
