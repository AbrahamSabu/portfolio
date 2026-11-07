import { describe, expect, it } from 'vitest';
import { SHORTCUTS } from '../ui/keyDialog';
import { layerSections, type LayerDeps } from '../ui/layerSections';
import { menuKeys, type RangeRow, type SwitchRow } from '../ui/layersMenu';
import { hearingOf, ScoreHearing } from './skyScore';
import { StoredLevel } from './storedLevel';

function toggle(value = false) {
  const t = { value, set: (on: boolean) => void (t.value = on), subscribe: () => {} };
  return t;
}

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

/** The menu's settings, with the score's. */
function deps(score: LayerDeps['score']): LayerDeps {
  const noop = () => {};
  const news = { shown: false, voice: false, set: noop, subscribe: noop };
  return {
    style: { value: 'shapes', set: noop, subscribe: noop },
    trails: { mode: 'all', style: 'line', set: noop, setStyle: noop, subscribe: noop },
    news,
    ...Object.fromEntries(
      ['briefing', 'airports', 'hazards', 'findings', 'chokepoints', 'radar', 'regions', 'sound', 'phosphor', 'exposure'].map((k) => [k, toggle()]),
    ),
    ...Object.fromEntries(['drawArea', 'manageAreas', 'search', 'tour', 'handover', 'rare', 'timeline'].map((k) => [k, noop])),
    radarTime: () => '',
    score,
  } as unknown as LayerDeps;
}

describe('the sky score in the Layers menu', () => {
  it('sits in the Sound section after the alert ping, keyed Y, with Y in the map key and nowhere else', () => {
    const sections = layerSections(deps({ on: toggle(), volume: new StoredLevel('v', 0.6, memory()), hearing: new ScoreHearing() }));
    const section = sections.find((s) => s.title === 'Sound')!;
    expect(section.rows.map((r) => r.label)).toEqual(['Alert ping', 'Ambient score', 'Score volume']);
    const keys = menuKeys(sections);
    expect(keys.filter((k) => k === 'Y')).toEqual(['Y']);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SHORTCUTS.filter(([k]) => k === 'Y')).toHaveLength(1);
  });

  it('switches the score and sets its volume through the same settings as the key', () => {
    const on = toggle();
    const storage = memory();
    const volume = new StoredLevel('watchfloor.scoreVolume', 0.6, storage);
    const hearing = new ScoreHearing();
    const [, onRow, volumeRow] = layerSections(deps({ on, volume, hearing })).find((s) => s.title === 'Sound')!.rows as [SwitchRow, SwitchRow, RangeRow];
    onRow.set(true);
    expect(on.value).toBe(true);
    hearing.set(hearingOf(312, 1));
    expect(onRow.detail!()).toBe('hearing 312 aircraft and 1 ship');
    expect(volumeRow.format(volumeRow.get())).toBe('60%');
    volumeRow.set(0.25);
    expect(volume.value).toBe(0.25);
    expect(storage.data.get('watchfloor.scoreVolume')).toBe('0.25');
  });

  it('leaves the Sound section to the alert ping without a score', () => {
    const sound = layerSections(deps(undefined)).find((s) => s.title === 'Sound')!;
    expect(sound.rows.map((r) => r.label)).toEqual(['Alert ping']);
  });
});

describe('what the score says it hears', () => {
  it('counts in words, and says why it is quiet', () => {
    expect(hearingOf(0, 0)).toBe('nothing live in view, so quiet');
    expect(hearingOf(1, 0)).toBe('hearing 1 aircraft');
    expect(hearingOf(0, 2)).toBe('hearing 2 ships');
    expect(hearingOf(4129, 12)).toBe('hearing 4,129 aircraft and 12 ships');
  });
});

describe('StoredLevel', () => {
  it('remembers a level between 0 and 1, and falls back on anything else', () => {
    expect(new StoredLevel('v', 0.6, memory({ v: '0.3' })).value).toBe(0.3);
    expect(new StoredLevel('v', 0.6, memory({ v: 'loud' })).value).toBe(0.6);
    expect(new StoredLevel('v', 0.6, memory({ v: '' })).value).toBe(0.6);
    expect(new StoredLevel('v', 0.6, memory({ v: '7' })).value).toBe(1);
    expect(new StoredLevel('v', 0.6, undefined).value).toBe(0.6);
    const level = new StoredLevel('v', 0.6, memory());
    let heard = 0;
    level.subscribe(() => heard++);
    level.set(-2);
    level.set(0);
    expect(level.value).toBe(0);
    expect(heard).toBe(1);
  });
});
