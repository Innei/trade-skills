import { currentSnapshotSafe, isLicensed } from '../license/licenseGate.js';
import type { CapabilitiesApi, CapabilitiesOut } from '../contract/capabilities.js';
import { featureStates } from '../pro/features.js';
import { hasEncBundle, isProPresent } from '../pro/bundleState.js';
import { getProvider } from '../marketdata/registry.js';
import { getWatchedMarketsOrDefault } from '../marketdata/watchedMarketsStore.js';

function collectDatasources(): CapabilitiesOut['datasources'] {
  const datasources: CapabilitiesOut['datasources'] = [];
  for (const market of getWatchedMarketsOrDefault()) {
    try {
      const provider = getProvider(market);
      datasources.push({ market, name: provider.name, realtime: provider.realtime });
    } catch {
      continue;
    }
  }
  return datasources;
}

export const capabilitiesService: CapabilitiesApi = {
  async get() {
    return {
      pro: isProPresent(),
      licensed: isLicensed(),
      license: currentSnapshotSafe(),
      features: await featureStates(),
      hasEncBundle: hasEncBundle(),
      datasources: collectDatasources(),
    };
  },
};
