"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  CROWN_IN,
  CROWN_OUT,
  FLYWHEEL_R,
  GEAR_BEVEL,
  PINION_IN,
  PINION_OUT,
  SPUR_LOW,
  SPUR_TOP,
  machine,
  type ShaftKey,
} from "@/lib/assembly";
import { APPROACH } from "@/lib/approach";
import { BUILD_ORDER, type PartKey } from "@/lib/build";
import { crownGeometry } from "@/lib/crown";
import { anglesAt, type Angles } from "@/lib/drive";
import { flywheelShape } from "@/lib/flywheel";
import {
  FREEWHEEL,
  HUB,
  camProfile,
  hubShape,
  restHub,
  rollerPlacements,
  starShape,
  stepHub,
  type HubState,
} from "@/lib/freewheel";
import { gearShape } from "@/lib/gears";
import { partGeometry, shaftGeometry } from "@/lib/partGeometry";
import {
  axleGeometry,
  crankShape,
  crossShape,
  extrude,
  lockDiscShape,
} from "@/lib/genevaParts";
import { fitDistance, lookAtOf, positionOf, type Orbit } from "@/lib/orbit";
import { TRAIN } from "@/lib/train";
import { Axle } from "./Axle";
import { Metal } from "./Finish";

/**
 * The machine itself, with no chrome on it.
 *
 * ── Why this is its own file ─────────────────────────────────────────────────
 *
 * It was not, and the renderers diverged for the third time. `lib/shot.mts` and
 * the bench figure each kept their own list of parts, so when the freewheel was
 * added to the stills the interactive scene went on showing a machine that
 * stopped at the slow cross — the same class of fault as the input spur pair
 * turning the same way, and the reason `lib/drive.ts` exists at all.
 *
 * Angles already had one home. Geometry did not. It does now: a scene is this
 * component plus whatever readouts and buttons wrap it, and adding a part means
 * adding it once.
 *
 * ── What still lives outside ─────────────────────────────────────────────────
 *
 * Where the camera goes, what the HUD says, and whether there are view buttons.
 * Those genuinely differ between a workbench figure and a page, and forcing
 * them together would put a seven-column readout on a phone.
 */

export type MachineState = {
  angles: Angles;
  hub: HubState;
  /** the decaying part of the input velocity, for a drive readout */
  spin: number;
};

export type Advance = (dt: number) => { angle: number; spin: number };

/* How far, and from which end of its shaft, each part slides in: see
   lib/approach.ts, where every entry is checked against the real geometry so
   that nothing passes through anything on its way. One length for every part
   used to put the input pinion through the spur gear beside it. */

export type Install = (part: PartKey) => number;

/**
 * One named part, wrapped so the assembly can slide it into place.
 *
 * Defined at module scope, not inside `Machine`. A component declared during
 * render is a new type every render, so React would tear down the mesh and
 * rebuild its geometry each time — which for twenty-four parts is the whole
 * machine, discarded and re-extruded.
 */
function Part({
  name,
  registry,
  children,
}: {
  name: PartKey;
  registry: React.RefObject<Partial<Record<PartKey, THREE.Group | null>>>;
  children: React.ReactNode;
}) {
  return (
    <group
      ref={(g) => {
        registry.current[name] = g;
      }}
    >
      {children}
    </group>
  );
}

/** A group pinned to one of the machine's frames. */
export function Mount({
  matrix,
  children,
}: {
  matrix: THREE.Matrix4;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.matrix.copy(matrix);
      ref.current.matrixWorldNeedsUpdate = true;
    }
  }, [matrix]);
  return (
    <group ref={ref} matrixAutoUpdate={false}>
      {children}
    </group>
  );
}

