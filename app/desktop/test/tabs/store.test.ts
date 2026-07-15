import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyMutation,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  createTabsFileStore,
  defaultTabsState,
  openTab,
  adoptTabs,
  updateTabRoute,
  updateTabScroll,
  updateTabTitle,
  type TabsState,
} from "../../src/tabs/store.js";

function tabsOf(state: TabsState): string[] {
  return state.tabs.map((tab) => tab.id);
}

describe("defaultTabsState", () => {
  it("starts with a single home tab", () => {
    const state = defaultTabsState();
    expect(state.revision).toBe(0);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].route).toBe("/");
  });
});

describe("openTab", () => {
  it("appends a new tab and bumps revision", () => {
    const state = defaultTabsState();
    const next = openTab(state, "/symbol/NVDA.US");
    expect(next.revision).toBe(state.revision + 1);
    expect(next.tabs).toHaveLength(2);
    expect(next.tabs[1].route).toBe("/symbol/NVDA.US");
    expect(next.tabs[1].title).toBe("Kansoku");
    expect(next.tabs[1].scrollY).toBe(0);
  });
});

describe("closeTab", () => {
  it("removes the tab and bumps revision", () => {
    const state = openTab(defaultTabsState(), "/symbol/NVDA.US");
    const targetId = state.tabs[0].id;
    const next = closeTab(state, targetId);
    expect(next.revision).toBe(state.revision + 1);
    expect(tabsOf(next)).not.toContain(targetId);
    expect(next.tabs).toHaveLength(1);
  });

  it("is a no-op when the tab does not exist", () => {
    const state = defaultTabsState();
    const next = closeTab(state, "missing-id");
    expect(next).toBe(state);
  });

  it("resets to a single home tab when the last tab is closed", () => {
    const state = defaultTabsState();
    const targetId = state.tabs[0].id;
    const next = closeTab(state, targetId);
    expect(next.revision).toBe(state.revision + 1);
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0].route).toBe("/");
    expect(next.tabs[0].id).not.toBe(targetId);
  });
});

describe("closeOtherTabs", () => {
  it("keeps only the given tab", () => {
    let state = defaultTabsState();
    state = openTab(state, "/symbol/NVDA.US");
    state = openTab(state, "/symbol/MRVL.US");
    const keepId = state.tabs[1].id;
    const next = closeOtherTabs(state, keepId);
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0].id).toBe(keepId);
    expect(next.revision).toBe(state.revision + 1);
  });

  it("is a no-op when the tab does not exist", () => {
    const state = defaultTabsState();
    const next = closeOtherTabs(state, "missing-id");
    expect(next).toBe(state);
  });
});

describe("closeTabsToRight", () => {
  it("drops every tab after the given id", () => {
    let state = defaultTabsState();
    state = openTab(state, "/symbol/NVDA.US");
    state = openTab(state, "/symbol/MRVL.US");
    const anchorId = state.tabs[1].id;
    const next = closeTabsToRight(state, anchorId);
    expect(tabsOf(next)).toEqual(state.tabs.slice(0, 2).map((tab) => tab.id));
    expect(next.revision).toBe(state.revision + 1);
  });

  it("is a no-op when the tab does not exist", () => {
    const state = defaultTabsState();
    const next = closeTabsToRight(state, "missing-id");
    expect(next).toBe(state);
  });
});

describe("updateTabRoute / updateTabTitle / updateTabScroll", () => {
  it("patches the matching tab and bumps revision", () => {
    const state = defaultTabsState();
    const id = state.tabs[0].id;

    const withRoute = updateTabRoute(state, id, "/symbol/NVDA.US");
    expect(withRoute.tabs[0].route).toBe("/symbol/NVDA.US");
    expect(withRoute.revision).toBe(state.revision + 1);

    const withTitle = updateTabTitle(withRoute, id, "NVDA");
    expect(withTitle.tabs[0].title).toBe("NVDA");
    expect(withTitle.revision).toBe(withRoute.revision + 1);

    const withScroll = updateTabScroll(withTitle, id, 240);
    expect(withScroll.tabs[0].scrollY).toBe(240);
    expect(withScroll.revision).toBe(withTitle.revision + 1);
  });

  it("is a no-op when the tab does not exist", () => {
    const state = defaultTabsState();
    expect(updateTabRoute(state, "missing-id", "/x")).toBe(state);
    expect(updateTabTitle(state, "missing-id", "x")).toBe(state);
    expect(updateTabScroll(state, "missing-id", 1)).toBe(state);
  });
});

