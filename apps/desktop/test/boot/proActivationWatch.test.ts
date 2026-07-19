import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startProActivationWatch } from '../../src/boot/proActivationWatch.js';

function deps(overrides: Partial<Parameters<typeof startProActivationWatch>[0]> = {}) {
  return {
    hasEncBundle: () => true,
    isProPresent: () => false,
    getBundleKey: (): string | undefined => undefined,
    relaunch: vi.fn(),
    intervalMs: 1000,
    ...overrides,
  };
}

describe('startProActivationWatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('relaunches once when the bundle key transitions from absent to present', () => {
    const state: { key: string | undefined } = { key: undefined };
    const d = deps({ getBundleKey: () => state.key });
    startProActivationWatch(d);

    vi.advanceTimersByTime(3000);
    expect(d.relaunch).not.toHaveBeenCalled();

    state.key = 'aa'.repeat(32);
    vi.advanceTimersByTime(1000);
    expect(d.relaunch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(d.relaunch).toHaveBeenCalledTimes(1);
  });

  it('never arms when a key was already stored at boot (undecryptable-key loop guard)', () => {
    const d = deps({ getBundleKey: () => 'bb'.repeat(32) });
    startProActivationWatch(d);

    vi.advanceTimersByTime(10_000);
    expect(d.relaunch).not.toHaveBeenCalled();
  });

  it('never arms without an enc bundle or when pro is already loaded', () => {
    const noEnc = deps({ hasEncBundle: () => false });
    startProActivationWatch(noEnc);
    const proLoaded = deps({ isProPresent: () => true });
    startProActivationWatch(proLoaded);

    vi.advanceTimersByTime(10_000);
    expect(noEnc.relaunch).not.toHaveBeenCalled();
    expect(proLoaded.relaunch).not.toHaveBeenCalled();
  });

  it('stops polling once cancelled', () => {
    const state: { key: string | undefined } = { key: undefined };
    const d = deps({ getBundleKey: () => state.key });
    const stop = startProActivationWatch(d);

    stop();
    state.key = 'cc'.repeat(32);
    vi.advanceTimersByTime(5000);
    expect(d.relaunch).not.toHaveBeenCalled();
  });
});
