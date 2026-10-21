"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DRIVE, push, step, stepCalm, type Drive, type DriveSpec } from "@/lib/motion";
import { RUNNING, govern, type Governor } from "@/lib/rest";

/**
 * The input shaft: idles forward, takes a shove from the scroll wheel, coasts.
 *
 * Kept in a ref rather than in state. The angle changes sixty times a second
 * and nothing about the page's markup depends on it, so putting it in state
 * would re-render the whole tree to move a gear.
 *
 * ── What it listens to ───────────────────────────────────────────────────────
 *
 * `wheel` rather than `scroll`, because the impulse wants the *gesture*, not
 * the resulting position: a page that has hit its end still receives wheel
 * events, and a machine that stops responding when you reach the bottom of the
 * section feels broken. Scroll position is also already smoothed by the
 * browser, which is a second easing curve on top of the one here.
 *
 * Touch gets its own handler, because `wheel` does not fire for it.
 */
export function useDrive(
  enabled = true,
  visible?: React.RefObject<boolean>,
  /**
   * How much of the idle applies, read fresh each frame.
   *
   * A ref rather than a value, because the thing that decides it — how far a
   * reader has scrolled — changes every frame, and passing it as a prop would
   * re-render the figure to tell it the machine should be slowing down.
   */
  idleScale?: React.RefObject<number>,
  /**
   * How the shaft takes a shove. The workbench uses `DRIVE`, which lets a
   * reader whip the machine up; the site uses `SITE_DRIVE`, whose flywheel
   * actually resists — because the site prints a claim that it does.
   */
  spec: DriveSpec = DRIVE,
  /**
   * When true, bring the machine to rest — in a dwell — and start it again
   * when it goes false. Read fresh each frame. Absent, the drive simply runs,
   * which is what the workbench wants. See `lib/rest.ts`.
   */
  rest?: React.RefObject<boolean>,
) {
  const drive = useRef<Drive>({ angle: 0, spin: 0 });
  const governor = useRef<Governor>(RUNNING);
  const calm = useRef(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    calm.current = query.matches;
    const onChange = () => {
      calm.current = query.matches;
      if (query.matches) drive.current.spin = 0;
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    /* Rendering pauses when the figure scrolls away, so an impulse taken then
       would sit in the shaft and fire the moment it came back — the machine
       would lurch as it appeared, having apparently been wound up by scrolling
       past some text. */
    const listening = () => !calm.current && (visible?.current ?? true);

    const onWheel = (e: WheelEvent) => {
      if (!listening()) return;
      /* deltaMode 1 is lines, 2 is pages. Firefox on Windows reports lines, so
         a wheel notch arrives as 3 rather than ~100 and the machine barely
         moves unless it is converted. */
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1;
      drive.current = push(drive.current, e.deltaY * scale, spec);
    };

    let lastTouch: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      lastTouch = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!listening()) return;
      const y = e.touches[0]?.clientY;
      if (y == null || lastTouch == null) return;
      drive.current = push(drive.current, lastTouch - y, spec);
      lastTouch = y;
    };
    const onTouchEnd = () => {
      lastTouch = null;
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, visible, spec]);

  /**
   * Advance one frame and hand back the angle.
   *
   * `dt` is clamped: a backgrounded tab hands back whatever elapsed since it
   * was last painted, which can be minutes, and integrating that in one step
   * spins the machine through hundreds of revolutions in a frame.
   */
  const advance = (dt: number) => {
    const clamped = Math.min(0.1, Math.max(0, dt));
    if (calm.current) {
      drive.current = stepCalm(drive.current, clamped);
    } else if (rest) {
      const r = govern(governor.current, drive.current, clamped, rest.current ?? false, spec);
      governor.current = r.g;
      drive.current = r.d;
    } else {
      drive.current = step(drive.current, clamped, spec, idleScale?.current ?? 1);
    }
    return drive.current;
  };

  return { advance, drive, spec, calm };
}

