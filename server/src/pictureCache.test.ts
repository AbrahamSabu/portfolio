import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AIS_STALENESS, DEFAULT_STALENESS, type StalenessRules, type Track } from '@watchfloor/shared';
import { loadPicture, pictureOf, restorePicture, savePicture } from './pictureCache';
import { TrackStore } from './trackStore';

const NOW = Date.parse('2026-10-27T23:00:00Z');
const RULES: StalenessRules = { ...DEFAULT_STALENESS, bySource: { ais: AIS_STALENESS } };

function ship(id: string, observedAt: number, lon = -8.3): Track {
  return {
    id: `ais:${id}`, source: 'ais', domain: 'sea', platform: 'cargo', affiliation: 'unknown',
    callsign: `SHIP ${id}`, lat: 51.8, lon, courseDeg: 90, speedMps: 5, observedAt, provider: 'aisstream',
  };
}
const simShip = (): Track => ({ ...ship('x', NOW), id: 'sim:sea-0001', source: 'sim', provider: undefined });

// Each test writes under its own temp directory; all are removed afterwards
// (they used to pile up in the system temp folder, one per test per run).
const tempDirs: string[] = [];
const tempFile = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-picture-'));
  tempDirs.push(dir);
  return path.join(dir, 'nested', 'picture.json');
};
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('picture cache', () => {
  it('saves live tracks and trails, and restores them after a restart', async () => {
    const before = new TrackStore(RULES);
    before.ingest(ship('1', NOW - 60_000, -8.4), NOW);
    before.ingest(ship('1', NOW - 10_000, -8.3), NOW);
    before.ingest(simShip(), NOW);
    const file = tempFile();
    await savePicture(file, pictureOf(before, 'cork', NOW));

    const after = new TrackStore(RULES);
    expect(restorePicture(after, loadPicture(file), 'cork', NOW + 30_000)).toBe(1);
    expect(after.get('ais:1')).toMatchObject({ callsign: 'SHIP 1', lon: -8.3 });
    expect(after.get('sim:sea-0001')).toBeUndefined(); // the simulator rebuilds its own
    expect(after.trailSnapshot()['ais:1']).toHaveLength(2);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('saves the longer paths too, with where their start came from', async () => {
    const before = new TrackStore(RULES);
    before.ingest(ship('1', NOW - 20 * 60_000, -8.5), NOW);
    before.ingest(ship('1', NOW - 10 * 60_000, -8.4), NOW);
    before.paths.markNoBackfill('ais:1');
    const file = tempFile();
    await savePicture(file, pictureOf(before, 'cork', NOW));

    const after = new TrackStore(RULES);
    restorePicture(after, loadPicture(file), 'cork', NOW + 30_000);
    expect(after.paths.get('ais:1')).toEqual(before.paths.get('ais:1'));
    expect(after.paths.info('ais:1')?.backfill).toBe('none');
  });

  it("saves what the AIS feed knows about each live ship, and only those", async () => {
    const store = new TrackStore(RULES);
    store.ingest(ship('235000001', NOW - 60_000), NOW);
    const asked: string[][] = [];
    const file = tempFile();
    await savePicture(
      file,
      pictureOf(store, 'cork', NOW, (mmsis) => {
        asked.push(mmsis);
        return { '235000001': { destination: 'PORTLAND' } };
      }),
    );
    expect(asked).toEqual([['235000001']]);
    expect(loadPicture(file)?.ships).toEqual({ '235000001': { destination: 'PORTLAND' } });
  });

  it('still loads a picture saved before paths existed', () => {
    const file = tempFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 1, scenario: 'cork', savedAt: NOW, tracks: [ship('1', NOW)], trails: {} }));
    const store = new TrackStore(RULES);
    expect(restorePicture(store, loadPicture(file), 'cork', NOW)).toBe(1);
    expect(store.paths.get('ais:1')).toHaveLength(1);
  });

  it('leaves out tracks that went past their drop window while the server was down', async () => {
    const before = new TrackStore(RULES);
    before.ingest(ship('old', NOW - 19 * 60_000), NOW);
    before.ingest(ship('new', NOW - 60_000), NOW);
    const file = tempFile();
    await savePicture(file, pictureOf(before, 'cork', NOW));
    const after = new TrackStore(RULES);
    expect(restorePicture(after, loadPicture(file), 'cork', NOW + 5 * 60_000)).toBe(1);
    expect(after.get('ais:new')).toBeDefined();
  });

  it("doesn't restore another area's picture", async () => {
    const before = new TrackStore(RULES);
    before.ingest(ship('1', NOW), NOW);
    const file = tempFile();
    await savePicture(file, pictureOf(before, 'english-channel', NOW));
    expect(restorePicture(new TrackStore(RULES), loadPicture(file), 'cork', NOW)).toBe(0);
  });

  it('treats a missing or corrupt file as no picture, and drops malformed trails', () => {
    const file = tempFile();
    expect(loadPicture(file)).toBeNull();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"version":1,"scenario":"cork","savedAt":1,"tracks":[');
    expect(loadPicture(file)).toBeNull();
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, scenario: 'cork', savedAt: NOW, tracks: [ship('1', NOW), { junk: true }], trails: { 'ais:1': [[1, 2, 'x']] } }),
    );
    const store = new TrackStore(RULES);
    expect(restorePicture(store, loadPicture(file), 'cork', NOW)).toBe(1);
    expect(store.trailSnapshot()['ais:1']).toHaveLength(1); // only the point ingest itself recorded
  });
});
