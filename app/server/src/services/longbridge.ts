import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NewsItem, RawBar } from "../../../shared/types.js";
import { ClientError } from "../errors.js";
import type { FlowRow } from "./simple.js";

const execFileP = promisify(execFile);

export async function longbridgeJson<T>(args: string[]): Promise<T> {
  let stdout: string;
  try {
    ({ stdout } = await execFileP("longbridge", [...args, "--format", "json"], {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60_000,
    }));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ClientError(
      `longbridge ${args.join(" ")} failed: ${detail}`,
      "Check `longbridge auth login`, network, and the symbol format (e.g. NVDA.US).",
      502,
    );
  }
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new ClientError(
      `longbridge ${args.join(" ")} returned non-JSON output`,
      stdout.slice(0, 200),
      502,
    );
  }
}

export function fetchKline(symbol: string, period: string, count: number, session?: string): Promise<RawBar[]> {
  const args = ["kline", symbol, "--period", period, "--count", String(count)];
  if (session) args.push("--session", session);
  return longbridgeJson<RawBar[]>(args);
}

export function fetchFlow(symbol: string): Promise<FlowRow[]> {
  return longbridgeJson<FlowRow[]>(["capital", symbol, "--flow"]);
}

export interface RawCapitalDistribution {
  capital_in: { large: string; medium: string; small: string };
  capital_out: { large: string; medium: string; small: string };
  symbol: string;
  timestamp: string;
}

export function fetchCapitalDistribution(symbol: string): Promise<RawCapitalDistribution> {
  return longbridgeJson<RawCapitalDistribution>(["capital", symbol]);
}

export interface RawPosition {
  available: string;
  cost_price: string;
  currency: string;
  market: string;
  name: string;
  quantity: string;
  symbol: string;
}

export function fetchPositions(): Promise<RawPosition[]> {
  return longbridgeJson<RawPosition[]>(["positions"]);
}

interface RawNewsItem {
  id: string | number;
  title: string;
  published_at: string;
  url: string;
}

export async function fetchNews(symbol: string, limit = 6): Promise<NewsItem[]> {
  try {
    const items = await longbridgeJson<RawNewsItem[]>(["news", symbol, "--lang", "zh-CN"]);
    return items.slice(0, limit).map((n) => ({
      id: String(n.id),
      title: n.title,
      published_at: n.published_at,
      url: n.url,
    }));
  } catch {
    return [];
  }
}
