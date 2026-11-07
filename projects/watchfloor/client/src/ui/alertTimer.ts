import { AlertLives } from '../state/alertLife';

/** How often the cards are looked at: often enough that one never outstays its life by much. */
const TICK_MS = 250;
/** The fade a card leaves with (the CSS transition on `.alert-leaving`). */
const FADE_MS = 300;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/**
 * What counts as reading a card. On a touch screen `:hover` sticks to
 * whatever was last tapped, which would hold a card forever, so there only
 * focus counts.
 */
const reading = () => (window.matchMedia('(hover: hover)').matches ? ':hover, :focus-within' : ':focus-within');

/**
 * Lets one kind of alert card leave by itself (`AlertLives` has the rules).
 * A card carries its id in `data-life`; `onDue` takes it away once it has
 * faded. The cards are looked at by selector each tick rather than through
 * listeners, because a kind may rebuild its cards (the squawks do) and a
 * rebuilt card keeps its life. Ticks only while some card is alive.
 */
export class AlertTimer {
  private readonly lives: AlertLives;
  private timer: number | undefined;

  constructor(
    private readonly root: HTMLElement,
    lifeMs: number,
    private readonly onDue: (id: string) => void,
  ) {
    this.lives = new AlertLives(lifeMs);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.lives.pause(performance.now());
      else this.lives.resume(performance.now());
    });
  }

  /** The card with `data-life="id"` starts (or restarts) its life. */
  start(id: string): void {
    const now = performance.now();
    this.lives.start(id, now);
    if (document.hidden) this.lives.pause(now);
    this.timer ??= window.setInterval(() => this.tick(), TICK_MS);
  }

  /** The card went some other way: no fade, no `onDue`. */
  forget(id: string): void {
    this.lives.forget(id);
  }

  private tick(): void {
    const now = performance.now();
    const held = reading();
    for (const card of this.root.querySelectorAll<HTMLElement>('[data-life]')) {
      if (card.matches(held)) this.lives.hold(card.dataset.life!, now);
    }
    for (const id of this.lives.due(now)) {
      const card = this.root.querySelector(`[data-life="${CSS.escape(id)}"]`);
      if (!card || reducedMotion()) {
        this.onDue(id);
        continue;
      }
      card.classList.add('alert-leaving');
      window.setTimeout(() => this.onDue(id), FADE_MS);
    }
    if (this.lives.size === 0) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