/**
 * True while the element is on screen.
 *
 * A WebGL canvas with 250,000 vertices and a 2048² shadow map does not stop
 * costing anything when it scrolls out of view — R3F keeps rendering and the
 * fan keeps running. Two thirds of this page is text.
 */
export function useOnScreen<T extends HTMLElement>(margin = "200px") {
  /* A callback ref for the same reason as `useApproached`: a sentinel that is
     not in the first render never gets observed. The consequence here is milder
     — `visible` defaults to true, so the worst case is a figure that never
     stops drawing rather than one that never starts — but it is the same bug. */
  const [node, setNode] = useState<T | null>(null);
  const ref = useCallback((el: T | null) => setNode(el), []);
  const visible = useRef(true);

  useEffect(() => {
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry.isIntersecting;
      },
      { rootMargin: margin },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [node, margin]);

  return { ref, visible };
}

/**
 * Has this element ever come near the viewport?
 *
 * State, not a ref, because the point is to re-render and *create* the canvas —
 * where `useOnScreen` only stops an existing one from drawing.
 *
 * ── Why a page cannot just mount them all ────────────────────────────────────
 *
 * A browser allows a small number of live WebGL contexts per process, and when
 * the limit is reached it takes one away: `THREE.WebGLRenderer: Context Lost`,
 * and that canvas is simply blank from then on. The lifecycle figure on /blend
 * was the third on its page and lost its context every time, which looks
 * exactly like a canvas that failed to size itself and is nothing of the sort.
 *
 * So a figure below the fold asks for a context when somebody is on their way
 * to it, and not before. It keeps it afterwards: tearing the renderer down on
 * the way past would drop the machine's momentum and its clutch state, and
 * rebuilding a quarter of a million vertices to scroll back up is worse than
 * holding one context.
 */
export function useApproached<T extends HTMLElement>(margin = 600) {
  /**
   * A callback ref, not a `useRef`, and that is the whole difference between
   * this working and not.
   *
   * A `useRef` is filled in *during* commit and changing it re-runs nothing. So
   * a component that does not render its sentinel on the first pass — one that
   * returns a placeholder until it knows whether reduced motion is on, say —
   * runs this effect once against `null`, bails, and never looks again. The
   * element appears a render later and nothing is watching it, so the canvas it
   * gates is waiting on a signal that cannot arrive. Which is exactly what
   * happened: the section rendered, the machine never did.
   *
   * Setting state from the callback re-runs the effect the moment the real
   * element exists, whenever that turns out to be.
   */
  const [node, setNode] = useState<T | null>(null);
  const ref = useCallback((el: T | null) => setNode(el), []);
  const [approached, setApproached] = useState(false);

  useEffect(() => {
    if (!node) return;

    let done = false;
    let timer = 0;

    /* The ground truth. An observer is the cheap way to learn this and a
       measurement is the certain one, so the measurement decides and the
       observer only ever says "check now". */
    const near = () => {
      const r = node.getBoundingClientRect();
      return r.top < window.innerHeight + margin && r.bottom > -margin;
    };

    const cleanup = () => {
      io?.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.clearInterval(timer);
    };

    function check() {
      if (done || !near()) return;
      done = true;
      setApproached(true);
      cleanup();
    }

    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) check();
      }, { rootMargin: `${margin}px` });
      io.observe(node);
    }

    /* Belt and braces, and not paranoia: an observer that never reports is
       indistinguishable from an element nobody has scrolled to, and the
       failure is a panel that stays blank for good. `useOnScreen` gets away
       with assuming the worst because its default is "keep drawing"; this one
       decides whether anything is drawn at all, so it cannot assume "no".

       Hence a poll as well as the events. Both signals turned out to be
       missable — in one embedded browser neither IntersectionObserver
       callbacks nor window scroll events arrive at all, while the element sits
       plainly on screen. A `getBoundingClientRect` twice a second is nothing
       next to the WebGL context this is deciding about, and it stops the
       moment the answer is yes. */
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    timer = window.setInterval(check, 500);
    check();

    return cleanup;
  }, [node, margin]);

  return { ref, approached };
}
