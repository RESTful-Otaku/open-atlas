import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

/**
 * During `bun run dev` (see `package.json`) Vite listens on :5173.
 * `server.host: true` binds 0.0.0.0 so `http://127.0.0.1:5173` and
 * `http://localhost:5173` work reliably across browsers. The Svelte app connects
 * directly to SpacetimeDB (WS at :3000 by default) using the generated
 * module bindings, and to the minimal ingest health surface at :8080
 * for liveness checks — no data ever flows through Vite's proxy.
 *
 * The optional `openatlas-llm-bridge` (default :3847) exposes
 * `/v1/insight` to Ollama. In dev, `/api/llm` proxies there so the
 * browser can call a same-origin path without CORS to localhost.
 * Production: run the bridge behind your reverse proxy or set
 * `VITE_LLM_BASE` to its public URL.
 */
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      "/status": "http://127.0.0.1:8080",
      "/health": "http://127.0.0.1:8080",
      "/ready": "http://127.0.0.1:8080",
      "/api/llm": {
        target: "http://127.0.0.1:3847",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llm/, "") || "/",
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    // Split the heavy visualisation vendors so they are fetched and
    // cached independently of app code. Keeps first-paint JS small
    // and lets the browser warm long-lived vendor chunks once.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
          echarts: ["echarts/core", "echarts/charts", "echarts/components", "echarts/renderers"],
          svelte: ["svelte"],
        },
      },
    },
  },
});
