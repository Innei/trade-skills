// boot/env.js must stay the FIRST import in this file: its module body sets
// TRADE_PROJECT_ROOT (and app.setName) before anything else runs, and ESM
// import evaluation order is declaration order — every import below this one
// transitively reaches packages/core's env.ts, whose top-level consts read
// TRADE_PROJECT_ROOT once at module-load time. Reordering this import (or
// inserting one above it that reaches core) silently reintroduces a bug
// where env.ts captures an empty/wrong project root in the bundled output.
import './boot/env.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { createServices } from 'electron-ipc-decorator';
import { registerAppControlIpc } from './appControl/ipc.js';
import { createAppMenuManager } from './menu/appMenuManager.js';
import { bootKernel } from './boot/kernel.js';
import { createWindowManager } from './window/windowManager.js';
import { showFatalErrorWindow } from './window/fatalErrorWindow.js';
import { applyDevDockIcon } from './window/dockIcon.js';
import {
  registerAppProtocolHandler,
  registerAppScheme,
  resolveWebDistRoot,
} from './protocol/protocol.js';
import { createOnboardingStore } from './onboarding/store.js';
import { registerOnboardingIpc } from './onboarding/ipc.js';
import { runImportFromRepoFlow } from './dataImport/flow.js';
import { runSelectDataRootFlow } from './dataRoot/flow.js';
import { registerDataRootIpc } from './dataRoot/ipc.js';
import {
  createFileLogger,
  installConsoleBridge,
  resolveMainLogPath,
} from './logging/fileLogger.js';
import { installDefaultContextMenu } from './contextMenu/defaultMenu.js';
import { registerContextMenuIpc } from './contextMenu/ipc.js';
import { registerLogsIpc } from './logging/ipc.js';
import { createRendererCallClient, type RendererCallClient } from './rendererCall/client.js';
import { sendTabsCommand } from './tabs/commands.js';
import {
  createTabsFileStore,
  cycleTabId,
  resolveCloseTabAction,
  type TabsFileStore,
} from './tabs/store.js';
import { createTabsService, type TabsService } from './tabs/service.js';
import { registerTabsIpc } from './tabs/ipc.js';
import { initUpdater } from './updater/updater.js';
import { registerUpdaterIpc } from './updater/ipc.js';
import { isPopoutWindow } from './window/popoutWindow.js';
import { isAboutWindow, openAboutWindow } from './window/aboutWindow.js';

const fileLogger = createFileLogger({
  logFilePath: resolveMainLogPath(app.getPath('logs')),
});
installConsoleBridge(fileLogger);
console.log(`[desktop] logging to ${fileLogger.path}`);

// Scheme registration must run before app.ready — calling it at module top
// level (evaluated on import, ahead of the whenReady() handler below) makes
// that ordering impossible to get wrong regardless of what else this file
// grows into.
registerAppScheme();

interface InstallAppMenuOptions {
  checkForUpdates: () => void;
  openWindow: () => void;
  tabs: TabsService;
  rendererCalls: RendererCallClient;
}

