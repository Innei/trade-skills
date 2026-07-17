import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Value } from "typebox/value";
import { runBackfillNews } from "./generate/backfillPipeline.js";
import { fetchGdeltArticlesLive, fetchEdgarFilingsLive } from "./generate/newsSource.js";
import { runGenerate } from "./generate/pipeline.js";
import { fetchCalendarLive, fetchKlineHistoryLive } from "./generate/source.js";
import { DEFAULT_SYMBOLS, layerForSymbol, type SymbolSpec } from "./generate/symbols.js";
import { listQuestions } from "./dataset/loader.js";
import { type ReportConfigSnapshot, renderReport } from "./report/render.js";
import { parseBaselineArgs } from "./baseline/args.js";
import { runBenchBaseline } from "./baseline/run.js";
import { type Scores, scoresSchema } from "./schema/scores.js";
import { runGold } from "./score/gold.js";
import { runScore } from "./score/score.js";

const SUBCOMMANDS = ["generate", "run", "baseline", "score", "gold", "report", "backfill-news"] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

const USAGE = `Usage: bench <command> [options]

Commands:
  generate       Build benchmark question datasets
  run            (moved) drive models against the question bank — run from app/pro
  baseline       Emit deterministic baseline answer sheets
  score          Score recorded answer sheets
  gold           Emit hindsight-optimal gold answer sheets
  report         Render a leaderboard report
  backfill-news  Backfill fixtures.news from GDELT + SEC EDGAR

Options:
  -h, --help   Show this help message
`;

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_DATASETS_ROOT = join(PACKAGE_ROOT, "datasets");
const DEFAULT_RESULTS_ROOT = join(PACKAGE_ROOT, "results");

function gitSha(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: PACKAGE_ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const RUN_POINTER = [
  "run requires the pro slot — run it from app/pro.",
  "  cd app/pro && pnpm bench:run --help",
  "The public @kansoku/bench package ships the pure framework (generate, backfill-news, score, gold, report, baseline).",
  "Driving live models against the question bank lives in the private @kansoku/pro package.",
].join("\n");

function runRunCommand(): void {
  process.stderr.write(`${RUN_POINTER}\n`);
  process.exit(1);
}

async function runBaselineCommand(argv: string[]): Promise<void> {
  const args = parseBaselineArgs(argv);
  const result = await runBenchBaseline({
    strategies: args.strategies,
    datasetVersion: args.datasetVersion,
    bank: args.bank,
    modes: args.modes,
    runId: args.runId,
    resultsRoot: DEFAULT_RESULTS_ROOT,
    datasetsRoot: DEFAULT_DATASETS_ROOT,
    questionIds: args.questionIds,
    gitSha: gitSha() ?? undefined,
    log: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(
    `\nbaseline ${result.runId}: written ${result.written}, skipped ${result.skipped} of ${result.planned}\n`,
  );
}

interface GenerateArgs {
  symbols: SymbolSpec[];
  version: string;
  windowsPerSymbol: number;
  dryRun: boolean;
  fresh: boolean;
}

function parseGenerateArgs(argv: string[]): GenerateArgs {
  let symbolsArg: string | undefined;
  let version: string | undefined;
  let windowsPerSymbol = 3;
  let dryRun = false;
  let fresh = false;
  let bank = "swing";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--bank":
        bank = argv[++i];
        break;
      case "--symbols":
        symbolsArg = argv[++i];
        break;
      case "--version":
        version = argv[++i];
        break;
      case "--windows-per-symbol":
        windowsPerSymbol = Number(argv[++i]);
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--fresh":
        fresh = true;
        break;
      default:
        throw new Error(`unknown generate option: ${arg}`);
    }
  }

  if (bank !== "swing") throw new Error(`unsupported bank: ${bank} (only "swing" is implemented)`);
  if (!version) throw new Error("--version is required");
  if (!Number.isInteger(windowsPerSymbol) || windowsPerSymbol < 1) {
    throw new Error(`--windows-per-symbol must be a positive integer, got: ${windowsPerSymbol}`);
  }

  const symbols = symbolsArg
    ? symbolsArg.split(",").map((symbol) => {
        const trimmed = symbol.trim();
        return { symbol: trimmed, layer: layerForSymbol(trimmed) };
      })
    : DEFAULT_SYMBOLS;

  return { symbols, version, windowsPerSymbol, dryRun, fresh };
}

function parseScoreArgs(argv: string[]): { runId: string; datasetVersion: string; bank?: string } {
  let runId: string | undefined;
  let datasetVersion: string | undefined;
  let bank: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--run-id":
        runId = argv[++i];
        break;
      case "--dataset-version":
        datasetVersion = argv[++i];
        break;
      case "--bank":
        bank = argv[++i];
        break;
      default:
        throw new Error(`unknown score option: ${arg}`);
    }
  }
  if (!runId) throw new Error("--run-id is required");
  if (!datasetVersion) throw new Error("--dataset-version is required");
  return { runId, datasetVersion, bank };
}

