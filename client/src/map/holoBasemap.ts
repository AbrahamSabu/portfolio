import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';

/**
 * Recolours CARTO's dark basemap as a hologram: deep navy land, near-black
 * sea, coastlines and borders in faint glowing lines of the display's blue
 * (--hud in styles.css), roads barely there, place names in a muted cyan.
 * Dim on purpose: the tracks' identity colours must stay the brightest
 * things on the map. Done by overriding paint at load, so it needs no style
 * of our own and still works with another style URL (unknown layers keep
 * their colours).
 */

const HUD = '63, 182, 255';
const hud = (alpha: number) => `rgba(${HUD}, ${alpha})`;
const LAND = '#04111f';
const SEA = '#01060d';

/** The paint to set on one basemap layer, by its type and id; null leaves it alone. */
export function holoPaint(layer: Pick<LayerSpecification, 'id' | 'type'>): Record<string, unknown> | null {
  const id = layer.id;
  switch (layer.type) {
    case 'background':
      return { 'background-color': LAND };
    case 'fill':
      if (id.startsWith('water')) return { 'fill-color': SEA, 'fill-opacity': 1 };
      if (id.startsWith('building')) return { 'fill-color': hud(0.06), 'fill-outline-color': hud(0.12) };
      // Landcover, parks, land use: a shade off the land, so areas barely show.
      return { 'fill-color': '#051729', 'fill-opacity': 0.6 };
    case 'line':
      if (id === 'boundary_country_outline') return { 'line-color': hud(0.08) };
      if (id.startsWith('boundary_country')) return { 'line-color': hud(0.5) };
      if (id.startsWith('boundary')) return { 'line-color': hud(0.16) };
      if (id.startsWith('waterway')) return { 'line-color': hud(0.16) };
      // Road and rail casings go; their fills become faint traces.
      if (id.endsWith('_case') || id.includes('_case_')) return { 'line-color': 'rgba(0, 0, 0, 0)' };
      if (/^(road|tunnel|bridge|rail|aeroway)/.test(id)) return { 'line-color': hud(0.13) };
      return null;
    case 'symbol':
      if (id.startsWith('water')) return { 'text-color': hud(0.45), 'text-halo-color': SEA };
      if (id.startsWith('place_country') || id.startsWith('place_continent')) return { 'text-color': 'rgba(150, 205, 240, 0.75)', 'text-halo-color': LAND };
      return { 'text-color': 'rgba(120, 175, 210, 0.75)', 'text-halo-color': LAND };
    default:
      return null;
  }
}

/** Glowing coastlines: two lines along the water's edge, a soft wide one and a fine one on top. */
const COAST_LAYERS = ['holo-coast-glow', 'holo-coast'] as const;

export function applyHoloBasemap(map: MapLibreMap): void {
  const style = map.getStyle();
  for (const layer of style.layers) {
    if ((COAST_LAYERS as readonly string[]).includes(layer.id)) continue;
    // Only the basemap's own layers: ours draw from GeoJSON sources and keep their colours.
    const source = 'source' in layer ? style.sources[layer.source] : undefined;
    if (source?.type === 'geojson') continue;
    const paint = holoPaint(layer);
    if (!paint) continue;
    for (const [name, value] of Object.entries(paint)) {
      try {
        map.setPaintProperty(layer.id, name as Parameters<MapLibreMap['setPaintProperty']>[1], value as Parameters<MapLibreMap['setPaintProperty']>[2]);
      } catch {
        // A property this layer doesn't take (another style's quirk): leave it.
      }
    }
  }
  // Space around the globe, and a thin blue atmosphere on its edge that fades as you zoom in.
  map.setSky({
    'sky-color': '#01050b',
    'horizon-color': '#0a3456',
    'fog-color': '#01050b',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.5,
    'fog-ground-blend': 0.5,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
  });
  const water = style.layers.find((l) => l.id === 'water' && l.type === 'fill') as
    | (LayerSpecification & { source: string; 'source-layer'?: string })
    | undefined;
  if (!water || map.getLayer('holo-coast')) return;
  // Under the first label, so names stay readable over the coast.
  const firstSymbol = style.layers.find((l) => l.type === 'symbol')?.id;
  const base = { type: 'line' as const, source: water.source, ...(water['source-layer'] ? { 'source-layer': water['source-layer'] } : {}) };
  map.addLayer({ ...base, id: 'holo-coast-glow', paint: { 'line-color': hud(0.14), 'line-width': 5, 'line-blur': 4 } }, firstSymbol);
  map.addLayer({ ...base, id: 'holo-coast', paint: { 'line-color': hud(0.6), 'line-width': 0.8 } }, firstSymbol);
}
