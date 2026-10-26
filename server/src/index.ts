import { DEFAULT_STALENESS, polledStaleness, type ScenarioInfo, type StalenessRules } from '@watchfloor/shared';
import { loadConfig, trafficKind } from './config';
import type { Feed } from './feeds/feed';
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
  // to the poll interval instead of the transponder-rate defaults.
  const staleness: StalenessRules = {
    ...DEFAULT_STALENESS,
    bySource: config.feeds.includes('opensky')
      ? { adsb: polledStaleness(config.opensky.pollMs, DEFAULT_STALENESS.byDomain.air) }
      : {},
  };
  const store = new TrackStore(staleness);
  const startedAt = Date.now();

  const scenario = getScenario(config.scenario);
  const worldwide = config.feeds.includes('opensky') && config.opensky.area === 'world';
  // With only live worldwide traffic, the scenario's area means nothing, so
  // frame and name the whole map. With the simulator too, keep its area.
  const scenarioInfo: ScenarioInfo =
    worldwide && !config.feeds.includes('sim')
      ? { id: 'world', name: 'Worldwide', center: { lat: 30, lon: 0 }, zoom: 2 }
      : { id: scenario.id, name: scenario.name, center: scenario.center, zoom: scenario.zoom };

  // Every feed pushes into the same store; nothing downstream knows which ran.
  const feeds: Feed[] = [];
  for (const name of config.feeds) {
    switch (name) {
      case 'sim':
        feeds.push(new Simulator({ scenario, seed: config.sim.seed }));
        break;
      case 'opensky':
        feeds.push(
          new OpenSkyFeed({
            bounds: config.opensky.area === 'world' ? null : scenario.bounds,
            pollMs: config.opensky.pollMs,
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
