import type { Affiliation, Platform, Track } from '@watchfloor/shared';
import { AFFILIATION_COLOR } from './colors';

/**
 * Top-down vehicle outlines, the Flightradar24 way of reading a picture: you
 * see an airliner, a helicopter or a tanker, pointing where it's going.
 *
 * Each shape is drawn on a 64-unit square, nose up (north), centred on the
 * track's position. `body` is filled in the identity colour and outlined;
 * `detail` is stroked in the outline colour on top (container bays, a
 * bridge, a gun mount), so one colour still says identity and only the
 * outline says type. All drawn for this project.
 */
export type Shape =
  | 'airliner'
  | 'business-jet'
  | 'light-aircraft'
  | 'helicopter'
  | 'military-jet'
  | 'patrol'
  | 'uav'
  | 'aircraft'
  | 'cargo'
  | 'tanker'
  | 'passenger'
  | 'fishing'
  | 'leisure'
  | 'warship'
  | 'vessel';

interface ShapeDrawing {
  body: string;
  detail?: string;
}

// A swept-wing jet without engines, shared by the airliner and the generic aircraft.
const JET =
  'M32 3C34 3 35 6 35 10L35 24 60 38 60 42 35 34 35 50 45 56 45 59 33.5 57 32 61 30.5 57 19 59 19 56 29 50 29 34 4 42 4 38 29 24 29 10C29 6 30 3 32 3Z';
// A plain hull, bow up, shared by cargo ships and the generic vessel.
const HULL = 'M32 4C37 10 40 17 40 24L40 58C40 60 39 61 37 61L27 61C25 61 24 60 24 58L24 24C24 17 27 10 32 4Z';

export const SHAPES: Record<Shape, ShapeDrawing> = {
  airliner: { body: `${JET}M44 27H49V35H44ZM15 27H20V35H15Z` },
  'business-jet': {
    body: 'M32 6C34 6 34.5 9 34.5 13L34.5 28 54 38 54 41 34.5 36 34.5 50 42 56 42 59 32.5 57 32 59 31.5 57 22 59 22 56 29.5 50 29.5 36 10 41 10 38 29.5 28 29.5 13C29.5 9 30 6 32 6ZM35 41H39V49H35ZM25 41H29V49H25Z',
  },
  'light-aircraft': {
    body: 'M32 10C34 10 35 12 35 16L35 22 60 22 60 29 35 29 34 50 44 52 44 57 20 57 20 52 30 50 29 29 4 29 4 22 29 22 29 16C29 12 30 10 32 10ZM24 7H40V9.5H24Z',
  },
  helicopter: {
    body: 'M32 15C36 15 39 20 39 27 39 33 36 37 32 37 28 37 25 33 25 27 25 20 28 15 32 15ZM30.5 36H33.5L33 56H31ZM26 53H38V57H26ZM10.6 7.4 13.4 4.6 53.4 44.6 50.6 47.4ZM50.6 4.6 53.4 7.4 13.4 47.4 10.6 44.6Z',
  },
  'military-jet': {
    body: 'M32 2L34 10 35 22 55 44 55 48 36 46 37 52 44 57 44 60 32 58 20 60 20 57 27 52 28 46 9 48 9 44 29 22 30 10Z',
  },
  patrol: {
    body: 'M32 4C34 4 35 7 35 11L35 26 61 32 61 36 35 34 35 51 44 55 44 58 32 57 20 58 20 55 29 51 29 34 3 36 3 32 29 26 29 11C29 7 30 4 32 4ZM42 24H46V33H42ZM51 26H55V34H51ZM18 24H22V33H18ZM9 26H13V34H9Z',
  },
  uav: {
    body: 'M32 14C33.5 14 34 16 34 19L34 28 62 30 62 33 34 34 33.5 50 40 56 39 58 32 54 25 58 24 56 30.5 50 30 34 2 33 2 30 30 28 30 19C30 16 30.5 14 32 14Z',
  },
  aircraft: { body: JET },
  cargo: { body: HULL, detail: 'M26 22H38M26 30H38M26 38H38M26 46H38M27 51H37V56H27Z' },
  tanker: {
    body: 'M32 5C37 8 40 15 40 22L40 58C40 60 39 61 37 61L27 61C25 61 24 60 24 58L24 22C24 15 27 8 32 5Z',
    detail: 'M32 15V47M27 31H37M27 51H37V56H27Z',
  },
  passenger: {
    body: 'M32 4C38 9 42 17 42 25L42 56C42 59 40 61 37 61L27 61C24 61 22 59 22 56L22 25C22 17 26 9 32 4Z',
    detail: 'M27 18C27 14 37 14 37 18L37 55H27ZM29.5 37H34.5',
  },
  fishing: {
    body: 'M32 14C36 18 38 23 38 28L38 50C38 52 37 53 35 53L29 53C27 53 26 52 26 50L26 28C26 23 28 18 32 14ZM27 31 14 23 15.5 21 28 29ZM37 31 50 23 48.5 21 36 29Z',
    detail: 'M28.5 38H35.5V45H28.5Z',
  },
  leisure: {
    body: 'M32 16C36 21 38 27 38 33L38 48 36 51 28 51 26 48 26 33C26 27 28 21 32 16Z',
    detail: 'M32 29V46M30.5 29A1.5 1.5 0 1 0 33.5 29 1.5 1.5 0 1 0 30.5 29Z',
  },
  warship: {
    body: 'M32 2C36 12 38 22 38 30L38 58 35 61 29 61 26 58 26 30C26 22 28 12 32 2Z',
    detail: 'M32 13.5V8M29.5 16A2.5 2.5 0 1 0 34.5 16 2.5 2.5 0 1 0 29.5 16ZM28.5 27H35.5V42H28.5ZM28 52H36',
  },
  vessel: { body: HULL },
};

