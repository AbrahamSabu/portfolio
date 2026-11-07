import { describe, expect, it } from 'vitest';
import { layerState, onLayerChange, setLayer, type LayerSettings } from './screenControl';

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
    satellites: toggle(false),
    currents: toggle(false),
    stack: toggle(false),
    score: {
      on: toggle(false),
      volume: { value: 0.6, set() {}, subscribe: () => {} },
      hearing: { describe: () => '', subscribe: () => {} },
    },
  };
  return s as typeof s & LayerSettings;
}

describe('screen layer switches', () => {
  it('listens to the twelve settings only, not the rest of the Layers menu', () => {
    let subscribed = 0;
    const s = settings();
    const count = () => void subscribed++;
    for (const [name, setting] of Object.entries(s)) {
      if (name === 'score') s.score.on.subscribe = count;
      else (setting as { subscribe: unknown }).subscribe = count;
    }
    // The real object also carries plain functions, which have no subscribe.
    onLayerChange({ ...s, search: () => {}, tour: () => {} } as LayerSettings, () => {});
    expect(subscribed).toBe(12);
  });

  it('reads what the screen shows', () => {
    expect(layerState(settings())).toEqual({
      news: true, trails: true, symbols: false, radar: false, airports: true, hazards: true, findings: false, chokepoints: true,
      satellites: false, currents: false, stack: false, score: false,
    });
  });

  it('switches the satellites, the currents, the Stack and the sound of the sky', () => {
    const s = settings();
    for (const layer of ['satellites', 'currents', 'stack', 'score'] as const) setLayer(s, layer, true);
    expect(layerState(s)).toMatchObject({ satellites: true, currents: true, stack: true, score: true });
    expect(s.score.on.value).toBe(true);
  });

  it('reads the sound as off on a screen without it, and leaves it alone', () => {
    const s = { ...settings(), score: undefined } as unknown as LayerSettings;
    setLayer(s, 'score', true);
    expect(layerState(s).score).toBe(false);
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
