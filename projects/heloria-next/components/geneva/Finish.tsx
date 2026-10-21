"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  AMBIENT,
  EXPOSURE,
  FILL,
  FINISH,
  GROUND,
  KEY,
  RIM,
  SKY,
  type Finish,
} from "@/lib/finish";
import { bakeRoughness, type Grain } from "@/lib/grain";

/**
 * The finish, applied to the real renderer.
 *
 * Everything numeric comes from `lib/finish.ts`, which the software rasteriser
 * in `lib/shot.mts` also reads. Two renderers carrying their own copies of a
 * palette drift within a day, and then the stills stop being evidence about the
 * page.
 */

/**
 * Roughness maps, baked once from `lib/grain.ts` and shared by every part
 * using that finish.
 *
 * Baked rather than loaded, and baked from the same arithmetic the software
 * renderer calls per pixel — so a turning mark lands in the same place in a
 * still as it does on the page. A texture file would have meant one renderer
 * sampling an image and the other guessing.
 */
/* How hard the environment lights the metal, and how far the zenith is
   lifted toward white. Tuned on the real canvas, in headless Chrome at
   1440x900, against the share of the machine under 10% luminance. */
const ENV_INTENSITY = 1.25;
const ZENITH_LIFT = 0.4;
const FLOOR_LIFT = 0;

const maps = new Map<string, THREE.DataTexture>();
function roughnessMap(kind: Grain, base: number) {
  const key = `${kind}:${base}`;
  const hit = maps.get(key);
  if (hit) return hit;
  const size = 512;
  const grey = bakeRoughness(kind, base, size);
  /* Three channels, because `roughnessMap` reads green and the red/blue are
     what metalnessMap and aoMap would want if they were ever added. */
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = grey[i];
    data[i * 4 + 1] = grey[i];
    data[i * 4 + 2] = grey[i];
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  /* Filtered and mipmapped. A DataTexture defaults to nearest-neighbour with
     no mipmaps, so at any distance the turning marks were point-sampled: a
     shaft's grain broke into moiré stripes that crawled as the camera moved,
     and a texture meant to be felt rather than seen read as noise. */
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  maps.set(key, tex);
  return tex;
}

/** A material straight from the palette. */
export function Metal({ of }: { of: keyof typeof FINISH | Finish }) {
  const f = typeof of === "string" ? FINISH[of] : of;
  const kind = f.grain ?? "none";
  const map = useMemo(
    () => (kind === "none" ? null : roughnessMap(kind, f.roughness)),
    [kind, f.roughness],
  );
  return (
    <meshStandardMaterial
      color={f.colour}
      /* 1 whenever there is a map, and this line is the difference between
         the page and the stills agreeing and not.

         three.js MULTIPLIES `roughness` by the map's green channel. The map
         stores absolute roughness — the finish's own value plus the grain —
         so passing the finish's roughness here as well squared it: ground
         shafts at 0.3 rendered at 0.09, a mirror, and a mirror pointed down
         at the floor of a dark environment is black. Measured on the real
         canvas, 46% of the machine was under 0.1 luminance while the software
         stills, which read the map as the absolute value it is, showed none.
         Every "the metal looks dark" note on this project traces back here. */
      roughness={map ? 1 : f.roughness}
      roughnessMap={map}
      metalness={f.metalness}
      emissive={f.emissive ?? "#000000"}
      emissiveIntensity={f.emissiveIntensity ?? 0}
      /* Ignored while the light comes from `scene.environment`: three takes
         `scene.environmentIntensity` then (WebGLRenderer, setProgram). Set
         there, in Environment; kept here only for a material given its own
         envMap. */
      envMapIntensity={ENV_INTENSITY}
    />
  );
}

/**
 * The environment the metals reflect.
 *
 * Built here rather than loaded, because an HDRI is a megabyte of network for a
 * two-colour gradient — and because the gradient has to be the *same* one the
 * software renderer uses or the two disagree about what steel looks like.
 *
 * It cannot be skipped. A `meshStandardMaterial` at `metalness: 0.9` with no
 * environment has almost nothing to reflect and renders nearly black: the
 * classic "why is my metal black" failure. Lights alone will not save it,
 * because a metal has no diffuse response for them to land on.
 */
