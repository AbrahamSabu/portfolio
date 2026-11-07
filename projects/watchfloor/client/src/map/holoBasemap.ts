import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { SKIN_LOOKS, type BasemapPalette } from '../state/skins';

/**
 * Recolours CARTO's dark basemap as a hologram: deep navy land, near-black
 * sea, coastlines and borders in faint glowing lines of the display's blue
 * (--hud in styles.css), roads barely there, place names in a muted cyan.
 * Dim on purpose: the tracks' identity colours must stay the brightest
 * things on the map. Done by overriding paint at load, so it needs no style
 * of our own and still works with another style URL (unknown layers keep
 * their colours). A skin passes its own palette (state/skins.ts); the
 * hologram is the default.
 */

const HOLO = SKIN_LOOKS.holo.basemap;

/** The paint to set on one basemap layer, by its type and id; null leaves it alone. */
export function holoPaint(layer: Pick<LayerSpecification, 'id' | 'type'>, p: BasemapPalette = HOLO): Record<string, unknown> | null {
  const id = layer.id;
  const line = (alpha: number) => `rgba(${p.line}, ${alpha})`;
  switch (layer.type) {
    case 'background':
      return { 'background-color': p.land };
    case 'fill':
      if (id.startsWith('water')) return { 'fill-color': p.sea, 'fill-opacity': 1 };
      if (id.startsWith('building')) return { 'fill-color': line(0.06), 'fill-outline-color': line(0.12) };
      // Landcover, parks, land use: a shade off the land, so areas barely show.
      return { 'fill-color': p.area, 'fill-opacity': 0.6 };
    case 'line':
      if (id === 'boundary_country_outline') return { 'line-color': line(0.08) };
      if (id.startsWith('boundary_country')) return { 'line-color': line(p.border) };
      if (id.startsWith('boundary')) return { 'line-color': line(0.16) };
      if (id.startsWith('waterway')) return { 'line-color': line(0.16) };
      // Road and rail casings go; their fills become faint traces.
      if (id.endsWith('_case') || id.includes('_case_')) return { 'line-color': 'rgba(0, 0, 0, 0)' };
      if (/^(road|tunnel|bridge|rail|aeroway)/.test(id)) return { 'line-color': line(0.13) };
      return null;
    case 'symbol':
      if (id.startsWith('water')) return { 'text-color': line(0.45), 'text-halo-color': p.sea };
      if (id.startsWith('place_country') || id.startsWith('place_continent')) return { 'text-color': p.countryLabel, 'text-halo-color': p.land };
      return { 'text-color': p.placeLabel, 'text-halo-color': p.land };
    default:
      return null;
  }
}

/** Glowing coastlines: two lines along the water's edge, a soft wide one and a fine one on top. */
const COAST_LAYERS = ['holo-coast-glow', 'holo-coast'] as const;

type PaintName = Parameters<MapLibreMap['setPaintProperty']>[1];
type PaintValue = Parameters<MapLibreMap['setPaintProperty']>[2];

/** Paints the basemap (at every style load, and again when the skin changes). */
export function applyHoloBasemap(map: MapLibreMap, p: BasemapPalette = HOLO): void {
  const style = map.getStyle();
  const coast = { 'holo-coast-glow': `rgba(${p.line}, ${p.coastGlow})`, 'holo-coast': `rgba(${p.line}, ${p.coast})` };
  for (const layer of style.layers) {
    if ((COAST_LAYERS as readonly string[]).includes(layer.id)) continue;
    // Only the basemap's own layers: ours draw from GeoJSON sources and keep their colours.
    const source = 'source' in layer ? style.sources[layer.source] : undefined;
    if (source?.type === 'geojson') continue;
    const paint = holoPaint(layer, p);
    if (!paint) continue;
    for (const [name, value] of Object.entries(paint)) {
      try {
        map.setPaintProperty(layer.id, name as PaintName, value as PaintValue);
      } catch {
        // A property this layer doesn't take (another style's quirk): leave it.
      }
    }
  }
  // Space around the globe, and a thin atmosphere on its edge that fades as you zoom in.
  map.setSky({
    'sky-color': p.sky,
    'horizon-color': p.horizon,
    'fog-color': p.sky,
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.5,
    'fog-ground-blend': 0.5,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
  });
  // Already drawn (a skin change): recolour them.
  if (map.getLayer('holo-coast')) {
    for (const id of COAST_LAYERS) map.setPaintProperty(id, 'line-color', coast[id]);
    return;
  }
  const water = style.layers.find((l) => l.id === 'water' && l.type === 'fill') as
    | (LayerSpecification & { source: string; 'source-layer'?: string })
    | undefined;
  if (!water) return;
  // Under the first label, so names stay readable over the coast.
  const firstSymbol = style.layers.find((l) => l.type === 'symbol')?.id;
  const base = { type: 'line' as const, source: water.source, ...(water['source-layer'] ? { 'source-layer': water['source-layer'] } : {}) };
  map.addLayer({ ...base, id: 'holo-coast-glow', paint: { 'line-color': coast['holo-coast-glow'], 'line-width': 5, 'line-blur': 4 } }, firstSymbol);
  map.addLayer({ ...base, id: 'holo-coast', paint: { 'line-color': coast['holo-coast'], 'line-width': 0.8 } }, firstSymbol);
}
