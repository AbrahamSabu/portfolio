"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { machine } from "@/lib/assembly";
import { BACKDROP } from "@/lib/finish";
import { isLocked } from "@/lib/freewheel";
import { idleRate, rateOf } from "@/lib/motion";
import { DEFAULT_VIEW, PRESETS } from "@/lib/orbit";
import { TRAIN, peakRatio, reduction } from "@/lib/train";
import { Environment, Grade, Lights } from "./Finish";
import { Fit, Pause, Rig, machineReach, type MachineState } from "./MachineScene";
import { useApproached, useDrive, useOnScreen } from "./useDrive";
import { useOrbitKeys } from "./useOrbit";
import { ViewPicker, useFramedOrbit } from "./ViewPicker";

/**
 * The machine.
 *
 * Three families of axis, because a mechanism whose every shaft is parallel is
 * a drawing with thickness — and because two coaxial Geneva stages put the slow
 * one in front of the fast one and hid it completely. The drive turns two right
 * angles, through crown gears:
 *
 *   input shaft, horizontal   a flywheel, a spur pair, a crown pinion
 *   stage 1, vertical         four slots, a quarter turn per revolution
 *   stage 2, horizontal       three slots, standing on edge on a layshaft
 *
 * Every angle on screen is one function of one number. Positions, orientations
 * and depths come from `lib/assembly`, never from this file: the last time a
 * renderer owned that, a crank pin spent a whole build lying flat in the
 * cross's plane where no test could reach it.
 */

/**
 * The bench figure: the machine, plus everything a workbench wants on top of it.
 *
 * The machine itself moved to `MachineScene.tsx` when the freewheel went in and
 * this file did not get it — two renderers drawing two different machines, for
 * the third time. What is left here is the chrome: a seven-column readout, a
 * ratio gauge, and buttons for the six named views. None of that belongs on a
 * page, which is why it stayed behind rather than moving with the parts.
 */

