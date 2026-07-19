import { BrowserWindow, app, dialog } from 'electron';

let prompted = false;

export async function promptProRelaunch(): Promise<void> {
  if (prompted) return;
  prompted = true;
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  const options = {
    type: 'info' as const,
    buttons: ['立即重启'],
    defaultId: 0,
    title: 'Kansoku',
    message: 'AI 付费功能已解锁',
    detail: '需要重启应用完成加载，点击「立即重启」后应用会自动重新打开。',
  };
  await (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options));
  console.log('[desktop] bundle key landed — relaunching to load pro');
  app.relaunch();
  app.quit();
}

export async function maybePromptProRelaunchAfterKeyLanded(): Promise<void> {
  const [{ hasEncBundle, isProPresent }, { getActiveBundleKey }] = await Promise.all([
    import('@kansoku/core/pro/registry'),
    import('@kansoku/core/license/licenseState'),
  ]);
  if (!hasEncBundle() || isProPresent() || !getActiveBundleKey()) return;
  await promptProRelaunch();
}

export function resetProRelaunchForTests(): void {
  prompted = false;
}
