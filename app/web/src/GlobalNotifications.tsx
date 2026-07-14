import { useEffect, useRef } from "react";
import type { CockpitComment, Notice } from "../../shared/types";
import { maybeNotify, requestNotificationPermissionOnce } from "./lib/notifications";
import { routePathname, useRoute } from "./router";
import { subscribeChannel } from "./wsHub";

interface NotificationEnvelope {
  type: "comment" | "notice";
  comment?: CockpitComment;
  notice?: Notice;
}

export function activeSymbolFromRoute(route: string): string | null {
  const match = routePathname(route).match(/^\/symbol\/(.+)$/);
  if (!match) return null;
  const symbol = decodeURIComponent(match[1]).trim().toUpperCase();
  return symbol.includes(".") ? symbol : `${symbol}.US`;
}

export function GlobalNotifications({ route }: { route: string }) {
  const activeSymbolRef = useRef<string | null>(activeSymbolFromRoute(route));
  activeSymbolRef.current = activeSymbolFromRoute(route);

  useEffect(() => {
    requestNotificationPermissionOnce();
    return subscribeChannel(
      { kind: "notifications" },
      (payload) => {
        const envelope = payload as NotificationEnvelope;
        if (envelope.type === "comment" && envelope.comment) {
          const comment = envelope.comment;
          maybeNotify(
            { type: "comment", live: true, symbol: comment.symbol, level: comment.level, text: comment.text },
            activeSymbolRef.current,
          );
        } else if (envelope.type === "notice" && envelope.notice) {
          maybeNotify({ type: "notice", live: true, notice: envelope.notice }, activeSymbolRef.current);
        }
      },
      () => {},
    );
  }, []);

  return null;
}

export function RoutedGlobalNotifications() {
  return <GlobalNotifications route={useRoute()} />;
}
