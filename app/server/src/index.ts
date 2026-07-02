import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { BASE_URL, PORT } from "./env.js";

serve({ fetch: createApp().fetch, port: PORT }, () => {
  console.log(`trade chart server listening on ${BASE_URL}`);
});
