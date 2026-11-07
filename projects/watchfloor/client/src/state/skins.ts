/**
 * Skins: the same display in different clothes. Each recolours the panels
 * (CSS tokens and effects in skins.css, under `html[data-skin]`), the
 * basemap and the sky round the globe (`BasemapPalette`, painted by
 * map/holoBasemap.ts), the graticule and the starfield. What no skin
 * changes: the tracks' identity colours, the squawks' amber and the
 * hazards' apricot. Colour means identity whatever the clothes; Phosphor
 * alone puts the map through one green gun, as the Phosphor scope toggle
 * always has (an operator's deliberate choice).
 */
export const SKINS = ['holo', 'phosphor', 'minimal', 'bubbly', 'blueprint', 'synthwave'] as const;
export type Skin = (typeof SKINS)[number];

export const isSkin = (v: unknown): v is Skin => typeof v === 'string' && (SKINS as readonly string[]).includes(v);

/** How a skin paints the basemap and the sky round the globe. */
export interface BasemapPalette {
  /** Coastlines, borders, roads and water names: one colour at different strengths, as "r, g, b". */
  line: string;
  land: string;
  sea: string;
  /** Landcover, parks and land use: a shade off the land. */
  area: string;
  countryLabel: string;
  placeLabel: string;
  /** Strengths (alpha) of the fine coastline, its soft glow and country borders. */
  coast: number;
  coastGlow: number;
  border: number;
  /** Space round the globe, and its atmosphere's edge. */
  sky: string;
  horizon: string;
}

export interface SkinLook {
  label: string;
  /** One line for the Layers menu. */
  hint: string;
  /** The menu's swatch: background, lines, accent. */
  swatch: readonly [string, string, string];
  basemap: BasemapPalette;
  graticule: string;
  /** Google Fonts families beyond the page's own (`css2?family=` form), loaded the first time it's worn. */
  fonts?: string;
}

