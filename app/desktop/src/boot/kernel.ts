import { join } from "node:path";
import { app, ipcMain, safeStorage, shell } from "electron";
import { createCredentialsBridgeHandlers, registerCredentialsIpc } from "../credentials/bridge.js";
import { createDesktopSecretBox } from "../credentials/secretBox.js";
import { IS_DEV } from "./env.js";

export async function bootKernel() {
  const [{ initServerRuntime }, { attachRealtimeBridge }, { CHART_DATA_DIR }, { getPro }] = await Promise.all([
    import("../../../server/src/runtimeInit.js"),
    import("../realtime/bridge.js"),
    import("../../../packages/core/src/env.js"),
    import("../../../packages/core/src/pro/registry.js"),
  ]);

  // Dev keeps the pre-P3 plaintext keyfile so ELECTRON_DEV workflows are
  // unaffected; packaged builds move the AI master key into safeStorage.
  const secretBox = IS_DEV
    ? undefined
    : createDesktopSecretBox({
        safeStorage,
        wrappedKeyPath: join(app.getPath("userData"), "ai-master-key.json"),
        legacyKeyPath: join(CHART_DATA_DIR, "ai-secret.key"),
      });

  await initServerRuntime({
    secretBox,
    openAuthUrl: (url) => {
      shell.openExternal(url).catch(() => {});
    },
  });
  // bootstrap.js is imported lazily, after initServerRuntime() has awaited
  // loadPro() above, so AppModule's registry-derived AI module composition
  // sees the pro module (when present).
  const { createKernel } = await import("../../../server/src/bootstrap.js");
  const kernel = await createKernel();
  if (getPro()?.startScheduler) {
    getPro()!.startScheduler!();
    console.log("[desktop] ai scheduler started");
  }
  const apiApp = kernel.app.getInstance();
  attachRealtimeBridge();
  registerCredentialsIpc(ipcMain, createCredentialsBridgeHandlers());

  const health = await apiApp.fetch(new Request("http://localhost/api/health"));
  console.log(`[desktop] kernel self-test /api/health -> ${health.status}`, await health.text());

  return kernel;
}
