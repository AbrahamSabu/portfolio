"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { solve, type GenevaSpec } from "@/lib/geneva";
import {
  crankShape,
  crossShape,
  depths,
  dims,
  extrude,
  lockDiscShape,
} from "@/lib/genevaParts";
import { Axle } from "./Axle";

/**
 * Step 2 — machined parts.
 *
 * The outlines from step 1 become solids: extruded profiles with a small bevel
 * standing in for a chamfer, a pin that actually passes through the slot, and
 * shafts and a plate to hang it all on. Perspective now, because the point of
 * this step is that it has a thickness.
 *
 * Materials are deliberately a flat placeholder grey. Step 3 is where it gets
 * to look like metal; anything that reads as finished here would only hide
 * whether the *form* is right.
 */

const SPEC: GenevaSpec = { slots: 4, centres: 1 };

function Mechanism({ onState }: { onState: (s: ReturnType<typeof solve>) => void }) {
  const driver = useRef<THREE.Group>(null);
  const cross = useRef<THREE.Group>(null);
  const roller = useRef<THREE.Group>(null);

  const d = useMemo(() => dims(SPEC), []);

  const geo = useMemo(() => {
    const crossG = extrude(crossShape(SPEC, d), d.thickness, d.bevel);
    const discG = extrude(lockDiscShape(SPEC, d), d.thickness, d.bevel);
    const crankG = extrude(crankShape(SPEC, d), d.thickness * 0.78, d.bevel);
    return { crossG, discG, crankG };
  }, [d]);

  const z = useMemo(() => depths(d), [d]);

  useEffect(() => {
    return () => {
      geo.crossG.dispose();
      geo.discG.dispose();
      geo.crankG.dispose();
    };
  }, [geo]);

  useFrame((state) => {
    const t = (state.clock.elapsedTime / 4) * Math.PI * 2;
    const s = solve(t, SPEC);
    if (driver.current) driver.current.rotation.z = s.theta;
    if (cross.current) cross.current.rotation.z = s.cross;
    /* `roll` is the arc a unit-radius follower would roll through; divide by the
       real radius to get the angle. It winds up over the dive to the slot root
       and unwinds on the way out, so the roller ends every index where it
       started — which is correct, and also why it needs the witness mark to be
       legible at all. */
    if (roller.current) roller.current.rotation.z = s.roll / d.pin;
    onState(s);
  });

  const steel = "#9a9a98";
  const dark = "#6f6f6d";

  return (
    <group position={[-d.centres / 2, 0, 0]}>
      {/* ---------------------------------------------------------- driver */}
      <group ref={driver}>
        {/* locking disc — coplanar with the cross */}
        <mesh geometry={geo.discG} castShadow receiveShadow>
          <meshStandardMaterial color={steel} roughness={0.72} metalness={0.05} />
        </mesh>

        {/* crank — below the cross plane, where its width cannot foul a slot */}
        <mesh geometry={geo.crankG} position={[0, 0, z.crank]} castShadow receiveShadow>
          <meshStandardMaterial color={dark} roughness={0.66} metalness={0.12} />
        </mesh>

        {/* ---------------------------------------------------------- pin

            The only part that crosses the cross's plane, and therefore the only
            one whose diameter has to respect the slot.

            Every cylinder below carries `rotation={[Math.PI / 2, 0, 0]}`, and
            it is not decoration. `CylinderGeometry` runs along Y and
            `ExtrudeGeometry` runs along Z, so an unrotated cylinder among these
            plates lies *flat in their plane*. The pin did: a rod on its side,
            scything through the cross once a revolution. It is the one failure
            in this whole build that no amount of 2D checking could ever have
            caught, because in plan view a sideways pin and an upright one are
            the same circle.

            Stud, then roller on it — which is how the real mechanism is built.
            A fixed pin scrubs sideways against the slot wall for the whole
            index; a roller rolls, and that is the difference between a
            mechanism and a peg dragged through a groove. */}
        <Axle
          radius={d.pin * 0.44}
          length={z.studLen}
          segments={24}
          position={[d.crank, 0, z.studMid]}
          castShadow
        >
          <meshStandardMaterial color={dark} roughness={0.38} metalness={0.42} />
        </Axle>

        <group ref={roller} position={[d.crank, 0, 0]}>
          <Axle radius={d.pin} length={z.rollerLen} segments={40} castShadow>
            <meshStandardMaterial color="#ff682c" roughness={0.45} metalness={0.15} />
          </Axle>
          {/* Witness mark. A turned cylinder spinning about its own axis is
              perfectly invisible without one, and the roll is the point. */}
          <Axle
            radius={d.pin * 0.16}
            length={d.thickness * 0.06}
            segments={12}
            position={[d.pin * 0.55, 0, z.rollerLen / 2]}
          >
            <meshStandardMaterial color="#7a2e10" roughness={0.6} metalness={0.1} />
          </Axle>
        </group>
      </group>

      {/* ----------------------------------------------------------- cross */}
      <group ref={cross} position={[d.centres, 0, 0]}>
        <mesh geometry={geo.crossG} castShadow receiveShadow>
          <meshStandardMaterial color={steel} roughness={0.72} metalness={0.05} />
        </mesh>
      </group>

      {/* ---------------------------------------------------------- shafts */}
      {[0, d.centres].map((x) => (
        <Axle
          key={x}
          radius={d.shaft}
          length={d.thickness * 3.2}
          position={[x, 0, z.crank * 0.4]}
          castShadow
        >
          <meshStandardMaterial color={dark} roughness={0.5} metalness={0.3} />
        </Axle>
      ))}

      {/* bearing bosses and the plinth they stand on */}
      {[0, d.centres].map((x) => (
        <Axle
          key={`p${x}`}
          radius={d.lock * 0.3}
          radiusBottom={d.lock * 0.34}
          length={d.thickness * 0.8}
          position={[x, 0, z.plinth]}
          receiveShadow
          castShadow
        >
          <meshStandardMaterial color={dark} roughness={0.8} metalness={0.1} />
        </Axle>
      ))}

      <mesh position={[d.centres / 2, 0, z.plinth - d.thickness * 0.7]} receiveShadow>
        <boxGeometry
          args={[d.centres + d.rim * 1.75, d.rim * 2.05, d.thickness * 0.55]}
        />
        <meshStandardMaterial color="#3c3c3a" roughness={0.95} metalness={0.02} />
      </mesh>
    </group>
  );
}

