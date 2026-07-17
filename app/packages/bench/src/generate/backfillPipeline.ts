import { promises as fs } from "node:fs";
import { join } from "node:path";
import { loadQuestionFile, loadQuestionForScorer } from "../dataset/loader.js";
import type { BenchNewsItem } from "../schema/newsItem.js";
import type { Question } from "../schema/question.js";
import { cacheFile, readCache, writeCache } from "./cache.js";
import { assertNoLeak, mapEdgarFilings, mapGdeltArticles } from "./newsMapping.js";
import type { EdgarFiling, GdeltArticle } from "./newsMapping.js";
import type { FetchEdgarFilings, FetchGdeltArticles } from "./newsSource.js";
import { edgarWindow, gdeltWindow, toGdeltStamp } from "./newsWindow.js";
import { specForSymbol } from "./symbols.js";

export interface NewsBackfillDeps {
  datasetsRoot: string;
  fresh: boolean;
  fetchGdelt: FetchGdeltArticles;
  fetchEdgar: FetchEdgarFilings;
  log: (line: string) => void;
}

export const GDELT_CIRCUIT_BREAKER_THRESHOLD = 2;

export interface GdeltCircuitBreaker {
  consecutiveFailures: number;
  tripped: boolean;
}

export function newGdeltCircuitBreaker(): GdeltCircuitBreaker {
  return { consecutiveFailures: 0, tripped: false };
}

export function recordGdeltOutcome(breaker: GdeltCircuitBreaker, failed: boolean): void {
  if (!failed) {
    breaker.consecutiveFailures = 0;
    return;
  }
  breaker.consecutiveFailures += 1;
  if (breaker.consecutiveFailures >= GDELT_CIRCUIT_BREAKER_THRESHOLD) breaker.tripped = true;
}

export interface QuestionNewsResult {
  news: BenchNewsItem[];
  gdeltCount: number;
  edgarCount: number;
  gdeltError: string | null;
  gdeltSkipped: boolean;
}

async function loadGdeltArticles(
  symbol: string,
  companyQuery: string,
  startIso: string,
  endIso: string,
  deps: NewsBackfillDeps,
): Promise<GdeltArticle[]> {
  const period = `news-gdelt-${toGdeltStamp(startIso)}-${toGdeltStamp(endIso)}`;
  const file = cacheFile(deps.datasetsRoot, symbol, period);
  if (!deps.fresh) {
    const cached = await readCache<GdeltArticle[]>(file);
    if (cached) return cached;
  }
  const articles = await deps.fetchGdelt(companyQuery, startIso, endIso);
  await writeCache(file, articles);
  return articles;
}

async function loadEdgarFilings(symbol: string, cik: string, deps: NewsBackfillDeps): Promise<EdgarFiling[]> {
  const file = cacheFile(deps.datasetsRoot, symbol, "news-edgar-full");
  if (!deps.fresh) {
    const cached = await readCache<EdgarFiling[]>(file);
    if (cached) return cached;
  }
  const filings = await deps.fetchEdgar(cik);
  await writeCache(file, filings);
  return filings;
}

export async function computeNewsForQuestion(
  symbol: string,
  cutoff: string,
  companyQuery: string | null,
  cik: string | null,
  deps: NewsBackfillDeps,
  breaker?: GdeltCircuitBreaker,
): Promise<QuestionNewsResult> {
  let gdeltItems: BenchNewsItem[] = [];
  let gdeltError: string | null = null;
  let gdeltSkipped = false;
  if (companyQuery) {
    if (breaker?.tripped) {
      gdeltSkipped = true;
      deps.log(`  gdelt skipped for ${symbol} (circuit breaker tripped: durably rate-limited this run)`);
    } else {
      try {
        const { startIso, endIso } = gdeltWindow(cutoff);
        const articles = await loadGdeltArticles(symbol, companyQuery, startIso, endIso, deps);
        gdeltItems = mapGdeltArticles(articles, cutoff);
        if (breaker) recordGdeltOutcome(breaker, false);
      } catch (error) {
        gdeltError = error instanceof Error ? error.message : String(error);
        deps.log(`  gdelt fetch failed for ${symbol} (cutoff ${cutoff}): ${gdeltError}`);
        if (breaker) recordGdeltOutcome(breaker, true);
      }
    }
  }

  let edgarItems: BenchNewsItem[] = [];
  if (cik) {
    const filings = await loadEdgarFilings(symbol, cik, deps);
    const { startDate, endDate } = edgarWindow(cutoff);
    edgarItems = mapEdgarFilings(filings, cutoff, cik, startDate, endDate);
  }

  const news = [...gdeltItems, ...edgarItems];
  assertNoLeak(news, cutoff);
  return { news, gdeltCount: gdeltItems.length, edgarCount: edgarItems.length, gdeltError, gdeltSkipped };
}

