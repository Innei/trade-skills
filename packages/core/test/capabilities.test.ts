import { afterEach, describe, expect, it } from 'vitest';
import { FEATURES, type FeatureTier } from '@kansoku/pro-api/features';
import {
  setLicenseManagerForTests,
  type LicenseManager,
} from '../src/license/licenseState.js';
import { setEncBundlePresent } from '../src/pro/bundleState.js';
import type { EditionRuntimeStatus, EditionRuntimeStatusReader } from '../src/pro/editionRuntime.js';
import {
  capabilitiesService,
  configureCapabilitiesService,
  createCapabilitiesService,
  resetCapabilitiesServiceForTests,
} from '../src/modules/capabilities/capabilities.service.js';

class FakeEditionRuntimeStatusReader implements EditionRuntimeStatusReader {
  constructor(readonly status: EditionRuntimeStatus) {}
}

const featureKeys = Object.keys(FEATURES) as Array<keyof typeof FEATURES>;

function fakeLicenseManager(licensed: boolean): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: licensed ? 'licensed' : 'unlicensed' }),
    getBundleKey: () => undefined,
    activate: async () => ({ activated: true }),
    deactivate: async () => ({}) as never,
    revalidate: async () => {},
  };
}

afterEach(() => {
  resetCapabilitiesServiceForTests();
  setEncBundlePresent(false);
  setLicenseManagerForTests(null);
});

describe('capabilitiesService.get', () => {
  it('marks every pro-tier key absent when no pro module is present', async () => {
    const result = await capabilitiesService.get();
    expect(result.pro).toBe(false);
    expect(result.licensed).toBe(false);
    expect(result.hasEncBundle).toBe(false);
    for (const key of featureKeys) {
      expect(result.features).toHaveProperty(key);
      const tier = FEATURES[key].tier as FeatureTier;
      expect(result.features[key]).toBe(tier === 'free' ? 'active' : 'absent');
    }
  });

  it('marks pro-tier keys locked and reports hasEncBundle when only the enc bundle is present', async () => {
    setEncBundlePresent(true);
    const result = await capabilitiesService.get();
    expect(result.pro).toBe(false);
    expect(result.licensed).toBe(false);
    expect(result.hasEncBundle).toBe(true);
    for (const key of featureKeys) {
      const tier = FEATURES[key].tier as FeatureTier;
      expect(result.features[key]).toBe(tier === 'free' ? 'active' : 'locked');
    }
  });

  it('marks pro-tier keys locked when pro is registered but unlicensed', async () => {
    configureCapabilitiesService(
      new FakeEditionRuntimeStatusReader({ state: 'active', bundlePresent: true }),
    );
    setLicenseManagerForTests(fakeLicenseManager(false));
    const result = await capabilitiesService.get();
    expect(result.pro).toBe(true);
    expect(result.licensed).toBe(false);
    for (const key of featureKeys) {
      const tier = FEATURES[key].tier as FeatureTier;
      expect(result.features[key]).toBe(tier === 'free' ? 'active' : 'locked');
    }
  });

  it('marks pro-tier keys active when pro is registered and licensed', async () => {
    configureCapabilitiesService(
      new FakeEditionRuntimeStatusReader({ state: 'active', bundlePresent: true }),
    );
    setLicenseManagerForTests(fakeLicenseManager(true));
    const result = await capabilitiesService.get();
    expect(result.pro).toBe(true);
    expect(result.licensed).toBe(true);
    for (const key of featureKeys) {
      expect(result.features[key]).toBe('active');
    }
  });
});

describe('createCapabilitiesService', () => {
  it('reads pro and hasEncBundle from the injected status reader', async () => {
    const service = createCapabilitiesService(
      new FakeEditionRuntimeStatusReader({
        state: 'active',
        bundlePresent: true,
        keyId: 'test-key',
      }),
    );
    const result = await service.get();
    expect(result.pro).toBe(true);
    expect(result.hasEncBundle).toBe(true);
  });

  it('marks pro false when the injected reader reports a locked state', async () => {
    const service = createCapabilitiesService(
      new FakeEditionRuntimeStatusReader({
        state: 'locked',
        bundlePresent: true,
      }),
    );
    const result = await service.get();
    expect(result.pro).toBe(false);
    expect(result.hasEncBundle).toBe(true);
  });

  it('marks pro and hasEncBundle false when the injected reader reports absent', async () => {
    const service = createCapabilitiesService(
      new FakeEditionRuntimeStatusReader({
        state: 'absent',
        bundlePresent: false,
      }),
    );
    const result = await service.get();
    expect(result.pro).toBe(false);
    expect(result.hasEncBundle).toBe(false);
  });
});
