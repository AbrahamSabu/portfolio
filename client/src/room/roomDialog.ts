import type { ConsolePresence } from '@watchfloor/shared';
import { encodeQr, qrSvg } from './qr';
import type { RoomView } from './roomView';

const MARKUP = `
  <header class="key-head">
    <h2 class="key-title" id="room-title">Ops room</h2>
    <button class="icon-button" type="button" data-close aria-label="Close the ops room dialog">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
    </button>
  </header>
  <div class="room-body">
    <div class="room-qr" data-qr role="img" aria-label="QR code with the link to join this room"></div>
    <div class="room-info">
      <div data-code-block>
        <p class="room-label">Room code</p>
        <p class="room-code" data-code></p>
      </div>
      <p class="room-message" data-message></p>
      <a class="room-link" data-link target="_blank" rel="noopener"></a>
      <p class="room-also" data-also></p>
      <div data-consoles-block>
        <h3 class="room-label">Consoles</h3>
        <ul class="room-consoles" data-consoles></ul>
      </div>
    </div>
  </div>
  <footer class="room-foot" data-foot>
    <p class="room-fine">Consoles can send tracks to this screen. Nothing is saved: the room ends when you close it.</p>
    <button class="room-leave" type="button" data-leave>Close room</button>
  </footer>`;

/**
 * The join dialog (Q): QR code, link and room code, and who has joined. A
 * modal like the map key; keys pressed inside stay inside, so the map's
 * shortcuts behind it don't fire, and Q or Escape closes it.
 */
export class RoomDialog {
  private readonly dialog = document.createElement('dialog');
  private readonly part = <T extends HTMLElement>(name: string) => this.dialog.querySelector<T>(`[data-${name}]`)!;
  private qrFor: string | null = null;

  constructor(onLeave: () => void) {
    // The map key's dialog frame, header and close button, so the two dialogs match.
    this.dialog.className = 'key-dialog room-dialog';
    this.dialog.setAttribute('aria-labelledby', 'room-title');
    this.dialog.innerHTML = MARKUP;
    document.body.append(this.dialog);
    this.part('close').addEventListener('click', () => this.close());
    this.part('leave').addEventListener('click', onLeave);
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.close(); // the backdrop
    });
    this.dialog.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if ((event.key === 'q' || event.key === 'Q') && !event.ctrlKey && !event.metaKey && !event.altKey) this.close();
    });
  }

  get open(): boolean {
    return this.dialog.open;
  }

  show(): void {
    if (!this.dialog.open) this.dialog.showModal();
  }

  close(): void {
    if (this.dialog.open) this.dialog.close();
  }

  /** `nameOf` names a track for the consoles list (callsign, or its id). */
  render(view: RoomView, consoles: readonly ConsolePresence[], nameOf: (id: string) => string): void {
    const qr = this.part('qr');
    qr.hidden = !view.qr;
    if (view.qr !== this.qrFor) {
      // Our own markup from numbers and fixed colours only: safe as innerHTML.
      qr.innerHTML = view.qr ? qrSvg(encodeQr(view.qr)) : '';
      this.qrFor = view.qr;
    }
    this.part('code-block').hidden = !view.code;
    this.part('code').textContent = view.code ?? '';
    this.part('message').textContent = view.message;
    const link = this.part<HTMLAnchorElement>('link');
    link.hidden = !view.link;
    link.textContent = view.link ?? '';
    if (view.link) link.href = view.link;
    else link.removeAttribute('href');
    const also = this.part('also');
    also.hidden = view.also.length === 0;
    also.textContent = view.also.length > 0 ? `Other addresses for this computer: ${view.also.join(', ')}` : '';

    this.part('consoles-block').hidden = !view.code;
    const list = this.part('consoles');
    list.replaceChildren(
      ...(consoles.length === 0
        ? [item('None yet', 'room-consoles-empty')]
        : consoles.map((c) => item(`CONSOLE ${c.callsign} · ${c.id ? nameOf(c.id) : 'browsing the list'}`))),
    );
    this.part('foot').hidden = !view.canClose;
  }
}

function item(text: string, className?: string): HTMLLIElement {
  const li = document.createElement('li');
  li.textContent = text;
  if (className) li.className = className;
  return li;
}
