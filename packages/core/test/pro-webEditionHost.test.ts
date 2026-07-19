import { describe, expect, it, vi } from "vitest";
import {
  WEB_EDITION_ABI_VERSION,
  isValidWebEditionEntry,
  type WebEditionEntryModule,
  type WebEditionHost,
} from "../src/pro/webEditionHost.js";

function fakeContainer(): Element {
  return {} as unknown as Element;
}

function fakeHost(): WebEditionHost {
  return {
    abiVersion: WEB_EDITION_ABI_VERSION,
    react: {},
    reactJsxRuntime: {},
    registerRoute: vi.fn(),
    registerSlot: vi.fn(),
  };
}

function validEntry(mount = vi.fn()): WebEditionEntryModule {
  return {
    abiVersion: WEB_EDITION_ABI_VERSION,
    runtime: "web",
    createEdition: () => ({ mount }),
  };
}

describe("isValidWebEditionEntry", () => {
  it("accepts a well-formed entry module", () => {
    expect(isValidWebEditionEntry(validEntry())).toBe(true);
  });

  it("rejects a module missing createEdition", () => {
    const mod = { abiVersion: WEB_EDITION_ABI_VERSION, runtime: "web" };
    expect(isValidWebEditionEntry(mod)).toBe(false);
  });

  it("rejects a module with the wrong abiVersion", () => {
    const mod = { ...validEntry(), abiVersion: WEB_EDITION_ABI_VERSION + 1 };
    expect(isValidWebEditionEntry(mod)).toBe(false);
  });

  it("rejects a module with the wrong runtime", () => {
    const mod = { ...validEntry(), runtime: "desktop" };
    expect(isValidWebEditionEntry(mod)).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isValidWebEditionEntry(null)).toBe(false);
    expect(isValidWebEditionEntry(undefined)).toBe(false);
    expect(isValidWebEditionEntry("web")).toBe(false);
  });
});

describe("WebEditionEntryModule.createEdition", () => {
  it("mounts into a container and returns a working cleanup function", () => {
    const container = fakeContainer();
    const unmount = vi.fn();
    const entry = validEntry(vi.fn(() => unmount));
    const host = fakeHost();

    const edition = entry.createEdition(host);
    const cleanup = edition.mount(container);
    cleanup();

    expect(unmount).toHaveBeenCalledTimes(1);
  });
});