function questionFilePath(datasetsRoot: string, version: string, bank: string, id: string): string {
  return join(datasetsRoot, version, bank, `${id}.json`);
}

export interface BackfillNewsOptions {
  datasetsRoot: string;
  resultsRoot: string;
  version: string;
  bank: string;
  symbols?: string[];
  dryRun: boolean;
  fresh: boolean;
  fetchGdelt: FetchGdeltArticles;
  fetchEdgar: FetchEdgarFilings;
  log: (line: string) => void;
  listQuestionIds: (datasetsRoot: string, version: string, bank: string) => Promise<string[]>;
}

export interface QuestionBackfillOutcome {
  id: string;
  symbol: string;
  gdeltCount: number;
  edgarCount: number;
  gdeltError?: string;
  gdeltSkipped?: boolean;
}

export interface BackfillNewsResult {
  processed: QuestionBackfillOutcome[];
  frozenWarning: string[];
  failed: { id: string; error: string }[];
  gdeltFailures: string[];
  gdeltCircuitTripped: boolean;
}

export async function findRunsReferencingVersion(resultsRoot: string, version: string): Promise<string[]> {
  const found: string[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(resultsRoot);
  } catch {
    return found;
  }
  for (const entry of entries) {
    const configFile = join(resultsRoot, entry, "config.json");
    try {
      const raw = await fs.readFile(configFile, "utf8");
      const parsed = JSON.parse(raw) as { datasetVersion?: string };
      if (parsed.datasetVersion === version) found.push(entry);
    } catch {
      continue;
    }
  }
  return found;
}

export async function runBackfillNews(options: BackfillNewsOptions): Promise<BackfillNewsResult> {
  const frozenWarning = await findRunsReferencingVersion(options.resultsRoot, options.version);
  if (frozenWarning.length > 0) {
    options.log(
      `WARNING: dataset version ${options.version} is already referenced by run(s): ${frozenWarning.join(", ")}. In-place rewrite may invalidate recorded scores.`,
    );
  }

  const ids = await options.listQuestionIds(options.datasetsRoot, options.version, options.bank);
  const symbolFilter = options.symbols ? new Set(options.symbols) : null;

  const processed: QuestionBackfillOutcome[] = [];
  const deps: NewsBackfillDeps = {
    datasetsRoot: options.datasetsRoot,
    fresh: options.fresh,
    fetchGdelt: options.fetchGdelt,
    fetchEdgar: options.fetchEdgar,
    log: options.log,
  };

  const failed: { id: string; error: string }[] = [];
  const gdeltFailures: string[] = [];
  const breaker = newGdeltCircuitBreaker();

  for (const id of ids) {
    const file = questionFilePath(options.datasetsRoot, options.version, options.bank, id);
    const question: Question = await loadQuestionFile(file);
    if (symbolFilter && !symbolFilter.has(question.symbol)) continue;
    const spec = specForSymbol(question.symbol);

    try {
      const result = await computeNewsForQuestion(
        question.symbol,
        question.cutoff,
        spec.companyQuery ?? null,
        spec.cik ?? null,
        deps,
        breaker,
      );

      options.log(`${id}: gdelt ${result.gdeltCount}, edgar ${result.edgarCount}`);
      const outcome: QuestionBackfillOutcome = {
        id,
        symbol: question.symbol,
        gdeltCount: result.gdeltCount,
        edgarCount: result.edgarCount,
      };
      if (result.gdeltError) {
        outcome.gdeltError = result.gdeltError;
        gdeltFailures.push(id);
      }
      if (result.gdeltSkipped) outcome.gdeltSkipped = true;
      processed.push(outcome);

      if (options.dryRun) continue;

      const updated: Question = { ...question, fixtures: { ...question.fixtures, news: result.news } };
      await fs.writeFile(file, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
      await loadQuestionForScorer(options.datasetsRoot, options.version, options.bank, id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.log(`${id}: FAILED ${message}`);
      failed.push({ id, error: message });
    }
  }

  return { processed, frozenWarning, failed, gdeltFailures, gdeltCircuitTripped: breaker.tripped };
}
