/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Basemap style URL, or "offline" for a plain background. */
  readonly VITE_MAP_STYLE_URL?: string;
  /** Override the WebSocket endpoint (defaults to same host, /ws). */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