export function Machine({
  onState,
  advance,
  install,
}: {
  onState: (s: MachineState) => void;
  advance: Advance;
  /**
   * How far each part has been installed, 0 to 1.
   *
   * Absent means a finished machine, which is what the workbench figures want:
   * they exist to interrogate a mechanism, not to watch one being made.
   */
  install?: Install;
}) {
  const M = useMemo(() => machine(TRAIN), []);
  const { d1, d2, frames: F, z, t } = M;

  const inputTopSpin = useRef<THREE.Group>(null);
  const inputLowSpin = useRef<THREE.Group>(null);
  const crownInSpin = useRef<THREE.Group>(null);
  const driver1 = useRef<THREE.Group>(null);
  const cross1 = useRef<THREE.Group>(null);
  const crownOutSpin = useRef<THREE.Group>(null);
  const pinionOut = useRef<THREE.Group>(null);
  const geneva2 = useRef<THREE.Group>(null);
  const cross2 = useRef<THREE.Group>(null);
  const starRef = useRef<THREE.Group>(null);
  const hubRef = useRef<THREE.Group>(null);
  const rollers = useRef<(THREE.Mesh | null)[]>([]);
  const parts = useRef<Partial<Record<PartKey, THREE.Group | null>>>({});

  /* The cam outline never changes; only where the rollers sit on it does.
     `rollerPlacements` bisects against every segment of this polygon, so
     rebuilding it per frame would do that from scratch sixty times a second. */
  const profile = useMemo(() => camProfile(FREEWHEEL), []);

  /* One geometry list, shared with the software renderer, so a bore cut
     here is the bore the stills show — see lib/partGeometry.ts. */
  const G = useMemo(() => partGeometry(M), [M]);

  useEffect(() => () => Object.values(G).forEach((g) => g.dispose()), [G]);

  /* The hub is the only stateful thing here. Every other angle is a function of
     the input angle alone; this one depends on how it got here, because it sits
     on the far side of a clutch that has usually let go. A ref, not state. */
  const hub = useRef<HubState>(restHub());
  const lastCross = useRef<number | null>(null);

  useFrame((_, dt) => {
    /* The input angle comes from the drive — which idles forward and takes a
       shove from the scroll wheel — and every other angle from lib/drive.ts.
       This file used to work some of them out for itself and got the input
       pair wrong: both gears of a mesh were handed the same value, so two
       wheels that should counter-rotate turned together. */
    const step = Math.min(0.1, Math.max(0, dt));
    const d = advance(step);
    const a = anglesAt(d.angle, TRAIN);

    if (inputTopSpin.current) inputTopSpin.current.rotation.z = a.spurTop;
    if (inputLowSpin.current) inputLowSpin.current.rotation.z = a.spurLow;
    if (crownInSpin.current) crownInSpin.current.rotation.z = -a.driver1;
    if (driver1.current) driver1.current.rotation.z = a.driver1;
    if (cross1.current) cross1.current.rotation.z = a.cross1;
    /* Not negated: there is no flip above it to undo. */
    if (crownOutSpin.current) crownOutSpin.current.rotation.z = a.cross1;
    if (pinionOut.current) pinionOut.current.rotation.z = a.driver2;
    if (geneva2.current) geneva2.current.rotation.z = a.crank2;
    if (cross2.current) cross2.current.rotation.z = a.cross2;

    /* The clutch. Its driver's rate is differenced from the cross rather than
       read off the solver's ratio, because a clutch wedges on radians per
       second and the ratio is per radian of input. */
    if (lastCross.current === null) lastCross.current = a.cross2;
    const starRate = step > 0 ? (a.cross2 - lastCross.current) / step : 0;
    lastCross.current = a.cross2;
    hub.current = stepHub(hub.current, starRate, step, HUB);

    if (starRef.current) starRef.current.rotation.z = a.cross2;
    if (hubRef.current) hubRef.current.rotation.z = hub.current.angle;
    const places = rollerPlacements(hub.current.slip, FREEWHEEL, profile);
    for (let i = 0; i < places.length; i++) {
      const m = rollers.current[i];
      /* The offset too, not just x and y. Setting z to 0 here silently undid
         the `position={[0, 0, z.freewheel]}` in the JSX below and parked all
         six rollers in the cross's own plane, a shaft-length away from the cam
         they are supposed to be wedged against. */
      if (m) m.position.set(places[i].x, places[i].y, z.freewheel);
    }

    /* The assembly. Each part slides along its own shaft's axis — which is the
       local Z of whatever frame it is mounted in, so this one line is correct
       for a vertical shaft and a horizontal one alike. */
    if (install) {
      for (const key of BUILD_ORDER) {
        const g = parts.current[key];
        if (!g) continue;
        const at = install(key);
        g.visible = at > 0.002;
        const a = APPROACH[key];
        g.position.z = (1 - at) * a.dir * a.length;
      }
    }

    onState({ angles: a, hub: hub.current, spin: d.spin });
  });

  /** A shaft, lying along its frame's own axis, as `lib/assembly.ts` defines it. */
  const Shaft = ({ of }: { of: ShaftKey }) => {
    const s = shaftGeometry(M, of);
    return (
      <Axle radius={s.radius} length={s.length} segments={18} position={[0, 0, s.at]} castShadow>
        <Metal of="shaft" />
      </Axle>
    );
  };

  const Roller = ({ r, len, at }: { r: number; len: number; at: number }) => (
    <Axle radius={r} length={len} segments={28} position={[at, 0, 0]} castShadow>
      <Metal of="roller" />
    </Axle>
  );

  const mid = new THREE.Vector3()
    .addVectors(M.bounds.min, M.bounds.max)
    .multiplyScalar(0.5);

  return (
    <group position={[-mid.x, -mid.y, -mid.z]}>
      {/* ------------------------------------------------------ input shaft */}
      <Mount matrix={F.inputTop.matrix}>
        <group ref={inputTopSpin}>
          <Part name="flywheel" registry={parts}>
  <mesh geometry={G.flywheel} position={[0, 0, z.flywheel]} castShadow receiveShadow>
              <Metal of="iron" />
            </mesh>
</Part>
          <Part name="spurTop" registry={parts}>
  <mesh geometry={G.spurTop} position={[0, 0, z.spurTop]} castShadow receiveShadow>
              <Metal of="spur" />
            </mesh>
</Part>
        </group>
        <Part name="shaftInput" registry={parts}>
          <Shaft of="shaftInput" />
        </Part>
      </Mount>

      <Mount matrix={F.inputLow.matrix}>
        <group ref={inputLowSpin}>
          <Part name="spurLow" registry={parts}>
  <mesh geometry={G.spurLow} position={[0, 0, z.spurLow]} castShadow receiveShadow>
              <Metal of="spur" />
            </mesh>
</Part>
          {/* Explicitly at its offset, even though the offset is zero. The
              stills place it with `z.pinionIn` and this placed it at the frame
              origin, so the two agreed only for as long as that number stayed
              0 — a divergence already written, waiting for someone to move a
              shaft. */}
          <Part name="pinionIn" registry={parts}>
  <mesh geometry={G.pinionIn} position={[0, 0, z.pinionIn]} castShadow receiveShadow>
              <Metal of="brass" />
            </mesh>
</Part>
        </group>
        <Part name="shaftLow" registry={parts}>
          <Shaft of="shaftLow" />
        </Part>
      </Mount>

      {/* --------------------------------------------------- stage 1 driver */}
      <Mount matrix={F.driver1.matrix}>
        {/* Teeth downward, so the part is flipped — and the spin inside the
            flip runs the other way to undo it. */}
        <Part name="crownIn" registry={parts}>
          <group position={[0, 0, z.crownIn]} rotation={[Math.PI, 0, 0]}>
            <group ref={crownInSpin}>
              <mesh geometry={G.crownIn} castShadow receiveShadow>
                <Metal of="brass" />
              </mesh>
            </group>
          </group>
        </Part>
        <group ref={driver1}>
          <Part name="crank1" registry={parts}>
  <mesh geometry={G.crank1} position={[0, 0, z.crank1]} castShadow receiveShadow>
              <Metal of="crank" />
            </mesh>
</Part>
          <Part name="disc1" registry={parts}>
  <mesh geometry={G.disc1} position={[0, 0, z.datum1]} castShadow receiveShadow>
              <Metal of="cross" />
            </mesh>
</Part>
          <Part name="pin1" registry={parts}>
            <group position={[0, 0, z.datum1]}>
              <Roller r={d1.pin} len={t.plate * 1.24} at={d1.crank} />
            </group>
          </Part>
        </group>
        <Part name="shaftDriver1" registry={parts}>
          <Shaft of="shaftDriver1" />
        </Part>
      </Mount>

      {/* ---------------------------------------------------- stage 1 cross */}
      <Mount matrix={F.cross1.matrix}>
        <group ref={cross1}>
          <Part name="cross1" registry={parts}>
  <mesh geometry={G.cross1} position={[0, 0, z.datum1]} castShadow receiveShadow>
              <Metal of="cross" />
            </mesh>
</Part>
        </group>
        {/* Teeth up, so no flip — unlike crown IN. This one sits on top of the
            cross with its pinion above it, which is what lets stage 2 stack
            over stage 1 rather than hang beside it. */}
        <Part name="crownOut" registry={parts}>
          <group position={[0, 0, z.crownOut]}>
            <group ref={crownOutSpin}>
              <mesh geometry={G.crownOut} castShadow receiveShadow>
                <Metal of="brass" />
              </mesh>
            </group>
          </group>
        </Part>
        <Part name="shaftCross1" registry={parts}>
          <Shaft of="shaftCross1" />
        </Part>
      </Mount>

      {/* --------------------------------------------- stage 2, on its edge */}
      <Mount matrix={F.driver2.matrix}>
        <group ref={pinionOut}>
          <Part name="pinionOut" registry={parts}>
  <mesh geometry={G.pinionOut} position={[0, 0, z.pinionOut]} castShadow receiveShadow>
              <Metal of="brass" />
            </mesh>
</Part>
        </group>
        <Part name="shaftDriver2" registry={parts}>
          <Shaft of="shaftDriver2" />
        </Part>
      </Mount>

      <Mount matrix={F.geneva2.matrix}>
        <group ref={geneva2}>
          <Part name="crank2" registry={parts}>
  <mesh geometry={G.crank2} position={[0, 0, z.crank2]} castShadow receiveShadow>
              <Metal of="crank" />
            </mesh>
</Part>
          <Part name="disc2" registry={parts}>
  <mesh geometry={G.disc2} position={[0, 0, z.datum2]} castShadow receiveShadow>
              <Metal of="crossSlow" />
            </mesh>
</Part>
          <Part name="pin2" registry={parts}>
            <group position={[0, 0, z.datum2]}>
              <Roller r={d2.pin} len={d2.thickness * 1.24} at={d2.crank} />
            </group>
          </Part>
        </group>
      </Mount>

      <Mount matrix={F.cross2.matrix}>
        <group ref={cross2}>
          <Part name="cross2" registry={parts}>
  <mesh geometry={G.cross2} position={[0, 0, z.datum2]} castShadow receiveShadow>
              <Metal of="crossSlow" />
            </mesh>
</Part>
        </group>

        {/* ------------------------------------------------- the freewheel */}
        <Part name="star" registry={parts}>
        <group ref={starRef}>
          <mesh geometry={G.star} position={[0, 0, z.freewheel]} castShadow receiveShadow>
            <Metal of="crank" />
          </mesh>
          {Array.from({ length: FREEWHEEL.rollers }, (_, i) => (
            <mesh
              key={i}
              ref={(m) => {
                rollers.current[i] = m;
              }}
              geometry={G.roller}
              position={[0, 0, z.freewheel]}
              castShadow
            >
              <Metal of="roller" />
            </mesh>
          ))}
        </group>
        </Part>
        <group ref={hubRef}>
          <Part name="hub" registry={parts}>
  <mesh geometry={G.hub} position={[0, 0, z.freewheel]} castShadow receiveShadow>
              <Metal of="cross" />
            </mesh>
</Part>
        </group>

        <Part name="shaftCross2" registry={parts}>
          <Shaft of="shaftCross2" />
        </Part>
      </Mount>

      {/* ------------------------------------------------ the standard */}
      {/* Carries the outboard end of stage 2's layshaft. It arrives with the
          shafts, because it is one of them as far as the assembly goes: it is
          structure, and structure is what goes in before anything turns. */}
      <Part name="standard" registry={parts}>
        <mesh
          position={[M.post.x, M.post.y, M.post.h / 2]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[M.post.w, M.post.d, M.post.h]} />
          <Metal of="frame" />
        </mesh>
      </Part>

      {/* ---------------------------------------------------------- the bed */}
      <Part name="bed" registry={parts}>
      <mesh position={[M.bed.cx, M.bed.cy, -t.plate * 0.4]} receiveShadow>
        <boxGeometry args={[M.bed.w, M.bed.d, M.bed.thickness]} />
        <Metal of="bed" />
      </mesh>
      </Part>
    </group>
  );
}

