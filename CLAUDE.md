# Watchfloor

A real-time common operating picture (COP): a defence-style tactical map of
live air and sea tracks drawn with NATO MIL-STD-2525C symbols. It is a
portfolio project, so code quality, structure, tests and the README matter as
much as features. It runs on a built-in traffic simulator by default, and can
show live aircraft from the OpenSky Network; live AIS (ships) comes next.

## Commands

- `npm run dev`: server on 8080 (tsx watch) plus Vite on 5173, which proxies `/ws`.
- `npm run build` then `npm start`: production as one process on 8080, serving
  the built client, `/ws` and `/healthz`.
- `npm run typecheck`: all workspaces (strict mode plus `noUncheckedIndexedAccess`).
- `npm test`: Vitest from the root config (217 tests after the loading-speed work).
- Install with `npm ci` and never delete package-lock.json: npm 10 crashes
  resolving this workspace without it ("Cannot read properties of null
  (reading 'edgesOut')").

## Layout (npm workspace)

- `shared/` (`@watchfloor/shared`, its package.json exports TS source directly):
  the `Track` type, the WebSocket protocol (`protocol.ts`), geodesy (`geo.ts`:
  distance, bearing, dead reckoning), staleness rules (`staleness.ts`),
  `TrailHistory` (`trail.ts`) and `sanitizeTrack` validation (`validate.ts`).
- `server/`: Node plus `ws`, bundled with esbuild for production. `trackStore.ts`,
  `hub.ts`, `http.ts`, `config.ts`, `feeds/` (Feed interface, `pollScheduler.ts`, `sim/`, `opensky/`,
  `adsblol/`, shared `adsb/category.ts`) and
  `scenarios/`.
- `client/`: Vite, MapLibre GL JS v6 and milsymbol v3 in plain TypeScript, with no
  UI framework. `map/` (createMap, trackLayer, trailLayer, trailControl, symbols,
  reticle), `net/connection`, `state/` (trackStore, trackQuery, clock, selection)
  and `ui/` (trackList, detailsPanel, statusBar, format).

## Architecture

- Data flow: feeds → TrackSink (`sanitizeTrack`) → server TrackStore → Hub
  (WebSocket) → browser TrackStore → map layer and UI.
- **Feed contract:** `start(sink)` and `stop()`, where the sink has
  `upsert(report: unknown)` and `remove(id)`. New feeds (OpenSky, AISStream)
  implement this and push into the same store, and nothing downstream changes.
  An optional `health()` adds feed state to `/healthz`, and an optional
  `status()` returns a viewer-facing `FeedStatus` (shared/feedStatus.ts: ok,
  starting, rate-limited with `until`, failing with `detail`, standing-aside
  when the view is wider than the feed covers). An optional
  `setDemand(watched)` hint (may be called before `start`) is driven by the
  Hub's `onClientsChanged(count)`; `index.ts` calls `setDemand(false)` before
  starting feeds, because nobody is connected yet. An optional
  `setAreas(views)` is driven by the Hub's `onViewsChanged(views)`. The
  simulator ignores both.
- Track ids are `${source}:${nativeId}`, for example `adsb:4ca7b3` or `sim:air-0001`.
- Server TrackStore: drops out-of-order reports, rejects timestamps more than
  30 s in the future, and keeps dirty and removed sets. `flush()` returns only
  what changed, coalesced per track. Several providers can report one track
  (same `adsb:<icao24>` id): newest report wins, but `keepKnownIdentity`
  keeps a known callsign and never lets a generic platform ('aircraft',
  'vessel') replace a specific one. Kinematics always come from the newest.
- `Track.provider` ('opensky' | 'adsb.lol', protocol v6) says who delivered
  the latest report: details panel "ADS-B via adsb.lol"; the map's
  attribution credits running live feeds (`map/dataCredits.ts`, an empty
  source carrying the attribution).
- Hub: every 1 s tick it prunes, flushes and broadcasts one serialised delta to
  all clients. It always sends one, even when empty, because the delta doubles
  as a heartbeat. A client with more than 5 unwritten deltas (counted via the
  `ws.send` callback) is skipped and later resynced with a snapshot. Deltas
  queued behind a snapshot in flight don't count, and no resync starts while
  one is in flight; **don't go back to judging by bufferedAmount**, which made
  a 2.5 MB worldwide snapshot look slow and caused a snapshot storm.
  bufferedAmount > 32 MB stays as a memory backstop. It pings every 15 s to
  drop dead sockets. Browser messages (`view` only) go through
  `parseClientMessage`; each client keeps its latest view, and changes are
  reported via `onViewsChanged` within 100 ms of a change (coalescing
  bursts), not on the tick, which was pure added latency. maxPayload is 4 KB.
- Protocol (`PROTOCOL_VERSION = 7`): hello (protocol, serverTime, tickMs,
  staleness, scenario, traffic, feeds), then snapshot (tracks plus `trails`), then a delta per tick.
  A delta carries `feeds` only in the tick where a status changed (the Hub
  compares serialised statuses each tick). The status bar shows a `--warn`
  line from `describeFeeds` for any feed with a problem, and nothing
  otherwise; `standing-aside` adds "Zoom in to see aircraft from adsb.lol"
  only when no other live feed is delivering. The browser sends `view`
  (screen plus 20%, `viewForServer`) on every hello and 300 ms after each
  `moveend`. Applying messages
  is idempotent. **Bump the version on any breaking change**; the client shows
  "reload the page" on mismatch.
- Staleness (`shared/src/staleness.ts`): rules are `{ byDomain, bySource }`
  and are **always** looked up with `ruleFor(track, rules)` (server store,
  browser store, track layer). Domain defaults: air stale 30 s / drop 120 s,
  sea stale 90 s / drop 10 min. `index.ts` sets `bySource.adsb` from
  `polledStaleness(pollMs)` when OpenSky runs (60 s poll gives 145 s / 360 s).
- `hello.traffic` is `simulated | live | mixed` (from `trafficKind(feeds)`);
  the top bar labels the picture from it. Never present sim traffic as live.
- Trails (`shared/src/trail.ts`): `TrailHistory` keeps reported positions as
  `[lon, lat, t]` tuples rounded to about 1 m. Air keeps 5 min with 200 m
  minimum spacing; sea keeps 30 min with 50 m spacing. The server store records
  every accepted report and sends the history in the snapshot. The browser store
  loads it, then records delta upserts and prunes using `serverTime`. Trails
  show reported positions only, never dead-reckoned ones.
- Client:
  - ServerClock keeps the lowest-latency offset sample.
  - TrackLayer dead-reckons live tracks and freezes them at the stale
    threshold. Stale tracks draw at 40% opacity. Its render interval comes
    from `map/renderRate.ts` (a 300 m/s jet moves at most half a pixel per
    frame: 10 Hz zoomed in, 1 Hz at world view). Store, selection and
    `moveend` force the next frame. Only tracks inside `viewBox()` (screen
    plus 50%, antimeridian-aware, `map/viewBox.ts`) and the selected one
    become features; all get positions. Below zoom 5 a circle layer
    (`track-dots`) replaces symbols and leaders aren't computed. Trails and
    heads use the same view cull.
  - Speed leaders look 60 s ahead for air and 600 s for sea.
  - Symbols come from `map.setMissingStyleImageResolver`, with ids
    `sym:<15-char SIDC>` or `sym:<SIDC>:<label>`. The labelled version appears
    from zoom 8.
  - TrailLayer rebuilds trail lines only on store or selection change. A separate
    "heads" source joins the last report to the symbol at 10 Hz. Its mode
    (all, selected or off) is cycled by TrailControl or the T key and saved in
    localStorage.
  - TrackList is a left drawer (L key; `/` focuses search), or a bottom sheet
    under 640 px. Its filter and sort are pure functions in `state/trackQuery.ts`.
    Rows are reused per id and only moved when the order changes, and they use
    roving tabindex. Selecting a row pans the map without turning on follow.
    It is windowed (`ui/listWindow.ts`): only rows in view plus overscan exist,
    between two spacer rows; row height is measured. Keys move by index in the
    sorted list (arrows, Page Up/Down, Home, End); aria-rowcount/rowindex.
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
- OpenSky (`server/src/feeds/opensky/`):
  - `mapState.ts` is pure: a state vector becomes an airborne report, an
    on-ground id (the feed calls `sink.remove`) or a skip reason. observedAt
    is `time_position` (fallback `last_contact`); geometric altitude beats
    barometric; category picks platform but never a military role.
  - `openSkyFeed.ts` polls `/states/all` for `scenario.bounds` with
    `extended=1`. `pollOnce()` returns the next delay and never throws.
    429 waits `X-Rate-Limit-Retry-After-Seconds`; other failures use `Backoff`
    floored at the poll interval. Optional OAuth2 client credentials; rejected
    credentials fall back to anonymous. fetch, clock, random and timers are
    injected; tests use fixtures in `opensky/fixtures/`.
  - With no viewers it skips its next due poll and stops rescheduling (the
    pending timer is the grace period). `setDemand(true)` resumes at
    `max(0, nextDueAt - now)`, so reloads can't poll early and 429 waits hold.
    When recording arrives (roadmap 6), the recorder must count as demand.
  - `OPENSKY_AREA=viewport`: `coverage.ts` (pure) plans requests from views:
    antimeridian split, outward snap to whole degrees, cheapest of separate
    boxes / one union / world (ties go to fewer requests). The feed is
    "active" only with demand and a non-empty plan. `maybePollEarly` is a
    bounded debounce: an uncovered plan brings the next poll forward to
    max(now + 2 s, lastAttempt + 10 s), later views push it back but never
    past the regular poll it replaced, covered views restore the regular
    poll, and never during backoff or a 429. It also runs after each poll
    (the view may move mid-request). A failed request keeps earlier results
    but leaves `lastPolled` unchanged. /healthz has `polled` and
    `creditsPerPoll`. Opens on the scenario (cheap) but names it Worldwide.
  - Budget (OpenSky docs, Oct 2026): 400 credits/day anonymous, 4,000 with
    an account; boxes up to 25 sq° cost 1 credit per poll. Data resolution is
    10 s anonymous, 5 s authenticated.
  - `openSkyStatus()` wraps the shared `polledFeedStatus()`: a live 429 wait
    beats a failure, failures beat "starting". `OPENSKY_API_URL` (http(s),
    default OpenSky's) points at a proxy or a local stub.
- `PollScheduler` (`feeds/pollScheduler.ts`) owns when to poll for every
  polled feed: pause with no viewers, resume at nextDueAt, the bounded
  early-poll debounce. Feeds supply hooks: run, isActive, wantsEarlyPoll,
  isWaiting, describe. Don't re-implement scheduling in a feed.
- adsb.lol (`server/src/feeds/adsblol/`): readsb/ADSBx v2 JSON. `mapAircraft`
  times reports from the response's `now` minus `seen_pos`, feet to metres,
  knots to m/s, skips '~' non-ICAO hexes. `circlesFor` tiles views with
  snapped circles of up to 250 nm; more than 6 (about a region, roughly
  zoom 6+) and it stands aside (status `standing-aside`). Fetches circles two
  at a time (adsb.lol takes 1-3.5 s per circle) and pushes each as it
  answers, with a project User-Agent; 429 waits for Retry-After. Being free,
  its scheduler settles 1 s and may poll 3 s after the last attempt (OpenSky
  keeps 2 s and 10 s to protect credits). A pan shows new aircraft in about
  3 s, measured. To measure, restart the test server between runs, or its
  leftover tracks hide new ones.
  Categories go through `feeds/adsb/category.ts` (codes like 'A3' to
  OpenSky's numbers). Fixtures are ODbL-credited.
- Settings: a root `.env` (see `.env.example`) is read by the server via
  `process.loadEnvFile` and by Vite via `envDir: '..'`. `VITE_MAP_STYLE_URL=offline`
  runs without a basemap. `FEEDS` (`sim`, `opensky`, or `sim,opensky`;
  default `sim`) picks the feeds; `SCENARIO` (old name `SIM_SCENARIO`) picks
  the area for all of them. `SIM_ENABLED` is gone and errors if set.
  `OPENSKY_CLIENT_ID`/`OPENSKY_CLIENT_SECRET` (both or neither) and
  `OPENSKY_POLL_S` (default 60 anonymous, 15 with an account).
  `OPENSKY_AREA=world` polls globally (4 credits, ~7,000 aircraft, ~1.1 MB);
  with only live worldwide traffic, hello frames and names the map
  "Worldwide", otherwise the scenario keeps it. `OPENSKY_AREA=viewport`
  polls only what browsers show (1 credit at zoom 8+, 2 at the Channel's
  zoom 7, 4 for the world). `FEEDS` may include `adsblol` (`ADSBLOL_POLL_S`,
  default 30; `ADSBLOL_API_URL`); the shared adsb staleness rule uses the
  slower of the two poll intervals.

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
- Snapshot size: about 90 KB after 3 minutes of simulation; worldwide about
  2.5 MB raw / 0.5 MB deflated, with a 1.4 MB raw / 214 KB deflated delta
  after each poll. `permessage-deflate` is on (threshold 1 KB).
- Headless SwiftShader is GPU-bound when zoomed in close (about 6 fps with the
  main thread 94% idle). Judge client performance by Performance.getMetrics
  script and task time over CDP, not fps alone.
- Every live OpenSky poll spends a credit from a 400-a-day anonymous budget.
  Never hit the real API from tests or loops; use the fixtures. For a manual
  check, one production instance with `FEEDS=opensky` for a few minutes is enough.
  To see 429s and outages in the UI, run a local stub that scripts them and
  set `OPENSKY_API_URL=http://127.0.0.1:<port>/api` with `OPENSKY_POLL_S=10`.
- A production server keeps serving `client/dist` from disk, so rebuilding
  while it runs gives its browsers a newer client than its server: restart it
  after `npm run build`, or a reload shows the protocol-mismatch notice.
- Another session may already be running the dev server on 8080/5173. Don't
  kill it; verify with `npm run build`, then from `server/`
  `PORT=8090 FEEDS=opensky node dist/index.js` (env vars override `.env`).
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

1. ~~Track history trails and a sortable, filterable track list~~ (done).
2. ~~Live aircraft from the OpenSky Network API as a Feed~~ (done). Polling pauses
   while no browser is connected, viewport mode polls only what's on screen,
   and the status bar says when the feed is rate limited or failing.
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
