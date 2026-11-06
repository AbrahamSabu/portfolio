import { HAZARD_KINDS, NEWS_KINDS, type Affiliation, type Platform } from '@watchfloor/shared';
import { airportIconSvg } from '../map/airports';
import { HAZARD_KIND_LABEL, hazardIconSvg } from '../map/hazardIcons';
import { NEWS_KIND_LABEL, newsIconSvg } from '../map/newsIcons';
import { trackIconSvg } from '../map/trackIcon';
import type { SymbolStyle, SymbolStyleSetting } from '../state/symbolStyle';
import { AFFILIATION_LABEL, PLATFORM_LABEL } from './format';

const IDENTITIES: Affiliation[] = ['friend', 'neutral', 'hostile', 'unknown'];
const EXAMPLES: Platform[] = [
  'airliner', 'business-jet', 'light-aircraft', 'helicopter', 'military-aircraft', 'uav',
  'cargo', 'tanker', 'passenger', 'fishing', 'leisure', 'warship',
];
export const SHORTCUTS: Array<[keys: string, action: string]> = [
  ['M', 'Layers: everything the map can show, in one menu'],
  ['L', 'Open or close the track list'],
  ['/', 'Search tracks, airports, chokepoints and areas'],
  ['G', 'Cinematic tour of what is happening'],
  ['V', 'Watch handover: the last 24 hours, read back'],
  ['Z', 'Timeline: replay six hours back, project thirty minutes ahead'],
  ['U', 'Rare aircraft: in the air now, and the last 24 hours'],
  ['F', 'Open or close the filter'],
  ['T', 'Trails: all tracks, selected only, off'],
  ['I', 'Traffic currents: the average flow of air and sea traffic'],
  ['S', 'Vehicle shapes or military symbols'],
  ['N', 'Show or hide the news'],
  ['B', 'Open or close the briefing'],
  ['A', 'Show or hide airports'],
  ['H', 'Show or hide earthquakes and disasters'],
  ['D', 'Show or hide findings (rare aircraft, circling, converging, gone silent)'],
  ['C', 'Show or hide shipping chokepoints'],
  ['W', 'Draw a watch area'],
  ['X', 'Hook a second track: range, bearing, closest approach'],
  ['R', 'Show or hide weather radar'],
  ['?', 'This key'],
  ['Esc', 'Close a panel, or clear the selection'],
];

/**
 * The map key: what colours, symbols and lines mean, and the keyboard
 * shortcuts. Icons are drawn by the same code as the map's, in whichever
 * style is on, so the key can't drift from what's on screen. A modal dialog:
 * it's read, then closed.
 */
export class KeyDialog {
  constructor(
    private readonly dialog: HTMLDialogElement,
    toggle: HTMLButtonElement,
    style: SymbolStyleSetting,
  ) {
    const body = dialog.querySelector<HTMLElement>('[data-body]');
    const fill = () => body && (body.innerHTML = content(style.value));
    fill();
    style.subscribe(fill);
    toggle.addEventListener('click', () => this.toggle());
    dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    // A click on the backdrop (the dialog element itself, outside its content) closes it.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  get open(): boolean {
    return this.dialog.open;
  }

  toggle(): void {
    if (this.dialog.open) this.dialog.close();
    else this.dialog.showModal();
  }
}

const STYLE_NOTE: Record<SymbolStyle, string> = {
  shapes:
    'Each vehicle is drawn from above, pointing where it is heading, and roughly to size: a wide-body is bigger than a Cessna. For MIL-STD-2525C military symbols, press <kbd>S</kbd> or use the Layers menu (<kbd>M</kbd>).',
  tactical:
    "MIL-STD-2525C. The frame's shape says air or sea; the icon inside says what kind. For vehicle shapes, press <kbd>S</kbd> or use the Layers menu (<kbd>M</kbd>).",
};