/** Puts the camera wherever the orbit says, and draws the machine. */
export function Rig({
  onState,
  advance,
  look,
  install,
}: {
  onState: (s: MachineState) => void;
  advance: Advance;
  look: (dt: number) => Orbit;
  install?: Install;
}) {
  const { camera } = useThree();

  useFrame((_, dt) => {
    /* The camera is wherever the orbit says. It used to lean a few degrees
       toward the pointer, which proves the machine has depth and is nowhere
       near enough to look at anything — the whole point of turning the drive
       through two right angles is that there are three families of axis to
       see, and none of them are visible from one fixed angle. */
    const o = look(dt);
    const [x, y, z] = positionOf(o);
    const [tx, ty, tz] = lookAtOf(o);
    camera.position.set(x, y, z);
    camera.up.set(0, 0, 1);
    camera.lookAt(tx, ty, tz);
  });

  return <Machine onState={onState} advance={advance} install={install} />;
}

/**
 * Stops rendering when the figure is off screen.
 *
 * A WebGL canvas with a quarter of a million vertices and a 2048² shadow map
 * does not stop costing anything when it scrolls away — R3F keeps drawing and
 * the fan keeps running. Two thirds of both pages that use this are text.
 */
export function Pause({ visible }: { visible: React.RefObject<boolean> }) {
  const set = useThree((s) => s.setFrameloop);
  const current = useRef(true);
  useEffect(() => {
    const id = window.setInterval(() => {
      const want = visible.current;
      if (want !== current.current) {
        current.current = want;
        set(want ? "always" : "never");
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [set, visible]);
  return null;
}

/** How big the machine is, for sizing the light rig. */
export function machineReach() {
  const M = machine(TRAIN);
  const span = new THREE.Vector3().subVectors(M.bounds.max, M.bounds.min);
  return Math.max(span.x, span.y, span.z);
}

/** Radius of a sphere that contains the whole machine. */
export function machineRadius() {
  const M = machine(TRAIN);
  return new THREE.Vector3().subVectors(M.bounds.max, M.bounds.min).length() / 2;
}

/**
 * Reports the distance at which the whole machine fits the frame it is in.
 *
 * Inside the Canvas because only the Canvas knows how big it ended up. A
 * preset's distance was tuned against one figure's proportions and is simply
 * wrong in another — a wide, short panel crops the machine top and bottom at
 * the same distance that suits a tall one.
 *
 * Reports rather than applies, so a detail view that is *meant* to crop can
 * ignore it.
 */
export function Fit({ onFit }: { onFit: (distance: number) => void }) {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const radius = useMemo(machineRadius, []);
  useEffect(() => {
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 34;
    if (size.height > 0) onFit(fitDistance(radius, fov, size.width / size.height));
  }, [size.width, size.height, camera, radius, onFit]);
  return null;
}
