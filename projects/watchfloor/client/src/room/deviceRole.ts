import { isScreenKind, type ScreenKind } from '@watchfloor/shared';

/**
 * What this device does in an ops room, remembered on it: shows the map (a
 * screen, like a TV or a tablet on a stand) or steers one (a controller).
 * The room's link asks once (console.html); the Ops room dialog on a
 * screen, and the console's Room tab, switch it.
 */
export type DeviceRole = 'screen' | 'control';

const ROLE_KEY = 'watchfloor.roomRole';
const KIND_KEY = 'watchfloor.screenKind';

function read(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null; // private windows and blocked storage: ask again next time
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not remembered, which only means asking again
  }
}

export function readRole(): DeviceRole | null {
  const role = read(ROLE_KEY);
  return role === 'screen' || role === 'control' ? role : null;
}

export function writeRole(role: DeviceRole): void {
  write(ROLE_KEY, role);
}

/** This screen's kind: as chosen on it before, else a guess. */
export function readKind(nav: { userAgent: string; maxTouchPoints?: number } = navigator): ScreenKind {
  const kind = read(KIND_KEY);
  return isScreenKind(kind) ? kind : guessScreenKind(nav);
}

export function writeKind(kind: ScreenKind): void {
  write(KIND_KEY, kind);
}

/**
 * A first guess at what this device is, from what its browser says about
 * itself. Wrong guesses are one menu away in the Ops room dialog, so this
 * only has to be right for the common cases: TV browsers name their
 * platform, iPads now say Macintosh but have touch, and Android tablets
 * leave "Mobile" out.
 */
export function guessScreenKind(nav: { userAgent: string; maxTouchPoints?: number }): ScreenKind {
  const ua = nav.userAgent;
  if (/SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|BRAVIA|Android TV|GoogleTV|HbbTV|CrKey|AFT[A-Z]|Roku|Viera/i.test(ua)) return 'tv';
  if (/iPad|Tablet|Silk/i.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1)) return 'tablet';
  if (/iPhone|iPod|Mobile/i.test(ua)) return 'phone';
  if (/Android/i.test(ua)) return 'tablet';
  return 'laptop';
}