async function runScoreCommand(argv: string[]): Promise<void> {
  const args = parseScoreArgs(argv);
  const scores = await runScore({
    runId: args.runId,
    datasetVersion: args.datasetVersion,
    bank: args.bank,
    resultsRoot: DEFAULT_RESULTS_ROOT,
    datasetsRoot: DEFAULT_DATASETS_ROOT,
  });
  process.stdout.write(
    `scored ${args.runId}: ${scores.cells.length} cells, ${scores.models.length} models -> scores.json\n`,
  );
}

function parseGoldArgs(argv: string[]): { datasetVersion: string; bank?: string; check: boolean } {
  let datasetVersion: string | undefined;
  let bank: string | undefined;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--dataset-version":
        datasetVersion = argv[++i];
        break;
      case "--bank":
        bank = argv[++i];
        break;
      case "--check":
        check = true;
        break;
      default:
        throw new Error(`unknown gold option: ${arg}`);
    }
  }
  if (!datasetVersion) throw new Error("--dataset-version is required");
  return { datasetVersion, bank, check };
}

async function runGoldCommand(argv: string[]): Promise<void> {
  const args = parseGoldArgs(argv);
  const result = await runGold({
    datasetVersion: args.datasetVersion,
    bank: args.bank,
    check: args.check,
    resultsRoot: DEFAULT_RESULTS_ROOT,
    datasetsRoot: DEFAULT_DATASETS_ROOT,
  });
  process.stdout.write(
    `gold ${args.datasetVersion}: ${result.total} questions, ${result.directional} directional (${(result.directionalFraction * 100).toFixed(0)}%)\n`,
  );
  if (!args.check) return;
  if (result.aggregate) {
    process.stdout.write(
      `gold check: winRate ${result.aggregate.winRate.toFixed(3)}, expectancy ${result.aggregate.expectancy.toFixed(3)}\n`,
    );
  }
  if (result.passed) {
    process.stdout.write("gold check: PASS\n");
  } else {
    process.stderr.write(`gold check: FAIL (${result.failures.join("; ")})\n`);
    process.exit(1);
  }
}

async function runGenerateCommand(argv: string[]): Promise<void> {
  const args = parseGenerateArgs(argv);
  const result = await runGenerate({
    bank: "swing",
    symbols: args.symbols,
    version: args.version,
    windowsPerSymbol: args.windowsPerSymbol,
    dryRun: args.dryRun,
    fresh: args.fresh,
    datasetsRoot: DEFAULT_DATASETS_ROOT,
    fetchKlineHistory: fetchKlineHistoryLive,
    fetchCalendar: fetchCalendarLive,
    now: () => new Date(),
    log: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(`\nwritten: ${result.written.length}, skipped: ${result.skipped.length}\n`);
}

interface BackfillNewsArgs {
  version: string;
  bank: string;
  symbols?: string[];
  dryRun: boolean;
  fresh: boolean;
}

function parseBackfillNewsArgs(argv: string[]): BackfillNewsArgs {
  let version: string | undefined;
  let bank = "swing";
  let symbols: string[] | undefined;
  let dryRun = false;
  let fresh = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--dataset-version":
        version = argv[++i];
        break;
      case "--bank":
        bank = argv[++i];
        break;
      case "--symbols":
        symbols = argv[++i].split(",").map((symbol) => symbol.trim());
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--fresh":
        fresh = true;
        break;
      default:
        throw new Error(`unknown backfill-news option: ${arg}`);
    }
  }

  if (!version) throw new Error("--dataset-version is required");
  return { version, bank, symbols, dryRun, fresh };
}