describe("adoptTabs", () => {
  it("takes over an empty store", () => {
    const empty: TabsState = { revision: 3, tabs: [] };
    const legacyTabs = [{ id: "a", route: "/symbol/NVDA.US", title: "NVDA", scrollY: 10 }];
    const next = adoptTabs(empty, legacyTabs);
    expect(next.tabs).toEqual(legacyTabs);
    expect(next.revision).toBe(4);
  });

  it("is a no-op when the store already has tabs", () => {
    const state = defaultTabsState();
    const next = adoptTabs(state, [{ id: "a", route: "/", title: "x", scrollY: 0 }]);
    expect(next).toBe(state);
  });

  it("is a no-op when the incoming list has no valid tabs", () => {
    const empty: TabsState = { revision: 0, tabs: [] };
    const next = adoptTabs(empty, [{ id: 1 } as never]);
    expect(next).toBe(empty);
  });
});

describe("applyMutation", () => {
  it("dispatches every op kind", () => {
    let state = defaultTabsState();
    state = applyMutation(state, { op: "open", route: "/symbol/NVDA.US" });
    expect(state.tabs).toHaveLength(2);

    const id = state.tabs[1].id;
    state = applyMutation(state, { op: "updateTitle", id, title: "NVDA" });
    expect(state.tabs[1].title).toBe("NVDA");

    state = applyMutation(state, { op: "updateRoute", id, route: "/symbol/NVDA.US?tab=news" });
    expect(state.tabs[1].route).toBe("/symbol/NVDA.US?tab=news");

    state = applyMutation(state, { op: "updateScroll", id, scrollY: 99 });
    expect(state.tabs[1].scrollY).toBe(99);

    state = applyMutation(state, { op: "closeOthers", id });
    expect(state.tabs).toHaveLength(1);

    state = applyMutation(state, { op: "open", route: "/symbol/MRVL.US" });
    const rightId = state.tabs[0].id;
    state = applyMutation(state, { op: "closeToRight", id: rightId });
    expect(state.tabs).toHaveLength(1);

    state = applyMutation(state, { op: "close", id: rightId });
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].route).toBe("/");

    const adopted = applyMutation({ revision: 0, tabs: [] }, {
      op: "adopt",
      tabs: [{ id: "z", route: "/", title: "x", scrollY: 0 }],
    });
    expect(adopted.tabs).toHaveLength(1);
  });
});

describe("createTabsFileStore", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "tabs-store-"));
    path = join(dir, "tabs.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("falls back to a single home tab when the file is absent", async () => {
    const store = createTabsFileStore(path);
    const state = await store.load();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].route).toBe("/");
  });

  it("treats a corrupt file as a fresh home tab", async () => {
    await rm(path, { force: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, "not json");
    const state = await createTabsFileStore(path).load();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].route).toBe("/");
  });

  it("debounces scheduleSave and persists only the latest state after the wait", async () => {
    const debounceMs = 30;
    const store = createTabsFileStore(path, debounceMs);
    const first = openTab(defaultTabsState(), "/symbol/NVDA.US");
    const second = openTab(first, "/symbol/MRVL.US");

    store.scheduleSave(first);
    await new Promise((resolve) => setTimeout(resolve, debounceMs / 2));
    store.scheduleSave(second);

    const readerMid = await readFile(path, "utf8").catch(() => null);
    expect(readerMid).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, debounceMs + 20));

    const raw = await readFile(path, "utf8");
    const persisted = JSON.parse(raw) as TabsState;
    expect(persisted.tabs).toHaveLength(3);
  });

  it("round-trips through load after a flush", async () => {
    const store = createTabsFileStore(path, 500);
    const state = openTab(defaultTabsState(), "/symbol/NVDA.US");
    store.scheduleSave(state);
    await store.flush();

    const reloaded = await createTabsFileStore(path).load();
    expect(reloaded.tabs).toHaveLength(2);
    expect(reloaded.revision).toBe(state.revision);
  });
});