function installAppMenu({
  checkForUpdates,
  openWindow,
  tabs,
  rendererCalls,
}: InstallAppMenuOptions): void {
  function focusedTabWindow(): BrowserWindow | null {
    const focused = BrowserWindow.getFocusedWindow();
    if (!focused || isPopoutWindow(focused) || isAboutWindow(focused)) return null;
    return focused;
  }

  async function activeTabIdOf(win: BrowserWindow): Promise<string | null> {
    const result = await rendererCalls.call(win, 'tabs.getActiveTabId');
    return typeof result === 'string' && result.length > 0 ? result : null;
  }

  function cycleTab(delta: 1 | -1): void {
    const focused = focusedTabWindow();
    if (!focused) {
      sendTabsCommand(delta === 1 ? 'next-tab' : 'prev-tab');
      return;
    }
    void (async () => {
      const activeId = await activeTabIdOf(focused);
      if (!activeId) return;
      const target = cycleTabId(tabs.current(), activeId, delta);
      if (!target) return;
      await rendererCalls.call(focused, 'tabs.setActive', { id: target });
    })().catch((error: unknown) => {
      console.error('[desktop] cycle tab failed', error);
    });
  }

  createAppMenuManager({
    appName: app.name,
    deps: {
      openAbout: () => {
        openAboutWindow();
      },
      importFromRepo: () => {
        runImportFromRepoFlow(BrowserWindow.getFocusedWindow()).catch((error: unknown) => {
          console.error('[desktop] import-from-repo flow crashed', error);
        });
      },
      selectDataRoot: () => {
        runSelectDataRootFlow(BrowserWindow.getFocusedWindow()).catch((error: unknown) => {
          console.error('[desktop] select-data-root flow crashed', error);
        });
      },
      openSettings: () => sendTabsCommand('open-settings'),
      openLogs: () => sendTabsCommand('open-logs'),
      openResearch: () => sendTabsCommand('open-research'),
      openChat: () => sendTabsCommand('open-chat'),
      checkForUpdates,
      newWindow: openWindow,
      newTab: () => {
        const focused = focusedTabWindow();
        if (!focused) {
          sendTabsCommand('new-tab');
          return;
        }
        void (async () => {
          const id = crypto.randomUUID();
          await tabs.mutate({ op: 'open', route: '/', id });
          await rendererCalls.call(focused, 'tabs.setActive', { id });
        })().catch((error: unknown) => {
          console.error('[desktop] new tab failed', error);
        });
      },
      closeTab: () => {
        const focused = BrowserWindow.getFocusedWindow();
        if (!focused) return;
        if (isPopoutWindow(focused) || isAboutWindow(focused)) {
          focused.close();
          return;
        }
        void (async () => {
          const activeId = await activeTabIdOf(focused);
          if (!activeId) return;
          const action = resolveCloseTabAction(tabs.current(), activeId);
          if (action.kind === 'close-window') focused.close();
          else if (action.kind === 'close-tab') await tabs.mutate({ op: 'close', id: action.id });
          else sendTabsCommand('close-tab');
        })().catch((error: unknown) => {
          console.error('[desktop] close tab failed', error);
        });
      },
      nextTab: () => cycleTab(1),
      prevTab: () => cycleTab(-1),
    },
  }).install();
}

app.whenReady().then(async () => {
  try {
    applyDevDockIcon();
    await bootKernel();
    const { ipcServiceClasses } = await import('./ipc/index.js');
    createServices(ipcServiceClasses);

    const webDistRoot = resolveWebDistRoot();
    registerAppProtocolHandler({
      distRoot: webDistRoot,
      distRootExists: () => existsSync(webDistRoot),
    });

    registerOnboardingIpc(createOnboardingStore());
    registerAppControlIpc();
    registerDataRootIpc();
    const tabsFileStore: TabsFileStore = createTabsFileStore(
      join(app.getPath('userData'), 'tabs.json'),
    );
    const tabsService = createTabsService(tabsFileStore);
    registerTabsIpc(tabsService);
    registerLogsIpc(fileLogger);
    registerContextMenuIpc();
    await installDefaultContextMenu();

    const updater = await initUpdater();
    registerUpdaterIpc(updater);

    const windowManager = await createWindowManager({
      userDataDir: app.getPath('userData'),
      onWindowFocus: () => updater.silentCheckOnActivate(),
    });
    installAppMenu({
      checkForUpdates: () => updater.checkNow(),
      openWindow: () => windowManager.openWindow(),
      tabs: tabsService,
      rendererCalls: createRendererCallClient(),
    });
    windowManager.restoreWindows();

    app.on('activate', () => {
      if (windowManager.windowCount() === 0) windowManager.restoreWindows();
    });

    // Quit must never be interrupted: Sparkle's installer asks the app to
    // terminate, and a will-quit preventDefault (even followed by a re-quit)
    // makes Sparkle treat the install as cancelled — the app exits with no
    // update applied and no relaunch. Flush synchronously instead.
    app.on('before-quit', () => {
      try {
        tabsFileStore.flushSync();
        windowManager.flushSync();
      } catch (error) {
        console.error('[desktop] flush on quit failed', error);
      }
    });
  } catch (error) {
    showFatalErrorWindow(error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
