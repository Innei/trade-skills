import { runAnalyst } from "../src/ai/analyst.js";
import { listComments } from "../src/ai/comments.js";
import { runCommentator } from "../src/ai/commentator.js";
import { buildCommentPack } from "../src/ai/datapack.js";
import { initAiSettings } from "../src/ai/initAiSettings.js";
import { aiConfig, type AiConfig } from "../src/ai/models.js";
import type { Trigger } from "../src/ai/triggers.js";
import { getDb } from "../src/db/index.js";
import { loadDotenv } from "../src/dotenv.js";
import { easternDate } from "../src/services/session.js";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function describeModel(model: AiConfig["commentModel"]): string {
  if (!model) return "未配置";
  const thinking = model.thinkingLevel ? `:${model.thinkingLevel}` : "";
  return `${model.provider}/${model.id}${thinking}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runAnalystLayer = args.includes("--analyst");
  const symbol = args.find((a) => !a.startsWith("--"));
  if (!symbol) fail("usage: tsx scripts/ai-smoke.ts <SYMBOL> [--analyst]");

  loadDotenv();
  initAiSettings(getDb());
  const config = aiConfig();
  console.log(`comment model: ${describeModel(config.commentModel)}`);
  console.log(`analyst model: ${describeModel(config.analystModel)}`);

  const today = easternDate(new Date());

  if (!config.commentModel) fail("comment model 未配置；请在 /settings 配置盘中快评模型");

  console.log(`\n[commentator] building pack for ${symbol}...`);
  const pack = await buildCommentPack(symbol);
  const trigger: Trigger = { kind: "volume_spike", detail: "manual ai-smoke run" };
  const commentResult = await runCommentator({ symbol, pack, trigger, deps: { model: config.commentModel } });
  console.log(`[commentator] escalate=${commentResult.escalate}`);
  console.log(JSON.stringify(await listComments(symbol, today), null, 2));

  if (!runAnalystLayer) return;
  if (!config.analystModel) fail("--analyst given but 分析员模型未配置；请在 /settings 配置升级分析模型");

  console.log(`\n[analyst] running for ${symbol}...`);
  const start = runAnalyst({ symbol, origin: "manual", deps: { model: config.analystModel } });
  if (!start.started) fail(`analyst did not start: ${start.reason ?? "unknown"}`);
  await start.done;
  console.log(JSON.stringify(await listComments(symbol, today), null, 2));
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
