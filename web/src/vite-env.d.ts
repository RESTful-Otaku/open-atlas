/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_DATA?: string;
  readonly VITE_STDB_URI?: string;
  readonly VITE_STDB_DB?: string;
  readonly VITE_INGEST_BASE?: string;
  readonly VITE_LLM_BASE?: string;
  readonly VITE_LLM_INSIGHT_TIMEOUT_MS?: string;
  readonly VITE_MOBILE_RUNTIME_CONFIG?: string;
  readonly VITE_NATIVE_DEFAULT_LLM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
