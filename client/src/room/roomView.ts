import { joinOrigins, joinUrl, type ConsoleCallsign, type ConsolePresence, type RoomClosedReason, type Track } from '@watchfloor/shared';

/** A track's name as screens show it: its callsign, else its native id. */
export const trackName = (track: Pick<Track, 'id' | 'callsign'>) => track.callsign ?? (track.id.split(':')[1] ?? track.id).toUpperCase();

/** Where the main screen stands with its room. */
export type RoomState =
  | { kind: 'none' }
  | { kind: 'opening' }
  | { kind: 'open'; code: string; key: string; origins: string[] }
  | { kind: 'ended'; reason: RoomClosedReason };

/** What the join dialog shows, worked out from the state alone so it can be tested. */
export interface RoomView {
  code: string | null;
  /** What the QR code carries, or null when no phone could use it. */
  qr: string | null;
  /** The link in text: the QR's, or this computer's own when phones can't reach the server. */
  link: string | null;
  /** Other addresses that may work (a computer with several network adapters). */
  also: string[];
  /** One plain sentence: what to do, or why it can't be done. */
  message: string;
  /** The Close room button. */
  canClose: boolean;
}

const ENDED: Record<RoomClosedReason, string> = {
  closed: 'The room has closed. Press Q to open a new one.',
  'not-found': 'The room closed while this screen was away. Press Q to open a new one.',
  full: 'The server has as many rooms open as it allows. Try again later.',
  busy: 'The server is pausing rooms for a minute. Try again shortly.',
};

/**
 * The dialog's content. Phones are sent to the page's own address when it
 * isn't this computer's loopback; otherwise to the server's network
 * addresses, and when there are none (the server listens on this computer
 * only) the dialog says how to opt in rather than show a code that can't work.
 */
export function roomView(state: RoomState, page: { origin: string; hostname: string }, live: boolean): RoomView {
  const none = { code: null, qr: null, link: null, also: [], canClose: false };
  if (!live) {
    return { ...none, message: "Rooms need the Watchfloor server. This demo runs entirely in your browser, so there's nothing for a phone to join." };
  }
  switch (state.kind) {
    case 'none':
      return { ...none, message: 'Press Q to open a room that phones can join.' };
    case 'opening':
      return { ...none, message: 'Opening a room…' };
    case 'ended':
      return { ...none, message: ENDED[state.reason] };
    case 'open': {
      const [best, ...others] = joinOrigins(page, state.origins);
      if (!best) {
        return {
          code: state.code,
          qr: null,
          link: joinUrl(page.origin, state.code),
          also: [],
          message:
            "Phones can't reach this server: it listens on this computer only. To let devices on your network join, " +
            'restart it with HOST=0.0.0.0 (then anyone on that network can open Watchfloor). This computer can join at:',
          canClose: true,
        };
      }
      return {
        code: state.code,
        qr: joinUrl(best, state.code),
        link: joinUrl(best, state.code),
        also: others,
        message: 'Scan with a phone camera to join as a console, or open the link and type the code.',
        canClose: true,
      };
    }
  }
}

/** Consoles grouped by the track they have open, for one map tag per track. */
export function presenceByTrack(consoles: readonly ConsolePresence[]): Map<string, ConsoleCallsign[]> {
  const byTrack = new Map<string, ConsoleCallsign[]>();
  for (const c of consoles) {
    if (!c.id) continue;
    const list = byTrack.get(c.id);
    if (list) list.push(c.callsign);
    else byTrack.set(c.id, [c.callsign]);
  }
  return byTrack;
}

/** "CONSOLE ALFA", or "CONSOLES ALFA · BRAVO" when several have the same track open. */
export function presenceLabel(callsigns: readonly ConsoleCallsign[]): string {
  return `${callsigns.length === 1 ? 'CONSOLE' : 'CONSOLES'} ${callsigns.join(' · ')}`;
}
