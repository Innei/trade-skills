import { currentSnapshotSafe, isLicensed } from '../../license/licenseGate.js';
import type { CapabilitiesApi } from '../../contract/capabilities.js';
import {
  configureEditionRuntimeStatus,
  FreeEditionRuntimeStatusReader,
  resetEditionRuntimeStatusForTests,
  type EditionRuntimeStatusReader,
} from '../../pro/editionRuntime.js';
import { featureStates } from '../../pro/features.js';

export function createCapabilitiesService(
  statusReader: EditionRuntimeStatusReader,
): CapabilitiesApi {
  return {
    async get() {
      const status = statusReader.status;
      return {
        pro: status.state === 'active',
        licensed: isLicensed(),
        license: currentSnapshotSafe(),
        features: await featureStates(),
        hasEncBundle: status.bundlePresent,
      };
    },
  };
}

let currentCapabilitiesService: CapabilitiesApi = createCapabilitiesService(
  new FreeEditionRuntimeStatusReader(),
);

export function configureCapabilitiesService(statusReader: EditionRuntimeStatusReader): void {
  currentCapabilitiesService = createCapabilitiesService(statusReader);
  // Feature gates (packages/core/src/pro/features.ts) read edition presence
  // through the same shared status so routes gated behind `requireFeature`
  // (e.g. symbol-follow, deep-dive) unlock under the active edition branch
  // too, not just this service's own `.get()` response.
  configureEditionRuntimeStatus(statusReader);
}

export function resetCapabilitiesServiceForTests(): void {
  currentCapabilitiesService = createCapabilitiesService(new FreeEditionRuntimeStatusReader());
  resetEditionRuntimeStatusForTests();
}

export const capabilitiesService: CapabilitiesApi = new Proxy({} as CapabilitiesApi, {
  get: (_target, prop, receiver) => Reflect.get(currentCapabilitiesService as object, prop, receiver),
});
