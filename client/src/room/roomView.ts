import {
  joinOrigins,
  joinUrl,
  screenUrl,
  type ConsoleCallsign,
  type ConsolePresence,
  type RoomClosedReason,
  type ScreenName,
  type Track,
} from '@watchfloor/shared';

/** A track's name as screens show it: its callsign, else its native id. */
export const trackName = (track: Pick<Track, 'id' | 'callsign'>) => track.callsign ?? (track.id.split(':')[1] ?? track.id).toUpperCase();

/** Where this screen stands with a room: hosting one, or showing someone else's as another screen. */
export type RoomState =
  | { kind: 'none' }
  | { kind: 'opening' }
  | { kind: 'open'; code: string; key: string; origins: string[] }
  | { kind: 'joining'; code: string }
  | { kind: 'screen'; code: string; name: ScreenName; token: string }
  | { kind: 'ended'; reason: RoomClosedReason; as: 'main' | 'screen'; code?: string };

/** What the dialog shows, worked out from the state alone so it can be tested. */
export interface RoomView {
  /** choose: open a room or join one; wait: on the way; host: the join codes; screen: joined as another screen. */
  mode: 'demo' | 'choose' | 'wait' | 'host' | 'screen';
  code: string | null;
  /** What the QR code carries, or null when no phone could use it. */
  qr: string | null;
  /** The link in text: the QR's, or this computer's own when phones can't reach the server. */
  link: string | null;
  /** Other addresses that may work (a computer with several network adapters). */
  also: string[];
  /** Where another screen can join: the map, with the code in the link. */
  screenLink: string | null;
  /** This screen's name in a room it joined. */
  name: ScreenName | null;
  /** One plain sentence: what to do, or why it can't be done. */
  message: string;
}

const ENDED: Record<'main' | 'screen', Record<RoomClosedReason, string>> = {
  main: {
    closed: 'The room has closed.',
    'not-found': 'The room closed while this screen was away.',
    full: 'The server has as many rooms open as it allows. Try again later.',
    busy: 'The server is pausing rooms for a minute. Try again shortly.',
  },
  screen: {
    closed: 'The room has closed.',
    'not-found': "There's no room with that code. Check the main screen: Q shows it there.",
    full: 'That room has as many screens as it takes.',
    busy: 'Too many wrong codes were tried just now. Try again in a minute.',
  },
};

const CHOOSE = 'Open a room here for phones and other screens to join, or join a room as another screen with its code.';

/**
 * The dialog's content. Phones are sent to the page's own address when it
 * isn't this computer's loopback; otherwise to the server's network
 * addresses, and when there are none (the server listens on this computer
 * only) the dialog says how to opt in rather than show a code that can't work.
 */
export function roomView(state: RoomState, page: { origin: string; hostname: string }, live: boolean, liveUrl?: string): RoomView {
  const blank = { code: null, qr: null, link: null, also: [], screenLink: null, name: null };
  if (!live) {
    // The static demo has no server. A demo built knowing the live version's address (VITE_LIVE_URL) points there.
    if (liveUrl) {
      return {
        ...blank,
        mode: 'demo',
        link: liveUrl,
        message: 'Rooms need the Watchfloor server, and this demo runs entirely in your browser. The live version has one: open it and press Q there (it can take a minute to wake up).',
      };
    }
    return { ...blank, mode: 'demo', message: "Rooms need the Watchfloor server. This demo runs entirely in your browser, so there's nothing for a phone to join." };
  }
  switch (state.kind) {
    case 'none':
      return { ...blank, mode: 'choose', message: CHOOSE };
    case 'ended':
      return { ...blank, mode: 'choose', message: `${ENDED[state.as][state.reason]} ${state.as === 'main' ? CHOOSE : ''}`.trim() };
    case 'opening':
      return { ...blank, mode: 'wait', message: 'Opening a room…' };
    case 'joining':
      return { ...blank, mode: 'wait', code: state.code, message: `Joining room ${state.code} as a screen…` };
    case 'screen':
      return {
        ...blank,
        mode: 'screen',
        code: state.code,
        name: state.name,
        message: 'Phones in the room can steer this screen; the main screen and this one never steer each other.',
      };
    case 'open': {
      const [best, ...others] = joinOrigins(page, state.origins);
      if (!best) {
        return {
          ...blank,
          mode: 'host',
          code: state.code,
          link: joinUrl(page.origin, state.code),
          screenLink: screenUrl(page.origin, state.code),
          message:
            "Phones can't reach this server: it listens on this computer only. To let devices on your network join, " +
            'restart it with HOST=0.0.0.0 (then anyone on that network can open Watchfloor). This computer can join at:',
        };
      }
      return {
        ...blank,
        mode: 'host',
        code: state.code,
        qr: joinUrl(best, state.code),
        link: joinUrl(best, state.code),
        also: others,
        screenLink: screenUrl(best, state.code),
        message: 'Scan with a phone or tablet camera. Each device chooses: show the map there, or control a screen.',
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
