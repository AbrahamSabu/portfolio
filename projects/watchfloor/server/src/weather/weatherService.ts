import type { AirportWeather } from '@watchfloor/shared';
import { createLogger } from '../log';
import { parseMetar } from './metar';

const log = createLogger('weather');

const USER_AGENT = 'Watchfloor/1.0 (open-source, non-commercial portfolio project)';
const API = 'https://aviationweather.gov/api/data/metar';
/** METARs are issued hourly or half-hourly: a report a few minutes old is as good as new. */
const CACHE_MS = 10 * 60_000;
/** aviationweather.gov allows 100 requests a minute and asks for gaps between them; we keep to one a second. */
const REQUEST_GAP_MS = 1_000;
const FAILURE_WAIT_MS = 60_000;

/**
 * Airport weather for the browser, which can't ask aviationweather.gov
 * itself (it refuses cross-origin requests). One request per station per
 * ten minutes however many browsers ask, a second between requests, and
 * concurrent asks for one station share a request.
 */
export class WeatherService {
  private readonly cache = new Map<string, { at: number; weather: AirportWeather | null }>();
  private readonly inFlight = new Map<string, Promise<AirportWeather | null>>();
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = -Infinity;

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** The station's latest report; null when it has none or the service is down. */
  async get(station: string): Promise<AirportWeather | null> {
    if (!/^[A-Z0-9]{4}$/.test(station)) return null;
    const cached = this.cache.get(station);
    if (cached && this.now() - cached.at < CACHE_MS) return cached.weather;
    const pending = this.inFlight.get(station);
    if (pending) return pending;
    const request = this.fetchStation(station).finally(() => this.inFlight.delete(station));
    this.inFlight.set(station, request);
    return request;
  }

  private async fetchStation(station: string): Promise<AirportWeather | null> {
    // Queue behind earlier requests, then keep the gap.
    const turn = this.queue.then(async () => {
      const wait = this.lastRequestAt + REQUEST_GAP_MS - this.now();
      if (wait > 0) await this.wait(wait);
      this.lastRequestAt = this.now();
    });
    this.queue = turn;
    await turn;
    try {
      const res = await this.fetchFn(`${API}?ids=${station}&format=json`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      // 204: no recent report for that station.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const weather = res.status === 204 ? null : parseMetar(await res.json());
      this.cache.set(station, { at: this.now(), weather });
      return weather;
    } catch (err) {
      log.warn('could not read a METAR', { station, error: err instanceof Error ? err.message : String(err) });
      // Remember the failure for a minute, so a struggling service isn't asked again by every browser.
      this.cache.set(station, { at: this.now() - CACHE_MS + FAILURE_WAIT_MS, weather: null });
      return null;
    }
  }
}
