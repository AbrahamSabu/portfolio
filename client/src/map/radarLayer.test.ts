import { describe, expect, it } from 'vitest';
import { latestRadarFrame } from './radarLayer';

// Recorded from api.rainviewer.com, 31 Oct 2026 (trimmed to three frames).
const BODY = {
  version: '2.0',
  generated: 1793449825,
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [
      { time: 1793448600, path: '/v2/radar/0e3e7bc9aefe' },
      { time: 1793449200, path: '/v2/radar/deb5c0c7aba0' },
      { time: 1793449800, path: '/v2/radar/47f1ea6bad64' },
    ],
    nowcast: [],
  },
  satellite: { infrared: [] },
};

describe('latestRadarFrame', () => {
  it('takes the newest past frame as a 512 px, zoom-addressed tile template', () => {
    expect(latestRadarFrame(BODY)).toEqual({
      time: 1793449800_000,
      tiles: 'https://tilecache.rainviewer.com/v2/radar/47f1ea6bad64/512/{z}/{x}/{y}/2/1_0.png',
    });
  });

  it("refuses another host, odd paths, or a file that isn't the frame list", () => {
    expect(latestRadarFrame({ ...BODY, host: 'https://evil.example' })).toBeNull();
    expect(latestRadarFrame({ ...BODY, radar: { past: [{ time: 1, path: '/../x' }] } })).toBeNull();
    expect(latestRadarFrame({ ...BODY, radar: { past: [] } })).toBeNull();
    expect(latestRadarFrame('nope')).toBeNull();
  });
});
