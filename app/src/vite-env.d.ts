/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUD_AGENT_API_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
