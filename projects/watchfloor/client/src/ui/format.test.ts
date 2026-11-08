import { describe, expect, it } from 'vitest';
import {
  formatDestination,
  formatNewsPlace,
  formatNewsTime,
  newsSpeech,
  formatOperator,
  formatShipSize,
  formatShipType,
  describeFeedStatus,
  describeFeeds,
  formatSource,
  trafficLabel,
  formatAge,
  formatAltitude,
  formatCourse,
  formatDtg,
  formatPathSpan,
  formatDuration,
  formatLat,
  formatLon,
  formatSpeed,
} from './format';

describe('format', () => {
  it('writes positions as degrees and decimal minutes', () => {
    expect(formatLat(50.4519)).toBe('50°27.11′N');
    expect(formatLon(-0.8533)).toBe('000°51.20′W');
    expect(formatLat(-33.9999999)).toBe('34°00.00′S');
  });

  it('pads courses to three digits', () => {
    expect(formatCourse(7.4)).toBe('007°');
    expect(formatCourse(359.7)).toBe('000°');
  });

  it('uses knots, and flight levels at altitude', () => {
    expect(formatSpeed(10 * (1852 / 3600))).toBe('10 kn'); // ten knots exactly
    expect(formatSpeed(2)).toBe('3.9 kn');
    expect(formatAltitude(10_668)).toBe('FL350');
    expect(formatAltitude(457)).toBe('1,500 ft');
    expect(formatAltitude(undefined)).toBe('—');
  });

  it('formats a military date-time group in UTC', () => {
    expect(formatDtg(Date.UTC(2026, 9, 25, 14, 32))).toBe('251432Z OCT 26');
  });

  it('formats elapsed time compactly, and as an age', () => {
    expect(formatDuration(4400)).toBe('4 s');
    expect(formatDuration(150_000)).toBe('2 min');
    expect(formatDuration(2 * 3_600_000)).toBe('2 h');
    expect(formatDuration(-500)).toBe('0 s');
    expect(formatAge(150_000)).toBe('2 min ago');
  });
});

describe('trafficLabel', () => {
  it('never passes simulated traffic off as live', () => {
    expect(trafficLabel('simulated', 'English Channel')).toBe('English Channel, simulated traffic');
    expect(trafficLabel('live', 'English Channel')).toBe('English Channel, live traffic');
    expect(trafficLabel('mixed', 'English Channel')).toBe('English Channel, live and simulated traffic');
  });

  it('stands alone without a scenario', () => {
    expect(trafficLabel('live')).toBe('Live traffic');
  });
});

describe('describeFeedStatus', () => {
  const opensky = { feed: 'opensky', label: 'OpenSky' };

  it('says nothing while a feed is healthy', () => {
    expect(describeFeedStatus({ ...opensky, state: 'ok' })).toBeNull();
  });

  it('explains each problem in a short line', () => {
    expect(describeFeedStatus({ ...opensky, state: 'starting' })).toBe('Waiting for OpenSky');
    expect(
      describeFeedStatus({ feed: 'ais', label: 'AISStream', state: 'unconfigured', detail: 'no API key, set AISSTREAM_API_KEY' }),
    ).toBe('AISStream off: no API key, set AISSTREAM_API_KEY');
    expect(describeFeedStatus({ ...opensky, state: 'rate-limited', until: Date.UTC(2026, 9, 27, 0, 0) })).toBe(
      'OpenSky rate limited, resumes 270000Z',
    );
    expect(describeFeedStatus({ ...opensky, state: 'failing', detail: 'HTTP 503', until: 1 })).toBe(
      'OpenSky not responding (HTTP 503), retrying',
    );
  });

  it('copes without the optional details', () => {
    expect(describeFeedStatus({ ...opensky, state: 'rate-limited' })).toBe('OpenSky rate limited');
    expect(describeFeedStatus({ ...opensky, state: 'failing' })).toBe('OpenSky not responding, retrying');
  });
});

describe('formatSource', () => {
  it('names the provider when a source has several', () => {
    expect(formatSource({ source: 'adsb', provider: 'adsb.lol' })).toBe('ADS-B via adsb.lol');
    expect(formatSource({ source: 'ais', provider: 'aisstream' })).toBe('AIS via AISStream');
    expect(formatSource({ source: 'adsb', provider: 'opensky' })).toBe('ADS-B via OpenSky');
  });

  it('is just the kind of data otherwise', () => {
    expect(formatSource({ source: 'sim' })).toBe('Simulator');
  });
});

