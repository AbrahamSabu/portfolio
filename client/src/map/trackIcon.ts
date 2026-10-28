import type { Track } from '@watchfloor/shared';
import type { SymbolStyle } from '../state/symbolStyle';
import { shapeFor, shapeSvg } from './shapes';
import { sidcFor, symbolSvg } from './symbols';

/**
 * A track's icon as SVG markup in the current style, for the details panel and
 * the key, so the UI always shows what the map draws. Shapes point north here.
 */
export function trackIconSvg(
  track: Pick<Track, 'affiliation' | 'platform' | 'typeCode'>,
  style: SymbolStyle,
  size: number,
): string {
  return style === 'shapes' ? shapeSvg(shapeFor(track).shape, track.affiliation, size) : symbolSvg(sidcFor(track), size);
}

/** A key that changes exactly when trackIconSvg's output would. */
export function trackIconKey(track: Pick<Track, 'affiliation' | 'platform' | 'typeCode'>, style: SymbolStyle): string {
  return style === 'shapes' ? `${shapeFor(track).shape}:${track.affiliation}` : sidcFor(track);
}
