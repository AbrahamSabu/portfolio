import { describe, expect, it } from 'vitest';
import { layerState, setLayer, type LayerSettings } from './screenControl';

/** The settings as the Layers menu has them, recording every change. */
function settings() {
  const toggle = (value: boolean) => ({ value, set(on: boolean) { this.value = on; }, subscribe: () => {} });
  const s = {
    news: { shown: true, voice: false, set(change: { shown?: boolean }) { if (change.shown !== undefined) this.shown = change.shown; }, subscribe: () => {} },
    trails: { mode: 'selected' as 'all' | 'selected' | 'off', style: 'line' as const, set(mode: 'all' | 'selected' | 'off') { this.mode = mode; }, setStyle() {}, subscribe: () => {} },
    style: { value: 'shapes' as 'shapes' | 'tactical', set(v: 'shapes' | 'tactical') { this.value = v; }, subscribe: () => {} },
    radar: toggle(false),
    airports: toggle(true),
    hazards: toggle(true),
    findings: toggle(false),
    chokepoints: toggle(true),
  };
  return s as typeof s & LayerSettings;
}

describe('screen layer switches', () => {
  it('reads what the screen shows', () => {
    expect(layerState(settings())).toEqual({
      news: true, trails: true, symbols: false, radar: false, airports: true, hazards: true, findings: false, chokepoints: true,
    });
  });

  it('switches each layer the way a console asked', () => {
    const s = settings();
    setLayer(s, 'radar', true);
    setLayer(s, 'news', false);
    setLayer(s, 'symbols', true);
    setLayer(s, 'chokepoints', false);
    expect(layerState(s)).toMatchObject({ radar: true, news: false, symbols: true, chokepoints: false });
    expect(s.style.value).toBe('tactical');
  });

  it("keeps trails on 'selected' when asked to turn trails on, and turns them back on as 'all'", () => {
    const s = settings();
    setLayer(s, 'trails', true); // already on (selected): left alone
    expect(s.trails.mode).toBe('selected');
    setLayer(s, 'trails', false);
    expect(s.trails.mode).toBe('off');
    setLayer(s, 'trails', true);
    expect(s.trails.mode).toBe('all');
  });
});
