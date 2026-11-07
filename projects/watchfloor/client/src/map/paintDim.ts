import type { Map as MapLibreMap } from 'maplibre-gl';

const isZoom = (input: unknown) => Array.isArray(input) && input.length === 1 && input[0] === 'zoom';

/**
 * An opacity paint value scaled by `k`. A zoom curve has to stay the outermost
 * expression (MapLibre rejects `['*', k, ['interpolate', …, ['zoom'], …]]`), so
 * its outputs are scaled instead.
 */
export function scaledOpacity(value: unknown, k: number): unknown {
  if (value === undefined || value === null) return k;
  if (typeof value === 'number') return value * k;
  if (Array.isArray(value)) {
    const op = value[0];
    // ['interpolate', type, input, z0, v0, …] and ['step', input, v0, z1, v1, …]
    const firstOutput = op === 'interpolate' ? 4 : op === 'step' ? 2 : -1;
    if (firstOutput > 0 && isZoom(value[firstOutput - (op === 'interpolate' ? 2 : 1)])) {
      const out = [...value];
      for (let i = firstOutput; i < out.length; i += 2) out[i] = scaledOpacity(out[i], k);
      return out;
    }
  }
  return ['*', k, value];
}

const OPACITY: Record<string, readonly string[]> = {
  symbol: ['icon-opacity', 'text-opacity'],
  circle: ['circle-opacity', 'circle-stroke-opacity'],
  line: ['line-opacity'],
};

type Paint = Parameters<MapLibreMap['setPaintProperty']>;

/**
 * Fade some layers to `k` of their opacity, and put them back exactly as
 * they were. Paint, not visibility: the timeline hides and shows the live
 * picture with visibility, and the two mustn't undo each other.
 */
export function dimLayers(map: MapLibreMap, layerIds: readonly string[], k: number): () => void {
  const saved: Array<[id: string, property: string, value: unknown]> = [];
  for (const id of layerIds) {
    const layer = map.getLayer(id);
    if (!layer) continue;
    for (const property of OPACITY[layer.type] ?? []) {
      const value = map.getPaintProperty(id, property as Parameters<MapLibreMap['getPaintProperty']>[1]);
      saved.push([id, property, value]);
      map.setPaintProperty(id, property as Paint[1], scaledOpacity(value, k) as Paint[2]);
    }
  }
  return () => {
    for (const [id, property, value] of saved) {
      if (map.getLayer(id)) map.setPaintProperty(id, property as Paint[1], value as Paint[2]);
    }
  };
}
