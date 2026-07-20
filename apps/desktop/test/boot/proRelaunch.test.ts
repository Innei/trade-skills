import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  app: { relaunch: vi.fn(), quit: vi.fn() },
  dialog: { showMessageBox: vi.fn() },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
}));
vi.mock('electron', () => electron);

const bundleState = vi.hoisted(() => ({
  hasEncBundle: vi.fn(() => true),
}));
vi.mock('@kansoku/core/pro/bundleState', () => bundleState);

const editionRuntime = vi.hoisted(() => ({
  isEditionActive: vi.fn(() => false),
}));
vi.mock('@kansoku/core/pro/editionRuntime', () => editionRuntime);

const licenseState = vi.hoisted(() => ({
  getActiveBundleKey: vi.fn((): string | undefined => 'aa'.repeat(32)),
}));
vi.mock('@kansoku/core/license/licenseState', () => licenseState);

const { maybePromptProRelaunchAfterKeyLanded, promptProRelaunch, resetProRelaunchForTests } =
  await import('../../src/boot/proRelaunch.js');

beforeEach(() => {
  resetProRelaunchForTests();
  electron.app.relaunch.mockReset();
  electron.app.quit.mockReset();
  electron.dialog.showMessageBox.mockReset().mockResolvedValue({ response: 0 });
  bundleState.hasEncBundle.mockReturnValue(true);
  editionRuntime.isEditionActive.mockReturnValue(false);
  licenseState.getActiveBundleKey.mockReturnValue('aa'.repeat(32));
});

describe('promptProRelaunch', () => {
  it('shows the message box, then relaunches and quits', async () => {
    await promptProRelaunch();
    expect(electron.dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(electron.app.relaunch).toHaveBeenCalledTimes(1);
    expect(electron.app.quit).toHaveBeenCalledTimes(1);
  });

  it('prompts at most once even when both triggers fire', async () => {
    await Promise.all([promptProRelaunch(), promptProRelaunch()]);
    expect(electron.dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(electron.app.relaunch).toHaveBeenCalledTimes(1);
  });
});

describe('maybePromptProRelaunchAfterKeyLanded', () => {
  it('prompts when the enc bundle is staged, pro is unloaded, and the key landed', async () => {
    await maybePromptProRelaunchAfterKeyLanded();
    expect(electron.dialog.showMessageBox).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no enc bundle', () => bundleState.hasEncBundle.mockReturnValue(false)],
    ['pro already loaded', () => editionRuntime.isEditionActive.mockReturnValue(true)],
    ['no bundle key stored', () => licenseState.getActiveBundleKey.mockReturnValue(undefined)],
  ])('stays quiet with %s', async (_label, arrange) => {
    arrange();
    await maybePromptProRelaunchAfterKeyLanded();
    expect(electron.dialog.showMessageBox).not.toHaveBeenCalled();
  });
});
