import ms from 'milsymbol';
import type { Affiliation, Platform, Track } from '@watchfloor/shared';

/**
 * MIL-STD-2525C symbology via milsymbol.
 *
 * A 15-character symbol code (SIDC) encodes identity and type:
 *   S  F  A  P  MFP---  -----
 *   |  |  |  |  |       modifiers, country, order of battle (unused)
 *   |  |  |  |  function: what the platform is
 *   |  |  |  status: P = present
 *   |  |  battle dimension: A = air, S = sea surface
 *   |  affiliation: F friend, H hostile, N neutral, U unknown, P pending
 *   coding scheme: S = warfighting
 */

const AFFILIATION_CODE: Record<Affiliation, string> = {
  friend: 'F',
  hostile: 'H',
  neutral: 'N',
  unknown: 'U',
  pending: 'P',
};

const PLATFORM_CODE: Record<Platform, { dimension: 'A' | 'S'; fn: string }> = {
  airliner: { dimension: 'A', fn: 'CF----' }, // civilian fixed wing
  'light-aircraft': { dimension: 'A', fn: 'CF----' },
  helicopter: { dimension: 'A', fn: 'CH----' }, // civilian rotary wing
  'military-helicopter': { dimension: 'A', fn: 'MH----' },
  'maritime-patrol': { dimension: 'A', fn: 'MFP---' }, // military fixed wing, patrol
  uav: { dimension: 'A', fn: 'MFQ---' }, // drone
  aircraft: { dimension: 'A', fn: '------' },
  'business-jet': { dimension: 'A', fn: 'CF----' }, // civilian fixed wing, as airliners
  'military-aircraft': { dimension: 'A', fn: 'MF----' }, // military fixed wing
  cargo: { dimension: 'S', fn: 'XMC---' }, // non-combatant, merchant, cargo
  tanker: { dimension: 'S', fn: 'XMO---' },
  passenger: { dimension: 'S', fn: 'XMP---' },
  fishing: { dimension: 'S', fn: 'XF----' },
  leisure: { dimension: 'S', fn: 'XR----' },
  warship: { dimension: 'S', fn: 'CLFF--' }, // combatant, line, frigate
  vessel: { dimension: 'S', fn: '------' },
};

export function sidcFor(track: Pick<Track, 'affiliation' | 'platform'>): string {
  const p = PLATFORM_CODE[track.platform];
  return `S${AFFILIATION_CODE[track.affiliation]}${p.dimension}P${p.fn}-----`;
}

// Image ids encode everything needed to draw the symbol, so the map can ask for
// any of them on demand: "sym:<sidc>" or "sym:<sidc>:<label>".
const PREFIX = 'sym:';
const SIDC_LENGTH = 15;

export function symbolImageId(sidc: string, label?: string): string {
  return label ? `${PREFIX}${sidc}:${label}` : `${PREFIX}${sidc}`;
}

export function parseSymbolImageId(id: string): { sidc: string; label?: string } | null {
  if (!id.startsWith(PREFIX)) return null;
  const body = id.slice(PREFIX.length);
  const sidc = body.slice(0, SIDC_LENGTH);
  if (sidc.length !== SIDC_LENGTH) return null;
  const label = body.length > SIDC_LENGTH + 1 ? body.slice(SIDC_LENGTH + 1) : undefined;
  return label ? { sidc, label } : { sidc };
}

const SYMBOL_SIZE = 20;
const OUTLINE = 'rgba(9, 16, 21, 0.92)';
const FONT = '"IBM Plex Sans Condensed", "Arial Narrow", Arial, sans-serif';

const SYMBOL_OPTIONS = {
  size: SYMBOL_SIZE,
  colorMode: 'Light',
  // 2525 draws civilian platforms in purple. Turned off so colour always means
  // identity (neutral green, friend cyan…) and never competes with the selection accent.
  civilianColor: false,
  outlineWidth: 3,
  outlineColor: OUTLINE,
  infoColor: '#E4ECF0',
  infoOutlineColor: OUTLINE,
  infoOutlineWidth: 4,
  infoSize: 46,
  fontfamily: FONT,
} as const;

/**
 * The same symbol as SVG markup, for the details panel and the key, so the
 * UI shows exactly what the map draws. Built from a SIDC we generate, never
 * from track text, so it's safe to insert as markup.
 */
export function symbolSvg(sidc: string, size = 30): string {
  return new ms.Symbol(sidc, { ...SYMBOL_OPTIONS, size }).asSVG();
}

/**
 * Draw a symbol into ImageData with its anchor exactly at the centre, so the
 * map can position every icon with the default centre anchor regardless of
 * frame shape or where the label sits.
 */
export function renderSymbol(
  sidc: string,
  label: string | undefined,
  pixelRatio: number,
): { image: ImageData; pixelRatio: number } | null {
  const symbol = new ms.Symbol(sidc, { ...SYMBOL_OPTIONS, ...(label ? { uniqueDesignation: label } : {}) });

  const source = symbol.asCanvas(pixelRatio);
  const { width, height } = symbol.getSize();
  const anchor = symbol.getAnchor();
  const halfW = Math.ceil(Math.max(anchor.x, width - anchor.x)) + 1;
  const halfH = Math.ceil(Math.max(anchor.y, height - anchor.y)) + 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(halfW * 2 * pixelRatio);
  canvas.height = Math.ceil(halfH * 2 * pixelRatio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, (halfW - anchor.x) * pixelRatio, (halfH - anchor.y) * pixelRatio);
  return { image: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio };
}
