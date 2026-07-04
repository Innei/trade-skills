import type { Api, Model } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

export type ModelRef = { provider: string; id: string };

export type AiModel = Model<Api>;

export type AiConfig = {
  commentModel: AiModel | null;
  analystModel: AiModel | null;
};

type ModelLookup = (provider: string, id: string) => AiModel | undefined;

const catalog = builtinModels();
const defaultLookup: ModelLookup = (provider, id) => catalog.getModel(provider, id);

export function parseModelRef(raw: string): ModelRef | null {
  const slash = raw.indexOf("/");
  if (slash <= 0) return null;
  const provider = raw.slice(0, slash).trim();
  const id = raw.slice(slash + 1).trim();
  if (!provider || !id) return null;
  return { provider, id };
}

export function resolveModel(
  envValue: string | undefined,
  lookup: ModelLookup = defaultLookup,
): AiModel | null {
  if (!envValue) return null;
  const ref = parseModelRef(envValue);
  if (!ref) return null;
  try {
    return lookup(ref.provider, ref.id) ?? null;
  } catch (err) {
    console.error(`resolveModel: getModel failed for "${envValue}": ${String(err)}`);
    return null;
  }
}

export function aiConfig(): AiConfig {
  return {
    commentModel: resolveModel(process.env.AI_COMMENT_MODEL),
    analystModel: resolveModel(process.env.AI_ANALYST_MODEL),
  };
}
