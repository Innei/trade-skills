import type { ReactNode } from "react";

export type ContextMenuItem =
  | {
      key?: string;
      label: ReactNode;
      icon?: ReactNode;
      onClick?: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | { type: "divider"; key?: string };

export interface ContextMenuAnchor {
  getBoundingClientRect: () => DOMRect;
}

interface ContextMenuState {
  open: boolean;
  items: ContextMenuItem[];
  anchor: ContextMenuAnchor | null;
}

const emptyState: ContextMenuState = { open: false, items: [], anchor: null };

let state: ContextMenuState = emptyState;
const listeners = new Set<() => void>();
const lastPointer = { x: 0, y: 0, ready: false };

function emit() {
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getSnapshot(): ContextMenuState {
  return state;
}

export function getServerSnapshot(): ContextMenuState {
  return emptyState;
}

// Tracked globally so an imperative showContextMenu() opens at the cursor. The
// host registers these on window in the capture phase, so lastPointer is fresh
// before any element's own contextmenu/pointerdown handler runs.
export function updateLastPointer(event: MouseEvent | PointerEvent): void {
  lastPointer.x = event.clientX;
  lastPointer.y = event.clientY;
  lastPointer.ready = true;
}

function anchorAt(x: number, y: number): ContextMenuAnchor {
  return {
    getBoundingClientRect: () =>
      ({
        x,
        y,
        top: y,
        left: x,
        right: x,
        bottom: y,
        width: 0,
        height: 0,
        toJSON: () => undefined,
      }) as DOMRect,
  };
}

export function showContextMenu(items: ContextMenuItem[]): void {
  if (typeof window === "undefined") return;
  const x = lastPointer.ready ? lastPointer.x : window.innerWidth / 2;
  const y = lastPointer.ready ? lastPointer.y : window.innerHeight / 2;
  state = { open: true, items, anchor: anchorAt(x, y) };
  emit();
}

// Swap items without re-positioning — for interactive items that mutate the menu.
export function updateContextMenuItems(items: ContextMenuItem[]): void {
  if (typeof window === "undefined") return;
  state = { ...state, items };
  emit();
}

export function closeContextMenu(): void {
  state = emptyState;
  emit();
}
