import { describe, expect, it, vi } from "vitest";
import type { ChartDoc, ChartMeta } from "../../../shared/types.js";

const store = vi.hoisted(() => ({
  listCharts: vi.fn(),
  loadChart: vi.fn(),
}));

vi.mock("../src/services/store.js", () => store);

const provider = vi.hoisted(() => ({
  getQuotes: vi.fn(),
}));

vi.mock("../src/services/marketdata/registry.js", () => ({ getProvider: () => provider }));

const { buildOverviewBoard } = await import("../src/services/cockpit/board.js");
const { isProPresent } = await import("../src/pro/registry.js");
const { easternDate } = await import("../src/services/session.js");
const { handleConnection, parseWsMessage } = await import("../src/realtime/channelProtocol.js");

function meta(): ChartMeta {
  return {
    id: `${easternDate()}-free-intraday`,
    schema_version: 2,
    type: "intraday",
    title: "FREE 短线多周期",
    symbol: "FREE.US",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function doc(): ChartDoc {
  return {
    ...meta(),
    input: { symbol: "FREE.US" },
    built: { kind: "intraday" } as unknown as ChartDoc["built"],
  };
}

describe("pro free-mode fallback for board.ts and realtime channels (no builtin registered)", () => {
  it("has nothing registered so the default hooks apply", () => {
    expect(isProPresent()).toBe(false);
  });

  it("reports no follow state and no comments for any symbol", async () => {
    const today = easternDate();
    store.listCharts.mockResolvedValue([meta()]);
    store.loadChart.mockResolvedValue(doc());
    provider.getQuotes.mockResolvedValue([]);

    const board = await buildOverviewBoard((m) => `http://localhost/#/charts/${m.id}`);
    expect(board.date).toBe(today);
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0].ai_following).toBe(false);
    expect(board.rows[0].latest_comment).toBeNull();
    expect(board.rows[0].alert_count).toBe(0);
  });

  it("rejects a pro-only channel kind (e.g. comments) as unknown when no pro module is registered", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "comments", symbol: "FREE.US" })).toBeNull();
  });

  it("silently ignores a subscribe for a pro-only channel kind, no crash and no reply", async () => {
    const sent: string[] = [];
    let onMessage: ((raw: string) => void) | undefined;
    const conn = {
      send: (text: string) => sent.push(text),
      onMessage: (cb: (raw: string) => void) => {
        onMessage = cb;
      },
      onClose: () => {},
    };
    handleConnection(conn);
    onMessage?.(JSON.stringify({ op: "sub", key: "k1", kind: "comments", symbol: "FREE.US" }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sent).toHaveLength(0);
  });
});
