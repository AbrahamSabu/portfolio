/** How the operator closes a tab themselves, for when the browser won't let the page do it. */
export function closeHint(userAgent: string, touch: boolean): string {
  if (/Mac|iPhone|iPad/.test(userAgent) && !touch) return 'Press ⌘W to close this tab';
  if (touch) return 'Close this tab from your browser';
  return 'Press Ctrl+W to close this tab';
}

/**
 * The X at the far end of the top bar: closes Watchfloor. The screensaver's
 * full-screen kiosk has no window controls, so without it the way out was
 * Alt+F4. Browsers let a page close its window only when the page opened it
 * or nothing else is in the window's history, which is how the kiosk and an
 * app window start; in an ordinary tab the browser ignores the request, and
 * the button says how to close the tab instead. Not on a phone (hud.css):
 * no browser there lets a page close its tab, and the top bar has no room.
 */
export function mountCloseButton(button: HTMLButtonElement, note: HTMLElement): void {
  let hideTimer: number | undefined;
  button.addEventListener('click', () => {
    window.close();
    // A refused close leaves no trace but a console warning; still here a moment later means refused.
    window.setTimeout(() => {
      if (document.visibilityState === 'hidden') return;
      note.textContent = closeHint(navigator.userAgent, matchMedia('(pointer: coarse)').matches);
      note.hidden = false;
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => (note.hidden = true), 4000);
    }, 300);
  });
}
