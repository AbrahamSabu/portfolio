import type { Finding } from '@watchfloor/shared';
import { FINDING_LABEL, interrupts, type FindingStore } from '../state/findings';
import type { NewsSettings } from '../state/newsStore';
import { formatNewsTime } from './format';
import { speak } from './voice';

/** A finding alert goes away by itself after this long; the map marker stays. */
const SHOW_MS = 5 * 60_000;

/**
 * An alert card (the emergency squawks' style, in the same stack) when one of
 * the server's watchers notices something while the page is open: an aircraft
 * circling, military aircraft converging. Findings already on the map when
 * the page opened don't interrupt, and silent ships never do (they only mark
 * the map). Show hands the finding back to the page, which selects the track.
 */
export class FindingAlerts {
  private readonly timers = new Map<string, number>();

  constructor(
    private readonly root: HTMLElement,
    findings: FindingStore,
    voice: NewsSettings,
    show: (finding: Finding) => void,
    ping: () => void = () => {},
  ) {
    findings.subscribe((added) => {
      for (const f of added.filter(interrupts)) {
        this.add(f);
        ping();
        if (voice.voice) speak(`${FINDING_LABEL[f.kind]}. ${f.name}.`);
      }
    });
    root.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-finding-id]');
      const id = button?.dataset.findingId;
      if (!id) return;
      if (button.dataset.action !== 'dismiss') {
        const f = findings.get(id);
        if (f) show(f);
      }
      this.remove(id);
    });
  }

  private add(f: Finding): void {
    if (this.timers.has(f.id)) return;
    const card = document.createElement('article');
    card.className = 'alert-card finding-alert';
    card.dataset.finding = f.id;
    card.setAttribute('role', 'alert');
    const head = document.createElement('div');
    head.className = 'alert-head';
    const what = document.createElement('span');
    what.className = 'alert-code finding-code';
    what.textContent = FINDING_LABEL[f.kind].toUpperCase();
    const who = document.createElement('span');
    who.className = 'alert-meaning';
    who.textContent = f.name;
    const since = document.createElement('span');
    since.className = 'alert-since';
    since.textContent = formatNewsTime(f.since);
    head.append(what, who, since);
    const detail = document.createElement('div');
    detail.className = 'alert-kind';
    detail.textContent = f.detail;
    const actions = document.createElement('div');
    actions.className = 'alert-actions';
    const show = document.createElement('button');
    show.type = 'button';
    show.className = 'alert-show';
    show.dataset.findingId = f.id;
    show.textContent = 'Show';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'icon-button alert-dismiss';
    dismiss.dataset.findingId = f.id;
    dismiss.dataset.action = 'dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss alert');
    dismiss.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>';
    actions.append(show, dismiss);
    card.append(head, detail, actions);
    this.root.append(card);
    this.timers.set(f.id, window.setTimeout(() => this.remove(f.id), SHOW_MS));
  }

  private remove(id: string): void {
    window.clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.root.querySelector(`[data-finding="${CSS.escape(id)}"]`)?.remove();
  }
}
