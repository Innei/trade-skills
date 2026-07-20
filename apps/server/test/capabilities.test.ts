import { afterEach, describe, expect, it } from 'vitest';
import {
  setLicenseManagerForTests,
  type LicenseManager,
} from '@kansoku/core/license/licenseState';
import {
  configureCapabilitiesService,
  resetCapabilitiesServiceForTests,
} from '@kansoku/core/modules/capabilities/capabilities.service';
import { setEncBundlePresent } from '@kansoku/core/pro/bundleState';
import type { EditionRuntimeStatus, EditionRuntimeStatusReader } from '@kansoku/core/pro/editionRuntime';
import { tsukiRequest } from './helpers.js';

class FakeEditionRuntimeStatusReader implements EditionRuntimeStatusReader {
  constructor(readonly status: EditionRuntimeStatus) {}
}

function registerActiveEdition(bundlePresent = false): void {
  configureCapabilitiesService(new FakeEditionRuntimeStatusReader({ state: 'active', bundlePresent }));
}

function fakeLicenseManager(overrides: Partial<LicenseManager> = {}): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: 'unlicensed' }),
    getBundleKey: () => undefined,
    activate: async () => ({ activated: true }),
    deactivate: async () => ({}) as never,
    revalidate: async () => {},
    ...overrides,
  };
}

function allFeatures(state: 'absent' | 'locked' | 'active') {
  return { 'symbol-follow': state, 'deep-dive': state, 'research-ai': state, 'memory': state };
}

describe('GET /capabilities', () => {
  afterEach(async () => {
    setLicenseManagerForTests(null);
    resetCapabilitiesServiceForTests();
    setEncBundlePresent(false);
  });

  it('reports pro:false licensed:false when pro is absent', async () => {
    setLicenseManagerForTests(fakeLicenseManager());
    const res = await tsukiRequest('/api/capabilities');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: false,
      licensed: false,
      license: { state: 'unlicensed' },
      features: allFeatures('absent'),
      hasEncBundle: false,
    });
  });

  it('reports locked features and hasEncBundle:true when the enc bundle is present but not loaded', async () => {
    setEncBundlePresent(true);
    setLicenseManagerForTests(fakeLicenseManager());
    const res = await tsukiRequest('/api/capabilities');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: false,
      licensed: false,
      license: { state: 'unlicensed' },
      features: allFeatures('locked'),
      hasEncBundle: true,
    });
  });

  it('reports pro:true licensed:false with an unlicensed snapshot', async () => {
    registerActiveEdition();
    setLicenseManagerForTests(
      fakeLicenseManager({ getLicenseSnapshot: () => ({ state: 'unlicensed' }) }),
    );
    const res = await tsukiRequest('/api/capabilities');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: true,
      licensed: false,
      license: { state: 'unlicensed' },
      features: allFeatures('locked'),
      hasEncBundle: false,
    });
  });

  it('reports pro:true licensed:true with a licensed snapshot', async () => {
    registerActiveEdition();
    setLicenseManagerForTests(
      fakeLicenseManager({
        getLicenseSnapshot: () => ({
          state: 'licensed',
          deviceName: 'my-mac',
          maskedKey: '••••7890',
        }),
      }),
    );
    const res = await tsukiRequest('/api/capabilities');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: true,
      licensed: true,
      license: { state: 'licensed', deviceName: 'my-mac', maskedKey: '••••7890' },
      features: allFeatures('active'),
      hasEncBundle: false,
    });
  });

  it('keeps the license status route working when pro is absent (does not 404)', async () => {
    setLicenseManagerForTests(fakeLicenseManager());
    const res = await tsukiRequest('/api/license/status');
    expect(res.status).toBe(200);
  });
});
