import type { Map as MapLibreMap } from 'maplibre-gl';

const SEEN_KEY = 'watchfloor.firstHint';
/** After the opening sequence (2.6 s, main.ts), so the hint isn't lost under it. */
const SHOW_AFTER_MS = 3_200;
const SHOW_FOR_MS = 14_000;

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return true; // can't remember it, so don't risk showing it on every visit
  }
}

/**
 * A one-time hint for a first visit: everything on the map can be clicked,
 * and the map key lists every key. The map is busy and nothing on it looks
 * like a button, so a newcomer may not try. Shown once per browser, until
 * the first click, key or drag, or for 14 s.
 */
export function showFirstHint(map: MapLibreMap): void {
  if (seen()) return;
  window.setTimeout(() => {
    try {
      localStorage.setItem(SEEN_KEY, 'shown');
    } catch {
      // shown this once anyway
    }
    const hint = document.createElement('p');
    hint.className = 'first-hint';
    hint.setAttribute('role', 'status');
    hint.textContent = matchMedia('(hover: hover)').matches
      ? 'Click any aircraft or ship for its details. Press ? for the map key and every shortcut.'
      : 'Tap any aircraft or ship for its details.';
    (document.querySelector('.app') ?? document.body).append(hint);
    const close = () => {
      window.clearTimeout(timer);
      map.off('click', close);
      map.off('dragstart', close);
      document.removeEventListener('keydown', close);
      hint.classList.add('first-hint-out');
      window.setTimeout(() => hint.remove(), 400);
    };
    const timer = window.setTimeout(close, SHOW_FOR_MS);
    map.once('click', close);
    map.once('dragstart', close);
    document.addEventListener('keydown', close, { once: true });
  }, SHOW_AFTER_MS);
}
