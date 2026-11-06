import type { Board, Track } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { leaderboards, RecordsService } from './records';

const NOW = Date.UTC(2026, 10, 6, 18, 0);

function plane(id: string, over: Partial<Track> = {}): Track {
  return {
    id: `adsb:${id}`,
    source: 'adsb',
    domain: 'air',
    platform: 'airliner',
    affiliation: 'neutral',
    lat: 50,
    lon: 0,
    courseDeg: 90,
    speedMps: 230,
    altitudeM: 11_000,
    observedAt: NOW - 5_000,
    callsign: id.toUpperCase(),
    ...over,
  };
}

function ship(id: string, over: Partial<Track> = {}): Track {
  return { ...plane(id), id: `ais:${id}`, source: 'ais', domain: 'sea', platform: 'cargo', altitudeM: undefined, speedMps: 8, ...over };
}

const board = (boards: Board[], id: Board['id']) => boards.find((b) => b.id === id);
const names = (boards: Board[], id: Board['id']) => board(boards, id)?.entries.map((e) => e.name);

describe('leaderboards', () => {
  it('ranks the highest and fastest aircraft, three places each, worded', () => {
    const boards = leaderboards(
      [
        plane('a', { altitudeM: 12_500, speedMps: 250, typeCode: 'B77W' }),
        plane('b', { altitudeM: 16_250 }),
        plane('c', { altitudeM: 9_000, speedMps: 300 }),
        plane('d', { altitudeM: 11_000, speedMps: 200 }),
      ],
      NOW,
    );
    expect(names(boards, 'highest')).toEqual(['B', 'A', 'D']);
    expect(board(boards, 'highest')!.entries[0]).toMatchObject({ value: '53,300 ft', trackId: 'adsb:b', lat: 50, lon: 0 });
    expect(board(boards, 'highest')!.entries[1]!.detail).toBe('Boeing 777-300ER');
    expect(names(boards, 'fastest')).toEqual(['C', 'A', 'B']);
    expect(board(boards, 'fastest')!.entries[0]!.value).toBe('583 kt');
    expect(board(boards, 'fastest')!.entries[0]!.detail).toBe('1,080 km/h');
  });

  it('leaves out garbled figures, old reports, aircraft on the ground, and private ones', () => {
    const boards = leaderboards(
      [
        plane('glitch', { altitudeM: 61_000 }),
        plane('rocket', { speedMps: 900 }),
        plane('old', { altitudeM: 15_000, observedAt: NOW - 10 * 60_000 }),
        plane('taxi', { altitudeM: 0, speedMps: 10 }),
        plane('ladd', { altitudeM: 15_500 }),
        plane('ok', { altitudeM: 10_000 }),
      ],
      NOW,
      { isPrivate: (t) => t.id === 'adsb:ladd' },
    );
    expect(names(boards, 'highest')).toEqual(['OK']);
    expect(names(boards, 'fastest')).toEqual(['OK']);
  });

  it('calls the biggest by type, heaviest first, with how many are flying', () => {
    const boards = leaderboards(
      [
        plane('x1', { typeCode: 'A388' }),
        plane('x2', { typeCode: 'A388' }),
        plane('y', { typeCode: 'B748' }),
        plane('z', { typeCode: 'B77W' }),
        plane('w', { typeCode: 'A359' }),
        plane('small', { typeCode: 'A320' }),
      ],
      NOW,
    );
    expect(board(boards, 'biggest')!.entries.map((e) => [e.name, e.value, e.detail])).toEqual([
      ['Airbus A380', '~575 t', '2 in the air'],
      ['Boeing 747-8', '~448 t', '1 in the air'],
      ['Boeing 777-300ER', '~352 t', '1 in the air'],
    ]);
  });

  it('counts airlines by the callsign designator, named from the register when it knows them', () => {
    const boards = leaderboards(
      [plane('ryr1', { callsign: 'RYR12' }), plane('ryr2', { callsign: 'RYR4XW' }), plane('baw', { callsign: 'BAW9' }), plane('g', { callsign: 'GABCD' })],
      NOW,
      { airlineOf: (cs) => (cs.startsWith('RYR') ? 'Ryanair' : undefined) },
    );
    expect(board(boards, 'airlines')!.entries.map((e) => [e.name, e.value, e.detail])).toEqual([
      ['Ryanair', '2 in the air', 'RYR'],
      ['BAW', '1 in the air', undefined],
    ]);
  });

  it('finds the farthest north and south, and the fastest and longest ships', () => {
    const boards = leaderboards(
      [
        plane('n', { lat: 78.25 }),
        plane('s', { lat: -54.5 }),
        ship('fast', { speedMps: 19 }),
        ship('slow', { speedMps: 5 }),
        ship('junk', { speedMps: 52.6 }),
        ship('moored', { speedMps: 0 }),
      ],
      NOW,
      { shipLengthM: (t) => ({ 'ais:fast': 120, 'ais:slow': 399, 'ais:junk': 900 })[t.id] },
    );
    expect(board(boards, 'north')!.entries[0]).toMatchObject({ name: 'N', value: '78.3°N' });
    expect(board(boards, 'south')!.entries[0]).toMatchObject({ name: 'S', value: '54.5°S' });
    expect(names(boards, 'fastest-ship')).toEqual(['FAST', 'SLOW']);
    expect(board(boards, 'fastest-ship')!.entries[0]!.value).toBe('37 kn');
    expect(names(boards, 'longest-ship')).toEqual(['SLOW', 'FAST']);
  });

  it('leaves out a board nobody qualifies for', () => {
    const boards = leaderboards([plane('a')], NOW);
    expect(board(boards, 'longest-ship')).toBeUndefined();
    expect(board(boards, 'biggest')).toBeUndefined();
    expect(board(boards, 'highest')).toBeDefined();
  });
});

describe('RecordsService', () => {
  it('says when the boards change, and only then', () => {
    let tracks = [plane('a')];
    const heard: Board[][] = [];
    const service = new RecordsService({ tracks: () => tracks, now: () => NOW, onChange: (b) => heard.push(b) });
    service.update();
    service.update();
    expect(heard).toHaveLength(1);
    tracks = [plane('a'), plane('b', { altitudeM: 13_000 })];
    service.update();
    expect(heard).toHaveLength(2);
    expect(service.boards()[0]!.entries[0]!.name).toBe('B');
  });
});
