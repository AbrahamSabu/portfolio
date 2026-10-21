"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import * as THREE from "three";
import { Environment, Grade, Lights } from "@/components/geneva/Finish";
import { Rig, machineReach, type MachineState } from "@/components/geneva/MachineScene";
import { useDrive } from "@/components/geneva/useDrive";
import { useOrbit } from "@/components/geneva/useOrbit";
import { STAGES, easeShown, installAt, type PartKey, type Reading } from "@/lib/build";
import { FOV, finishedShot, shotFor } from "@/lib/director";
import { SITE_DRIVE } from "@/lib/motion";
import { anchorPoint, viewFor } from "@/lib/story";

/**
 * The one WebGL context on the page.
 *
 * Mounted once, inside the fixed well, and never torn down while the page is
 * open. Browsers cap live contexts and reclaim one at the limit without
 * warning, and an earlier version of this site lost its third canvas every
 * time — a blank panel that looks exactly like one that failed to size itself.
 * One context for the whole document means there is nothing to lose.
 *
 * ── The canvas is the well, not the viewport ─────────────────────────────────
 *
 * A full-bleed canvas with a scrim over the text would have drawn twice the
 * pixels to render a machine that then had to be pushed off-centre and half
 * covered so the words stayed legible. The canvas fills only the space the
 * machine is framed into, transparent, and the text column is beside it.
 *
 * ── Step 3: a view per stage, and labels ─────────────────────────────────────
 *
 * The camera follows the stage the reader is on — see `lib/director.ts`, where
 * the framing is solved and checked at every well shape the page produces —
 * and each stage's parts are named as they land.
 */
