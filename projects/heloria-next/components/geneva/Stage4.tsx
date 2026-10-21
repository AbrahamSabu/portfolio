"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { anglesAt } from "@/lib/drive";
import { BACKDROP } from "@/lib/finish";
import { FREEWHEEL, isLocked, releaseSlip } from "@/lib/freewheel";
import { PRESETS } from "@/lib/orbit";
import { TRAIN } from "@/lib/train";
import { Environment, Grade, Lights } from "./Finish";
import {
  Fit,
  Pause,
  Rig,
  machineReach,
  type MachineState,
} from "./MachineScene";
import { useApproached, useDrive, useOnScreen } from "./useDrive";
import { useOrbitKeys } from "./useOrbit";
import { ViewPicker, useFramedOrbit } from "./ViewPicker";

/**
 * The freewheel figure.
 *
 * Opens on the clutch, because that is what this step is about: the cam is a
 * fifteen-percent change in radius and the rollers shuttle six degrees, so at
 * the distance the whole mechanism is framed from it is a ring with some
 * orange in it. The readouts are the clutch's own — engaged or free, whether
 * its drive is even moving, what the hub is doing, and how far down their ramps
 * the rollers have run.
 *
 * ── It draws the whole machine ───────────────────────────────────────────────
 *
 * It did not, and that was wrong twice over.
 *
 * A scene holding only the output end needs its own copy of where the star, the
 * rollers and the hub go — a third copy, and one outside the guard that checks
 * the other two agree. The roller offset bug had to be found and fixed in both
 * of them for exactly that reason.
 *
 * And it makes every view but one a lie. Point the camera at the input crown
 * and there is nothing there, because this scene never drew it.
 *
 * So it is the same machine as every other figure, framed close. Being able to
 * pull back out to the whole is the point of offering the views at all: a
 * detail with no way back is a photograph rather than a model.
 */

const CLUTCH_VIEW = PRESETS.find((p) => p.key === "clutch") ?? PRESETS[0];

export default function Stage4() {
  const hud = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const { ref: frame, visible } = useOnScreen<HTMLDivElement>();
  /* One WebGL context per figure, and this page has four. Browsers cap how many
     can be live and quietly take one back at the limit, so a figure asks for
     its context when somebody is on the way to it. */
  const { ref: near, approached } = useApproached<HTMLDivElement>();
  const { advance, calm } = useDrive(ready && approached, visible);

  const view = useFramedOrbit(CLUTCH_VIEW);
  const stage = useRef<HTMLDivElement>(null);
  useOrbitKeys(stage, view, PRESETS);
  useEffect(() => view.bind(stage.current), [view.bind]);

  const reach = useMemo(machineReach, []);

  /* The slow cross at its fastest, for scaling the bar. Solved rather than
     guessed, so it still means something if the train is ever retuned. */
  const peakRate = useMemo(() => {
    let peak = 0;
    for (let k = 0; k < 4000; k++) {
      const a = anglesAt((k / 4000) * Math.PI * 2 * 9, TRAIN);
      peak = Math.max(peak, Math.abs(a.train.stage2.ratio));
    }
    return peak;
  }, []);

  const onState = ({ angles, hub }: MachineState) => {
    const el = hud.current;
    if (!el) return;
    const set = (k: string, v: string) => {
      const n = el.querySelector(`[data-k="${k}"]`);
      if (n && n.textContent !== v) n.textContent = v;
    };
    set("clutch", isLocked(hub) ? "ENGAGED" : "FREE");
    set("star", angles.train.stage2.engaged ? "INDEXING" : "STOPPED");
    set("hub", `${Math.abs(hub.rate).toFixed(2)} rad/s`);
    set("roll", `${((hub.slip / releaseSlip(FREEWHEEL)) * 100).toFixed(0)}%`);

    /* Straight to the DOM from the frame loop. React state here would re-render
       the page sixty times a second to move one bar. */
    if (bar.current) {
      const w = Math.min(1, Math.abs(hub.rate) / Math.max(peakRate, 1e-6));
      bar.current.style.transform = `scaleX(${w.toFixed(4)})`;
    }
  };

  return (
    <div ref={frame} className="relative h-full w-full">
      <div ref={near} aria-hidden className="absolute inset-0" />

      {ready && approached && (
        <Canvas
          camera={{ position: [3.2, -0.3, 1.5], fov: 34, up: [0, 0, 1] }}
          scene={{ background: new THREE.Color(BACKDROP) }}
          dpr={[1, 1.75]}
          resize={{ debounce: 0 }}
          shadows
          style={{ width: "100%", height: "100%", display: "block" }}
          gl={{ antialias: true, alpha: true }}
          onCreated={(state) => state.camera.up.set(0, 0, 1)}
        >
          <Grade />
          <Environment />
          <Lights reach={reach} />
          <Fit onFit={view.onFit} />
          <Rig onState={onState} advance={advance} look={view.advance} />
          <Pause visible={visible} />
        </Canvas>
      )}

      {/* After the canvas, or the canvas paints over it and eats every drag. */}
      <div
        ref={stage}
        tabIndex={0}
        aria-label="Freewheel — drag to look"
        className="absolute inset-0 outline-none focus-visible:ring-1 focus-visible:ring-ember/40"
      />

      <div className="pointer-events-none absolute left-6 top-5 text-[10px] uppercase tracking-[0.14em] text-slate">
        Fig. 04 — Roller freewheel, 6 rollers
        <span className="ml-3 text-brass">
          {calm.current ? "reduced motion" : "scroll to drive it · drag to look"}
        </span>
      </div>

      <ViewPicker
        active={view.active}
        choose={view.choose}
        home={CLUTCH_VIEW}
        zoom={view.nudgeZoom}
      />

      <div
        ref={hud}
        className="pointer-events-none absolute inset-x-0 bottom-0 grid grid-cols-2 gap-x-4 gap-y-3 p-6 sm:grid-cols-4 sm:pr-44"
      >
        {[
          ["Clutch", "clutch"],
          ["Its drive", "star"],
          ["The hub", "hub"],
          ["Rollers run down", "roll"],
        ].map(([label, k]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate">
              {label}
            </div>
            <div
              data-k={k}
              className="mt-1 font-tight text-[15px] tabular-nums text-ember"
            >
              &mdash;
            </div>
          </div>
        ))}
        <div className="col-span-2 sm:col-span-4">
          <div className="h-[2px] w-full bg-white/[0.09]">
            <div
              ref={bar}
              className="h-full origin-left bg-ember"
              style={{ transform: "scaleX(0)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
