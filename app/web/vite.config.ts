import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5198,
    // page may be served via the :5199 proxy; HMR websocket must hit vite directly
    hmr: { clientPort: 5198 },
    proxy: {
      "/api": "http://localhost:5199",
      "/legacy": "http://localhost:5199",
    },
  },
});
