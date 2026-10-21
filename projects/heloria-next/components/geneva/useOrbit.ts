"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_VIEW,
  LIMITS,
  aimAt,
  drag,
  goTo,
  makeOrbit,
  stepOrbit,
  zoom,
  type Orbit,
  type Preset,
} from "@/lib/orbit";

/**
 * Dragging the figure to look at it from somewhere else.
 *
 * ── The gesture problem ──────────────────────────────────────────────────────
 *
 * Scroll already drives the machine, so the wheel is spoken for. That leaves
 * drag — which on a touch screen is also how you scroll the page, and a figure
 * that swallows vertical drags is a figure you get stuck inside on a phone.
 *
 * So: one finger scrolls past as usual, two fingers orbit. On a mouse, drag
 * orbits, because there is no competing gesture. Pinch zooms on touch and the
 * buttons zoom everywhere.
 *
 * ── Pointer capture ──────────────────────────────────────────────────────────
 *
 * The drag is captured to the canvas, so releasing outside it still ends the
 * drag. Without that, letting go over the text below leaves the camera stuck to
 * the pointer and the next click anywhere swings the view.
 */
export function useOrbit(start: Preset = DEFAULT_VIEW) {
  /* `useRef(makeOrbit(start))` would re-solve the machine's bounds on every
     render and throw the result away; the initialiser form runs once. */
  const orbit = useRef<Orbit | null>(null);
  if (orbit.current === null) orbit.current = makeOrbit(start);
  const dragging = useRef(false);
  const [active, setActive] = useState(start.key);

  const advance = useCallback((dt: number) => {
    orbit.current = stepOrbit(orbit.current!, Math.min(0.1, Math.max(0, dt)));
    return orbit.current;
  }, []);

  const to = useCallback((p: Preset) => {
    orbit.current = goTo(orbit.current!, p);
    setActive(p.key);
  }, []);

  /**
   * Put the camera at an exact distance, angles untouched.
   *
   * For framing rather than zooming: the caller has measured what the frame can
   * actually hold and is correcting a preset that could not have known.
   */
  const fitTo = useCallback((distance: number, snap = false) => {
    const d = Math.min(LIMITS.maxDistance, Math.max(LIMITS.minDistance, distance));
    const o = orbit.current!;
    /* `snap` on the first frame, because easing in from whatever the preset
       asked for is a zoom nobody requested. Eased afterwards, so choosing a
       view is one movement rather than a swing plus a lurch. */
    orbit.current = { ...o, distance: d, atDistance: snap ? d : o.atDistance };
  }, []);

  /** Point the camera, without it being a click. For the scroll-told story. */
  const aim = useCallback(
    (p: Preset, over: { azimuth?: number; distance?: number; lift?: number } = {}) => {
      orbit.current = aimAt(orbit.current!, p, over);
    },
    [],
  );

  const nudgeZoom = useCallback((factor: number) => {
    orbit.current = zoom(orbit.current!, factor);
  }, []);

  /** Attach to the element that should receive drags. */
  const bind = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;

      let last: { x: number; y: number } | null = null;
      let pinch = 0;
      const size = () => ({ w: node.clientWidth || 1, h: node.clientHeight || 1 });

      const moved = (dx: number, dy: number) => {
        const { w, h } = size();
        orbit.current = drag(orbit.current!, dx, dy, w, h);
        /* Clearing the highlight is a state write, and a drag emits one of
           these per pointer move. The updater form lets React bail out when it
           is already clear, so a drag is one re-render rather than sixty a
           second — the same reason the drive angle lives in a ref. */
        setActive((cur) => (cur === "" ? cur : ""));
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.pointerType === "touch") return; // touch is handled below
        if (e.button !== 0) return;
        dragging.current = true;
        last = { x: e.clientX, y: e.clientY };
        node.setPointerCapture(e.pointerId);
        node.style.cursor = "grabbing";
      };
      const onPointerMove = (e: PointerEvent) => {
        if (!dragging.current || !last) return;
        moved(e.clientX - last.x, e.clientY - last.y);
        last = { x: e.clientX, y: e.clientY };
      };
      const onPointerUp = (e: PointerEvent) => {
        if (!dragging.current) return;
        dragging.current = false;
        last = null;
        if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
        node.style.cursor = "grab";
      };

      /* Two fingers to orbit; one is left alone so the page still scrolls. */
      const centreOf = (t: TouchList) => ({
        x: (t[0].clientX + t[1].clientX) / 2,
        y: (t[0].clientY + t[1].clientY) / 2,
      });
      const spreadOf = (t: TouchList) =>
        Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 2) return;
        last = centreOf(e.touches);
        pinch = spreadOf(e.touches);
      };
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 2 || !last) return;
        e.preventDefault(); // only for two fingers, so scrolling is untouched
        const c = centreOf(e.touches);
        moved(c.x - last.x, c.y - last.y);
        last = c;
        const s = spreadOf(e.touches);
        if (pinch > 0 && s > 0) orbit.current = zoom(orbit.current!, pinch / s);
        pinch = s;
      };
      const onTouchEnd = () => {
        last = null;
        pinch = 0;
      };

      node.style.cursor = "grab";
      node.style.touchAction = "pan-y";
      node.addEventListener("pointerdown", onPointerDown);
      node.addEventListener("pointermove", onPointerMove);
      node.addEventListener("pointerup", onPointerUp);
      node.addEventListener("pointercancel", onPointerUp);
      node.addEventListener("touchstart", onTouchStart, { passive: true });
      node.addEventListener("touchmove", onTouchMove, { passive: false });
      node.addEventListener("touchend", onTouchEnd, { passive: true });

      return () => {
        node.removeEventListener("pointerdown", onPointerDown);
        node.removeEventListener("pointermove", onPointerMove);
        node.removeEventListener("pointerup", onPointerUp);
        node.removeEventListener("pointercancel", onPointerUp);
        node.removeEventListener("touchstart", onTouchStart);
        node.removeEventListener("touchmove", onTouchMove);
        node.removeEventListener("touchend", onTouchEnd);
      };
    },
    [],
  );

  /* `active` changes; everything else does not. Keeping them apart lets the
     consumers depend on the stable half, so binding listeners does not re-run
     because a button highlight moved. */
  return { orbit, advance, to, aim, fitTo, nudgeZoom, bind, active };
}

