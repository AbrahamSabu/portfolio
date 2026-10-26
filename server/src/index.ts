import { DEFAULT_STALENESS, type ScenarioInfo } from '@watchfloor/shared';
import { loadConfig } from './config';
import type { Feed } from './feeds/feed';
import { Simulator } from './feeds/sim/simulator';
import { Hub } from './hub';
import { createHttpServer } from './http';
import { createLogger } from './log';
import { getScenario } from './scenarios';
import { TrackStore } from './trackStore';

const log = createLogger('main');

async function main(): Promise<void> {
  const config = loadConfig();
  const staleness = DEFAULT_STALENESS;
  const store = new TrackStore(staleness);
  const startedAt = Date.now();

  const scenario = getScenario(config.scenario);
  const scenarioInfo: ScenarioInfo = {
    id: scenario.id,
    name: scenario.name,
    center: scenario.center,
    zoom: scenario.zoom,
  };

  // Every feed pushes into the same store; nothing downstream knows which ran.
  const feeds: Feed[] = [];
  for (const name of config.feeds) {
    switch (name) {
      case 'sim':
        feeds.push(new Simulator({ scenario, seed: config.sim.seed }));
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
      feeds: feeds.map((f) => f.name),
    }),
  });

  hub = new Hub({ server, path: '/ws', store, tickMs: config.tickMs, staleness, scenario: scenarioInfo });

  const sink = {
    upsert: (report: unknown) => store.ingest(report),
    remove: (id: string) => store.remove(id),
  };
  for (const feed of feeds) feed.start(sink);
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