describe('describeFeeds', () => {
  const opensky = { feed: 'opensky', label: 'OpenSky' };
  const adsblol = { feed: 'adsblol', label: 'adsb.lol' };

  it('says nothing about a feed standing aside while another delivers', () => {
    expect(describeFeeds([{ ...opensky, state: 'ok' }, { ...adsblol, state: 'standing-aside' }])).toBe('');
  });

  it('still suggests zooming in for aircraft while ships are delivering', () => {
    const ais = { feed: 'ais', label: 'AISStream' };
    expect(describeFeeds([{ ...ais, state: 'ok' }, { ...adsblol, state: 'standing-aside' }])).toBe(
      'Zoom in to see aircraft from adsb.lol',
    );
  });

  it('suggests zooming in when standing aside is why the map is empty', () => {
    expect(
      describeFeeds([{ ...opensky, state: 'rate-limited', until: Date.UTC(2026, 9, 28, 17, 1) }, { ...adsblol, state: 'standing-aside' }]),
    ).toBe('OpenSky rate limited, resumes 281701Z; Zoom in to see aircraft from adsb.lol');
  });

  it('names both ADS-B networks in one hint when both stand aside', () => {
    const adsbfi = { feed: 'adsbfi', label: 'adsb.fi' };
    expect(describeFeeds([{ ...adsblol, state: 'standing-aside' }, { ...adsbfi, state: 'standing-aside' }])).toBe(
      'Zoom in to see aircraft from adsb.lol and adsb.fi',
    );
  });

  it('joins several problems', () => {
    expect(describeFeeds([{ ...opensky, state: 'failing', detail: 'HTTP 503' }, { ...adsblol, state: 'starting' }])).toBe(
      'OpenSky not responding (HTTP 503), retrying; Waiting for adsb.lol',
    );
  });
});


describe('formatPathSpan', () => {
  const now = Date.UTC(2026, 9, 28, 16, 15);
  const since = Date.UTC(2026, 9, 28, 14, 2);
  const path = (backfill: 'none' | 'pending' | 'opensky', loaded = true) => ({
    loaded,
    backfill,
    points: [
      [0, 50, since],
      [1, 50, now],
    ] as [number, number, number][],
  });

  it('says how far back the path goes and where its start came from', () => {
    expect(formatPathSpan(path('none'), now)).toBe('Since 1402Z (2 h 13 min)');
    expect(formatPathSpan(path('pending'), now)).toBe('Since 1402Z (2 h 13 min) · asking OpenSky for earlier');
    expect(formatPathSpan(path('opensky'), now)).toBe('Since 1402Z (2 h 13 min) · start from OpenSky');
  });

  it('says so while loading or with a single report', () => {
    expect(formatPathSpan(path('none', false), now)).toBe('Loading');
    expect(formatPathSpan({ loaded: true, backfill: 'none', points: [[0, 50, now]] }, now)).toBe('Only the latest report so far');
  });
});

describe('vehicle details', () => {
  it('names the operator: the airline, else whose military', () => {
    expect(formatOperator({ airline: 'Aer Lingus', country: 'Ireland' })).toBe('Aer Lingus');
    expect(formatOperator({ military: true, country: 'United States' })).toBe('United States military');
    expect(formatOperator({ military: true })).toBe('Military');
    expect(formatOperator({ country: 'Ireland' })).toBe('');
    expect(formatOperator(undefined)).toBe('');
  });

  it('reads a ship\'s destination and ETA', () => {
    expect(formatDestination({ destination: 'PORTLAND', eta: '09-22T19:00Z' })).toBe('PORTLAND · ETA 22 Sep 1900Z');
    expect(formatDestination({ destination: 'ROTTERDAM' })).toBe('ROTTERDAM');
    expect(formatDestination({ eta: '09-22T19:00Z' })).toBe('');
  });

  it("names a ship's AIS type", () => {
    expect(formatShipType(52)).toBe('Tug');
    expect(formatShipType(71)).toBe('Cargo ship, hazardous category A');
    expect(formatShipType(70)).toBe('Cargo ship');
    expect(formatShipType(89)).toBe('Tanker');
    expect(formatShipType(56)).toBe('');
    expect(formatShipType(undefined)).toBe('');
  });

  it('gives a ship\'s size', () => {
    expect(formatShipSize({ lengthM: 180, beamM: 24, draughtM: 4.8 })).toBe('180 × 24 m, draught 4.8 m');
    expect(formatShipSize({ lengthM: 22 })).toBe('22 m long');
    expect(formatShipSize({})).toBe('');
  });
});

describe('news', () => {
  const story = { place: "Marinovka, Saratovskaya Oblast', Russia", headline: 'Two jets destroyed', outlet: 'bnn-news.com' };

  it('writes the time and place in the intel-feed style', () => {
    expect(formatNewsTime(Date.UTC(2026, 9, 30, 12, 15))).toBe('301215Z');
    expect(formatNewsPlace(story.place)).toBe('MARINOVKA, RUSSIA');
    expect(formatNewsPlace('Tel Aviv, Israel')).toBe('TEL AVIV, ISRAEL');
  });

  it('reads a story aloud as where, the headline and who reported it', () => {
    expect(newsSpeech(story)).toBe('Marinovka, Russia. Two jets destroyed. Reported by bnn-news.com.');
  });
});