export function Environment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const texture = useMemo(() => {
    /* 256 wide, though every column is the same. PMREMGenerator sizes the
       cube it bakes from an equirect's WIDTH (width / 4, rounded down to a
       power of two), and this map used to be 2 pixels wide: it baked a
       336x2 nothing, the environment contributed no light at all, and every
       metal part was lit by the three direct lights alone — narrow highlights
       on near-black. That, not the finishes, is why the machine went dark
       wherever a part was not catching the key. */
    const H = 128;
    const W = 256;
    const data = new Uint8Array(W * H * 4);
    const sky = new THREE.Color(SKY);
    /* A zenith above the sky. A bare metal shows nothing but what it reflects,
       so a two-tone gradient whose top was a mid grey gave every face that
       looks upward — the brass crown's face, a plate's top — a mid grey times
       its own colour: brass came out chocolate. A real shop has light
       overhead; this is that light, a broad soft panel rather than a point. */
    const zenith = new THREE.Color(SKY).lerp(new THREE.Color("#ffffff"), ZENITH_LIFT);
    /* And a floor that is lit. Every vertical face — the shafts, the gear
       rims, the standard — is seen from above, so it reflects a view angled
       below the horizon: the ground half. At GROUND (#4b5158, about 7% linear)
       times a steel albedo that came out under 3%, and a shaft facing the
       reader rendered as a black bar with only its edges lit. A workshop floor
       bounces light; this one now does too. */
    const ground = new THREE.Color(GROUND).lerp(sky, FLOOR_LIFT);
    const c = new THREE.Color();
    for (let y = 0; y < H; y++) {
      /* Equirectangular: row 0 is the top of the sphere. A smoothstep rather
         than a straight ramp, so the horizon reads as a horizon and a turned
         face sweeps through it instead of crossing a hard line. */
      const v = y / (H - 1);
      const k = 1 - v * v * (3 - 2 * v);
      c.copy(ground).lerp(sky, k);
      /* Upper third only: the horizon, which side-on faces see, stays SKY. */
      const up = Math.max(0, (k - 0.66) / 0.34);
      c.lerp(zenith, up * up * (3 - 2 * up));
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        data[i] = Math.round(c.r * 255);
        data[i + 1] = Math.round(c.g * 255);
        data[i + 2] = Math.round(c.b * 255);
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromEquirectangular(texture);
    scene.environment = target.texture;
    /* The machine is built Z-up (every camera here sets `up` to +Z), and an
       equirectangular map is Y-up: unrotated, the sky lay along +Y and the
       ground along −Y — the side the camera stands on. So every face turned
       toward the reader reflected the dark half, and a gear or shaft went near
       black or read fine depending only on which way it happened to face.
       The software stills never showed it because lib/render.mts reads its
       hemisphere off `n.z`. A quarter turn about X puts the sky overhead.

       +π/2, not −π/2: three negates this Euler before building the sampling
       matrix (WebGLMaterials, "accommodate left-handed frame"), so this
       samples with a −90° turn, which carries world +Z onto the map's +Y. */
    scene.environmentRotation.set(Math.PI / 2, 0, 0);
    scene.environmentIntensity = ENV_INTENSITY;
    pmrem.dispose();
    return () => {
      scene.environmentRotation.set(0, 0, 0);
      scene.environment = null;
      target.dispose();
    };
  }, [gl, scene, texture]);

  useEffect(() => () => texture.dispose(), [texture]);

  return null;
}

/**
 * Key, fill and rim, with the key's shadow camera sized to the machine.
 *
 * A directional light's shadow is cast through an orthographic frustum that
 * defaults to ±5 units. That is far too big for a machine two units across —
 * the whole thing lands in a few texels and the shadows come out as soft grey
 * smears with no edges. Fitting the frustum to the subject is most of what
 * makes a shadow look like a shadow.
 */
export function Lights({ reach, boost = 1 }: { reach: number; boost?: number }) {
  const r = reach * 0.75;
  const dist = reach * 2.2;
  /* `boost` lifts the shadow side only — ambient, fill and rim — and leaves the
     key alone. The key is what rakes across the chamfers and tooth flanks, and
     raising it with the rest would wash out the very edges it exists to find.
     A workbench figure sits on a black panel and wants the full contrast; a
     page has text over the machine and a scrim between it, and the same rig
     comes out as a dark shape with holes in it. */
  return (
    <>
      <ambientLight intensity={AMBIENT * boost} />
      <directionalLight
        position={[KEY.dir[0] * dist, KEY.dir[1] * dist, KEY.dir[2] * dist]}
        color={KEY.colour}
        intensity={KEY.intensity}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.012}
        shadow-camera-near={0.1}
        shadow-camera-far={dist * 2.4}
        shadow-camera-left={-r}
        shadow-camera-right={r}
        shadow-camera-top={r}
        shadow-camera-bottom={-r}
      />
      <directionalLight
        position={[FILL.dir[0] * dist, FILL.dir[1] * dist, FILL.dir[2] * dist]}
        color={FILL.colour}
        intensity={FILL.intensity * boost}
      />
      <directionalLight
        position={[RIM.dir[0] * dist, RIM.dir[1] * dist, RIM.dir[2] * dist]}
        color={RIM.colour}
        intensity={RIM.intensity * boost}
      />
    </>
  );
}

/** Tone mapping and exposure, matched to the software renderer's curve. */
export function Grade() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = EXPOSURE;
  }, [gl]);
  return null;
}