async function runBackfillNewsCommand(argv: string[]): Promise<void> {
  const args = parseBackfillNewsArgs(argv);
  const result = await runBackfillNews({
    datasetsRoot: DEFAULT_DATASETS_ROOT,
    resultsRoot: DEFAULT_RESULTS_ROOT,
    version: args.version,
    bank: args.bank,
    symbols: args.symbols,
    dryRun: args.dryRun,
    fresh: args.fresh,
    fetchGdelt: fetchGdeltArticlesLive,
    fetchEdgar: fetchEdgarFilingsLive,
    log: (line) => process.stdout.write(`${line}\n`),
    listQuestionIds: listQuestions,
  });
  process.stdout.write(
    `\nbackfill-news ${args.version}: ${result.processed.length} processed, ${result.failed.length} failed, ${result.gdeltFailures.length} gdelt-only failures (edgar still applied)${result.gdeltCircuitTripped ? ", GDELT circuit breaker tripped (durably rate-limited, rest of run skipped GDELT)" : ""}\n`,
  );
  if (result.failed.length > 0) process.exitCode = 1;
}

function parseReportArgs(argv: string[]): { runId: string } {
  let runId: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--run-id":
        runId = argv[++i];
        break;
      default:
        throw new Error(`unknown report option: ${arg}`);
    }
  }
  if (!runId) throw new Error("--run-id is required");
  return { runId };
}

async function readJsonFile(file: string): Promise<unknown> {
  const raw = await fs.readFile(file, "utf8").catch(() => null);
  if (raw == null) return null;
  return JSON.parse(raw) as unknown;
}

async function runReportCommand(argv: string[]): Promise<void> {
  const args = parseReportArgs(argv);
  const runDir = join(DEFAULT_RESULTS_ROOT, args.runId);
  const rawScores = await readJsonFile(join(runDir, "scores.json"));
  if (rawScores == null) throw new Error(`scores.json not found for run ${args.runId} (run "bench score" first)`);
  if (!Value.Check(scoresSchema, rawScores)) {
    const first = Value.Errors(scoresSchema, rawScores)[0];
    throw new Error(`invalid scores.json: ${first?.instancePath ?? "(root)"} ${first?.message ?? "schema mismatch"}`);
  }
  const scores = rawScores as Scores;
  const config = ((await readJsonFile(join(runDir, "config.json"))) ?? {}) as ReportConfigSnapshot;

  const { markdown, summary } = renderReport(scores, config);
  await fs.writeFile(join(runDir, "report.md"), markdown, "utf8");
  await fs.writeFile(join(runDir, "report-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`report ${args.runId}: ${scores.models.length} models -> report.md, report-summary.json\n`);
}

function isSubcommand(value: string | undefined): value is Subcommand {
  return SUBCOMMANDS.includes(value as Subcommand);
}

function printUsage(): void {
  process.stdout.write(USAGE);
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  if (!isSubcommand(command)) {
    process.stderr.write(`unknown command: ${command}\n\n`);
    printUsage();
    process.exit(1);
  }

  const handlers: Partial<Record<Subcommand, (argv: string[]) => Promise<void>>> = {
    generate: runGenerateCommand,
    run: async () => runRunCommand(),
    baseline: runBaselineCommand,
    score: runScoreCommand,
    gold: runGoldCommand,
    report: runReportCommand,
    "backfill-news": runBackfillNewsCommand,
  };
  const handler = handlers[command];
  if (!handler) {
    process.stderr.write("not implemented\n");
    process.exit(1);
  }
  try {
    await handler(rest);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

export type { Subcommand };
export { main, printUsage, SUBCOMMANDS, USAGE };

if (!process.env.VITEST) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
