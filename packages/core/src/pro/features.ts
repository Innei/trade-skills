import { FEATURES, type FeatureKey, type FeatureState, type FeatureTier } from "../../../pro-api/src/features.js";
import { ClientError } from "../errors.js";
import { getPro } from "./registry.js";

const featureCatalog: Record<FeatureKey, { tier: FeatureTier }> = FEATURES;

export async function featureState(key: FeatureKey): Promise<FeatureState> {
  if (featureCatalog[key].tier === "free") return "active";

  const pro = getPro();
  if (!pro) return "absent";

  const license = pro.license;
  if (!license) return "locked";

  return (await license.isLicensed()) ? "active" : "locked";
}

export async function isFeatureActive(key: FeatureKey): Promise<boolean> {
  return (await featureState(key)) === "active";
}

export async function requireFeature(key: FeatureKey): Promise<void> {
  const state = await featureState(key);
  if (state === "absent") {
    throw new ClientError("AI features are not available in this build", undefined, 404);
  }
  if (state === "locked") {
    throw new ClientError("AI features require an active license", `feature: ${key}`, 403, "LICENSE_REQUIRED");
  }
}
