import { describe, expect, it } from 'vitest';
import { parseMetar } from './metar';
import { WeatherService } from './weatherService';

// Recorded from aviationweather.gov, 31 Oct 2026.
const CORK = [
  {
    icaoId: 'EICK', receiptTime: '2026-10-31T11:33:33.055Z', obsTime: 1793446200, reportTime: '2026-10-31T11:30:00.000Z',
    temp: 14, dewp: 10, wdir: 180, wspd: 4, visib: '6+', altim: 1030, qcField: 16, metarType: 'METAR',
    rawOb: 'METAR EICK 311130Z 18004KT 140V230 9999 FEW002 SCT015 14/10 Q1030 NOSIG',
    lat: 51.848, lon: -8.479, elev: 158, name: 'Cork Arpt, M, IE', cover: 'SCT',
    clouds: [{ cover: 'FEW', base: 200 }, { cover: 'SCT', base: 1500 }], fltCat: 'VFR',
  },
];

describe('parseMetar', () => {
  it('decodes the report', () => {
    expect(parseMetar(CORK)).toEqual({
      station: 'EICK',
      observedAt: 1793446200_000,
      raw: 'METAR EICK 311130Z 18004KT 140V230 9999 FEW002 SCT015 14/10 Q1030 NOSIG',
      tempC: 14,
      dewpointC: 10,
      windDir: 180,
      windKt: 4,
      visibility: '6+',
      pressureHpa: 1030,
      clouds: [{ cover: 'FEW', baseFt: 200 }, { cover: 'SCT', baseFt: 1500 }],
      category: 'VFR',
    });
  });

  it('takes variable wind, and refuses a body with no report', () => {
    expect(parseMetar([{ ...CORK[0], wdir: 'VRB' }])?.windDir).toBe('VRB');
    expect(parseMetar([])).toBeNull();
    expect(parseMetar([{ ...CORK[0], rawOb: undefined }])).toBeNull();
    expect(parseMetar({ error: 'x' })).toBeNull();
  });
});

describe('WeatherService', () => {
  function setup(respond: () => Response) {
    let now = 0;
    const urls: string[] = [];
    const waits: number[] = [];
    const service = new WeatherService(
      (async (url: string) => {
        urls.push(url);
        return respond();
      }) as unknown as typeof fetch,
      () => now,
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
    );
    return { service, urls, waits, advance: (ms: number) => (now += ms) };
  }

  it('asks once per station per ten minutes, and shares a request already on its way', async () => {
    const { service, urls, advance } = setup(() => Response.json(CORK));
    const [a, b] = await Promise.all([service.get('EICK'), service.get('EICK')]);
    expect(a?.station).toBe('EICK');
    expect(b).toEqual(a);
    advance(5 * 60_000);
    await service.get('EICK');
    expect(urls).toEqual(['https://aviationweather.gov/api/data/metar?ids=EICK&format=json']);
    advance(6 * 60_000);
    await service.get('EICK');
    expect(urls).toHaveLength(2);
  });

  it('keeps a second between requests to different stations', async () => {
    const { service, waits } = setup(() => Response.json(CORK));
    await Promise.all([service.get('EICK'), service.get('EGLL'), service.get('KJFK')]);
    expect(waits).toEqual([1000, 1000]);
  });

  it('answers null for a bad code, no report, or a failure, without throwing', async () => {
    const { service, urls } = setup(() => new Response(null, { status: 204 }));
    expect(await service.get('ei ck')).toBeNull();
    expect(await service.get('EICK')).toBeNull();
    expect(urls).toHaveLength(1);
    const failing = setup(() => new Response('busy', { status: 429 }));
    expect(await failing.service.get('EICK')).toBeNull();
  });
});
