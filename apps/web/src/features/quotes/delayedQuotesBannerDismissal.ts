import { useSyncExternalStore } from 'react';

export const DELAYED_QUOTES_BANNER_DISMISSED_STORAGE_KEY =
  'kansoku.delayed-quotes-banner-dismissed';

type ReadableStorage = Pick<Storage, 'getItem'>;

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readDelayedQuotesBannerDismissed(
  storage: ReadableStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(DELAYED_QUOTES_BANNER_DISMISSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let dismissed = readDelayedQuotesBannerDismissed();
const listeners = new Set<() => void>();
let listeningForStorageChanges = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function handleStorageChange(event: StorageEvent): void {
  if (event.key !== DELAYED_QUOTES_BANNER_DISMISSED_STORAGE_KEY) return;
  const next = event.newValue === '1';
  if (next === dismissed) return;
  dismissed = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!listeningForStorageChanges && typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageChange);
    listeningForStorageChanges = true;
  }
  return () => listeners.delete(listener);
}

export function getDelayedQuotesBannerDismissed(): boolean {
  return dismissed;
}

export function dismissDelayedQuotesBanner(): void {
  if (dismissed) return;
  dismissed = true;
  try {
    browserStorage()?.setItem(DELAYED_QUOTES_BANNER_DISMISSED_STORAGE_KEY, '1');
  } catch {
    // The dismissal still applies for this session when storage is unavailable.
  }
  emit();
}

export function useDelayedQuotesBannerDismissed(): boolean {
  return useSyncExternalStore(subscribe, getDelayedQuotesBannerDismissed, () => false);
}

export function resetDelayedQuotesBannerDismissedForTests(): void {
  dismissed = false;
  listeners.clear();
}

export function subscribeForTests(listener: () => void): () => void {
  return subscribe(listener);
}
