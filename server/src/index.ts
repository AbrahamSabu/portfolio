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
import type { Feed } from './feeds/feed';
import { AdsbLolFeed } from './feeds/adsblol/adsbLolFeed';
import { WORLD } from './feeds/ais/areas';
import { AisStreamFeed } from './feeds/ais/aisStreamFeed';
import { OpenSkyFeed } from './feeds/opensky/openSkyFeed';
import { Simulator } from './feeds/sim/simulator';
import { Hub } from './hub';
import { createHttpServer } from './http';
import { createLogger } from './log';
import { getScenario } from './scenarios';
import { TrackStore } from './trackStore';

const log = createLogger('main');

async function main(): Promise<void> {
  const config = loadConfig();
  // Polled feeds deliver reports in bursts, so their tracks get windows sized
  // to the poll interval instead of the transponder-rate defaults. Both ADS-B
  // providers feed the same 'adsb' tracks, so the slower interval sets the rule.
  const adsbPollMs = Math.max(
    config.feeds.includes('opensky') ? config.opensky.pollMs : 0,
    config.feeds.includes('adsblol') ? config.adsblol.pollMs : 0,
  );
  // AIS ships report at rates set by what they're doing (minutes apart when
  // moored), so they get their own rule too.
  const bySource: Partial<Record<TrackSource, StalenessRule>> = {};
  if (adsbPollMs > 0) bySource.adsb = polledStaleness(adsbPollMs, DEFAULT_STALENESS.byDomain.air);
  if (config.feeds.includes('ais')) bySource.ais = AIS_STALENESS;
  const staleness: StalenessRules = { ...DEFAULT_STALENESS, bySource };
  const store = new TrackStore(staleness);
  const startedAt = Date.now();

  const scenario = getScenario(config.scenario);
  // The areas of the live feeds that have one (adsb.lol only follows views).
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
  for (const name of config.feeds) {
    switch (name) {
      case 'sim':
        feeds.push(new Simulator({ scenario, seed: config.sim.seed }));
        break;
      case 'ais':
        feeds.push(
          new AisStreamFeed({
            apiKey: config.ais.apiKey,
            // Viewport mode starts with nothing and follows the browsers' views.
            boxes: config.ais.area === 'viewport' ? [] : [config.ais.area === 'world' ? WORLD : scenario.bounds],
            viewport: config.ais.area === 'viewport',
            ...(config.ais.url ? { url: config.ais.url } : {}),
          }),
        );
        break;
      case 'adsblol':
        feeds.push(
          new AdsbLolFeed({
            pollMs: config.adsblol.pollMs,
            ...(config.adsblol.apiUrl ? { apiUrl: config.adsblol.apiUrl } : {}),
          }),
        );
        break;
      case 'opensky':
        feeds.push(
          new OpenSkyFeed({
            bounds: config.opensky.area === 'scenario' ? scenario.bounds : null,
            viewport: config.opensky.area === 'viewport',
            pollMs: config.opensky.pollMs,
            ...(config.opensky.apiUrl ? { apiUrl: config.opensky.apiUrl } : {}),
            ...(config.opensky.credentials ? { credentials: config.opensky.credentials } : {}),
          }),
        );
        break;
    }
  }

  let hub: Hub | undefined;
  const server = createHttpServer({
    staticDir: config.staticDir,
    health: () => ({
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
      tracks: store.size,
      rejectedReports: store.rejected,
      clients: hub?.clientCount ?? 0,
      feeds: Object.fromEntries(feeds.map((f) => [f.name, f.health?.() ?? {}])),
    }),
  });

  hub = new Hub({
    server,
    path: '/ws',
    store,
    tickMs: config.tickMs,
    staleness,
    scenario: scenarioInfo,
    traffic: trafficKind(config.feeds),
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
