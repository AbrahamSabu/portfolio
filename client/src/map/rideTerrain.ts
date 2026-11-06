import type { Map as MapLibreMap, RasterDEMSourceSpecification } from 'maplibre-gl';
import type { SkyLook } from './sunSky';

/**
 * Real ground under Ride Along: Mapzen's open terrain tiles, hosted free in
 * the AWS Registry of Open Data ("Terrain Tiles": no key, open to browsers
 * from any site, hosting paid by AWS's open-data programme). The licence asks
 * for credit to the source datasets, which the map credits carry while the
 * tiles are on screen. Mapterhorn is sharper but publishes no terms for its
 * public tile server, so this is the safer choice for a public page.
 */
const TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export const TERRAIN_CREDIT =
  '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Terrain: Mapzen terrain tiles</a> ' +
  '(SRTM, GMTED2010, ETOPO1, USGS 3DEP and others; EU-DEM produced using Copernicus data and information funded by the European Union)';

const DEM: RasterDEMSourceSpecification = {
  type: 'raster-dem',
  tiles: [TILES],
  tileSize: 256,
  encoding: 'terrarium',
  maxzoom: 15,
  attribution: TERRAIN_CREDIT,
};

const TERRAIN_SOURCE = 'ride-terrain';
/** MapLibre draws better with separate sources for the 3D ground and its shading. */
const SHADE_SOURCE = 'ride-terrain-shade';
const SHADE_LAYER = 'ride-hillshade';

type Paint = Parameters<MapLibreMap['setPaintProperty']>;

function shadePaint(look: SkyLook): Record<string, unknown> {
  return {
    'hillshade-illumination-anchor': 'map',
    'hillshade-illumination-direction': look.shade.direction,
    'hillshade-illumination-altitude': look.shade.altitude,
    'hillshade-exaggeration': look.shade.exaggeration,
    'hillshade-highlight-color': look.shade.highlight,
    'hillshade-shadow-color': look.shade.shadow,
    'hillshade-accent-color': 'rgba(0, 0, 0, 0)',
  };
}

/** Raise the ground and shade it from the sun, under the basemap's labels. */
export function addTerrain(map: MapLibreMap, look: SkyLook): void {
  if (!map.getSource(TERRAIN_SOURCE)) map.addSource(TERRAIN_SOURCE, DEM);
  if (!map.getSource(SHADE_SOURCE)) map.addSource(SHADE_SOURCE, DEM);
  if (!map.getLayer(SHADE_LAYER)) {
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addLayer({ id: SHADE_LAYER, type: 'hillshade', source: SHADE_SOURCE, paint: shadePaint(look) } as Parameters<MapLibreMap['addLayer']>[0], firstSymbol);
  }
  map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 1 });
}

/** Move the shading's light with the sun. */
export function shadeTerrain(map: MapLibreMap, look: SkyLook): void {
  if (!map.getLayer(SHADE_LAYER)) return;
  for (const [property, value] of Object.entries(shadePaint(look))) map.setPaintProperty(SHADE_LAYER, property as Paint[1], value as Paint[2]);
}

export function removeTerrain(map: MapLibreMap): void {
  map.setTerrain(null);
  if (map.getLayer(SHADE_LAYER)) map.removeLayer(SHADE_LAYER);
  for (const id of [TERRAIN_SOURCE, SHADE_SOURCE]) if (map.getSource(id)) map.removeSource(id);
}
