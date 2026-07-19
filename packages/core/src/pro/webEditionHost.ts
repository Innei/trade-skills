export const WEB_EDITION_ABI_VERSION = 1;

export interface WebEditionHost {
  abiVersion: number;
  react: unknown;
  reactJsxRuntime: unknown;
  registerRoute(path: string, loadPage: () => Promise<{ default: unknown }>): void;
  registerSlot(slotId: string, loadComponent: () => Promise<{ default: unknown }>): void;
  // Opaque transport handle (apps/web's typed API client). Narrow-interface
  // injection per design §15.4: pro slots that need live data cast this to
  // their own minimal locally-declared shape instead of importing apps/web
  // source across the package boundary.
  client?: unknown;
}

export interface WebEditionEntryModule {
  abiVersion: number;
  runtime: "web";
  createEdition(host: WebEditionHost): { mount(container: Element): () => void };
}

export function isValidWebEditionEntry(mod: unknown): mod is WebEditionEntryModule {
  if (mod === null || typeof mod !== "object") return false;
  const candidate = mod as Partial<WebEditionEntryModule>;
  return (
    candidate.abiVersion === WEB_EDITION_ABI_VERSION &&
    candidate.runtime === "web" &&
    typeof candidate.createEdition === "function"
  );
}
