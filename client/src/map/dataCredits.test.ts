import { describe, expect, it } from 'vitest';
import { creditsFor } from './dataCredits';

describe('creditsFor', () => {
  it('credits each live provider, with the ODbL licence for adsb.lol', () => {
    const html = creditsFor(['opensky', 'adsblol']);
    expect(html).toMatch(/^Aircraft: .*OpenSky Network.*adsb\.lol.*ODbL/);
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
