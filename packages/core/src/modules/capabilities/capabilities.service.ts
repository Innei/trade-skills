import type { CapabilitiesApi } from "../../contract/capabilities.js";
import { FEATURES, type FeatureKey, type FeatureState } from "../../../../pro-api/src/features.js";
import { featureState } from "../../pro/features.js";
import { getPro } from "../../pro/registry.js";

async function resolveFeatures(): Promise<Record<FeatureKey, FeatureState>> {
  const keys = Object.keys(FEATURES) as FeatureKey[];
  const states = await Promise.all(keys.map((key) => featureState(key)));
  return Object.fromEntries(keys.map((key, i) => [key, states[i]])) as Record<FeatureKey, FeatureState>;
}

export const capabilitiesService: CapabilitiesApi = {
  async get() {
    const pro = getPro();
    const features = await resolveFeatures();
    if (!pro?.license) return { pro: pro != null, licensed: false, features };
    const [licensed, license] = await Promise.all([pro.license.isLicensed(), pro.license.status()]);
    return { pro: true, licensed, license, features };
  },
};
