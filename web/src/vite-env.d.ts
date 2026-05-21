/// <reference types="vite/client" />

/**
 * Build-time configuration exposed via Vite's `import.meta.env`. Only
 * variables with the `VITE_` prefix are inlined; everything else is
 * stripped so we can't accidentally leak server secrets to the bundle.
 */
interface ImportMetaEnv {
  /** When `1`, the app boots in demo mode with `demo-seed` data (no SpacetimeDB). */
  readonly VITE_DEMO_DATA?: string;
  readonly VITE_STDB_URI?: string;
  readonly VITE_STDB_DB?: string;
  /**
   * Ingest HTTP base (no trailing `/`). Empty = same-origin paths proxied
   * by Vite. Required for Capacitor against LAN/cloud hosts.
   */
  readonly VITE_INGEST_BASE?: string;
  /**
   * Base URL for `openatlas-llm-bridge` (no trailing `/`). In dev, the
   * Vite default proxy serves `/api/llm` on :3847. Override for
   * production (e.g. `https://ops.example/llm`).
   */
  readonly VITE_LLM_BASE?: string;
  readonly VITE_LLM_INSIGHT_TIMEOUT_MS?: string;
  /** When `1`, Settings exposes Deployment profiles (native operator APK). */
  readonly VITE_MOBILE_RUNTIME_CONFIG?: string;
  readonly VITE_NATIVE_DEFAULT_LLM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