export default function Stage3() {
  const hud = useRef<HTMLDivElement>(null);
  const needle = useRef<SVGLineElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const { ref: frame, visible } = useOnScreen<HTMLDivElement>();
  /* One WebGL context per figure, and this page has four of them. Browsers cap
     how many can be live at once and silently take one back when the cap is
     reached, so a figure asks for its context when somebody is on the way to
     it rather than all four on load. */
  const { ref: near, approached } = useApproached<HTMLDivElement>();
  const { advance, calm } = useDrive(ready && approached, visible);
  /* Framed, not just pointed. This figure is wide and short — aspect 2.28 —
     and the three-quarter preset's 4.3 crops the machine off the top and
     bottom of it; the panel wants 7.60. The fit was written for the page and
     this kept the raw preset, which is precisely why it is shared now. */
  const view = useFramedOrbit(DEFAULT_VIEW);
  const stage = useRef<HTMLDivElement>(null);
  useOrbitKeys(stage, view, PRESETS);
  /* Returning the cleanup matters: `bind` adds seven listeners, and an effect
     that re-runs without tearing them down stacks another seven every render. */
  useEffect(() => view.bind(stage.current), [view.bind]);

  const peak = peakRatio(TRAIN);
  const turns = reduction(TRAIN);
  const reach = useMemo(machineReach, []);

  const onState = ({ angles, hub, spin }: MachineState) => {
    const s = angles.train;
    const el = hud.current;
    if (!el) return;
    const set = (k: string, v: string) => {
      const n = el.querySelector(`[data-k="${k}"]`);
      if (n && n.textContent !== v) n.textContent = v;
    };
    const station = (n: number, of: number) => (((-n % of) + of) % of) + 1;

    set("input", `${(s.driver / (Math.PI * 2)).toFixed(2)} rev`);
    set("fast", s.stage1.engaged ? "INDEXING" : "LOCKED");
    set("slow", s.stage2.engaged ? "INDEXING" : "LOCKED");
    set("st1", `${station(s.stage1.station, TRAIN.stage1.slots)} / ${TRAIN.stage1.slots}`);
    set("st2", `${station(s.stage2.station, TRAIN.stage2.slots)} / ${TRAIN.stage2.slots}`);
    set("ratio", s.ratio.toFixed(2));
    set("drive", `${(rateOf({ angle: 0, spin }) / idleRate()).toFixed(2)}×`);
    /* The one part whose state is not a function of the input angle. */
    set("out", isLocked(hub) ? "DRIVEN" : `${Math.abs(hub.rate).toFixed(2)} rad/s`);

    /* Written straight to the DOM from the frame loop; routing it through React
       state would re-render the page sixty times a second to move one line. */
    if (needle.current) {
      const a = (-135 + Math.min(1, Math.abs(s.ratio) / peak) * 270) * (Math.PI / 180);
      needle.current.setAttribute("x2", String(60 + Math.sin(a) * 42));
      needle.current.setAttribute("y2", String(58 - Math.cos(a) * 42));
    }
  };

  return (
    <div ref={frame} className="relative h-full w-full">
      <div ref={near} aria-hidden className="absolute inset-0" />
      {ready && approached && (
        <Canvas
          camera={{ position: [-2, -4.6, 1.7], fov: 34, up: [0, 0, 1] }}
          /* The figure sits on a dark panel; the backdrop keeps the metals
             from reflecting a bright page behind them. */
          scene={{ background: new THREE.Color(BACKDROP) }}
          dpr={[1, 1.75]}
          resize={{ debounce: 0 }}
          shadows
          style={{ width: "100%", height: "100%", display: "block" }}
          gl={{
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: process.env.NODE_ENV !== "production",
          }}
          onCreated={(state) => {
            state.camera.up.set(0, 0, 1);
            if (process.env.NODE_ENV !== "production") {
              (window as unknown as Record<string, unknown>).__geneva = state;
            }
          }}
        >
          <Grade />
          <Environment />
          <Lights reach={reach} />
          <Fit onFit={view.onFit} />
          <Rig onState={onState} advance={advance} look={view.advance} />
          <Pause visible={visible} />
        </Canvas>
      )}

      {/* The surface that takes drags. It has to come AFTER the canvas: painted
          before it, the canvas sits on top and swallows every pointer event, so
          the figure looks draggable and is not. The buttons below come after
          this in turn, so they stay clickable through it. */}
      <div
        ref={stage}
        tabIndex={0}
        aria-label="Geneva drive. Drag to orbit, arrow keys to turn, number keys for a named view."
        className="absolute inset-0 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ember/40"
      />

      <div className="pointer-events-none absolute right-5 top-5">
        <svg width="120" height="80" viewBox="0 0 120 80" aria-hidden>
          <path
            d="M 30 58 A 42 42 0 0 1 90 58"
            fill="none"
            stroke="currentColor"
            className="text-white/15"
            strokeWidth="1"
          />
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const a = (-135 + f * 270) * (Math.PI / 180);
            return (
              <line
                key={f}
                x1={60 + Math.sin(a) * 36}
                y1={58 - Math.cos(a) * 36}
                x2={60 + Math.sin(a) * 43}
                y2={58 - Math.cos(a) * 43}
                stroke="currentColor"
                className="text-white/25"
                strokeWidth="1"
              />
            );
          })}
          <line
            ref={needle}
            x1="60"
            y1="58"
            x2="60"
            y2="16"
            stroke="currentColor"
            className="text-ember"
            strokeWidth="1.6"
          />
          <circle cx="60" cy="58" r="2.6" className="fill-ember" />
          <text
            x="60"
            y="74"
            textAnchor="middle"
            className="fill-slate"
            style={{ fontSize: 9, letterSpacing: "0.1em" }}
          >
            d&#966;/d&#952; &#8212; 0 TO {peak.toFixed(0)}
          </text>
        </svg>
      </div>

      <div className="pointer-events-none absolute left-6 top-5 text-[10px] uppercase tracking-[0.14em] text-slate">
        {turns} input turns per output turn
        <span className="ml-3 text-brass">
          {calm.current ? "reduced motion" : "scroll to drive it · drag to look"}
        </span>
      </div>

      <ViewPicker
        active={view.active}
        choose={view.choose}
        home={DEFAULT_VIEW}
        zoom={view.nudgeZoom}
      />

      <div
        ref={hud}
        className="pointer-events-none absolute inset-x-0 bottom-0 grid grid-cols-2 gap-x-4 gap-y-3 p-6 pb-6 sm:grid-cols-4 sm:pr-44 xl:grid-cols-8"
      >
        {[
          ["Turns", "input"],
          ["Drive", "drive"],
          ["Fast stage", "fast"],
          ["Station", "st1"],
          ["Slow stage", "slow"],
          ["Station", "st2"],
          ["Output dφ/dθ", "ratio"],
          ["Freewheel", "out"],
        ].map(([label, k], i) => (
          <div key={`${k}${i}`}>
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
      </div>
    </div>
  );
}