export default function MachineCanvas({
  reading,
  rest,
  narrow,
}: {
  /** where the reader is in the build, measured by the page — see useDocumentProgress */
  reading: React.RefObject<Reading>;
  /** the reader has stopped at the freewheel: bring the machine to rest */
  rest: React.RefObject<boolean>;
  /** a phone, give or take: lower pixel ratio, no shadows */
  narrow: boolean;
}) {
  /* The site's drive, not the workbench's: its flywheel resists a shove,
     because the page prints a sentence saying so. */
  /* The rest the drive obeys: the page's, once the build shown has caught up. */
  const resting = useRef(false);
  const { advance } = useDrive(true, undefined, undefined, SITE_DRIVE, resting);
  const view = useOrbit(viewFor(STAGES[0].view));
  const reach = useMemo(machineReach, []);
  const labels = useRef<(HTMLDivElement | null)[]>([]);

  /* The build as shown: the reader's position, eased in time. Read from a ref
     inside the frame loop, so the machine assembles without React rendering
     anything. */
  const shown = useRef<number | null>(null);
  const install = useCallback(
    (part: PartKey) => installAt(shown.current ?? reading.current?.progress ?? 1, part),
    [reading],
  );

  /* Nothing reads the machine's state on the page. */
  const onState = useCallback((_: MachineState) => {}, []);

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [-2, -4.6, 1.7], fov: FOV, up: [0, 0, 1] }}
        /* Rendered above the screen's own density — 2x even on a 1x monitor,
           which is supersampling: the machine's edges and teeth come out clean
           rather than stepped. Phones stop at 1.75x, not their native 3x: a
           quarter of a million vertices at 3x is a warm phone and a dropped
           frame. */
        dpr={narrow ? [1.25, 1.75] : [2, 2.5]}
        shadows={!narrow}
        resize={{ debounce: 0 }}
        style={{ width: "100%", height: "100%", display: "block" }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={(s) => s.camera.up.set(0, 0, 1)}
      >
        <Grade />
        <Environment />
        <Lights reach={reach} boost={1.2} />
        <Ease reading={reading} shown={shown} rest={rest} resting={resting} />
        <Rig onState={onState} advance={advance} look={view.advance} install={install} />
        <Director aim={view.aim} reading={reading} shown={shown} labels={labels} />
      </Canvas>

      {ANCHORS.map((a, i) => (
        <div
          key={`${a.stage}-${a.label}`}
          ref={(el) => {
            labels.current[i] = el;
          }}
          /* Positioned from the frame loop; starts invisible so nothing flashes
             at the top-left corner before the first projection. */
          className="pointer-events-none absolute left-0 top-0 flex items-center gap-2 whitespace-nowrap opacity-0 transition-opacity duration-500"
          style={{ willChange: "transform, opacity" }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ember shadow-[0_0_0_3px_rgba(16,19,21,0.7)]" />
          {/* On a tag rather than a text shadow. The dot has to sit on its
              part, so on a 375px band the words often cross the standard or a
              shaft; a shadow only blurs that collision, a ground under the
              words removes it. */}
          <span className="rounded-[2px] border border-white/10 bg-void/85 px-1.5 py-[3px] font-mono text-[11px] uppercase leading-none tracking-[0.14em] text-bone">
            {a.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Every label on every stage, each its own element.
 *
 * Not one slot per position with the words swapped in. A slot changing its
 * text while it is still visible reads as a flicker — the old name, the new
 * name, then a fade — and a label per anchor simply crossfades: the stage that
 * finished lets its labels go while the next one's arrive with its parts.
 */
const ANCHORS = STAGES.flatMap((s, index) =>
  s.anchors.map((a) => ({
    stage: s.key,
    index,
    label: a.label,
    point: new THREE.Vector3(...anchorPoint(a)),
  })),
);

/**
 * The build as shown, stepped each frame by `easeShown` — eased, and never
 * faster than a part per half second. See lib/build.ts.
 *
 * Registered before `Rig`, so the scene reads this frame's value.
 */
function Ease({
  reading,
  shown,
  rest,
  resting,
}: {
  reading: React.RefObject<Reading>;
  shown: React.RefObject<number | null>;
  rest: React.RefObject<boolean>;
  resting: React.RefObject<boolean>;
}) {
  useFrame((_, dt) => {
    const target = reading.current?.progress ?? 1;
    if (shown.current === null) {
      /* The first frame lands exactly: easing in from nothing would rebuild
         the machine in front of someone who arrived half way down. */
      shown.current = target;
    } else {
      shown.current = easeShown(shown.current, target, dt);
    }
    /* The machine only comes to rest once the freewheel has actually been
       seen to arrive — never while it is still sliding in. */
    resting.current = (rest.current ?? false) && shown.current >= 1 - 1e-6;
  });
  return null;
}

/**
 * Points the camera and places the labels.
 *
 * Driven, never offered. There is no drag surface on this page: one finger
 * always scrolls, and a camera the reader can put anywhere is a camera that is
 * usually pointed at nothing.
 *
 * Registered after `Rig`, so its frame runs after the camera has been placed
 * for this one — the labels are projected through the camera the reader is
 * actually looking through, not last frame's.
 */
function Director({
  aim,
  reading,
  shown,
  labels,
}: {
  aim: ReturnType<typeof useOrbit>["aim"];
  reading: React.RefObject<Reading>;
  shown: React.RefObject<number | null>;
  labels: React.RefObject<(HTMLDivElement | null)[]>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const r = reading.current;
    /* Labels follow the parts as shown, so a name never arrives before the
       part it names has caught up. */
    const p = shown.current ?? r?.progress ?? 1;
    const aspect = size.height > 0 ? size.width / size.height : 1;
    const shot = r?.past
      ? finishedShot(aspect, FOV)
      : shotFor(r?.focus ?? { index: STAGES.length - 1, within: 1 }, aspect, FOV);
    aim(shot.preset, { azimuth: shot.azimuth, distance: shot.distance });

    /* How seated the focused stage's parts are. A label comes in with the
       thing it names — a name floating over an empty space reads as a
       mistake — except the first stage's, which point at where things WILL
       go and say so. */
    const parts = shot.stage.parts;
    let seated = 1;
    for (const part of parts) seated = Math.min(seated, installAt(p, part));

    camera.updateMatrixWorld();
    for (let i = 0; i < ANCHORS.length; i++) {
      const el = labels.current?.[i];
      if (!el) continue;
      const a = ANCHORS[i];
      if (a.index !== shot.index) {
        el.style.opacity = "0";
        continue;
      }
      v.copy(a.point).project(camera);
      /* Behind the camera projects to a mirrored point in front of it, and
         past the glass there is nothing to point at. */
      if (v.z > 1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) {
        el.style.opacity = "0";
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      /* The words hang off whichever side of the dot has room for them —
         measured, not "past the middle", because on a phone the band is 375px
         wide and a label is nearly two hundred: from the middle it runs off
         the edge. The dot stays exactly on the part either way. */
      const w = el.offsetWidth;
      const roomRight = size.width - x;
      const flip = roomRight < w + 6 && x > roomRight;
      el.style.flexDirection = flip ? "row-reverse" : "row";
      el.style.transform = flip
        ? `translate(${x + 3}px, ${y}px) translate(-100%, -50%)`
        : `translate(${x - 3}px, ${y}px) translateY(-50%)`;
      el.style.opacity = seated.toFixed(3);
    }
  });
  return null;
}
