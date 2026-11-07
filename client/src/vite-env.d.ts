/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Basemap style URL, or "offline" for a plain background. */
  readonly VITE_MAP_STYLE_URL?: string;
  /** Override the WebSocket endpoint (defaults to same host, /ws). */
  readonly VITE_WS_URL?: string;
  /** "sim" in the static demo build (`vite build --mode demo`): the server runs inside the page. */
  readonly VITE_DEMO?: string;
  /** The live server's address, given to a demo build so its ops room dialog can point there. */
  readonly VITE_LIVE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
