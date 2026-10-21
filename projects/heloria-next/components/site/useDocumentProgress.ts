"use client";

import { useEffect, useRef } from "react";
import { STAGES, readingFrom, type NoteBox, type Reading } from "@/lib/build";

/**
 * Where the reader is in the build, as a ref updated every frame.
 *
 * Timed against the notes — the short passages beside each stage that say
 * what just went in — because those are the words a part belongs with. See
 * `readingFrom` for why the sections were the wrong thing to measure.
 *
 * ── The page's loop, not the renderer's ──────────────────────────────────────
 *
 * This runs on its own `requestAnimationFrame`, outside the canvas. If it
 * lived inside the canvas's frame loop, anything on the page that ever
 * depended on it would depend on WebGL starting — and the previous version of
 * this site found out what that looks like, as a column of text that never
 * faded in.
 *
 * ── Measured, every frame ────────────────────────────────────────────────────
 *
 * Six `getBoundingClientRect` calls a frame on a static page, rather than
 * caching positions and re-measuring on resize. Caching has a class of bug all
 * of its own: a web font swaps in and every note moves down a line, the
 * address bar on a phone collapses — each one invalidates the cache without
 * firing the event it was listening for. Measuring is ground truth, and six
 * rects a frame costs nothing next to the canvas this is driving.
 *
 * It is not driven by scroll events either. They are an optimisation, and in
 * at least one embedded browser they are not delivered at all.
 */
export function useDocumentProgress() {
  /* Starts finished. Before the first frame has measured anything the honest
     answer is "unknown", and the failure mode of guessing the start is a bare
     plate for anyone whose first frame is late. A finished machine that then
     takes itself apart to the right point is a flicker; an empty stage is a
     broken page. */
  const reading = useRef<Reading>({
    progress: 1,
    focus: { index: STAGES.length - 1, within: 1 },
    payoff: false,
    past: false,
  });
  /**
   * The reader is at the freewheel's note and has stopped scrolling — the one
   * moment the machine is brought to rest. See `lib/rest.ts`.
   *
   * Stillness is measured from the scroll position, frame to frame, not from
   * the absence of scroll events: the same reason everything else here is
   * measured. A reader holding a finger on the glass without moving it has
   * stopped scrolling as far as anyone watching can tell.
   */
  const rest = useRef(false);

  useEffect(() => {
    let frame = 0;
    let lastY = window.scrollY;
    let movedAt = performance.now();
    /* The stacked phone layout: the machine is a band across the top and the
       text is read below it. Same breakpoint as the stylesheet's. */
    const phone = window.matchMedia("(max-width: 767px)");

    const measure = () => {
      const notes: NoteBox[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("[data-stage]")) {
        const r = el.getBoundingClientRect();
        notes.push({ stage: el.dataset.stage ?? "", top: r.top, height: r.height });
      }
      const vh = window.innerHeight;
      /* The reading line: the middle of the screen, or on a phone the middle
         of what the band leaves — measured off the band, not assumed, so it
         follows the layout if the layout moves. */
      let eye = vh / 2;
      if (phone.matches) {
        const band = document.querySelector<HTMLElement>("[data-well]")?.getBoundingClientRect();
        if (band && band.height > 0) eye = (band.bottom + vh) / 2;
      }
      reading.current = readingFrom(notes, vh, STAGES, eye);

      const now = performance.now();
      if (Math.abs(window.scrollY - lastY) > 0.5) {
        lastY = window.scrollY;
        movedAt = now;
      }
      rest.current = reading.current.payoff && now - movedAt >= STILL_MS;
    };

    const tick = () => {
      measure();
      frame = requestAnimationFrame(tick);
    };

    /* Once synchronously, so the very first canvas frame already has the
       right answer rather than the placeholder above. */
    measure();
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return { reading, rest };
}

/**
 * How long the reader has to have stopped before the machine does.
 *
 * Long enough that the pause at the end of a flick is not taken for a
 * decision; short enough that someone who has stopped to read the note sees
 * the machine answer them while they are still reading it.
 */
const STILL_MS = 700;
