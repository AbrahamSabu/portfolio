import { NEWS_KINDS, type Affiliation, type Platform } from '@watchfloor/shared';
import { NEWS_KIND_LABEL, newsIconSvg } from '../map/newsIcons';
import { trackIconSvg } from '../map/trackIcon';
import type { SymbolStyle, SymbolStyleSetting } from '../state/symbolStyle';
import { AFFILIATION_LABEL, PLATFORM_LABEL } from './format';

const IDENTITIES: Affiliation[] = ['friend', 'neutral', 'hostile', 'unknown'];
const EXAMPLES: Platform[] = [
  'airliner', 'business-jet', 'light-aircraft', 'helicopter', 'military-aircraft', 'uav',
  'cargo', 'tanker', 'passenger', 'fishing', 'leisure', 'warship',
];
const SHORTCUTS: Array<[keys: string, action: string]> = [
  ['L', 'Open or close the track list'],
  ['/', 'Search the track list'],
  ['F', 'Open or close the filter'],
  ['T', 'Trails: all tracks, selected only, off'],
  ['S', 'Vehicle shapes or military symbols'],
  ['N', 'Show or hide the news'],
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
    'Each vehicle is drawn from above, pointing where it is heading, and roughly to size: a wide-body is bigger than a Cessna. For MIL-STD-2525C military symbols, press <kbd>S</kbd> or the button under the trails toggle.',
  tactical:
    "MIL-STD-2525C. The frame's shape says air or sea; the icon inside says what kind. For vehicle shapes, press <kbd>S</kbd> or the button under the trails toggle.",
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
        <li><span class="key-glyph key-stale" aria-hidden="true"></span>Faded: no recent report, so its position is an estimate</li>
      </ul>
    </section>
    <section>
      <h3>News</h3>
      <p>Political news from the world's press, read by the <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener">GDELT Project</a> every 15 minutes, so a story shows up 15 to 30 minutes after it's published. Headlines are the outlets' own words. A computer judges what counts as political, so the odd story that isn't gets through.</p>
      <ul class="key-list">${NEWS_KINDS.map((k) => `<li><span class="key-glyph key-news" aria-hidden="true">${newsIconSvg(k, 16)}</span>${NEWS_KIND_LABEL[k]}</li>`).join('')}</ul>
    </section>
    <section>
      <h3>Keys</h3>
      <dl class="key-shortcuts">${shortcuts}</dl>
    </section>`;
}