const PLATFORM_SHAPE: Record<Platform, Shape> = {
  airliner: 'airliner',
  'business-jet': 'business-jet',
  'light-aircraft': 'light-aircraft',
  helicopter: 'helicopter',
  'military-helicopter': 'helicopter',
  'military-aircraft': 'military-jet',
  'maritime-patrol': 'patrol',
  uav: 'uav',
  aircraft: 'aircraft',
  cargo: 'cargo',
  tanker: 'tanker',
  passenger: 'passenger',
  fishing: 'fishing',
  leisure: 'leisure',
  warship: 'warship',
  vessel: 'vessel',
};

/**
 * Drawn size relative to the largest (a wide-body or a tanker), so a Cessna
 * reads smaller than a 777 and a yacht smaller than a container ship. Only a
 * hint of real size: true scale would make light aircraft invisible.
 */
const PLATFORM_SCALE: Record<Platform, number> = {
  airliner: 0.85,
  'business-jet': 0.7,
  'light-aircraft': 0.6,
  helicopter: 0.7,
  'military-helicopter': 0.75,
  'military-aircraft': 0.8,
  'maritime-patrol': 0.9,
  uav: 0.65,
  aircraft: 0.75,
  cargo: 1,
  tanker: 1,
  passenger: 0.95,
  fishing: 0.6,
  leisure: 0.5,
  warship: 0.9,
  vessel: 0.7,
};

/**
 * ICAO type designators of wide-body and other large aircraft, drawn at full
 * size. A300/A310/A330/A340/A350/A380, 747/767/777/787, MD-11, DC-10,
 * TriStar, Il-76/96, An-124/225, C-5, C-17, A400M, KC-135, E-3.
 * The A318-A321 family (A318, A319, A320, A321, A19N...) isn't matched.
 */
const HEAVY_TYPE = /^(A30[0-9B]|A310|A3[3-8]\d|A35K|B74\w|B76\w|B77\w|B78\w|MD11|DC10|L101|IL76|IL96|A124|A225|C5M|C17|A400|K35R|E3CF|E3TF)$/;

export function shapeFor(track: Pick<Track, 'platform' | 'typeCode'>): { shape: Shape; scale: number } {
  const shape = PLATFORM_SHAPE[track.platform];
  const heavy = track.typeCode !== undefined && HEAVY_TYPE.test(track.typeCode);
  return { shape, scale: heavy ? 1 : PLATFORM_SCALE[track.platform] };
}

/** Image ids for the map: "veh:<shape>:<affiliation>", everything needed to draw one. */
const PREFIX = 'veh:';

export function shapeImageId(shape: Shape, affiliation: Affiliation): string {
  return `${PREFIX}${shape}:${affiliation}`;
}

export function parseShapeImageId(id: string): { shape: Shape; affiliation: Affiliation } | null {
  if (!id.startsWith(PREFIX)) return null;
  const [shape, affiliation] = id.slice(PREFIX.length).split(':');
  if (!shape || !(shape in SHAPES) || !affiliation || !(affiliation in AFFILIATION_COLOR)) return null;
  return { shape: shape as Shape, affiliation: affiliation as Affiliation };
}

/** Pixel size of a full-scale (1.0) shape at icon-size 1. */
export const SHAPE_PX = 32;
const OUTLINE = 'rgba(9, 16, 21, 0.92)';
const OUTLINE_UNITS = 5; // the dark rim, in shape units, that keeps shapes legible on any basemap
const DETAIL_UNITS = 1.8;

/** The same shape as SVG markup, for the details panel and the key. Built from our own constants only. */
export function shapeSvg(shape: Shape, affiliation: Affiliation, size = 30): string {
  const { body, detail } = SHAPES[shape];
  const fill = AFFILIATION_COLOR[affiliation];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 72 72" width="${size}" height="${size}">` +
    `<path d="${body}" fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="${OUTLINE_UNITS}" stroke-linejoin="round"/>` +
    `<path d="${body}" fill="${fill}"/>` +
    (detail ? `<path d="${detail}" fill="none" stroke="${OUTLINE}" stroke-width="${DETAIL_UNITS}" stroke-linejoin="round"/>` : '') +
    `</svg>`
  );
}

/** Draw a shape into ImageData for the map, centred, nose up (the layer rotates it). */
export function renderShape(
  shape: Shape,
  affiliation: Affiliation,
  pixelRatio: number,
): { image: ImageData; pixelRatio: number } | null {
  const { body, detail } = SHAPES[shape];
  const px = Math.ceil(SHAPE_PX * pixelRatio * (72 / 64));
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(px / 72, px / 72);
  ctx.translate(4, 4);
  const path = new Path2D(body);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_UNITS;
  ctx.stroke(path);
  ctx.fillStyle = OUTLINE;
  ctx.fill(path);
  ctx.fillStyle = AFFILIATION_COLOR[affiliation];
  ctx.fill(path);
  if (detail) {
    ctx.lineWidth = DETAIL_UNITS;
    ctx.stroke(new Path2D(detail));
  }
  return { image: ctx.getImageData(0, 0, px, px), pixelRatio };
}
