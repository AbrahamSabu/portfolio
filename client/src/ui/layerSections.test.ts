import { describe, expect, it } from 'vitest';
import { SHORTCUTS } from './keyDialog';
import { layerSections, type LayerDeps } from './layerSections';
import { menuKeys, type SwitchRow } from './layersMenu';

function toggle(value = false) {
  const t = { value, set: (on: boolean) => void (t.value = on), subscribe: () => {} };
  return t;
}

function deps(): LayerDeps {
  const news = {
    shown: false,
    voice: false,
    set(change: { shown?: boolean; voice?: boolean }) {
      Object.assign(news, change);
    },
    subscribe: () => {},
  };
  return {
    style: { value: 'shapes', set() {}, subscribe: () => {} },
    trails: { mode: 'all', style: 'line', set() {}, setStyle() {}, subscribe: () => {} },
    news,
    briefing: toggle(),
    airports: toggle(true),
    hazards: toggle(true),
    findings: toggle(true),
    chokepoints: toggle(true),
    radar: toggle(),
    radarTime: () => '',
    regions: toggle(true),
    drawArea: () => {},
    manageAreas: () => {},
    sound: toggle(),
    search: () => {},
    tour: () => {},
    handover: () => {},
    timeline: () => {},
  };
}

describe('the Layers menu', () => {
  it('shows each key once, and only keys the map key lists', () => {
    const keys = menuKeys(layerSections(deps()));
    expect(new Set(keys).size).toBe(keys.length);
    const listed = new Set(SHORTCUTS.map(([k]) => k));
    expect(keys.filter((k) => !listed.has(k))).toEqual([]);
    expect(keys).toEqual(['S', 'T', 'N', 'B', 'A', 'H', 'D', 'C', 'R', '/', 'G', 'V', 'Z', 'W']);
  });

  it('turns news on when the briefing is asked for with news off', () => {
    const d = deps();
    const briefing = layerSections(d)
      .flatMap((s) => s.rows)
      .find((r) => r.label === 'Briefing') as SwitchRow;
    expect(briefing.get()).toBe(false);
    briefing.set(true);
    expect(d.news.shown).toBe(true);
    expect(briefing.get()).toBe(true);
  });
});
