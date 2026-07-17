import { useSyncExternalStore } from "react";

export type LicenseModalTrigger = "guard" | "runtime-403";

export interface LicenseModalState {
  open: boolean;
  trigger: LicenseModalTrigger | null;
}

let state: LicenseModalState = { open: false, trigger: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function openLicenseModal(trigger: LicenseModalTrigger): void {
  state = { open: true, trigger };
  emit();
}

export function closeLicenseModal(): void {
  if (!state.open) return;
  state = { open: false, trigger: null };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): LicenseModalState {
  return state;
}

export function useLicenseModalState(): LicenseModalState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function resetLicenseModalStoreForTests(): void {
  state = { open: false, trigger: null };
  listeners.clear();
}

export function subscribeForTests(listener: () => void): () => void {
  return subscribe(listener);
}

export function getLicenseModalStateForTests(): LicenseModalState {
  return getSnapshot();
}
