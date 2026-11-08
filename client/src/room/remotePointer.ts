/** The pointer fades after this long without a move or a click. */
const IDLE_MS = 6_000;
/** Synthesised pointer events need an id; one no real mouse or finger uses. */
const POINTER_ID = 7_391;

/**
 * A console's pointer on this screen (pointer mode on the phone's pad): a
 * slide moves it, a tap clicks whatever is under it as a mouse would (an
 * aircraft, an airport, a satellite, a button, a country's name), and a
 * press and release drag in between (the timeline, a slider, the map).
 * Events are synthesised on the element under the pointer, so every click
 * handler on the page works unchanged. Two places are off limits: the ops
 * room dialog (a console mustn't close the room it's in) and links to other
 * sites (a TV shouldn't open tabs nobody can close).
 */
export class RemotePointer {
  private readonly el: HTMLElement;
  private readonly tag: HTMLElement;
  private x = -1;
  private y = -1;
  /** Where a press went down: moves drag it until the release. */
  private pressed: Element | null = null;
  private pressedBy: string | null = null;
  private idleTimer: number | undefined;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'remote-pointer';
    this.el.hidden = true;
    this.el.setAttribute('aria-hidden', 'true');
    this.tag = document.createElement('span');
    this.tag.className = 'remote-pointer-tag';
    this.el.append(this.tag);
    document.body.append(this.el);
  }

  /** Move by fractions of the screen, from where it was (the middle, the first time). */
  move(who: string, dx: number, dy: number): void {
    this.show(who);
    this.x = clamp(this.x + dx * innerWidth, 0, innerWidth - 1);
    this.y = clamp(this.y + dy * innerHeight, 0, innerHeight - 1);
    this.place();
    const target = this.pressed ?? this.under();
    if (!target) return;
    const buttons = this.pressed ? 1 : 0;
    this.fire(target, 'pointermove', buttons);
    this.fire(target, 'mousemove', buttons);
  }

  click(who: string): void {
    this.show(who);
    const target = this.under();
    if (!target) return;
    this.fire(target, 'pointerdown', 1);
    this.fire(target, 'mousedown', 1);
    this.fire(target, 'pointerup', 0);
    this.fire(target, 'mouseup', 0);
    this.fire(target, 'click', 0);
  }

  press(who: string, down: boolean): void {
    this.show(who);
    if (down) {
      // A press while another console still holds one releases that first: never two drags at once.
      this.release();
      const target = this.under();
      if (!target) return;
      this.pressed = target;
      this.pressedBy = who;
      this.fire(target, 'pointerdown', 1);
      this.fire(target, 'mousedown', 1);
    } else this.release();
  }

  /** The console holding a press, or null: the host lets go for one that left the room. */
  get holder(): string | null {
    return this.pressedBy;
  }

  /** The room ended, or the pressing console left: let go of any drag and hide. */
  reset(): void {
    this.release();
    this.hide();
  }

  private release(): void {
    const target = this.pressed;
    if (!target) return;
    this.pressed = null;
    this.pressedBy = null;
    this.fire(target, 'pointerup', 0);
    this.fire(target, 'mouseup', 0);
  }

  /** What a click here would reach, or null where the pointer may not click. */
  private under(): Element | null {
    const target = document.elementFromPoint(this.x, this.y);
    if (!target || target.closest('.room-dialog')) return null;
    const link = target.closest('a[href]');
    if (link && (link as HTMLAnchorElement).origin !== location.origin) return null;
    return target;
  }

  private fire(target: Element, type: string, buttons: number): void {
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: this.x,
      clientY: this.y,
      screenX: this.x,
      screenY: this.y,
      button: 0,
      buttons,
    };
    target.dispatchEvent(
      type.startsWith('pointer')
        ? new PointerEvent(type, { ...init, pointerId: POINTER_ID, pointerType: 'mouse', isPrimary: true })
        : new MouseEvent(type, init),
    );
  }

  private show(who: string): void {
    if (this.x < 0) {
      this.x = innerWidth / 2;
      this.y = innerHeight / 2;
    }
    this.tag.textContent = who;
    this.el.hidden = false;
    this.place();
    // Above a dialog the page opened since (the map key): the top layer stacks in the order things join it.
    if (typeof this.el.showPopover === 'function') {
      if (!this.el.popover) this.el.popover = 'manual';
      if (this.el.matches(':popover-open')) this.el.hidePopover();
      this.el.showPopover();
    }
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => this.hide(), IDLE_MS);
  }

  private hide(): void {
    if (this.pressed) return; // never let go of a drag silently
    if (typeof this.el.hidePopover === 'function' && this.el.matches(':popover-open')) this.el.hidePopover();
    this.el.hidden = true;
  }

  private place(): void {
    this.el.style.transform = `translate(${this.x}px, ${this.y}px)`; // not `translate`: older TV browsers lack it
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
