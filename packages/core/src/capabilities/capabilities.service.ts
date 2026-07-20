import { currentSnapshotSafe, isLicensed } from '../license/licenseGate.js';
import type { CapabilitiesApi } from '../contract/capabilities.js';
import { featureStates } from '../pro/features.js';
import { hasEncBundle, isProPresent } from '../pro/bundleState.js';

export const capabilitiesService: CapabilitiesApi = {
  async get() {
    return {
      pro: isProPresent(),
      licensed: isLicensed(),
      license: currentSnapshotSafe(),
      features: await featureStates(),
      hasEncBundle: hasEncBundle(),
    };
  },
};