/**
 * Lays the mechanism's plane over for the camera. Nothing more.
 *
 * This used to be commented as if it also squared the cylinders up with the
 * plates. It cannot: it turns every child by the same amount, so the angle
 * between a cylinder's axis and a plate's normal is exactly what it was. Each
 * cylinder has to be rotated itself, and they now are.
 */
function ZUp({ children }: { children: React.ReactNode }) {
  return <group rotation={[Math.PI / 2, 0, 0]}>{children}</group>;
}

function Rig({ onState }: { onState: (s: ReturnType<typeof solve>) => void }) {
  const { camera } = useThree();
  const tilt = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      tilt.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      tilt.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((_, dt) => {
    /* A slow lean rather than a spin. The mechanism is the thing moving; the
       camera only shifts enough to show that the parts have edges.

       The assembly is about 2.4 units across — centre distance plus a rim
       either side — so it needs roughly four units of standoff at this field of
       view. The first pass sat at 2.37 and put the camera inside the
       mechanism. */
    const k = 1 - Math.exp(-dt * 2);
    const tx = 0.25 + tilt.current.x * 0.5;
    const ty = -3.15 + tilt.current.y * 0.35;
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (ty - camera.position.y) * k;
    camera.lookAt(0, 0, 0);
  });

  return <Mechanism onState={onState} />;
}

export default function Stage2() {
  const hud = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const onState = (s: ReturnType<typeof solve>) => {
    const el = hud.current;
    if (!el) return;
    const set = (k: string, v: string) => {
      const n = el.querySelector(`[data-k="${k}"]`);
      if (n) n.textContent = v;
    };
    const deg = (r: number) => ((r * 180) / Math.PI).toFixed(1);
    set("driver", `${(((s.driver * 180) / Math.PI) % 360).toFixed(1)}°`);
    set("cross", `${deg(s.cross)}°`);
    set("state", s.engaged ? "INDEXING" : "LOCKED");
    set("station", `${(((-s.station % 4) + 4) % 4) + 1} / 4`);
    set("ratio", s.ratio.toFixed(3));
    set("progress", Number.isNaN(s.progress) ? "—" : `${(s.progress * 100).toFixed(0)}%`);
  };

  return (
    <div className="relative h-full w-full">
      {ready && (
        <Canvas
          camera={{ position: [0.25, -3.15, 1.65], fov: 30 }}
          dpr={[1, 1.75]}
          resize={{ debounce: 0 }}
          shadows
          style={{ width: "100%", height: "100%", display: "block" }}
          gl={{
            antialias: true,
            alpha: true,
            /* Dev only. The preview pane in this setup frequently refuses to
               composite a frame — screenshots come back black while the canvas
               is demonstrably sized, running and correct — so the only reliable
               way to see what is actually being drawn is to read the drawing
               buffer straight out of the canvas. That needs the buffer kept,
               which costs a copy per frame and has no business shipping. */
            preserveDrawingBuffer: process.env.NODE_ENV !== "production",
          }}
          onCreated={(state) => {
            if (process.env.NODE_ENV !== "production") {
              (window as unknown as Record<string, unknown>).__geneva = state;
            }
          }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[-2.2, 2.6, 3.2]}
            intensity={2.1}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[3, -1.5, 1.4]} intensity={0.55} />
          <ZUp>
            <Rig onState={onState} />
          </ZUp>
        </Canvas>
      )}

      <div
        ref={hud}
        className="pointer-events-none absolute inset-x-0 bottom-0 grid grid-cols-3 gap-x-4 gap-y-3 p-6 sm:grid-cols-6"
      >
        {[
          ["Driver", "driver"],
          ["Cross", "cross"],
          ["State", "state"],
          ["Station", "station"],
          ["dφ/dθ", "ratio"],
          ["Index", "progress"],
        ].map(([label, k]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate">
              {label}
            </div>
            <div
              data-k={k}
              className="mt-1 font-tight text-[15px] tabular-nums text-ember"
            >
              —
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
