import { serveStatic } from "@hono/node-server/serve-static";
import { promises as fs } from "node:fs";
import { relative } from "node:path";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ClientError } from "./errors.js";
import { CHART_DATA_DIR, LEGACY_CHARTS_DIR, PORT, WEB_DIST } from "./env.js";
import { chartsRoute } from "./routes/charts.js";
import { streamsRoute } from "./routes/streams.js";

export function createApp(): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof ClientError) {
      return c.json({ ok: false, error: err.message, hint: err.hint }, err.status as ContentfulStatusCode);
    }
    console.error(err);
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  });

  app.get("/api/health", (c) =>
    c.json({ ok: true, data: { status: "up", port: PORT, dataDir: CHART_DATA_DIR } }),
  );

  app.route("/api/charts", chartsRoute);
  app.route("/api/stream", streamsRoute);

  app.get("/api/legacy", async (c) => {
    let files: string[] = [];
    try {
      files = (await fs.readdir(LEGACY_CHARTS_DIR)).filter((f) => f.endsWith(".html"));
    } catch {
      files = [];
    }
    files.sort((a, b) => (a < b ? 1 : -1));
    return c.json({
      ok: true,
      data: files.map((f) => ({ file: f, url: `/legacy/${encodeURIComponent(f)}`, date: f.slice(0, 10) })),
    });
  });

  const legacyRoot = relative(process.cwd(), LEGACY_CHARTS_DIR) || ".";
  app.use(
    "/legacy/*",
    serveStatic({ root: legacyRoot, rewriteRequestPath: (p) => p.replace(/^\/legacy/, "") }),
  );

  const webRoot = relative(process.cwd(), WEB_DIST) || ".";
  app.use("/*", serveStatic({ root: webRoot, index: "index.html" }));
  app.get("*", serveStatic({ root: webRoot, path: "index.html" }));

  return app;
}