/**
 * Arrow keys orbit, +/− zoom, and the number keys jump to a preset.
 *
 * A view you can only reach by dragging is a view some people cannot reach at
 * all. The handler only fires while the figure has focus, so it does not
 * hijack arrow keys for the rest of the page.
 */
export function useOrbitKeys(
  node: React.RefObject<HTMLElement | null>,
  api: ReturnType<typeof useOrbit>,
  presets: Preset[],
) {
  /* Depend on the stable members rather than the api object, which is a fresh
     literal every render and would re-attach the handler every render. */
  const { orbit, to, nudgeZoom } = api;
  useEffect(() => {
    const el = node.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 90 : 24;
      switch (e.key) {
        case "ArrowLeft":
          orbit.current = drag(orbit.current!, -step, 0, 360, 360);
          break;
        case "ArrowRight":
          orbit.current = drag(orbit.current!, step, 0, 360, 360);
          break;
        case "ArrowUp":
          orbit.current = drag(orbit.current!, 0, -step, 360, 360);
          break;
        case "ArrowDown":
          orbit.current = drag(orbit.current!, 0, step, 360, 360);
          break;
        case "+":
        case "=":
          nudgeZoom(0.88);
          break;
        case "-":
        case "_":
          nudgeZoom(1.14);
          break;
        default: {
          const n = Number(e.key);
          if (n >= 1 && n <= presets.length) to(presets[n - 1]);
          else return;
        }
      }
      e.preventDefault();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [node, orbit, to, nudgeZoom, presets]);
}
