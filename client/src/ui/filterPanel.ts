import type { Domain, Platform } from '@watchfloor/shared';
import type { ServerClock } from '../state/clock';
import { PLATFORMS_BY_DOMAIN, SOURCE_KEYS, sourceKeyOf, type PictureFilter, type SourceKey } from '../state/pictureFilter';
import type { TrackStore } from '../state/trackStore';
import { PLATFORM_LABEL, PROVIDER_LABEL } from './format';

const GROUP_LABEL: Record<Domain, string> = { air: 'Aircraft', sea: 'Ships' };
const SOURCE_LABEL: Record<SourceKey, string> = { ...PROVIDER_LABEL, sim: 'Simulator' };
const REFRESH_MS = 1000;
const number = new Intl.NumberFormat('en');

/**
 * The picture filter's panel: every vehicle type, grouped into aircraft and
 * ships, each source, and stale tracks, with a count beside each so the
 * operator can see what a box hides before unticking it. Counts are of the
 * whole picture, not what the filter leaves, and refresh once a second while
 * the panel is open. The rows are built once; refreshes only change text and
 * checkbox state, so focus and the scroll position survive.
 */
export class FilterPanel {
  private readonly body: HTMLElement;
  private timer: number | undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly filter: PictureFilter,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly onOpenChange: (open: boolean) => void,
  ) {
    const body = root.querySelector<HTMLElement>('[data-body]');
    if (!body) throw new Error('Filter panel is missing [data-body]');
    this.body = body;
    this.build();
    root.querySelector('[data-close]')?.addEventListener('click', () => this.setOpen(false));
    root.querySelector('[data-reset]')?.addEventListener('click', () => filter.reset());
    body.addEventListener('change', (event) => this.onChange(event.target));
    filter.subscribe(() => this.refresh());
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.root.hidden = !open;
    window.clearInterval(this.timer);
    if (open) {
      this.refresh();
      this.timer = window.setInterval(() => this.refresh(), REFRESH_MS);
    }
    this.onOpenChange(open);
  }

  private build(): void {
    const groups = (['air', 'sea'] as const).map((domain) => {
      const rows = PLATFORMS_BY_DOMAIN[domain]
        .map((p) => checkbox(`data-platform="${p}"`, PLATFORM_LABEL[p], `data-count-platform="${p}"`))
        .join('');
      return `<fieldset class="filter-group">
        <legend>${checkbox(`data-group="${domain}"`, GROUP_LABEL[domain], `data-count-group="${domain}"`, 'filter-group-title')}</legend>
        ${rows}
      </fieldset>`;
    });
    const sources = SOURCE_KEYS.map((s) => checkbox(`data-source="${s}"`, SOURCE_LABEL[s], `data-count-source="${s}"`)).join('');
    this.body.innerHTML = `${groups.join('')}
      <fieldset class="filter-group"><legend><span class="filter-group-title">Sources</span></legend>${sources}</fieldset>
      <fieldset class="filter-group"><legend><span class="filter-group-title">Reports</span></legend>
        ${checkbox('data-stale', 'Stale tracks', 'data-count-stale')}
      </fieldset>`;
  }

  private onChange(target: EventTarget | null): void {
    if (!(target instanceof HTMLInputElement)) return;
    const { platform, group, source } = target.dataset;
    if (platform) this.filter.setPlatforms([platform as Platform], target.checked);
    else if (group) this.filter.setPlatforms(PLATFORMS_BY_DOMAIN[group as Domain], target.checked);
    else if (source) this.filter.setSource(source as SourceKey, target.checked);
    else if (target.hasAttribute('data-stale')) this.filter.setShowStale(target.checked);
  }

  /** Counts and checkbox states, from the whole picture and the current filter. */
  private refresh(): void {
    if (!this.open) return;
    const now = this.clock.now();
    const byPlatform = new Map<Platform, number>();
    const bySource = new Map<SourceKey, number>();
    let stale = 0;
    for (const track of this.store.all()) {
      byPlatform.set(track.platform, (byPlatform.get(track.platform) ?? 0) + 1);
      const source = sourceKeyOf(track);
      bySource.set(source, (bySource.get(source) ?? 0) + 1);
      if (this.store.status(track, now) === 'stale') stale++;
    }
    const { hiddenPlatforms, hiddenSources, showStale } = this.filter.state;
    const hidden = new Set<string>(hiddenPlatforms);

    for (const domain of ['air', 'sea'] as const) {
      const platforms = PLATFORMS_BY_DOMAIN[domain];
      let total = 0;
      let shown = 0;
      for (const p of platforms) {
        const n = byPlatform.get(p) ?? 0;
        total += n;
        this.setCount(`[data-count-platform="${p}"]`, n);
        this.setChecked(`[data-platform="${p}"]`, !hidden.has(p));
        if (!hidden.has(p)) shown++;
      }
      this.setCount(`[data-count-group="${domain}"]`, total);
      const groupBox = this.body.querySelector<HTMLInputElement>(`[data-group="${domain}"]`);
      if (groupBox) {
        groupBox.checked = shown === platforms.length;
        groupBox.indeterminate = shown > 0 && shown < platforms.length;
      }
    }
    for (const s of SOURCE_KEYS) {
      const n = bySource.get(s) ?? 0;
      const isHidden = hiddenSources.includes(s);
      this.setCount(`[data-count-source="${s}"]`, n);
      this.setChecked(`[data-source="${s}"]`, !isHidden);
      // A source with nothing on the map isn't worth a row, unless it's hidden (so it can be shown again).
      const label = this.body.querySelector<HTMLElement>(`[data-source="${s}"]`)?.closest('label');
      if (label) label.hidden = n === 0 && !isHidden;
    }
    this.setCount('[data-count-stale]', stale);
    this.setChecked('[data-stale]', showStale);
  }

  private setCount(selector: string, n: number): void {
    const el = this.body.querySelector(selector);
    const text = number.format(n);
    if (el && el.textContent !== text) el.textContent = text;
  }

  private setChecked(selector: string, checked: boolean): void {
    const el = this.body.querySelector<HTMLInputElement>(selector);
    if (el) el.checked = checked;
  }
}

/** One labelled checkbox with its count. Labels are fixed strings from this build, never track data. */
function checkbox(attrs: string, label: string, countAttrs: string, className = ''): string {
  return `<label class="filter-row ${className}"><input type="checkbox" ${attrs} checked><span class="filter-label">${label}</span><span class="filter-count" ${countAttrs}>0</span></label>`;
}
