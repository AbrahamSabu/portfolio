import { describe, expect, it } from 'vitest';
import type { Track } from '@watchfloor/shared';
import type { AircraftInfo } from '../feeds/adsb/aircraftDb';
import { trackDetails } from './trackDetails';

function track(extra: Partial<Track>): Track {
  return {
    id: 'adsb:4ca7b3',
    source: 'adsb',
    domain: 'air',
    platform: 'airliner',
    affiliation: 'unknown',
    lat: 53,
    lon: -6,
    courseDeg: 90,
    speedMps: 230,
    observedAt: 0,
    ...extra,
  };
}

const airlines = new Map([
  ['EIN', 'Aer Lingus'],
  ['RCH', 'Reach'],
]);
const civil: AircraftInfo = { platform: 'airliner', typeCode: 'A320', military: false, private: false };

describe('trackDetails', () => {
  it('names an airliner\'s country and airline', () => {
    const details = trackDetails(track({ callsign: 'EIN123' }), { airlines, aircraft: () => civil });
    expect(details).toEqual({ country: 'Ireland', airline: 'Aer Lingus' });
  });

  it('says which country\'s military flies an aircraft', () => {
    const details = trackDetails(track({ id: 'adsb:ae1234', callsign: 'RCH123', platform: 'military-aircraft' }), {
      airlines,
      aircraft: () => ({ ...civil, military: true }),
    });
    expect(details).toMatchObject({ country: 'United States', military: true });
  });

  it('trusts the platform when the database has no entry', () => {
    expect(trackDetails(track({ platform: 'military-helicopter' }), {}).military).toBe(true);
  });

  it('says nothing more about a private aircraft than the map does', () => {
    const details = trackDetails(track({ callsign: 'EIN123' }), { airlines, aircraft: () => ({ ...civil, private: true }) });
    expect(details).toEqual({ country: 'Ireland', private: true });
  });

  it('gives a ship its flag and what it has broadcast about its voyage', () => {
    const ship = { imo: 9875848, destination: 'PORTLAND', lengthM: 22 };
    const details = trackDetails(track({ id: 'ais:232033439', source: 'ais', domain: 'sea', platform: 'cargo' }), {
      ships: () => ship,
    });
    expect(details).toEqual({ country: 'United Kingdom', ship });
  });

  it('works with no reference data at all', () => {
    expect(trackDetails(track({ callsign: 'EIN123' }), {})).toEqual({ country: 'Ireland' });
    expect(trackDetails(track({ id: 'sim:air-0001', source: 'sim' }), {})).toEqual({});
  });
});
