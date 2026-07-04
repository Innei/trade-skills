import { serveStatic } from "@hono/node-server/serve-static";
import { promises as fs } from "node:fs";
import { relative } from "node:path";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ClientError } from "./errors.js";
import { CHART_DATA_DIR, LEGACY_CHARTS_DIR, PORT, VITE_DEV_ORIGIN, WEB_DIST } from "./env.js";
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

  app.use("/*", async (c, next) => {
    const path = c.req.path;
    if (c.req.method !== "GET" || path.startsWith("/api") || path.startsWith("/legacy")) {
      return next();
    }
    try {
      const target = new URL(path, VITE_DEV_ORIGIN);
      target.search = new URL(c.req.url).search;
      const res = await fetch(target, {
        headers: { accept: c.req.header("accept") ?? "*/*" },
        redirect: "manual",
      });
      const headers = new Headers(res.headers);
      // undici decompresses the body but keeps the original encoding headers
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new Response(res.body, { status: res.status, headers });
    } catch {
      return next();
    }
  });

  const webRoot = relative(process.cwd(), WEB_DIST) || ".";
  app.use("/*", serveStatic({ root: webRoot, index: "index.html" }));
  app.get("*", serveStatic({ root: webRoot, path: "index.html" }));

  return app;
}
