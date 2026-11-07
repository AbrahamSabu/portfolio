import type { LayerName, LayerState } from '@watchfloor/shared';
import type { LayerDeps } from '../ui/layerSections';

/** The settings a console can switch: the same objects the keys and the Layers menu change. */
export type LayerSettings = Pick<
  LayerDeps,
  'news' | 'trails' | 'style' | 'radar' | 'airports' | 'hazards' | 'findings' | 'chokepoints' | 'satellites' | 'currents' | 'stack' | 'score'
>;

/**
 * Calls `listener` whenever one of these settings changes. Named one by one:
 * the object handed in is usually the whole Layers menu's deps, whose other
 * members are plain functions.
 */
export function onLayerChange(s: LayerSettings, listener: () => void): void {
  for (const setting of [s.news, s.trails, s.style, s.radar, s.airports, s.hazards, s.findings, s.chokepoints, s.satellites, s.currents, s.stack]) {
    setting.subscribe(listener);
  }
  // The score is optional in the Layers menu's deps (the menu works without it).
  s.score?.on.subscribe(listener);
}

/** What the screen shows now, as the consoles' switches read it. */
export function layerState(s: LayerSettings): Required<LayerState> {
  return {
    news: s.news.shown,
    trails: s.trails.mode !== 'off',
    symbols: s.style.value === 'tactical',
    radar: s.radar.value,
    airports: s.airports.value,
    hazards: s.hazards.value,
    findings: s.findings.value,
    chokepoints: s.chokepoints.value,
    satellites: s.satellites.value,
    currents: s.currents.value,
    stack: s.stack.value,
    score: s.score?.on.value ?? false,
  };
}

/**
 * Switches one layer the way a console asked. Trails come back on as "all"
 * (the setting also has "selected"), and `symbols` on means military
 * symbols rather than vehicle shapes.
 */
export function setLayer(s: LayerSettings, layer: LayerName, on: boolean): void {
  switch (layer) {
    case 'news':
      s.news.set({ shown: on });
      return;
    case 'trails':
      if (on !== (s.trails.mode !== 'off')) s.trails.set(on ? 'all' : 'off');
      return;
    case 'symbols':
      s.style.set(on ? 'tactical' : 'shapes');
      return;
    case 'score':
      // Plays at once if someone has touched this screen; otherwise at the next tap or key press there.
      s.score?.on.set(on);
      return;
    default:
      s[layer].set(on);
  }
}

/** Words for the line a screen shows when a console changes something on it. */
export const LAYER_LABEL: Record<LayerName, string> = {
  news: 'news',
  trails: 'trails',
  symbols: 'military symbols',
  radar: 'weather radar',
  airports: 'airports',
  hazards: 'earthquakes and disasters',
  findings: 'findings',
  chokepoints: 'chokepoints',
  satellites: 'satellites',
  currents: 'traffic currents',
  stack: 'the Stack',
  score: 'the sound of the sky',
};
