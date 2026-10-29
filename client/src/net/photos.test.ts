import { describe, expect, it } from 'vitest';
import { parsePhotoResponse } from './photos';

// The shape the API answered with (Oct 2026).
const ANSWER = {
  photos: [
    {
      id: '1979452',
      thumbnail: { src: 'https://t.plnspttrs.net/12508/1979452_1e9c7a001d_t.jpg', size: { width: 200, height: 133 } },
      thumbnail_large: { src: 'https://t.plnspttrs.net/12508/1979452_1e9c7a001d_280.jpg', size: { width: 420, height: 280 } },
      link: 'https://www.planespotters.net/photo/1979452/g-ezws-easyjet-airbus-a320-214-wl?utm_source=api',
      photographer: 'Pascal Weste',
    },
  ],
};

describe('parsePhotoResponse', () => {
  it('takes the large thumbnail, its link and its credit', () => {
    expect(parsePhotoResponse(ANSWER)).toEqual({
      src: 'https://t.plnspttrs.net/12508/1979452_1e9c7a001d_280.jpg',
      width: 420,
      height: 280,
      link: 'https://www.planespotters.net/photo/1979452/g-ezws-easyjet-airbus-a320-214-wl?utm_source=api',
      credit: 'Pascal Weste',
      source: 'Planespotters.net',
    });
  });

  it('gives null when there is no photo', () => {
    expect(parsePhotoResponse({ photos: [] })).toBeNull();
    expect(parsePhotoResponse({ error: 'nope' })).toBeNull();
    expect(parsePhotoResponse(null)).toBeNull();
  });

  it('refuses URLs that could put something else in the page', () => {
    const photo = ANSWER.photos[0]!;
    expect(parsePhotoResponse({ photos: [{ ...photo, link: 'javascript:alert(1)' }] })).toBeNull();
    expect(parsePhotoResponse({ photos: [{ ...photo, link: 'https://example.com/' }] })).toBeNull();
    expect(
      parsePhotoResponse({ photos: [{ ...photo, thumbnail_large: { src: 'http://insecure/x.jpg' }, thumbnail: undefined }] }),
    ).toBeNull();
    expect(parsePhotoResponse({ photos: [{ ...photo, photographer: ' ' }] })).toBeNull();
  });
});
