"use client";

import { useCallback, useRef } from "react";
import { PRESETS, type Preset } from "@/lib/orbit";
import { useOrbit } from "./useOrbit";

/**
 * Named views, and the framing that has to go with them.
 *
 * ── Why the two are one thing ────────────────────────────────────────────────
 *
 * Offering a view means being able to get back to it, and "back to it" is not
 * a distance a preset can carry. A preset's distance was chosen against one
 * figure's proportions; put the same view in a wider, shorter panel and the
 * machine runs off the top and bottom. So choosing a whole-machine view and
 * reframing it for the panel are the same action, and separating them is how
 * one figure ends up correctly framed and the next one cropped.
 *
 * Which is exactly what happened: the fit was written for the page and the
 * bench figure kept the raw preset, needing 7.60 and being given 4.3. This is
 * the third piece of chrome to be shared for that reason, after the angles and
 * the geometry.
 *
 * A detail view is deliberately left alone. Cropping into a crown mesh is the
 * whole point of one, and fitting it would pull the camera back until the
 * thing it exists to show is a few pixels across.
 */
export function useFramedOrbit(start: Preset) {
  const view = useOrbit(start);
  const { fitTo, to, active } = view;

  /** The distance the current panel needs, once something has measured it. */
  const fitted = useRef(0);
  const framed = useRef(false);

  const onFit = useCallback(
    (d: number) => {
      fitted.current = d;
      const current = PRESETS.find((p) => p.key === active);
      /* Unknown key means the camera has been dragged off every preset, which
         leaves the subject unchanged — still the whole machine, still worth
         framing. Snapped the first time: easing in from the preset's own
         distance is a zoom nobody asked for. */
      if (current?.whole ?? true) {
        fitTo(d, !framed.current);
        framed.current = true;
      }
    },
    [fitTo, active],
  );

  const choose = useCallback(
    (p: Preset) => {
      to(p);
      if (p.whole && fitted.current) fitTo(fitted.current);
    },
    [to, fitTo],
  );

  return { ...view, onFit, choose };
}

/**
 * The buttons.
 *
 * `stack` puts them up the right edge, which suits a tall workbench figure.
 * `row` keeps them on one line that scrolls sideways — for a figure on a page,
 * where three wrapped lines of buttons over the machine is most of the figure.
 */
export function ViewPicker({
  active,
  choose,
  home,
  zoom,
  layout = "stack",
}: {
  active: string;
  choose: (p: Preset) => void;
  home: Preset;
  /** omitted where there is no room for them; the buttons still frame things */
  zoom?: (factor: number) => void;
  layout?: "stack" | "row";
}) {
  const base =
    "shrink-0 rounded-[2px] border px-2 py-1 text-[10px] uppercase tracking-[0.12em] transition-colors";
  const idle =
    "border-white/[0.14] bg-void/40 text-slate hover:border-white/30 hover:text-bone";

  const wrap =
    layout === "row"
      ? "absolute inset-x-0 bottom-16 sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-14"
      : "absolute bottom-24 left-6 sm:bottom-6 sm:left-auto sm:right-6";
  const inner =
    layout === "row"
      ? "flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:flex-col sm:items-end sm:overflow-visible sm:px-0"
      : "flex flex-wrap items-center gap-1.5 sm:flex-col sm:items-end";

  return (
    <div className={wrap}>
      <div className={inner}>
        {PRESETS.map((p, i) => (
          <button
            key={p.key}
            type="button"
            onClick={() => choose(p)}
            title={`${p.hint} — key ${i + 1}`}
            className={`${base} ${
              active === p.key ? "border-ember/60 bg-ember/10 text-ember" : idle
            }`}
          >
            {p.label}
          </button>
        ))}

        <div className={layout === "row" ? "flex shrink-0 gap-1.5" : "mt-1 flex gap-1.5"}>
          {zoom && (
            <>
              <button
                type="button"
                onClick={() => zoom(0.86)}
                aria-label="Closer"
                className={`${base} ${idle} text-[11px] leading-none`}
              >
                +
              </button>
              <button
                type="button"
                onClick={() => zoom(1.16)}
                aria-label="Further away"
                className={`${base} ${idle} text-[11px] leading-none`}
              >
                &minus;
              </button>
            </>
          )}
          <button type="button" onClick={() => choose(home)} className={`${base} ${idle}`}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
