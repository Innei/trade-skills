import { useEffect, useSyncExternalStore } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import {
  closeContextMenu,
  getServerSnapshot,
  getSnapshot,
  subscribe,
  updateLastPointer,
  type ContextMenuItem,
} from "./contextMenuStore";

function isDivider(item: ContextMenuItem): item is { type: "divider"; key?: string } {
  return "type" in item && item.type === "divider";
}

export function ContextMenuHost() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const handler = (event: PointerEvent | MouseEvent) => updateLastPointer(event);
    window.addEventListener("pointerdown", handler, true);
    window.addEventListener("contextmenu", handler, true);
    return () => {
      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("contextmenu", handler, true);
    };
  }, []);

  if (!state.open && state.items.length === 0) return null;

  return (
    <ContextMenu.Root
      open={state.open}
      onOpenChange={(open) => {
        if (!open) closeContextMenu();
      }}
    >
      <ContextMenu.Portal>
        <ContextMenu.Positioner
          className="ui-context-menu-positioner"
          anchor={state.anchor ?? undefined}
          side="bottom"
          align="start"
          sideOffset={2}
        >
          <ContextMenu.Popup className="ui-context-menu-popup">
            {state.items.map((item, i) => {
              if (isDivider(item)) {
                return (
                  <ContextMenu.Separator
                    key={item.key ?? `divider-${i}`}
                    className="ui-context-menu-separator"
                  />
                );
              }
              return (
                <ContextMenu.Item
                  key={item.key ?? `item-${i}`}
                  className={`ui-context-menu-item${item.danger ? " ui-context-menu-item--danger" : ""}`}
                  disabled={item.disabled}
                  onClick={() => item.onClick?.()}
                >
                  {item.icon ? <span className="ui-context-menu-item-icon">{item.icon}</span> : null}
                  <span className="ui-context-menu-item-label">{item.label}</span>
                </ContextMenu.Item>
              );
            })}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
