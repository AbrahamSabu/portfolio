# Watchfloor

A real-time common operating picture (COP): a defence-style tactical map of
live air and sea tracks drawn with NATO MIL-STD-2525C symbols. It is a
portfolio project, so code quality, structure, tests and the README matter as
much as features. Today it runs on a built-in traffic simulator; live ADS-B
(aircraft) and AIS (ships) feeds come next.

## Commands

- `npm run dev`: server on 8080 (tsx watch) plus Vite on 5173, which proxies `/ws`.
- `npm run build` then `npm start`: production as one process on 8080, serving
  the built client, `/ws` and `/healthz`.
- `npm run typecheck`: all workspaces (strict mode plus `noUncheckedIndexedAccess`).
- `npm test`: Vitest from the root config (34 tests at the first commit).
- Install with `npm ci` and never delete package-lock.json: npm 10 crashes
  resolving this workspace without it ("Cannot read properties of null
  (reading 'edgesOut')").

## Layout (npm workspace)

- `shared/` (`@watchfloor/shared`, its package.json exports TS source directly):
  the `Track` type, the WebSocket protocol (`protocol.ts`), geodesy (`geo.ts`:
  distance, bearing, dead reckoning), staleness rules (`staleness.ts`) and
  `sanitizeTrack` validation (`validate.ts`).
- `server/`: Node plus `ws`, bundled with esbuild for production. `trackStore.ts`,
  `hub.ts`, `http.ts`, `config.ts`, `feeds/` (Feed interface plus the simulator) and
  `scenarios/`.
- `client/`: Vite, MapLibre GL JS v6 and milsymbol v3 in plain TypeScript, with no
  UI framework. `map/` (createMap, trackLayer, symbols, reticle), `net/connection`,
  `state/` (trackStore, clock, selection) and `ui/` (detailsPanel, statusBar, format).

## Architecture

- Data flow: feeds → TrackSink (`sanitizeTrack`) → server TrackStore → Hub
  (WebSocket) → browser TrackStore → map layer and UI.
- **Feed contract:** `start(sink)` and `stop()`, where the sink has
  `upsert(report: unknown)` and `remove(id)`. New feeds (OpenSky, AISStream)
  implement this and push into the same store, and nothing downstream changes.
- Track ids are `${source}:${nativeId}`, for example `adsb:4ca7b3` or `sim:air-0001`.
- Server TrackStore: drops out-of-order reports, rejects timestamps more than
  30 s in the future, and keeps dirty and removed sets. `flush()` returns only
  what changed, coalesced per track.
- Hub: every 1 s tick it prunes, flushes and broadcasts one serialised delta to
  all clients. It always sends one, even when empty, because the delta doubles
  as a heartbeat. Clients with more than 2 MB buffered are skipped and later
  resynced with a snapshot. It pings every 15 s to drop dead sockets.
- Protocol (`PROTOCOL_VERSION = 1`): hello (protocol, serverTime, tickMs,
  staleness, scenario), then snapshot, then a delta per tick. Applying messages
  is idempotent. **Bump the version on any breaking change**; the client shows
  "reload the page" on mismatch.
- Staleness: air goes stale at 30 s and is dropped at 120 s; sea goes stale at
  90 s and is dropped at 10 min.
- Client:
  - ServerClock keeps the lowest-latency offset sample.
  - TrackLayer renders at 10 Hz, dead-reckons live tracks and freezes them at
    the stale threshold. Stale tracks draw at 40% opacity.
  - Speed leaders look 60 s ahead for air and 600 s for sea.
  - Symbols come from `map.setMissingStyleImageResolver`, with ids
    `sym:<15-char SIDC>` or `sym:<SIDC>:<label>`. The labelled version appears
    from zoom 8.
  - Selection is a DOM Marker reticle with a lock-on animation, plus a details
    panel and follow mode. Dragging the map cancels follow.
  - Reconnect uses exponential backoff with jitter and a watchdog of
    max(5 s, 5 × tickMs).
- Simulator (`server/src/feeds/sim/`):
  - Uses a seeded mulberry32 RNG (`SIM_SEED`, default 42) and an injectable
    clock, so tests call `attach(sink, now)` and `step(now)` directly.
  - Behaviours are route (once, loop or pingpong with dwell), orbit and loiter,
    with turn-rate, acceleration and climb limits.
  - Random transponder dropouts exercise stale-track handling.
  - The `englishChannel` scenario follows the real Dover Strait traffic
    separation scheme and has three ferry routes plus fishing, leisure, naval,
    helicopter and light-aircraft areas.
  - Ships move only inside lanes, routes and areas, which is how they stay off
    land without coastline data.
  - About 85 contacts across 12 archetypes. All names and callsigns are invented.
- Settings: a root `.env` (see `.env.example`) is read by the server via
  `process.loadEnvFile` and by Vite via `envDir: '..'`. `VITE_MAP_STYLE_URL=offline`
  runs without a basemap.

## Gotchas already solved (do not undo)

- MapLibre v6 loses its worker after bundling. `createMap.ts` imports
  `maplibre-gl/dist/maplibre-gl-worker.mjs?url` and calls `setWorkerUrl()`. The
  server serves `.mjs` as `text/javascript`, because module workers need a JS MIME type.
- `main.ts` imports MapLibre's CSS **before** `styles.css`. Otherwise
  `.maplibregl-map { position: relative }` collapses the map to 300 px.
- milsymbol uses `civilianColor: false`, so colour always means identity.
  uniqueDesignation sits at the lower left, per the standard. `renderSymbol`
  pads the canvas so the anchor is exactly centred.
- Dependencies are pinned to exact versions that were at least 2 weeks old when
  added (a supply-chain precaution). Apply the same rule to anything new.
- Don't kill the server with `pkill -f "node dist/index.js"`, because it matches its own command line.
- The server honours `PORT`. Tools that inject `PORT` (such as preview launchers)
  will move it off 8080 and break the Vite `/ws` proxy, so force `PORT=8080` for `npm run dev`.
- `.gitattributes` pins LF line endings because the user's global `core.autocrlf=true`.
- npm 11 blocks esbuild's postinstall script. That is harmless, because the
  platform binary arrives as an optional dependency and both builds work.
- To *see* the map in automation, use headless Chrome with
  `--use-angle=swiftshader --enable-unsafe-swiftshader` over CDP. The app's
  preview pane shows a black WebGL canvas even when everything works.

## Design system (`client/src/styles.css`)

- Quiet slate-blue chrome (surface #101C23, rule #26404C, ink #DCE6EB, muted
  #8FA3AE), so symbol colours are the brightest things on screen: friend
  #80E0FF, neutral #AAFFAA, hostile #FF8080, unknown #FFFF80.
- One accent, orchid #C9A0FF, used only for selection and focus. It is
  deliberately outside the symbology palette.
- One typeface: IBM Plex Sans Condensed with tabular numbers. UI text is
  sentence case; callsigns and the date-time group are upper case.
- The top bar has a military DTG clock (`251432Z OCT 26`). The bottom status bar
  shows link state, air/sea/stale counts and the cursor position in degrees and
  decimal minutes.
- Map controls sit top left; the right side is reserved for the details panel,
  which becomes a bottom sheet under 640 px.
- Respect `prefers-reduced-motion`. Motion only responds to user actions.

## Roadmap (next up first)

1. Track history trails, plus a sortable, filterable track list panel
   (air/sea filter, callsign search, row selects track).
2. Live aircraft from the OpenSky Network API as a Feed (anonymous rate limits;
   staleness may need per-source tuning).
3. Live ships from AISStream.io over WebSocket (free API key in `.env`).
4. Geofences drawn on the map, with entry and exit alerts.
5. Operator tagging of affiliation.
6. Recording and a replay timeline.

## How to work here

- Small, well-named modules, comments that explain *why*, strict types, and
  tests for logic in `shared/` and `server/`.
- After every change, run `npm run typecheck` and `npm test`. Keep the README's
  roadmap and design notes current.
- Small, focused commits with clear messages, authored by Abraham only (no
  co-author lines).
- Explain decisions as you go. The user is learning and wants to be able to
  talk through this project in interviews.
- Propose a plan before writing code for each roadmap item.
