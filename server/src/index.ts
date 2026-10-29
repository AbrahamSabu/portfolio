import {
  AIS_STALENESS,
  DEFAULT_STALENESS,
  polledStaleness,
  type ScenarioInfo,
  type StalenessRule,
  type StalenessRules,
  type TrackSource,
} from '@watchfloor/shared';
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
import { trackDetails } from './details/trackDetails';
import { readAirlines } from './feeds/adsb/airlines';
import { createHttpServer } from './http';
import { createLogger } from './log';
import { loadPicture, pictureOf, restorePicture, savePicture } from './pictureCache';
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
  const server = createHttpServer({
    staticDir: config.staticDir,
    health: () => ({
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
      tracks: store.size,
      rejectedReports: store.rejected,
      clients: hub?.clientCount ?? 0,
      paths: { tracks: store.paths.size, points: store.paths.points, openSkyLookupsLastHour: paths.lookupsLastHour },
      feeds: Object.fromEntries(feeds.map((f) => [f.name, f.health?.() ?? {}])),
    }),
  });

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
      for (const feed of feeds) feed.setDemand?.(count > 0);
    },
    onViewsChanged: (views) => {
      for (const feed of feeds) feed.setAreas?.(views);
    },
    feedStatus: () => feeds.flatMap((feed) => (feed.status ? [feed.status()] : [])),
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
    const restored = restorePicture(store, loadPicture(config.pictureFile), pictureKey, Date.now());
    if (restored > 0) log.info('restored the saved picture', { tracks: restored });
  }
  const savePictureNow = async () => {
    if (!config.pictureFile) return;
    try {
      await savePicture(config.pictureFile, pictureOf(store, pictureKey, Date.now()));
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

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => resolve());
  });
  log.info(`listening on http://${config.host}:${config.port}`, {
    websocket: '/ws',
    health: '/healthz',
    feeds: feeds.map((f) => f.name),
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutting down', { signal });
    for (const feed of feeds) feed.stop();
    clearInterval(saveTimer);
    await savePictureNow();
    await hub?.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error('failed to start', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
