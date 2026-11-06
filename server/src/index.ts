import {
  AIS_STALENESS,
  DEFAULT_STALENESS,
  polledStaleness,
  type BBox,
  type ScenarioInfo,
  type StalenessRule,
  type StalenessRules,
  type TrackSource,
} from '@watchfloor/shared';
import { appendFileSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { loadConfig, trafficKind } from './config';
import { readAircraftDb } from './feeds/adsb/aircraftDb';
import type { Feed } from './feeds/feed';
import { circlesFor } from './feeds/readsb/circles';
import { ReadsbFeed } from './feeds/readsb/readsbFeed';
import { ADSB_FI, ADSB_LOL } from './feeds/readsb/services';
import { WORLD } from './feeds/ais/areas';
import { AisStreamFeed } from './feeds/ais/aisStreamFeed';
import { OpenSkyFeed } from './feeds/opensky/openSkyFeed';
import { Simulator } from './feeds/sim/simulator';
import { Hub } from './hub';
import { PathService } from './paths/pathService';
import { replayFor } from './replay/replay';
import { isLoopbackHost, lanOrigins } from './rooms/lanOrigins';
import { Rooms } from './rooms/rooms';
import { nearbyAircraft, SkyWatchers } from './sky/nearby';
import { trackDetails } from './details/trackDetails';
import { readAirlines } from './feeds/adsb/airlines';
import { createHttpServer } from './http';
import { createLogger } from './log';
import { loadPicture, pictureOf, restorePicture, savePicture } from './pictureCache';
import { BriefService } from './brief/briefService';
import { FindingsService } from './findings/findingsService';
import { HazardService } from './hazards/hazardService';
import { WeatherService } from './weather/weatherService';
import { loadNews, NewsService, saveNews } from './news/newsService';
import { getScenario } from './scenarios';
import { TrackStore } from './trackStore';

const log = createLogger('main');
/** How often the live picture is saved for the next restart. */
const PICTURE_SAVE_MS = 30_000;

async function main(): Promise<void> {
  const config = loadConfig();
  // Polled feeds deliver reports in bursts, so their tracks get windows sized
  // to the poll interval instead of the transponder-rate defaults. All ADS-B
  // providers feed the same 'adsb' tracks, so the slowest interval sets the rule.
  const adsbPollMs = Math.max(
    config.feeds.includes('opensky') ? config.opensky.pollMs : 0,
    config.feeds.includes('adsblol') ? config.adsblol.pollMs : 0,
    config.feeds.includes('adsbfi') ? config.adsbfi.pollMs : 0,
  );
  // AIS ships report at rates set by what they're doing (minutes apart when
  // moored), so they get their own rule too.
  const bySource: Partial<Record<TrackSource, StalenessRule>> = {};
  if (adsbPollMs > 0) bySource.adsb = polledStaleness(adsbPollMs, DEFAULT_STALENESS.byDomain.air);
  if (config.feeds.includes('ais')) bySource.ais = AIS_STALENESS;
  const staleness: StalenessRules = { ...DEFAULT_STALENESS, bySource };
  // What each aircraft is, from the database `npm run aircraft-db` downloads.
  // Without it, aircraft keep the types their reports give (often none).
  const aircraftDb = config.aircraftDb ? readAircraftDb(config.aircraftDb) : null;
  if (aircraftDb) {
    log.info('aircraft database loaded', { aircraft: aircraftDb.db.size, fetchedAt: aircraftDb.meta.fetchedAt });
  } else if (config.aircraftDb) {
    log.info('no aircraft database; run `npm run aircraft-db` to type aircraft', { looked: config.aircraftDb });
  }
  const store = new TrackStore(staleness, undefined, aircraftDb ? (t) => aircraftDb.db.enrich(t) : undefined);
  const startedAt = Date.now();

  const scenario = getScenario(config.scenario);
  if (config.feeds.includes('sim') && Object.keys(scenario.population).length === 0) {
    // Live-only areas (Cork) have no lanes or routes, so simulated ships would have nowhere to go.
    throw new Error(`The simulator has no traffic for ${scenario.name}. Use SCENARIO=english-channel with FEEDS=sim.`);
  }
  // The areas of the live feeds that have one (adsb.lol and adsb.fi only follow views).
  const areas = [
    ...(config.feeds.includes('opensky') ? [config.opensky.area] : []),
    ...(config.feeds.includes('ais') ? [config.ais.area] : []),
  ];
  const liveOnly = areas.length > 0 && !config.feeds.includes('sim');
  // With only live worldwide traffic, the scenario's area means nothing, so
  // frame and name the whole map. Viewport mode is worldwide too, but starts on
  // the scenario: a zoomed-in first view costs 1 credit, not 4. With the
  // simulator, or any live feed held to the scenario, keep its area.
  const scenarioInfo: ScenarioInfo =
    liveOnly && areas.every((a) => a === 'world')
      ? { id: 'world', name: 'Worldwide', center: { lat: 30, lon: 0 }, zoom: 2 }
      : liveOnly && areas.every((a) => a !== 'scenario')
        ? { id: 'world', name: 'Worldwide', center: scenario.center, zoom: scenario.zoom }
        : { id: scenario.id, name: scenario.name, center: scenario.center, zoom: scenario.zoom };

  // Every feed pushes into the same store; nothing downstream knows which ran.
  const feeds: Feed[] = [];
  let openSky: OpenSkyFeed | undefined;
  let ais: AisStreamFeed | undefined;
  for (const name of config.feeds) {
    switch (name) {
      case 'sim':
        feeds.push(new Simulator({ scenario, seed: config.sim.seed }));
        break;
      case 'ais':
        feeds.push(
          (ais = new AisStreamFeed({
            apiKey: config.ais.apiKey,
            // Viewport mode starts with nothing and follows the browsers' views.
            boxes: config.ais.area === 'viewport' ? [] : [config.ais.area === 'world' ? WORLD : scenario.bounds],
            viewport: config.ais.area === 'viewport',
            ...(config.ais.url ? { url: config.ais.url } : {}),
          })),
        );
        break;
      case 'adsblol':
      case 'adsbfi': {
        const settings = config[name];
        feeds.push(
          new ReadsbFeed({
            service: name === 'adsblol' ? ADSB_LOL : ADSB_FI,
            pollMs: settings.pollMs,
            // Always poll the scenario's area, so the picture is there before anyone looks.
            home: circlesFor([scenario.bounds]) ?? [],
            warmPollMs: settings.warmPollMs,
            ...(settings.apiUrl ? { apiUrl: settings.apiUrl } : {}),
          }),
        );
        break;
      }
      case 'opensky':
        feeds.push(
          (openSky = new OpenSkyFeed({
            bounds: config.opensky.area === 'scenario' ? scenario.bounds : null,
            viewport: config.opensky.area === 'viewport',
            pollMs: config.opensky.pollMs,
            ...(config.opensky.apiUrl ? { apiUrl: config.opensky.apiUrl } : {}),
            ...(config.opensky.credentials ? { credentials: config.opensky.credentials } : {}),
          })),
        );
        break;
    }
  }

  // Paths for selected tracks; OpenSky fills in flights from before we saw them, when it runs.
  const paths = new PathService({
    store,
    ...(openSky ? { lookup: (icao24: string) => openSky!.flightTrack(icao24) } : {}),
  });

  // Reference data for the details panel; each part is optional.
  const airlines = config.aircraftDb ? readAirlines(config.aircraftDb) : null;
  const detailSources = {
    ...(aircraftDb ? { aircraft: (icao24: string) => aircraftDb.db.lookup(icao24) } : {}),
    ...(airlines ? { airlines } : {}),
    ...(ais ? { ships: (mmsi: string) => ais!.shipDetails(mmsi) } : {}),
  };

  let hub: Hub | undefined;
  const newsFile = config.news.file;
  const news = config.news.enabled
    ? new NewsService({
        saved: newsFile ? loadNews(newsFile) : null,
        onStories: (items) => {
          hub?.broadcastNews(items);
          if (newsFile) {
            saveNews(newsFile, news!.toSaved()).catch((err: unknown) =>
              log.warn('could not save the news', { error: err instanceof Error ? err.message : String(err) }),
            );
          }
        },
      })
    : null;
  // The event log behind the handover brief: squawks, findings, hazards.
  const brief = new BriefService({ tracks: () => store.snapshot() });
  const hazards = config.hazards
    ? new HazardService({
        onChange: (items) => {
          hub?.broadcastHazards(items);
          brief.onHazards(items);
        },
      })
    : null;
  // The watchers: circling aircraft, ships gone silent under way, converging
  // military, rare aircraft (named with their fleet size when the database is loaded).
  const findings = new FindingsService({
    world: { tracks: () => store.snapshot(), path: (id) => store.paths.flat(id) },
    onChange: (items, recent) => hub?.broadcastFindings(items, recent),
    onEvent: (kind, finding, time, resolved) => brief.onFinding(kind, finding, time, resolved),
    ...(aircraftDb ? { fleetOf: (code: string) => aircraftDb.db.fleetSize(code) } : {}),
    isPrivate: (t) => trackDetails(t, detailSources).private === true,
  });
  const weather = new WeatherService();

  // Who is watching: browsers over the socket, plus plane-spotter phones,
  // which only make HTTP requests (sky/nearby.ts). Demand and areas are set
  // separately, so a socket connecting never makes the feeds re-poll.
  let socketClients = 0;
  let socketViews: BBox[] = [];
  const skyWatchers = new SkyWatchers();
  const applyDemand = () => {
    for (const feed of feeds) feed.setDemand?.(socketClients > 0 || skyWatchers.active);
  };
  const applyAreas = () => {
    const areas = [...socketViews, ...skyWatchers.areas()];
    for (const feed of feeds) feed.setAreas?.(areas);
  };
  const skyExpiry = setInterval(() => {
    if (!skyWatchers.expire(Date.now())) return;
    applyAreas();
    if (!skyWatchers.active) applyDemand();
  }, 30_000);
  skyExpiry.unref();

  const server = createHttpServer({
    staticDir: config.staticDir,
    weather: (station) => weather.get(station),
    sky: (lat, lon) => {
      const now = Date.now();
      const wasActive = skyWatchers.active;
      if (skyWatchers.touch(lat, lon, now)) applyAreas();
      if (!wasActive) applyDemand();
      return nearbyAircraft(store.snapshot(), { lat, lon }, now, staleness, (t) => trackDetails(t, detailSources));
    },
    health: () => ({
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
      tracks: store.size,
      rejectedReports: store.rejected,
      clients: hub?.clientCount ?? 0,
      paths: { tracks: store.paths.size, points: store.paths.points, openSkyLookupsLastHour: paths.lookupsLastHour },
      feeds: Object.fromEntries(feeds.map((f) => [f.name, f.health?.() ?? {}])),
      news: news?.health() ?? null,
      hazards: hazards?.health() ?? null,
      findings: findings.health(),
      brief: brief.health(),
    }),
  });

  // The ops room: phones join a main screen as consoles (rooms/). Memory only.
  const joinOrigins = () => lanOrigins(config.host, config.port, networkInterfaces());
  const rooms = new Rooms({ origins: joinOrigins });

  hub = new Hub({
    onTrackRequest: (id, send) => {
      paths.request(id, send);
      const track = store.get(id);
      if (track) send({ type: 'details', serverTime: Date.now(), id, details: trackDetails(track, detailSources) });
    },
    server,
    path: '/ws',
    store,
    tickMs: config.tickMs,
    staleness,
    scenario: scenarioInfo,
    // Without a key AIS can't deliver anything, so it mustn't make the label say "live".
    traffic: trafficKind(config.feeds.filter((f) => f !== 'ais' || config.ais.apiKey)),
    onClientsChanged: (count) => {
      socketClients = count;
      applyDemand();
    },
    onViewsChanged: (views) => {
      socketViews = views;
      applyAreas();
    },
    feedStatus: () => feeds.flatMap((feed) => (feed.status ? [feed.status()] : [])),
    rooms,
    ...(news ? { news: () => news.items() } : {}),
    ...(hazards ? { hazards: () => hazards.items() } : {}),
    findings: () => ({ items: findings.items(), recent: findings.recent() }),
    onBrief: (send) => send(brief.message()),
    onReplay: (bbox, send) => send(replayFor(store.snapshot(), (id) => store.paths.get(id), bbox, Date.now())),
  });

  const sink = {
    upsert: (report: unknown) => store.ingest(report),
    remove: (id: string) => store.remove(id),
  };
  // Bring back the picture saved before the last restart, so the first page
  // after a restart isn't empty: AIS can't be asked for what it missed. The
  // key includes the area settings, so a worldwide picture never lands on Cork.
  const pictureKey = `${config.scenario}|ais:${config.ais.area}|opensky:${config.opensky.area}`;
  if (config.pictureFile) {
    const picture = loadPicture(config.pictureFile);
    const restored = restorePicture(store, picture, pictureKey, Date.now());
    if (restored > 0) {
      const ships = picture?.ships && ais ? ais.restoreShips(picture.ships) : 0;
      log.info('restored the saved picture', { tracks: restored, shipDetails: ships });
    }
  }
  const savePictureNow = async () => {
    if (!config.pictureFile) return;
    try {
      const shipsOf = ais ? (mmsis: string[]) => ais!.savedShips(mmsis) : undefined;
      await savePicture(config.pictureFile, await pictureOf(store, pictureKey, Date.now(), shipsOf));
    } catch (err) {
      log.warn('could not save the picture', { error: err instanceof Error ? err.message : String(err) });
    }
  };
  const saveTimer = setInterval(() => void savePictureNow(), PICTURE_SAVE_MS);
  saveTimer.unref();

  // Nobody is connected yet. Without this, every tsx watch restart in
  // development would spend an OpenSky credit.
  for (const feed of feeds) {
    feed.setDemand?.(false);
    feed.start(sink);
  }
  hub.start();
  rooms.start();
  news?.start();
  hazards?.start();
  findings.start();
  brief.start();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => resolve());
  });
  log.info(`listening on http://${config.host}:${config.port}`, {
    websocket: '/ws',
    health: '/healthz',
    feeds: feeds.map((f) => f.name),
  });
  // Listening beyond this computer is the opt-in for phones on the network (README, "Ops room").
  if (!isLoopbackHost(config.host)) {
    log.warn(`HOST=${config.host}: anyone on this network can open Watchfloor`, { phonesJoinAt: joinOrigins() });
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutting down', { signal });
    for (const feed of feeds) feed.stop();
    rooms.stop();
    news?.stop();
    hazards?.stop();
    findings.stop();
    brief.stop();
    clearInterval(saveTimer);
    await savePictureNow();
    await hub?.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

/**
 * A last gasp with a stack. The kiosk server runs in a minimized console that
 * closes when the process dies, so without this file a crash leaves nothing
 * to read. Appends, so a crash loop tells its whole story.
 */
function recordCrash(kind: string, reason: unknown): void {
  const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  log.error(kind, { error: detail });
  try {
    mkdirSync('../.cache', { recursive: true });
    appendFileSync('../.cache/crash.log', `${new Date().toISOString()} ${kind}\n${detail}\n\n`);
  } catch {
    // Nowhere to write: the log line above is all there is.
  }
}

process.on('uncaughtException', (err) => {
  recordCrash('uncaught exception', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  recordCrash('unhandled rejection', reason);
  process.exit(1);
});

main().catch((err) => {
  recordCrash('failed to start', err);
  process.exit(1);
});
