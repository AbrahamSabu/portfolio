import { describe, expect, it } from 'vitest';
import { creditsFor } from './dataCredits';

describe('creditsFor', () => {
  it('credits each live provider, with the ODbL licence for adsb.lol', () => {
    const html = creditsFor(['opensky', 'adsblol']);
    expect(html).toMatch(/^Aircraft: .*OpenSky Network.*adsb\.lol.*ODbL/);
  });

  it('credits adsb.fi with a link to its home page, as its terms ask', () => {
    expect(creditsFor(['adsblol', 'adsbfi'])).toMatch(/^Aircraft: .*adsb\.lol.*, <a href="https:\/\/adsb\.fi"[^>]*>adsb\.fi<\/a>$/);
  });

  it('groups aircraft and ship credits', () => {
    expect(creditsFor(['ais'])).toMatch(/^Ships: .*aisstream\.io.*AISStream<\/a>$/);
    expect(creditsFor(['sim', 'ais', 'opensky'])).toMatch(/^Aircraft: .*OpenSky Network.*; Ships: .*AISStream/);
  });

  it('is empty for feeds that need no credit', () => {
    expect(creditsFor([])).toBe('');
    expect(creditsFor(['sim'])).toBe('');
  });
});
