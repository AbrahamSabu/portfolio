# Watchfloor

A real-time common operating picture (COP): a defence-style tactical map of
live air and sea tracks drawn as top-down vehicle shapes (default) or NATO
MIL-STD-2525C symbols (S key). It is a
portfolio project, so code quality, structure, tests and the README matter as
much as features. By default it opens on the live world: OpenSky aircraft
and AISStream ships everywhere (`OPENSKY_AREA`/`AIS_AREA` default `world`),
with adsb.lol and adsb.fi filling in aircraft where you zoom in and keeping
Cork (the home scenario) warm. It can run offline on a built-in simulator
over the English Channel.
**The user wants it to feel like Flightradar24: open the page and everything
is already there.** Keep the picture warm; never make a viewer wait for data
that could have been fetched before they arrived.

## Commands

- `npm run dev`: server on 8080 (tsx watch) plus Vite on 5173, which proxies `/ws`.
- `npm run build` then `npm start`: production as one process on 8080, serving
  the built client, `/ws` and `/healthz`.
- `npm run typecheck`: all workspaces (strict mode plus `noUncheckedIndexedAccess`).
- `npm test`: Vitest from the root config (444 tests after airports and the briefing).
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
  `readsb/` (adsb.lol and adsb.fi), `ais/`, shared `adsb/category.ts` and `backoff.ts`) and
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
  when the view is wider than the feed covers, unconfigured when it can't
  run without a missing API key: "AISStream off: ..."). An optional
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
- `Track.provider` ('opensky' | 'adsb.lol' | 'adsb.fi' | 'aisstream'; v6, adsb.fi v9) says who delivered
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
- Protocol (`PROTOCOL_VERSION = 15`, v15 `hazards` (the whole list after the news and on every change), v14 `news` (stories after the snapshot with `replace: true`, then each batch's), v8 feed state `unconfigured`, v9 provider `adsb.fi`, v10 compact wire format, v11 business-jet/military-aircraft and typeCode/model, v12 `path` request/reply, v13 the request is `track` and is answered with `path` and `details`): hello (protocol, serverTime, tickMs,
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
  `polledStaleness(pollMs)` when OpenSky runs (60 s poll gives 145 s / 360 s),
  and `bySource.ais` to `AIS_STALENESS` (6.5 min / 20 min: moored ships
  report every 3 min, so the sea default would fade them between reports).
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
  - Images come from `map.setMissingStyleImageResolver` (`renderImage` in
    trackLayer.ts), drawn from the id alone: `sym:<15-char SIDC>` or
    `sym:<SIDC>:<label>` (tactical; labelled from zoom 8), `veh:<shape>:<affiliation>`
    (vehicle shapes, `map/shapes.ts`), `lbl:<callsign>` (`map/labels.ts`) and
    `news:<kind>` (`map/newsIcons.ts`).
  - SymbolStyle (`state/symbolStyle.ts`, localStorage `watchfloor.symbolStyle`):
    'shapes' (default) or 'tactical'; StyleControl button under the trail
    toggle and the S key. Shapes: 15 top-down outlines on a 64-unit square,
    nose north, rotated by `icon-rotate` = course (`icon-rotation-alignment: map`),
    sized by a `scale` feature property (`shapeFor`: per platform, 1.0 for
    wide-bodies by ICAO type code). Fill = identity colour, detail lines in
    the outline colour. Their callsigns are a separate `track-labels-<domain>`
    layer of label images (no glyph server needed), above all tracks, which
    collide with each other (selected placed first); shapes still ignore
    placement. Tactical features carry no rotation/scale/label. Measured at
    regional zoom: same main-thread cost as tactical. `trackIconSvg`
    (`map/trackIcon.ts`) gives the details header and key the current style.
  - Identity colours live in `map/colors.ts`.
  - TrailLayer rebuilds trail lines only on store or selection change. A separate
    "heads" source joins the last report to the symbol at 10 Hz. Its mode
    (all, selected or off) is cycled by TrailControl or the T key and saved in
    localStorage.
  - PictureFilter (`state/pictureFilter.ts`): hidden vehicle types
    (grouped by `PLATFORMS_BY_DOMAIN`), hidden sources (provider, or `sim`)
    and `showStale`; saved in localStorage (`watchfloor.filter`, parsed
    with unknown values dropped). `passes(track, stale)` is checked by
    TrackLayer (selected track always drawn), TrailLayer, TrackList (its
    domain buttons and search narrow further) and StatusBar (counts are of
    shown tracks, plus "N filtered out"). FilterControl (funnel under the
    trail toggle, dot when active, F key; Escape closes it first) opens
    FilterPanel (`ui/filterPanel.ts`: rows built once, counts of the whole
    picture refreshed 1/s while open). Without the aircraft database ~90%
    of world aircraft are OpenSky's uncategorised 'aircraft'; with it 91 of
    11,720 (Oct 2026). About half the ships stay 'vessel' (no static report yet).
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
- adsb.lol and adsb.fi (`server/src/feeds/readsb/`): readsb/ADSBx v2 JSON.
  One `ReadsbFeed` class per service (`services.ts`: feed name, label,
  provider, URL pattern, `requestGapMs`, `minMsPerCircle`); `mapAircraft`
  takes the provider. Both run by default and feed the same `adsb:` tracks,
  so either alone keeps aircraft up (added after adsb.lol refused us for
  hours). adsb.fi (github.com/adsbfi/opendata): `/v3/lat/../lon/../dist/..`,
  1 req/s documented, 4xx count toward a temporary IP ban, attribution with
  a link required (map credit), personal non-commercial use; budget 1.2 s
  gap, 2 s per circle; `ADSBFI_POLL_S` 5, `ADSBFI_WARM_POLL_S` 30,
  `ADSBFI_API_URL`. A 429 without Retry-After is reported `rate-limited`
  with `until` = next try (backoff), not `failing`. airplanes.live (same
  API) now answers 403 "contact us" without prior approval: not used.
  The rest of this section was written for adsb.lol and applies to both. `mapAircraft`
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
  **Home area (warm):** `home` = `circlesFor([scenario.bounds])` (Cork: one
  125 nm circle) is always in the plan, so the feed is always active and never
  pauses: every 10 s watched (`ADSBLOL_POLL_S`), 30 s unwatched
  (`ADSBLOL_WARM_POLL_S`; 30 s keeps aircraft inside their live window).
  A viewer arriving to data older than pollMs gets an early poll (~1 s) via
  `wantsEarlyPoll`. View circles the home doesn't cover are added after it.
  **Budget:** requests start >= 1.2 s apart (`REQUEST_GAP_MS`; measured:
  6 within ~1 s fine, the 7th got 429; 10 spaced 1 s all fine), and polls
  are >= 8 s apart per circle (`MIN_MS_PER_CIRCLE`), at most 7.5
  requests/min (Cork: 6). adsb.lol publishes no limit ("dynamic"). 42/min
  drew 429s at once, and even a paced 12/min drew one about every minute.
  **Repeated test restarts plus a wide-view tab got our IP refused outright
  (429, no Retry-After) for a long while. Don't hammer it: one test server,
  few restarts, close stale tabs.**
  Categories go through `feeds/adsb/category.ts` (codes like 'A3' to
  OpenSky's numbers). Fixtures are ODbL-credited.
- Aircraft database (`server/src/feeds/adsb/aircraftDb.ts`): tar1090-db
  (Mictronics/wiedehopf; **no licence stated, never commit it**) fetched by
  `npm run aircraft-db` (`server/src/tools/fetchAircraftDb.ts`) into
  `.cache/aircraft-db/` as `aircraft.bin` (16-byte header `WFAC` v1, then
  sorted Uint32 ICAO24s, Uint16 type indexes, Uint8 flags; bit 0 =
  military) plus `types.json` ([code, model, ICAO class, WTC]). Refuses to
  write fewer than 100k aircraft. `AIRCRAFT_DB` (default
  `../.cache/aircraft-db`, `off`). `classifyType` (pure): UAV designators
  (Q1/Q4/Q9/Q25/Q28/HRON/HRM9) or class D -> uav; H/R/T -> (military-)
  helicopter; G -> light; non-L/S/A -> null (keep report); P8/P3/P1/IL38 ->
  maritime-patrol; military flag -> military-aircraft; business-jet name
  families; WTC L -> light, M/H/J -> airliner. Applied by TrackStore's
  `identify` hook (after sanitize, before merge; restores too), for
  `source: 'adsb'` only; DB platform beats the emitter category. Tracks gain
  `typeCode`/`model` (aircraft only, validated). Registration and owner are
  never read (LADD/PIA privacy). 494,975 aircraft, 1,869 types, 3.5 MB.
  Format v2 (Oct 2026) adds flag bit 1 = private (PIA or LADD: tar1090's
  flag digits are military, interesting, PIA, LADD, readsb dbFlags 1/2/4/8);
  a v1 file reads as missing, so rerun `npm run aircraft-db`. The same
  command writes `airlines.json` (OpenFlights airlines.dat, ODbL, ~5,800
  ICAO designators, a 2012-era snapshot: `feeds/adsb/airlines.ts`).
- Settings: a root `.env` (see `.env.example`) is read by the server via
  `process.loadEnvFile` and by Vite via `envDir: '..'`. `VITE_MAP_STYLE_URL=offline`
  runs without a basemap. `FEEDS` (any of `sim`, `opensky`, `adsblol`, `adsbfi`,
  `ais`; default `adsblol,adsbfi,ais`) picks the feeds; `SCENARIO` (old name
  `SIM_SCENARIO`; default `cork`) picks the area for all of them. `cork` is
  live-only (empty simulator geography): `FEEDS=sim` with it fails at
  startup and says to use `english-channel`. `PICTURE_FILE` (default
  `../.cache/picture.json` from server/, `off` to disable) holds the saved
  picture. `SIM_ENABLED` is gone and errors if set.
  `OPENSKY_CLIENT_ID`/`OPENSKY_CLIENT_SECRET` (both or neither) and
  `OPENSKY_POLL_S` (default 60; 15 only with an account and `OPENSKY_AREA=scenario`, since a world poll costs 4 credits).
  `OPENSKY_AREA=world` polls globally (4 credits, ~7,000 aircraft, ~1.1 MB);
  with only live worldwide traffic, hello frames and names the map
  "Worldwide", otherwise the scenario keeps it. `OPENSKY_AREA=viewport`
  polls only what browsers show (1 credit at zoom 8+, 2 at the Channel's
  zoom 7, 4 for the world). `FEEDS` may include `adsblol` (`ADSBLOL_POLL_S`,
  default 10; `ADSBLOL_WARM_POLL_S`, default 30; `ADSBLOL_API_URL`); the shared adsb staleness rule uses the
  slower of the two poll intervals. `FEEDS` may include `ais`:
  `AISSTREAM_API_KEY` (missing key = feed runs, reports `unconfigured`, and
  doesn't count towards `traffic` or map credits), `AIS_AREA` (scenario,
  world or viewport) and `AISSTREAM_URL` (ws(s), for a local stub).
- AISStream (`server/src/feeds/ais/`), one WebSocket (`ws` client, already a
  dependency: permessage-deflate, ping/pong):
  - Docs (Oct 2026): `wss://stream.aisstream.io/v0/stream`; subscribe within
    3 s with `{APIKey, BoundingBoxes: [[[lat, lon], [lat, lon]]], FilterMessageTypes}`
    (**latitude first**, the reverse of our BBox); resending replaces the
    subscription, but more than 1 update/s closes the connection. 3
    connections per key, 3 per IP. Uncompressed connections get bandwidth
    limits (since Sep 2026) and over-limit messages are dropped; so are a slow
    reader's. No replay. Frames are binary UTF-8 JSON. **Recorded, not as
    documented:** the confirmation is `{"Message":{"CompressionEnabled":true},
    "MessageType":"SubscriptionConfirmation"}`; MetaData keys are `MMSI`,
    `MMSI_String`, `ShipName`, lowercase `latitude`/`longitude`, and
    `time_utc` ("2026-10-27 22:21:46.881361972 +0000 UTC").
  - Measured (Oct 2026): Channel box 4-5 msg/s, ~750 ships after 8 min;
    world ~110 msg/s (peaks 214), 59 kB/s decompressed, ~20k ships after
    10 min, 4.7 MB snapshot at 16k, ~30% main thread in long tasks at 17k
    (headless). Coverage is mostly Europe (Singapore Strait: 5 ships in 30 s).
    8% of Channel fixes are stamped 1-2 s ahead of time_utc (why fixTime
    allows 5 s of skew). Only ~1 in 5 Channel ships is typed after 8 min:
    static data is every 6 min and often missed, and many types are tugs or
    dredgers (`vessel`). Fixtures: `fixtures/channel-2026-10-27.json` (real
    frames, 15 ships) and hand-made `edge-cases.json`.
  - `mapAis.ts` is pure: envelope parse (`SubscriptionConfirmation`,
    `{error}`, AIS), Class A/B positions and both static types.
    ITU-R M.1371 "not available" values (lat 91, lon 181, Sog 102.3, Cog
    360, heading 511) are skipped; a moving ship without course is skipped.
    `fixTime` rebuilds observedAt from `MetaData.time_utc` (receive time)
    and the report's UTC second (60-63 = no stamp); up to 5 s "ahead" is
    clock skew. Only MMSIs starting 2-7 are ships. Type 35 = warship
    platform, never an affiliation (always `unknown`).
  - `ShipRegistry` (ships.ts) caches name/type per MMSI (LRU, 50k), merged
    into each position; `MetaData.ShipName` is the fallback name. Tracks are
    `ais:<MMSI>`, `provider: 'aisstream'` ("AIS via AISStream").
  - `aisStreamFeed.ts`: connect, socket, clock, timers and random are
    injected. Backoff 1 s to 2 min, reset only after 30 s healthy. A close
    after open but before confirmation is a likely rejected key or 4th
    connection (**AISStream says nothing: recorded close 1006 ~600 ms after
    subscribing**), so it waits >= 30 s. 15 s to open and confirm; then a
    ping every 30 s, and a missed pong drops the connection (silence alone
    isn't failure: empty sea is quiet). It streams whether or not anyone
    watches (no `setDemand`): it's free, and AIS can't catch up on missed
    reports. Measured around Cork: ~0.5 msg/s, 15-20 ships (thin coverage).
  - `AIS_AREA=viewport`: `areas.ts` reuses coverage.ts's antimeridian split
    and whole-degree snap but keeps separate boxes (cost is volume, i.e.
    area; one union only past 16 boxes). Changes go out on the open
    connection at most every 2 s with the latest view; empty views keep the
    last subscription.

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
- Wire format (`shared/src/wire.ts`, v10): tracks travel as tuples
  `[id, source, domain, platform, affiliation, lat, lon, course, speed,
  ageMs, alt?, callsign?, provider?]` (codes = index in `TRACK_VALUES`,
  track.ts, which validation also uses: **append only**), trailing nulls
  trimmed; observedAt as ms before serverTime; lat/lon 1e-5, course and
  speed 0.1, altitude 1 m. Trails: one flat integer list per track
  (first point, then steps; lossless), aligned by position with the
  snapshot's tracks. `encodeServerMessage` (hub) / `parseServerMessage`
  (client) convert, so in-memory types are unchanged. Measured with ~37k
  tracks: snapshot 13.8 MB -> 4.7 MB raw (1.95 MB deflated), OpenSky's
  minute delta 2.55 -> 0.78 MB, browser parse ~0.25 -> ~0.13 s, tracks
  drawn 3.5-3.9 s -> 1.8-2.1 s after navigation (User Timing:
  `wf:snapshot-parse`, `wf:snapshot-apply`, `wf:first-tracks`). The hub
  sends hello, then builds the snapshot in `setImmediate`, and compresses
  at zlib level 1 (threshold 1 KB): about twice as fast for 12% more bytes.
  The hello itself is compressed (>1 KB with feed statuses).
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
- Each running AIS server holds one of the key's 3 AISStream connections; a
  fourth is dropped silently. Rehearse AIS failures with a local `ws` stub via
  `AISSTREAM_URL=ws://127.0.0.1:<port>` instead of the real service.
- Hazards (`server/src/hazards/`, `shared/src/hazards.ts`): USGS M2.5+
  past-day GeoJSON every 2 min (public domain) and GDACS `events4app`
  (current events, ~100, mostly green wildfires) every 10 min (free with
  credit "GDACS"; terms are disclaimers: automatic, may be wrong, local
  authorities first, which the card says). **GDACS's JSON starts with a
  BOM** (strip before JSON.parse) and its dates have no zone (UTC).
  `sources.ts` (pure): `parseUsgs`, `parseGdacs`, `mergeHazards` (USGS
  quakes plus GDACS's other kinds; a GDACS quake within 2 min / 100 km lends
  its alert level to the USGS one instead of showing twice). `HazardService`
  polls each on its own clock with Backoff, keeps the last list on failure,
  calls `onChange` only when the merged list changes; `HAZARDS=off`.
  Client: `state/hazards.ts` (HazardStore: listeners get what's new after the
  first list; `hazardScale`, `isSignificant` = M6+ or orange/red),
  `map/hazardIcons.ts` (pale apricot #FFD2A8 outlines, `hz:<kind>`),
  `map/hazardLayer.ts` (above tracks, under news; card in a Popup; source
  attribution credits USGS and GDACS), `ui/hazardAlerts.ts` (significant new
  ones only, 5 min, in `#alerts-hazard` beside the squawks' `#alerts-emergency`).
  H key / `watchfloor.hazards`. **Zoom must be the outermost expression**:
  `['*', scale, ['interpolate', ..., ['zoom'], ...]]` failed validation and
  took the whole basemap with it (no tiles, no error in the pane's console).
- Country briefing (`state/countryBriefing.ts` pure, `ui/countryPanel.ts`):
  click a basemap country label (`place_country_1/2`, `name:en` else
  `name`; cursor turns to a pointer) -> the day's stories whose GDELT place
  ends in that country (ranked by `briefing()` with a 24 h window), aircraft
  registered there (`registrationCountry` on adsb hex) and ships flying its
  flag (`flagCountry` on MMSI), plus hazards whose title ends with it.
  Names compared by `countryKey` (lower case, no accents, aliases such as
  Czechia / Czech Republic). Shares the briefing's frame; opening it closes
  the airport panel and vice versa; Escape closes. Click priority: track,
  then airport, then country label.
- Chokepoints (`state/chokepoints.ts` pure counts, `map/chokepointLayer.ts`):
  eight hand-drawn boxes (Hormuz, Bab-el-Mandeb, Suez, Singapore Strait,
  Bosphorus, Gibraltar, Dover, Panama); live (not stale) ships in each and
  how many > 1 m/s, every 5 s. DOM Marker tags below zoom 8 (compact
  "HORMUZ 0" below zoom 4), dashed box outlines from zoom 5; a tag click
  fits the box. C key / `watchfloor.chokepoints`. **Never give a marker
  element `position`**: MapLibre's markers are `position: absolute`, and
  `relative` stacked them in page flow, hundreds of px off. Oct 2026
  coverage: Gibraltar ~165, Dover ~25, Singapore ~9, Hormuz/Suez/Panama 0
  (AISStream receivers are mostly European; the key says so).
- Emergency squawks: `Track.squawk` (aircraft, `^[0-7]{4}$`, from readsb
  `squawk` and OpenSky state index 14; wire tuple index 15, appended, so no
  protocol bump). `EMERGENCY_SQUAWKS` / `emergencyOf` in shared/track.ts.
  Client `state/emergencies.ts` (EmergencyWatch, pure): a code counts once
  a second report (later observedAt) carries it; ends when the code changes
  or the track goes. `ui/emergencyAlerts.ts`: checked each second; amber
  (`--warn`, never hostile red) card under the top bar (Show selects and
  eases there; × dismisses until the code recurs) plus a dead-reckoned DOM
  Marker ring with the code; read aloud when read-aloud is on. To see it,
  run a local readsb stub (one aircraft squawking 7700) with
  `FEEDS=adsblol ADSBLOL_API_URL=http://127.0.0.1:<port>` on a spare port.
- Airports (`client/src/map/airports.ts`, `airportLayer.ts`): OurAirports
  (public domain) large + medium + small with scheduled service, 6,146
  rows, committed as `client/src/data/airports.json` (484 KB, 187 KB gzip;
  `[code, iata, name, city, iso, lat, lon, size]`), rebuilt by `npm run
  airports` (`server/src/tools/fetchAirports.ts`, pure `buildAirports` /
  `parseCsv` in `tools/airports.ts`; refuses < 4,000 rows). Imported with
  `?url` (hashed asset) and fetched after the map is up. AirportLayer is
  constructed before TrackLayer so its layers sit under everything; one
  icon + label layer pair per size with minzoom (large 0 / codes 5, medium
  6 / 7, small 8 / 9; full names from zoom 10). Images `apt:<size>` and
  `apt-lbl:<text>` via renderImage. Icons ignore placement; labels collide.
  HoverCard names an airport when no track is under the pointer (country
  names from `Intl.DisplayNames`). A key / `StoredToggle`
  `watchfloor.airports`.
  - Airport panel (`ui/airportPanel.ts`, click an airport; a track under the
    pointer wins; Escape or × closes; selecting a track closes it; shares the
    briefing's frame, `.app.airport-open` hides the briefing). Weather:
    `GET /api/weather/<ICAO>` (http.ts) -> `WeatherService`
    (`server/src/weather/`): aviationweather.gov METAR JSON, **which refuses
    browser (cross-origin) requests**, 100 req/min limit, asks for a custom
    User-Agent; cached 10 min per station (failures 1 min), >= 1 s between
    requests, concurrent asks shared. `parseMetar` keeps checked fields;
    `ui/weatherFormat.ts` words them (visibility arrives in statute miles,
    "6+" = 10 km or more; metre reports are rounded back to 50 m; `OVX` is
    their code for a VV group, "sky obscured"). Traffic: `airportTraffic`
    (state/airportTraffic.ts, pure): air tracks below 3,000 m within 40 km,
    within 60° of the bearing to it = arriving, > 120° = leaving, else
    nearby (and anything within 1.5 km). Not a timetable (no free source).
    Vite proxies `/api` in dev.
- Paths (selected track's whole history; `server/src/paths/`):
  - `PathHistory` (in TrackStore as `store.paths`, recorded on every accepted
    report): flat number arrays per track, online thinning (`redundant`: the
    old tail goes if the line past it stays within tolerance and it isn't a
    turning point), air 12 h / 300 m / a point at least every 5 min / 1,500
    max, sea 24 h / 30 m / 15 min. `backfill` per track: unset (not asked),
    'none', 'opensky'. Not in the snapshot.
  - Browser sends `{type:'path', id}` on selection and after each hello
    (hub ignores requests < 200 ms apart per client); `PathService` replies
    at once (`backfill: 'pending'` if a lookup started), then again after.
  - Backfill: `OpenSkyFeed.flightTrack(icao24)` = `/tracks/all?icao24=&time=0`
    (OpenSky calls it experimental; 4 credits from a bucket separate from
    /states). Only for `adsb:` aircraft whose path doesn't start near the
    ground (< 600 m first altitude), once per aircraft, shared between
    browsers, 60/hour cap, 10 min wait after a failure, pause on 429.
    Without OpenSky in FEEDS, no backfill. Only points older than ours are
    merged. /healthz `paths` has counts and lookups in the last hour.
  - Saved in the picture as `paths` (encodeTrail tuples relative to savedAt,
    optional so old files load): 2.7 MB after 7 minutes worldwide, mostly
    one point per track; grows over hours.
  - Client: `state/selectedPath.ts` (load keeps newer delta points, extend
    from deltas, `splitAtGaps`: > 20 min air / 60 min sea is drawn dashed),
    `map/pathLayer.ts` (orchid accent, dark casing, start ring, above
    trails, below tracks). "Show whole path" fits it beside the details
    panel; for a path that still doesn't fit at minZoom (was 3, now 0.5 with the globe), `fit()` binary
    searches the earliest point (then a fraction of the segment before it)
    that still fits at minZoom. Details row "Since 1402Z (2 h 13 min) ·
    start from OpenSky".
- Details (selected track; `server/src/details/trackDetails.ts`, pure):
  the browser's `{type:'track', id}` (sent on selection and after each
  hello) gets the path replies and one `details` reply: `country` (aircraft:
  `registrationCountry` from ICAO Annex 10 address blocks; ships:
  `flagCountry` from the MMSI's MID; tables generated into
  `shared/src/countryTables.ts`, an older Annex edition with names
  modernised and Yugoslavia's block given to Serbia), `airline` (callsign
  `^[A-Z]{3}\d` -> OpenFlights), `military` (DB flag or a military
  platform), `private` (no photo, no airline) and `ship` (AIS static data
  the ShipRegistry now keeps: IMO, call sign, destination, ETA
  "MM-DDTHH:MMZ", length/beam from Dimension A+B/C+D, draught; "not
  available" values dropped) plus `aisType` (20-99, `formatShipType` names
  it: "Tug", "Cargo ship, hazardous category A"). The registry's entries
  for live ships are saved with the picture (`ships`, validated by
  `parseSavedShip` on load; anything heard since starting wins), since
  static reports come only every ~6 min.
  - Ships (`client/src/net/shipInfo.ts`, browser, once per selected ship
    after its details arrive): one SPARQL query to query.wikidata.org by IMO
    (P458, trusted) or MMSI (P587, only if `sameName` agrees with the AIS
    name: MMSIs get reassigned) for photo P18, operator P137 (never a human,
    P31 Q5 filtered), class P289, year from P571/P729; then the Commons API
    for a 420 px thumbnail, author (HTML -> `plainText`) and licence. URLs
    checked (upload.wikimedia.org, commons.wikimedia.org). **Don't run
    per-ship Wikidata search API loops**: haswbstatement searches got this IP
    "You are making too many requests" within ~60 calls; batch with one
    SPARQL VALUES query instead. Coverage (Oct 2026): of 400 random ships,
    191 with static data, 53 on Wikidata, 29 with a photo.
  - Photos: `client/src/net/photos.ts` asks Planespotters.net's public API
    (`/pub/photos/hex/<hex>`) from the browser, only for the selected
    aircraft, once per page load, never when `private`. Terms: photographer
    credit beside the image, a plain link to the photo page (no nofollow),
    the browser's own Origin; free, no key. **It refuses headless Chrome**
    (and curl: "Server User-Agent strings must include a contact URL"), so
    check photos in a real browser (the app's browser pane works).
    `parsePhotoResponse` only accepts https images and planespotters.net links.
  - Panel: photo (3:2, caption "Photo: <credit> / <source>") or, without
    one, a large drawing of the vehicle shape (hidden on phones, where it
    would repeat the header icon); rows Ship type, Class, Operator,
    Registered in / Flag, Built, Destination, Size, IMO number, Radio call
    sign, each hidden when empty; OpenFlights and Wikidata credits when
    their data shows.
- Picture cache (`server/src/pictureCache.ts`): the store's live tracks and
  trails (never `sim:`) are saved every 30 s and on shutdown (temp file +
  rename) and restored at startup through `TrackStore.restore` (re-validated,
  drop windows applied; a saved trail replaces ingest's single point). The
  file is keyed by scenario plus AIS/OpenSky area modes, so a world picture
  never lands on Cork. Measured: after a restart, aircraft and ships show at
  ~1.9 s (page load 0.7 s) instead of trickling in.
  - File version 2 (Oct 2026): gzip (async, thread pool) of JSON with
    tracks/trails in wire form (`encodeTrack`/`encodeTrail`, trails aligned
    by position), paths as before, ships as value lists (`SAVED_SHIP_FIELDS`
    in ships.ts, append only). Version 1 (plain JSON objects) is still
    read. `pictureOf` is async: it gathers and `savePicture` serialises
    2,000 tracks at a time with `setImmediate` between pieces. **Don't go
    back to one big JSON.stringify**: measured on a 37k-track world picture,
    v1 was 20.5 MB and stalled the event loop ~300 ms per save (every 30
    s); v2 is 4.1 MB with a longest stall of 30-60 ms. Startup load and
    restore takes ~0.9 s.
- News (`server/src/news/`, `shared/src/news.ts`): GDELT 2.0 15-minute
  batches (gdeltproject.org; free for any use **with a citation and link**:
  ticker credit, map key, README). `lastupdate.txt` names the newest batch;
  files are fetched over https (http 301s), >= 5 s apart (GDELT asks for one
  request per 5 s on its API; its DOC API refused us outright, so don't use
  it). Each batch is `<stamp>.export.CSV.zip` (events) + `<stamp>.gkg.csv.zip`
  (articles, ~4.7 MB zipped / ~20 MB); `zip.ts` reads the first entry from
  the central directory and inflates on the thread pool (no zip dependency);
  the article file is parsed 150 rows per piece with `setImmediate` between
  (in one go it held the event loop 130-170 ms, measured).
  `gdelt.ts` (pure): political score from GKG themes (STRONG +2, WEAK +1,
  OTHER -3; `MIN_SCORE` 8) plus an event with a political actor type
  (GOV, MIL, REB...); place = the article's first-named place (a city in the
  same country preferred over a country centroid; country names from the
  batch's country-level events, since GKG keeps the article's word, e.g.
  "Russian"); kind from theme mention counts. **Don't place by event
  ActionGeo or classify by CAMEO root**: measured, both far noisier (an
  Israeli election landed in Qatar). Tuned on 4 real batches (~4,000
  articles): ~4 in 5 kept stories are political; ~30-40 per batch kept
  (capped 40). `NewsService`: checks every 3 min, backfills 8 batches at
  startup, keeps 24 h (2,000 max), saves `.cache/news.json` (`NEWS_FILE`;
  `NEWS=off`). **lastupdate.txt can name a batch whose files still 404
  minutes later**: a missing batch is retried until it's > 1 h older than
  the newest. Fixtures in `news/fixtures/` are a cut of a real batch.
  - Client: `state/newsStore.ts` (NewsStore; NewsSettings in localStorage
    `watchfloor.news`: `shown`, `voice` off by default), `map/newsLayer.ts`
    (symbol layer above tracks, fades with age; a click opens the card unless
    a track is under it), `ui/newsCards.ts` (MapLibre Popup; NewsRotation in
    `state/newsRotation.ts`: new stories first, then the last 2 h cycle, only
    stories in view; 9 s dwell, opened cards stay 45 s; waits while hovered,
    hidden or speaking; read-aloud via speechSynthesis, one story at a time),
    `ui/newsTicker.ts` (above the status bar, `--ticker-h`, 0 under
    `.app.news-off`; two copies of the newest 30 scroll at 55 px/s, new
    stories join at `animationiteration`; reduced motion steps every 8 s).
    Hotspots (`map/newsHotspots.ts`): a white heatmap of the day's stories
    (weight 1 for an hour, fading to 1/3 at 24 h), under all our layers,
    gone by zoom 7; constructed before AirportLayer for that order.
    N key and the top bar News switch (role=switch, aria-checked; the bare diamond it replaced wasn't recognised as a toggle) turn news on and off.
  - Briefing (`ui/briefingPanel.ts`, `state/briefing.ts`, pure): top 8 of the
    last 6 h, right side, open by default from 900 px wide (`StoredToggle`
    `watchfloor.briefing`; ×, B key, top bar list button). Hidden while a
    track is selected (the details panel has the right side) and while news
    is off. `NewsItem.importance` (optional, v14 unchanged: older clients
    ignore it; saved news without it ranks as 0) = `importanceOf` in gdelt.ts:
    capped political score / 2 + log-scaled sources, articles and copies of
    the headline in the batch. The briefing groups retellings (>= 3 shared
    headline words of 4+ letters, >= 40% of the shorter, place names
    excluded; **two words or same-country grouped five unrelated Delhi
    stories**), ranks groups by lead importance - 2/hour + 6 log2(size), and
    shows "+N related". Picking one eases the map there and opens its card.
- A browser tab left open on a test port reconnects to the next server
  started there and counts as a viewer with its old (possibly wide) view.
  That tab is what drove adsb.lol into 429s; close it or use a fresh port.
- `DataCredits` tracks style readiness itself (`style.load` /
  `styledataloading`). Don't go back to `map.isStyleLoaded()`: it's false
  while tiles load, so a hello arriving then (the worldwide page) never
  installed the credit.
- Client cost with the whole world loaded (Oct 2026, ~37k tracks): each
  domain has its own source and layers (`tracks-sea`/`tracks-air`, ships
  below), redrawn on its own pace (`renderRate.ts` PACE: air ceiling 1 s,
  sea 5 s); store changes force only the air redraw. Below zoom 5 'all'
  trails draw only the selected track, and below zoom 4 dots carry no
  symbol ids. Every setData copies the whole source to MapLibre's worker
  (its serialiser was the top profile entry). **When measuring long tasks
  over CDP, call `Page.enable` before `addScriptToEvaluateOnNewDocument`,
  or the observer never installs and reports zero.** Verify with a
  deliberate 120 ms busy loop. The status bar's counts refresh once a
  second, so time page opening from the User Timing entries, not them.
- To *see* the map in automation, use headless Chrome with
  `--use-angle=swiftshader --enable-unsafe-swiftshader` over CDP. The app's
  preview pane shows a black WebGL canvas even when everything works.

## Design system (`client/src/styles.css`)

- Holographic display (Oct 2026, the user asked for an Iron Man-style HUD;
  an original look, no film names or assets): deep navy glass (surface
  rgb(4 15 28 / 0.8), solid #06121F, ink #D8F1FF, muted #82A9C2) with the
  interface drawn in glowing `--hud` #3FB6FF lines. `--hud` is deliberately
  deeper and bluer than friend cyan and only ever lights lines, never fills
  a track, so symbol colours stay the most saturated things on screen:
  friend #80E0FF, neutral #AAFFAA, hostile #FF8080, unknown #FFFF80. The
  effects live in `client/src/hud.css` (corner brackets as eight gradients
  on every panel, glow, scan lines on `.app::after`, the opening sequence:
  `#boot` overlay plus `.app.booting`, removed by `endBootSequence` in
  main.ts after 2.6 s, never blocking clicks or data). Basemap recoloured at
  `style.load` by `map/holoBasemap.ts` (`holoPaint`, pure; basemap layers
  only, never our GeoJSON ones; adds `holo-coast` glow lines on the water
  layer). Globe: `setProjection({ type: 'globe' })` on every `style.load`
  (createMap.ts; MapLibre flattens it to Mercator as you zoom in), minZoom
  0.5 so the whole sphere fits, and `setSky` gives space and a thin blue
  atmosphere. Zoomed out, `getBounds()` can take in places round the back
  of the globe: news cards also check `facesViewer` (map/viewBox.ts, within
  80° of the centre below zoom 5) and move on after a pan that turns their
  story away. Day and night: `map/nightLayer.ts` draws one 512 px image
  (rows spaced in Mercator, since an image source is stretched in
  Mercator) once a minute from `map/sun.ts` (Almanac low-precision sun):
  faint blue wash by day, darker through twilight to full night 12° after
  sunset, a soft line at sunset; under basemap labels. **Darkening the night
  alone was invisible on the near-black basemap**, hence the day wash; a
  hard one-pixel line came out dotted. Reticle: three turning SVG rings (`map/reticle.ts`). **SVG
  `transform-box: view-box` origins are in user units**: with a viewBox
  centred on 0,0 use `transform-origin: 0 0`, not 50% 50% (that span the
  rings around the wrong point). Read-aloud prefers a British voice
  (`ui/voice.ts`, `pickBritishVoice`).
- One accent, orchid #C9A0FF, used only for selection and focus. It is
  deliberately outside the symbology palette.
- IBM Plex Sans Condensed with tabular numbers for text; Rajdhani
  (`--font-display`, Google Fonts) for headings, labels, the brand and the
  clock. UI text is sentence case; callsigns and the date-time group are
  upper case. The clock has a ring that fills with the minute's seconds.
- The top bar has a military DTG clock (`251432Z OCT 26`). The bottom status bar
  shows link state, air/sea/stale counts and the cursor position in degrees and
  decimal minutes.
- Map controls sit top left; the right side is reserved for the details panel,
  which becomes a bottom sheet under 640 px.
- Respect `prefers-reduced-motion`. Motion only responds to user actions,
  with one deliberate exception: news cards pop up and the ticker scrolls on
  their own (the user asked for it). Reduced motion stops the scroll, pulse
  and card animation.
- News is white (`#F2F6F8`), never an identity colour: a story is neither
  friend nor hostile. Intel-feed style: DTGs, places in capitals, "OSINT"
  tag with a red live lamp (the one warm mark).
- Zoomed out (dots, below zoom 5): aircraft are filled dots, ships are
  rings (`DOT_PAINT` in trackLayer.ts), so domains differ by shape, never
  colour. Symbols scale with zoom (`icon-size` 0.5 at 5, 0.7 at 7, 1 at 10);
  leaders thin and fade below zoom 9.
- HoverCard (`ui/hoverCard.ts`, mouse/pen only via `(hover: hover)`): name,
  model or type, altitude, speed; uses `TrackLayer.trackAt()`, the same
  hit-test as clicks. Text via textContent only (names come from feeds).
- KeyDialog (`ui/keyDialog.ts`, `?` or the top bar button): a modal
  `<dialog>`; symbols drawn with `symbolSvg()` (same options as the map's
  canvas symbols), so the key can't drift. While it's open the global key
  handler returns early. The details header shows the track's symbol too.
- `cleanCallsign` (shared/validate.ts) strips padding (`-.,:;_*~`, spaces)
  and drops names with no letter or digit or all zeros; it runs at
  validation, so restored pictures are cleaned on restart.

## Roadmap (next up first)

1. ~~Track history trails and a sortable, filterable track list~~ (done).
2. ~~Live aircraft from the OpenSky Network API as a Feed~~ (done). Polling pauses
   while no browser is connected, viewport mode polls only what's on screen,
   and the status bar says when the feed is rate limited or failing.
3. ~~Live ships from AISStream.io over WebSocket~~ (done). Free API key in
   `.env`; scenario, world or viewport areas; "off" without a key.
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
