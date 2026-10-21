"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  crankRadius,
  engageHalfAngle,
  slotRadius,
  solve,
  type GenevaSpec,
} from "@/lib/geneva";

/**
 * Step 1 — kinematics only.
 *
 * Orthographic, straight down the axis, everything drawn as outlines. No
 * materials, no lighting, no depth. The only thing this can be judged on is
 * whether the mechanism moves correctly, which is the only thing that matters
 * until it does.
 *
 * Every dimension comes from `lib/geneva.ts`, so the drawing cannot drift from
 * the maths — if the pin does not sit in the slot on screen, one of them is
 * wrong and it will be obvious.
 */

const SPEC: GenevaSpec = { slots: 4, centres: 1 };

/* ------------------------------------------------------------- line helpers */

/* Closed ring, for <lineLoop>. Note `<line>` is deliberately never used here:
   in JSX it resolves to the SVG element, not THREE.Line, and TypeScript rejects
   a `geometry` prop on it. lineLoop and lineSegments have no such collision. */
function ring(radius: number, segments = 128, z = 0) {
  const pts: number[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push(Math.cos(t) * radius, Math.sin(t) * radius, z);
  }
  return segs(pts);
}

/** Open arc as discrete segment pairs, for <lineSegments>. */
function arc(radius: number, from: number, to: number, segments = 64, z = 0) {
  const flat: number[] = [];
  let px = Math.cos(from) * radius;
  let py = Math.sin(from) * radius;
  for (let i = 1; i <= segments; i++) {
    const a = from + ((to - from) * i) / segments;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    flat.push(px, py, z, x, y, z);
    px = x;
    py = y;
  }
  return segs(flat);
}

function segs(flat: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(flat, 3));
  return g;
}

/* ------------------------------------------------------------------- parts */

