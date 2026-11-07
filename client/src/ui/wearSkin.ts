import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Graticule } from '../map/graticule';
import { applyHoloBasemap } from '../map/holoBasemap';
import { SKIN_LOOKS, type Skin } from '../state/skins';

/** Skins whose fonts have been asked for: each family is fetched once, and only if worn. */
const fontsAsked = new Set<Skin>();

/**
 * Puts a skin on: the `data-skin` attribute skins.css keys on, the skin's
 * fonts (from Google Fonts, like the page's own, the first time it's worn,
 * so nobody downloads fonts for skins they never try), the basemap and sky,
 * and the graticule. Tracks keep their colours.
 */
export function wearSkin(skin: Skin, map: MapLibreMap, graticule: Graticule): void {
  const look = SKIN_LOOKS[skin];
  document.documentElement.dataset.skin = skin;
  if (look.fonts && !fontsAsked.has(skin)) {
    fontsAsked.add(skin);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${look.fonts}&display=swap`;
    document.head.append(link);
  }
  graticule.setColour(look.graticule);
  try {
    applyHoloBasemap(map, look.basemap);
  } catch {
    // The style hasn't arrived yet: createMap paints it in this skin when it does.
  }
}