/** Brightness stays with the tracks: every basemap here is darker than the identity colours on it. */
export const SKIN_LOOKS: Record<Skin, SkinLook> = {
  holo: {
    label: 'Holo',
    hint: 'The display as built: blue light on navy glass',
    swatch: ['#06121f', '#3fb6ff', '#c9a0ff'],
    basemap: {
      line: '63, 182, 255',
      land: '#04111f',
      sea: '#01060d',
      area: '#051729',
      countryLabel: 'rgba(150, 205, 240, 0.75)',
      placeLabel: 'rgba(120, 175, 210, 0.75)',
      coast: 0.6,
      coastGlow: 0.14,
      border: 0.5,
      sky: '#01050b',
      horizon: '#0a3456',
    },
    graticule: '#3FB6FF',
  },
  phosphor: {
    label: 'Phosphor',
    hint: 'A green radar tube: one gun, a sweep, scan lines',
    swatch: ['#010a04', '#33ff66', '#eaffef'],
    // Bright lines on black, so they burn through the green filter.
    basemap: {
      line: '170, 255, 190',
      land: '#020805',
      sea: '#000201',
      area: '#030b06',
      countryLabel: 'rgba(200, 255, 210, 0.8)',
      placeLabel: 'rgba(170, 235, 185, 0.7)',
      coast: 0.85,
      coastGlow: 0.3,
      border: 0.55,
      sky: '#000000',
      horizon: '#0b3a1a',
    },
    graticule: '#AAFFBE',
    fonts: 'family=Share+Tech+Mono&family=VT323',
  },
  minimal: {
    label: 'Minimal',
    hint: 'Flat graphite, no glow: just the picture',
    swatch: ['#121418', '#cdd3db', '#c9a0ff'],
    basemap: {
      line: '205, 211, 219',
      land: '#15171b',
      sea: '#0c0d10',
      area: '#181a1f',
      countryLabel: 'rgba(225, 229, 235, 0.7)',
      placeLabel: 'rgba(160, 167, 177, 0.7)',
      coast: 0.32,
      coastGlow: 0,
      border: 0.24,
      sky: '#0b0c0e',
      horizon: '#2a2e36',
    },
    graticule: '#C8CDD4',
    fonts: 'family=Inter:wght@400;500;600;700',
  },
  bubbly: {
    label: 'Bubbly',
    hint: 'Candy glass, round corners, pink coastlines',
    swatch: ['#241248', '#ff7ac8', '#7cf5d4'],
    basemap: {
      line: '255, 140, 214',
      land: '#1e1240',
      sea: '#08243a',
      area: '#241650',
      countryLabel: 'rgba(255, 222, 246, 0.85)',
      placeLabel: 'rgba(214, 196, 255, 0.75)',
      coast: 0.7,
      coastGlow: 0.25,
      border: 0.45,
      sky: '#12062a',
      // Mint, not pink: pink space is Synthwave's.
      horizon: '#7cf5d4',
    },
    graticule: '#7CF5D4',
    fonts: 'family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700',
  },
  blueprint: {
    label: 'Blueprint',
    hint: 'White ink on drafting blue, in cockpit lettering',
    swatch: ['#0b2a55', '#e8f2ff', '#c9a0ff'],
    basemap: {
      line: '232, 242, 255',
      land: '#0a2650',
      sea: '#071d40',
      area: '#0c2b58',
      countryLabel: 'rgba(240, 246, 255, 0.85)',
      placeLabel: 'rgba(190, 212, 240, 0.75)',
      coast: 0.8,
      coastGlow: 0.1,
      border: 0.45,
      sky: '#061a38',
      horizon: '#3d74c2',
    },
    graticule: '#E8F2FF',
    // B612: drawn for Airbus cockpit displays, made to read at a glance.
    fonts: 'family=B612:wght@400;700&family=B612+Mono',
  },
  synthwave: {
    label: 'Synthwave',
    hint: 'Neon pink and cyan on a midnight grid',
    swatch: ['#14042a', '#ff3db4', '#7df9ff'],
    basemap: {
      line: '255, 61, 180',
      land: '#14072a',
      sea: '#07021a',
      area: '#180930',
      countryLabel: 'rgba(255, 190, 240, 0.85)',
      placeLabel: 'rgba(190, 170, 255, 0.75)',
      coast: 0.85,
      coastGlow: 0.32,
      border: 0.5,
      sky: '#0a0218',
      horizon: '#ff3db4',
    },
    graticule: '#7DF9FF',
    fonts: 'family=Orbitron:wght@500;700',
  },
};

const STORAGE_KEY = 'watchfloor.skin';

/** The skin being worn. Listeners hear every change (the K key, the Layers menu). */
export class SkinSetting {
  private readonly listeners = new Set<() => void>();

  constructor(private current: Skin) {}

  get value(): Skin {
    return this.current;
  }

  set(skin: Skin): void {
    if (skin === this.current) return;
    this.current = skin;
    for (const listener of this.listeners) listener();
  }

  /** The next skin along, back to the first after the last (the K key). */
  cycle(): void {
    this.set(SKINS[(SKINS.indexOf(this.current) + 1) % SKINS.length]!);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * The skin to start in: `?skin=` in the address (a kiosk or a TV can be
 * dressed by its link) beats the browser's remembered choice; anything
 * unknown is ignored.
 */
export function startingSkin(search: string, stored: string | null): Skin {
  const asked = new URLSearchParams(search).get('skin');
  if (isSkin(asked)) return asked;
  return isSkin(stored) ? stored : 'holo';
}

/** Storage can be unavailable (private windows, blocked site data): then the default, unremembered. */
export function loadSkin(search: string): Skin {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Use the default.
  }
  return startingSkin(search, stored);
}

export function saveSkin(skin: Skin): void {
  try {
    localStorage.setItem(STORAGE_KEY, skin);
  } catch {
    // Not remembered; that's fine.
  }
}
