import { describe, expect, it } from 'vitest';
import { holoPaint } from '../map/holoBasemap';
import { isSkin, SKIN_LOOKS, SKINS, SkinSetting, startingSkin } from './skins';

describe('skins', () => {
  it('gives every skin a complete look', () => {
    for (const skin of SKINS) {
      const look = SKIN_LOOKS[skin];
      expect(look.label.length).toBeGreaterThan(0);
      expect(look.hint.length).toBeGreaterThan(0);
      expect(look.swatch).toHaveLength(3);
      expect(look.basemap.line).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/);
      for (const alpha of [look.basemap.coast, look.basemap.coastGlow, look.basemap.border]) {
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps the labels distinct (the menu and the K key name them)', () => {
    expect(new Set(SKINS.map((s) => SKIN_LOOKS[s].label)).size).toBe(SKINS.length);
  });

  it('starts in the skin the address asks for, else the remembered one, else Holo', () => {
    expect(startingSkin('?skin=phosphor', 'minimal')).toBe('phosphor');
    expect(startingSkin('?screensaver&skin=bubbly', null)).toBe('bubbly');
    expect(startingSkin('', 'minimal')).toBe('minimal');
    expect(startingSkin('?skin=nonsense', 'blueprint')).toBe('blueprint');
    expect(startingSkin('', 'nonsense')).toBe('holo');
    expect(startingSkin('', null)).toBe('holo');
    expect(isSkin('holo')).toBe(true);
    expect(isSkin('HOLO')).toBe(false);
  });

  it('cycles through every skin and back to the first', () => {
    const skin = new SkinSetting('holo');
    let heard = 0;
    skin.subscribe(() => heard++);
    const seen = [];
    for (let i = 0; i < SKINS.length; i++) {
      skin.cycle();
      seen.push(skin.value);
    }
    expect(seen).toEqual([...SKINS.slice(1), 'holo']);
    expect(heard).toBe(SKINS.length);
    skin.set('holo');
    expect(heard).toBe(SKINS.length);
  });

  it('paints the basemap in the skin given, and as the hologram by default', () => {
    const synth = SKIN_LOOKS.synthwave.basemap;
    expect(holoPaint({ id: 'water', type: 'fill' }, synth)).toMatchObject({ 'fill-color': synth.sea });
    expect(holoPaint({ id: 'boundary_country_inner', type: 'line' }, synth)).toEqual({ 'line-color': `rgba(${synth.line}, ${synth.border})` });
    expect(holoPaint({ id: 'water', type: 'fill' })).toEqual(holoPaint({ id: 'water', type: 'fill' }, SKIN_LOOKS.holo.basemap));
  });
});