function content(style: SymbolStyle): string {
  const icon = (affiliation: Affiliation, platform: Platform) =>
    `<span class="key-symbol" aria-hidden="true">${trackIconSvg({ affiliation, platform }, style, style === 'shapes' ? 28 : 24)}</span>`;
  const identity = IDENTITIES.map(
    (a) => `<li>${icon(a, 'airliner')}<span>${AFFILIATION_LABEL[a]}</span></li>`,
  ).join('');
  const examples = EXAMPLES.map(
    (p) => `<li>${icon('unknown', p)}<span>${PLATFORM_LABEL[p]}</span></li>`,
  ).join('');
  const shortcuts = SHORTCUTS.map(([k, a]) => `<dt><kbd>${k}</kbd></dt><dd>${a}</dd>`).join('');
  return `
    <section>
      <h3>Identity</h3>
      <p>Colour only ever means identity. Live traffic shows as <em>unknown</em>: broadcasting a position doesn't make anyone a friend.</p>
      <ul class="key-grid">${identity}</ul>
    </section>
    <section>
      <h3>Symbols</h3>
      <p>${STYLE_NOTE[style]}</p>
      <ul class="key-grid">${examples}</ul>
    </section>
    <section>
      <h3>On the map</h3>
      <ul class="key-list">
        <li><span class="key-glyph key-dot" aria-hidden="true"></span>Aircraft, zoomed out</li>
        <li><span class="key-glyph key-ring" aria-hidden="true"></span>Ship, zoomed out</li>
        <li><span class="key-glyph key-leader" aria-hidden="true"></span>Speed leader: where it will be in 1 minute (aircraft) or 10 (ships)</li>
        <li><span class="key-glyph key-trail" aria-hidden="true"></span>Trail: where it was reported in the last 5 minutes (aircraft) or 30 (ships)</li>
        <li><span class="key-glyph key-flow" aria-hidden="true"></span><span>Currents (<kbd>I</kbd>): particles drift with the average direction and speed of the moving traffic around them, split by heading so a lane used both ways shows both currents, aircraft and ships as separate fields. It is the traffic on the map, not wind, sped up to be seen (ships about 13 times more than aircraft)</span></li>
        <li><span class="key-glyph key-stale" aria-hidden="true"></span>Faded: no recent report, so its position is an estimate</li>
        <li><span class="key-glyph key-emergency" aria-hidden="true"></span>Amber ring: the aircraft is squawking an emergency code (7500, 7600 or 7700), as its transponder broadcasts it. Click the ring, or the amber chip in the top bar, to find it again after hiding its alert</li>
        <li><span class="key-glyph key-news" aria-hidden="true">${airportIconSvg(16)}</span>Airport: the largest from the globe, more as you zoom in (<a href="https://ourairports.com/" target="_blank" rel="noopener">OurAirports</a>, public domain). Click one for its weather and the aircraft arriving and leaving</li>
      </ul>
    </section>
    <section>
      <h3>News</h3>
      <p>Political news from the world's press, read by the <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener">GDELT Project</a> every 15 minutes, so a story shows up 15 to 30 minutes after it's published. Headlines are the outlets' own words. A computer judges what counts as political, so the odd story that isn't gets through. The briefing lists the last six hours' top stories: the most widely covered and most political first, with a story told more than once listed once ("+2 related").</p>
      <ul class="key-list">${NEWS_KINDS.map((k) => `<li><span class="key-glyph key-news" aria-hidden="true">${newsIconSvg(k, 16)}</span>${NEWS_KIND_LABEL[k]}</li>`).join('')}</ul>
    </section>
    <section>
      <h3>Weather radar</h3>
      <p>Rain and snow from <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a> (free for personal use), the latest 10-minute picture, in grey so it never reads as an identity colour: the brighter, the heavier. Its detail stops at zoom 7, so closer in it is stretched. Coverage is where weather radars are: mostly North America, Europe, East Asia and Australia. Press <kbd>R</kbd> or use the Layers menu (<kbd>M</kbd>).</p>
    </section>
    <section>
      <h3>Watch areas</h3>
      <p>Press <kbd>W</kbd> (or the Layers menu, or the dashed-shape button on the left) and click out an area; name it and choose aircraft, ships or both, military only if you like. An alert says when one crosses in or out (two reports outside count as leaving, so one jumpy position doesn't), and each area counts the tracks that leave the picture inside it (landed, out of receiver range or switched off). Anything already inside when you open the page is counted, not alerted. Areas are kept in this browser, and alerts happen only while the page is open.</p>
    </section>
    <section>
      <h3>Countries</h3>
      <p>Click a country's name on the map for its briefing: the day's news placed there, its aircraft and ships on the map (by registration and flag, wherever they are), and earthquakes or disasters that name it.</p>
    </section>
    <section>
      <h3>Shipping chokepoints</h3>
      <p>Tags at eight narrows (Hormuz, Bab-el-Mandeb, Suez, Singapore, the Bosphorus, Gibraltar, Dover, Panama) count the ships in each now and how many are under way; closer in, a dashed box shows the area counted. Ship positions come from AIS receivers, which are mostly in Europe: a low count far away can mean few receivers rather than few ships.</p>
    </section>
    <section>
      <h3>Earthquakes and disasters</h3>
      <p>Earthquakes of magnitude 2.5 and up from the past day, from the <a href="https://earthquake.usgs.gov/" target="_blank" rel="noopener">USGS</a>, drawn larger the stronger they are. Other disasters from <a href="https://www.gdacs.org/" target="_blank" rel="noopener">GDACS</a> (the Global Disaster Alert and Coordination System), drawn larger at orange and red alert. GDACS's alerts are automatic estimates; local authorities' warnings come first.</p>
      <ul class="key-list">${HAZARD_KINDS.map((k) => `<li><span class="key-glyph key-hazard" aria-hidden="true">${hazardIconSvg(k, 16)}</span>${HAZARD_KIND_LABEL[k]}</li>`).join('')}</ul>
    </section>
    <section>
      <h3>Keys</h3>
      <dl class="key-shortcuts">${shortcuts}</dl>
    </section>`;
}
