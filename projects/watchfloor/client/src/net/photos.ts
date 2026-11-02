/**
 * Aircraft photos from Planespotters.net's public photo API, looked up by
 * ICAO address. Their terms: no key, but every photo shows its photographer's
 * credit beside it and links to its page on planespotters.net (a plain link,
 * no nofollow), the browser sends its own Origin, and traffic stays modest.
 * So the browser asks only for the aircraft the operator selects, once each.
 */

/** A photo for the details panel, with what its credit line needs. */
export interface Photo {
  src: string;
  width: number;
  height: number;
  /** The photo's own page, which the credit links to (both sources ask for this). */
  link: string;
  /** Who took it, and the licence when there is one: "Pascal Weste", "Jane Doe, CC BY-SA 4.0". */
  credit: string;
  source: 'Planespotters.net' | 'Wikimedia Commons';
}

const API = 'https://api.planespotters.net/pub/photos/hex/';

/**
 * The first photo in an API answer, or null. Strict, because the URLs go into
 * the page: only https images, and links to planespotters.net itself.
 */
export function parsePhotoResponse(data: unknown): Photo | null {
  const photo = (data as { photos?: unknown[] } | null)?.photos?.[0] as Record<string, unknown> | undefined;
  if (!photo || typeof photo !== 'object') return null;
  // The larger thumbnail (420 × 280) suits the panel; the small one is 200 wide.
  const thumb = (photo.thumbnail_large ?? photo.thumbnail) as { src?: unknown; size?: { width?: unknown; height?: unknown } } | undefined;
  const { link, photographer } = photo;
  if (typeof thumb?.src !== 'string' || !thumb.src.startsWith('https://')) return null;
  if (typeof link !== 'string' || !link.startsWith('https://www.planespotters.net/')) return null;
  if (typeof photographer !== 'string' || photographer.trim() === '') return null;
  const width = typeof thumb.size?.width === 'number' ? thumb.size.width : 420;
  const height = typeof thumb.size?.height === 'number' ? thumb.size.height : 280;
  return { src: thumb.src, width, height, link, credit: photographer.trim(), source: 'Planespotters.net' };
}

/** One lookup per aircraft per page load, shared by every caller; failures count as no photo. */
const cache = new Map<string, Promise<Photo | null>>();

export function aircraftPhoto(icao24: string): Promise<Photo | null> {
  const hex = icao24.toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) return Promise.resolve(null);
  let pending = cache.get(hex);
  if (!pending) {
    pending = fetch(API + hex, { signal: AbortSignal.timeout(10_000) })
      .then((res) => (res.ok ? res.json() : null))
      .then(parsePhotoResponse)
      .catch(() => null);
    cache.set(hex, pending);
  }
  return pending;
}
