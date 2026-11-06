import { isRoomCode, normalizeRoomCode, type ConsolePresence, type ScreenName, type ScreenPresence } from '@watchfloor/shared';
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
        <p class="room-label" data-code-label>Room code</p>
        <p class="room-code" data-code></p>
      </div>
      <p class="room-message" data-message></p>
      <a class="room-link" data-link target="_blank" rel="noopener"></a>
      <p class="room-also" data-also></p>
      <p class="room-also" data-screen-hint></p>
      <div class="room-choose" data-choose>
        <button class="room-primary" type="button" data-open autofocus>Open a room here</button>
        <form class="room-join" data-join-form>
          <label class="room-label" for="room-join-code">Or join a room as another screen</label>
          <div class="room-join-row">
            <input class="room-join-input" id="room-join-code" data-join-code maxlength="7" autocomplete="off"
              autocapitalize="characters" spellcheck="false" placeholder="K7QX" />
            <button class="room-secondary" type="submit">Join as a screen</button>
          </div>
        </form>
      </div>
      <div data-people>
        <h3 class="room-label">In the room</h3>
        <ul class="room-consoles" data-people-list></ul>
      </div>
    </div>
  </div>
  <footer class="room-foot" data-foot>
    <p class="room-fine" data-fine></p>
    <button class="room-leave" type="button" data-leave></button>
  </footer>`;

export interface RoomDialogHandlers {
  /** Open a room with this screen as its main screen. */
  open(): void;
  /** Join a room (code already checked) as another screen. */
  join(code: string): void;
  /** Close the room (main screen) or leave it (another screen). */
  leave(): void;
}

/** Who is in the room, for the dialog's list. */
export interface RoomPeople {
  screens: readonly ScreenPresence[];
  consoles: readonly ConsolePresence[];
}

/**
 * The ops room dialog (Q, or Layers → Ops room): open a room or join one as
 * another screen; then the QR code, link and code for phones, how to add a
 * screen, and who is in the room. A modal like the map key; keys pressed
 * inside stay inside, so the map's shortcuts behind it don't fire, and Q
 * (outside the code box) or Escape closes it.
 */
export class RoomDialog {
  private readonly dialog = document.createElement('dialog');
  private readonly part = <T extends HTMLElement>(name: string) => this.dialog.querySelector<T>(`[data-${name}]`)!;
  private qrFor: string | null = null;
  private typedError: string | null = null;

  constructor(private readonly handlers: RoomDialogHandlers) {
    // The map key's dialog frame, header and close button, so the two dialogs match.
    this.dialog.className = 'key-dialog room-dialog';
    this.dialog.setAttribute('aria-labelledby', 'room-title');
    this.dialog.innerHTML = MARKUP;
    document.body.append(this.dialog);
    this.part('close').addEventListener('click', () => this.close());
    this.part('leave').addEventListener('click', () => handlers.leave());
    this.part('open').addEventListener('click', () => handlers.open());
    this.part<HTMLFormElement>('join-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const code = normalizeRoomCode(this.part<HTMLInputElement>('join-code').value);
      if (!isRoomCode(code)) {
        this.typedError = 'Room codes are four letters and digits, like K7QX.';
        this.part('message').textContent = this.typedError;
        return;
      }
      this.typedError = null;
      handlers.join(code);
    });
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.close(); // the backdrop
    });
    this.dialog.addEventListener('keydown', (event) => {
      event.stopPropagation();
      const typing = event.target instanceof HTMLInputElement;
      if (!typing && (event.key === 'q' || event.key === 'Q') && !event.ctrlKey && !event.metaKey && !event.altKey) this.close();
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

  /** `nameOf` names a track for the list; `self` is this screen's own name in the room. */
  render(view: RoomView, people: RoomPeople, nameOf: (id: string) => string, self: ScreenName | null): void {
    const qr = this.part('qr');
    qr.hidden = !view.qr;
    if (view.qr !== this.qrFor) {
      // Our own markup from numbers and fixed colours only: safe as innerHTML.
      qr.innerHTML = view.qr ? qrSvg(encodeQr(view.qr)) : '';
      this.qrFor = view.qr;
    }
    const screen = view.mode === 'screen';
    this.part('code-block').hidden = !view.code || view.mode === 'wait';
    this.part('code-label').textContent = screen ? `This screen is ${view.name} in room` : 'Room code';
    this.part('code').textContent = view.code ?? '';
    this.part('message').textContent = view.mode === 'choose' && this.typedError ? this.typedError : view.message;
    const link = this.part<HTMLAnchorElement>('link');
    link.hidden = !view.link;
    link.textContent = view.link ?? '';
    if (view.link) link.href = view.link;
    else link.removeAttribute('href');
    const also = this.part('also');
    also.hidden = view.also.length === 0;
    also.textContent = view.also.length > 0 ? `Other addresses for this computer: ${view.also.join(', ')}` : '';
    const hint = this.part('screen-hint');
    hint.hidden = !view.screenLink;
    hint.textContent = view.screenLink
      ? `Add a TV as another screen: on the TV, open Watchfloor, then Layers → Ops room → join as a screen with code ${view.code}, or open ${view.screenLink}`
      : '';
    this.part('choose').hidden = view.mode !== 'choose';

    const inRoom = view.mode === 'host' || screen;
    this.part('people').hidden = !inRoom;
    const rows = [
      ...people.screens.map((s) => `${s.name}${s.name === self ? ' (this screen)' : ''}`),
      ...people.consoles.map((c) => `CONSOLE ${c.callsign} · ${c.id ? nameOf(c.id) : 'browsing the list'}`),
    ];
    this.part('people-list').replaceChildren(...(rows.length > 0 ? rows : ['Nobody yet']).map((text) => item(text)));
    this.part('foot').hidden = !inRoom;
    this.part('fine').textContent = screen
      ? 'Nothing is saved. Leaving takes this screen out of the room.'
      : 'Phones in the room can steer its screens. Nothing is saved: the room ends when you close it.';
    this.part('leave').textContent = screen ? 'Leave the room' : 'Close room';
  }
}

function item(text: string): HTMLLIElement {
  const li = document.createElement('li');
  li.textContent = text;
  return li;
}
