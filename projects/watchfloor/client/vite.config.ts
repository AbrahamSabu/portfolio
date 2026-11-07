import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const server = process.env.WATCHFLOOR_SERVER ?? 'http://127.0.0.1:8080';

export default defineConfig(({ mode }) => {
  // `vite build --mode demo`: a static build with the server inside the page
  // (src/demo/localServer.ts), for hosting anywhere files are served.
  const demo = mode === 'demo';
  return {
    // Read VITE_* variables from the repo-root .env, shared with the server.
    envDir: '..',
    // Relative asset paths, so the demo works from any folder (GitHub Pages
    // serves it under /portfolio/demos/watchfloor/, not the site root).
    base: demo ? './' : '/',
    // The demo's news file (npm run demo-news) is served beside the page.
    publicDir: demo ? 'public-demo' : 'public',
    define: demo
      ? {
          'import.meta.env.VITE_DEMO': JSON.stringify('sim'),
          // The server's logger reads its level at load; a browser has no process.
          'process.env.LOG_LEVEL': 'undefined',
        }
      : {},
    server: {
      port: 5173,
      proxy: {
        '/ws': { target: server.replace(/^http/, 'ws'), ws: true },
        '/healthz': server,
        '/api': server,
      },
    },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      // Two pages: the display, and the phone plane-spotter (sky.html), which
      // needs a live server, so the static demo leaves it out.
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          ...(demo ? {} : { sky: fileURLToPath(new URL('./sky.html', import.meta.url)) }),
          // The ops room's phone console needs a live server too.
          ...(demo ? {} : { console: fileURLToPath(new URL('./console.html', import.meta.url)) }),
        },
      },
      sourcemap: !demo,
      // MapLibre and milsymbol (all symbol standards) are large; they're cached after first load.
      chunkSizeWarningLimit: 2500,
    },
    worker: {
      // The SGP4 worker (src/space) uses satellite.js's plain JavaScript. Its index also
      // re-exports an optional WebAssembly build written with top-level await, which only a
      // module worker can hold; declared free of side effects, those unused parts are left out.
      format: 'es' as const,
      rolldownOptions: {
        treeshake: { moduleSideEffects: (id: string) => !/[\\/]satellite\.js[\\/]/.test(id) },
      },
    },
  };
});