function Mechanism({
  onState,
}: {
  onState: (s: ReturnType<typeof solve>) => void;
}) {
  const driverRef = useRef<THREE.Group>(null);
  const crossRef = useRef<THREE.Group>(null);
  const pinRef = useRef<THREE.Mesh>(null);

  const a = crankRadius(SPEC);
  const b = slotRadius(SPEC);
  const c = SPEC.centres;
  const theta0 = engageHalfAngle(SPEC);

  const geo = useMemo(() => {
    const step = (Math.PI * 2) / SPEC.slots;

    /* Locking disc. Its radius is bounded by the slot mouths: at rest the two
       slots either side of the line of centres sit at ±step/2, putting their
       outer corners at distance √((c − b·cos45)² + (b·sin45)²) = 0.707c from
       the driver's axis. Anything larger fouls them. 0.6c leaves visible
       clearance. The gate — the sector cut away so the cross can turn — spans
       exactly the engagement window, ±θ₀. */
    const rLock = c * 0.6;
    const driverBody = ring(rLock * 0.34);
    const crankArm = segs([0, 0, 0, a, 0, 0]);
    const lockArc = arc(rLock, theta0, Math.PI * 2 - theta0, 128);

    /* Cross: the blank circle, four slot centrelines from the rim in to the
       slot root, and the four lock crescents between them. The slot must reach
       at least to where the pin is at mid-index — distance c − a from the cross
       centre — or the pin bottoms out. */
    const crossBody = ring(b);
    const slotDepth = c - a;
    const slotLines: number[] = [];
    const crescents: THREE.BufferGeometry[] = [];
    for (let i = 0; i < SPEC.slots; i++) {
      /* At rest no slot points at the driver — two straddle it at ±step/2, and
         the material between them is what the locking disc holds. Placing slot
         0 on the line of centres (the obvious guess) puts a slot mouth where
         the lock has to sit. */
      const ang = i * step + step / 2;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      slotLines.push(cs * b, sn * b, 0, cs * slotDepth, sn * slotDepth, 0);
      /* The crescent is cut by the locking disc, so its centre of curvature is
         the driver's axis — a distance c away in the cross's own frame, not the
         cross's centre. Drawn as an arc about that offset point. */
      const cx = -c * Math.cos(ang - (i * step + step / 2));
      void cx;
    }

    /* One crescent per rest position: an arc of radius rLock swept about the
       point where the driver's axis sits when that station is locked. In the
       cross's frame the driver is at distance c along the bearing that the
       just-filled slot pair straddles. */
    for (let i = 0; i < SPEC.slots; i++) {
      const rest = i * step; // cross bearing of the driver at rest, local frame
      const ox = Math.cos(rest + Math.PI) * c;
      const oy = Math.sin(rest + Math.PI) * c;
      const flat: number[] = [];
      const span = Math.asin(Math.min(1, rLock / c)) * 0.9;
      const N = 28;
      for (let j = 0; j < N; j++) {
        const t0a = rest - span + ((2 * span) * j) / N;
        const t1a = rest - span + ((2 * span) * (j + 1)) / N;
        flat.push(
          ox + Math.cos(t0a) * rLock, oy + Math.sin(t0a) * rLock, 0,
          ox + Math.cos(t1a) * rLock, oy + Math.sin(t1a) * rLock, 0,
        );
      }
      crescents.push(segs(flat));
    }

    return {
      driverBody,
      crankArm,
      lockArc,
      crossBody,
      slots: segs(slotLines),
      crescents,
      centreMarks: segs([
        -0.06, 0, 0, 0.06, 0, 0, 0, -0.06, 0, 0, 0.06, 0,
        c - 0.06, 0, 0, c + 0.06, 0, 0, c, -0.06, 0, c, 0.06, 0,
      ]),
      centreLine: segs([0, 0, -0.001, c, 0, -0.001]),
    };
  }, [a, b, c, theta0]);

  useFrame((state) => {
    /* One driver revolution every 4 seconds: 1s indexing, 3s locked. Slow
       enough to watch the entry and exit, which is where the design lives. */
    const driver = (state.clock.elapsedTime / 4) * Math.PI * 2;
    const s = solve(driver, SPEC);

    if (driverRef.current) driverRef.current.rotation.z = s.theta;
    if (crossRef.current) crossRef.current.rotation.z = s.cross;

    /* The pin is drawn in world space rather than parented to the driver, so
       its position is an independent read of the maths. If it ever leaves the
       slot, the two disagree and the error is visible rather than hidden by a
       shared transform. */
    if (pinRef.current) {
      pinRef.current.position.set(
        Math.cos(s.theta) * a,
        Math.sin(s.theta) * a,
        0.01,
      );
    }
    onState(s);
  });

  const faint = "#4a463f";
  const ink = "#f4f2ef";
  const hot = "#ff682c";

  return (
    <group position={[-c / 2, 0, 0]}>
      {/* reference: the line of centres and both axes */}
      <lineSegments geometry={geo.centreLine}>
        <lineBasicMaterial color={faint} />
      </lineSegments>
      <lineSegments geometry={geo.centreMarks}>
        <lineBasicMaterial color={faint} />
      </lineSegments>

      {/* driver */}
      <group ref={driverRef}>
        <lineLoop geometry={geo.driverBody}>
          <lineBasicMaterial color={ink} />
        </lineLoop>
        <lineSegments geometry={geo.lockArc}>
          <lineBasicMaterial color={hot} />
        </lineSegments>
        <lineSegments geometry={geo.crankArm}>
          <lineBasicMaterial color={ink} />
        </lineSegments>
      </group>

      {/* the pin, in world space */}
      <mesh ref={pinRef}>
        <circleGeometry args={[0.045, 24]} />
        <meshBasicMaterial color={hot} />
      </mesh>

      {/* cross */}
      <group ref={crossRef} position={[c, 0, 0]}>
        <lineLoop geometry={geo.crossBody}>
          <lineBasicMaterial color={ink} />
        </lineLoop>
        <lineSegments geometry={geo.slots}>
          <lineBasicMaterial color={ink} />
        </lineSegments>
        {geo.crescents.map((g, i) => (
          <lineSegments key={i} geometry={g}>
            <lineBasicMaterial color={faint} />
          </lineSegments>
        ))}
      </group>
    </group>
  );
}

function Rig({ onState }: { onState: (s: ReturnType<typeof solve>) => void }) {
  const { size, camera } = useThree();
  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    ortho.zoom = Math.min(size.width / 3.1, size.height / 2.2);
    ortho.updateProjectionMatrix();
  }, [size, camera]);
  return <Mechanism onState={onState} />;
}

export default function Stage1() {
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
    set("station", `${((s.station % 4) + 4) % 4} / 4`);
    set("ratio", s.ratio.toFixed(3));
    set(
      "progress",
      Number.isNaN(s.progress) ? "—" : `${(s.progress * 100).toFixed(0)}%`,
    );
  };

  return (
    <div className="relative h-full w-full">
      {ready && (
        <Canvas
          orthographic
          camera={{ position: [0, 0, 5], zoom: 200 }}
          dpr={[1, 2]}
          resize={{ debounce: 0 }}
          style={{ width: "100%", height: "100%", display: "block" }}
          gl={{ antialias: true, alpha: true }}
        >
          <Rig onState={onState} />
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
