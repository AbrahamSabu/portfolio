import type { Finding } from '@watchfloor/shared';
import { ALERT_LIFE_MS } from '../state/alertLife';
import { FINDING_LABEL, interrupts, type FindingStore } from '../state/findings';
import type { NewsSettings } from '../state/newsStore';
import { AlertTimer } from './alertTimer';
import { formatNewsTime } from './format';
import { speak } from './voice';

/**
 * Findings that turn up in the page's first half minute were already out
 * there: the server's feeds wake when a page connects, so its first fresh
 * reports "discover" aircraft that were flying all along. They go on the map
 * and in the Rare tab, without a card or a ping.
 */
const CALM_OPEN_MS = 30_000;
const openedAt = performance.now();
/** Busy skies can start several findings in one sweep; the stack stays readable. */
const MAX_CARDS = 3;

/**
 * An alert card (the emergency squawks' style, in the same stack) when one of
 * the server's watchers notices something while the page is open: military
 * aircraft converging, a rare type in the air. Findings already on the map
 * when the page opened don't interrupt, and circling aircraft and silent
 * ships never do (they only mark the map). Show hands the finding back to
 * the page, which selects the track. Cards leave by themselves.
 */
export class FindingAlerts {
  /** The cards up, oldest first. */
  private readonly shown = new Set<string>();
  private readonly timer: AlertTimer;

  constructor(
    private readonly root: HTMLElement,
    findings: FindingStore,
    voice: NewsSettings,
    show: (finding: Finding) => void,
    ping: () => void = () => {},
  ) {
    this.timer = new AlertTimer(root, ALERT_LIFE_MS, (id) => this.remove(id));
    findings.subscribe((added) => {
      if (performance.now() - openedAt < CALM_OPEN_MS) return;
      const interrupting = added.filter(interrupts);
      for (const f of interrupting) {
        this.add(f);
        // One card in, oldest card out: the map keeps every finding regardless.
        while (this.shown.size > MAX_CARDS) this.remove(this.shown.values().next().value!);
      }
      if (interrupting.length === 0) return;
      ping();
      if (voice.voice) speak(`${FINDING_LABEL[interrupting[0]!.kind]}. ${interrupting[0]!.name}.`);
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
    if (this.shown.has(f.id)) return;
    const card = document.createElement('article');
    card.className = 'alert-card finding-alert';
    card.dataset.finding = f.id;
    card.dataset.life = f.id;
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
    detail.className = 'alert-line';
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
    actions.append(show);
    // On the card itself: the actions row is positioned, and would take the × with it.
    card.append(head, detail, actions, dismiss);
    this.root.append(card);
    this.shown.add(f.id);
    this.timer.start(f.id);
  }

  private remove(id: string): void {
    this.timer.forget(id);
    this.shown.delete(id);
    this.root.querySelector(`[data-finding="${CSS.escape(id)}"]`)?.remove();
  }
}
