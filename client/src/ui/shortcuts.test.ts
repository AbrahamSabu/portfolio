import { REMOTE_KEYS } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { SHORTCUTS } from './shortcuts';

/** Shortcuts a console can't press on a screen, and why. */
const NOT_REMOTE: Record<string, string> = {
  '/': 'search needs typing on the screen',
  W: 'a watch area is named by typing on the screen',
  Q: "the ops room's own dialog",
};

describe('the keys a console can press on a screen', () => {
  it("cover every shortcut in the map key, or it's listed as left out, with why", () => {
    const remote = new Set<string>(REMOTE_KEYS.map((k) => (k === 'Escape' ? 'Esc' : k)));
    for (const [key] of SHORTCUTS) expect(remote.has(key) || key in NOT_REMOTE, `${key}: add it to REMOTE_KEYS or NOT_REMOTE`).toBe(true);
    for (const key of remote) expect(SHORTCUTS.some(([k]) => k === key), `${key} isn't in the map key`).toBe(true);
  });
});
