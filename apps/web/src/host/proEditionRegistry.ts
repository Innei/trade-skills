import * as React from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import { isValidWebEditionEntry, WEB_EDITION_ABI_VERSION } from '@kansoku/core/pro/webEditionHost';
import type { WebEditionHost } from '@kansoku/core/pro/webEditionHost';
import { client } from '../client';
import { injectSharedReactImportMapOnce } from './bootstrapWebEditionHost';
import type { BootstrapDeps, ReactSingletonModules } from './bootstrapWebEditionHost';

export const PRO_ENTRY_SPECIFIER = 'pro-asset://web/index.mjs';

export interface ProEditionHandle {
  mount: (container: Element) => () => void;
  routes: Map<string, () => Promise<{ default: unknown }>>;
  slots: Map<string, () => Promise<{ default: unknown }>>;
}

let cachedEdition: Promise<ProEditionHandle | null> | null = null;

async function buildProEdition(deps: BootstrapDeps): Promise<ProEditionHandle | null> {
  const reactSingleton: ReactSingletonModules = deps.reactSingleton ?? {
    react: React,
    reactJsxRuntime: ReactJsxRuntime,
    reactDomClient: await import('react-dom/client'),
  };

  injectSharedReactImportMapOnce(reactSingleton);

  const load = deps.loadEntry ?? ((specifier: string) => import(/* @vite-ignore */ specifier));
  let mod: unknown;
  try {
    mod = await load(PRO_ENTRY_SPECIFIER);
  } catch (error) {
    // Expected in the community build / when the pro-asset manifest is
    // absent or locked — the protocol handler 404s and the dynamic import
    // rejects. Not an error worth surfacing to the user.
    console.info('[web-edition] pro-asset entry unavailable, not mounting', error);
    return null;
  }

  if (!isValidWebEditionEntry(mod)) {
    console.error('[web-edition] pro-asset entry failed ABI validation, refusing to mount');
    return null;
  }

  const routes = new Map<string, () => Promise<{ default: unknown }>>();
  const slots = new Map<string, () => Promise<{ default: unknown }>>();

  const host: WebEditionHost = deps.createHost?.() ?? {
    abiVersion: WEB_EDITION_ABI_VERSION,
    react: reactSingleton.react,
    reactJsxRuntime: reactSingleton.reactJsxRuntime,
    registerRoute: deps.registerRoute ?? ((path, loadPage) => routes.set(path, loadPage)),
    registerSlot: (slotId, loadComponent) => slots.set(slotId, loadComponent),
    client,
  };

  const edition = mod.createEdition(host);
  return {
    mount: (container: Element) => edition.mount(container),
    routes,
    slots,
  };
}

// A pro entry session should perform exactly one dynamic import() and one
// createEdition() call — every caller (route fallback, slot lookups) shares
// this memoized promise. Explicit deps (unit tests injecting their own
// loadEntry/reactSingleton) bypass the cache so each call gets a fresh,
// isolated build instead of leaking state across independent test cases.
export function ensureProEdition(deps: BootstrapDeps = {}): Promise<ProEditionHandle | null> {
  const hasOverrides = Object.keys(deps).length > 0;
  if (!hasOverrides) {
    if (!cachedEdition) cachedEdition = buildProEdition(deps);
    return cachedEdition;
  }
  return buildProEdition(deps);
}

export function resetProEditionCacheForTests(): void {
  cachedEdition = null;
}
