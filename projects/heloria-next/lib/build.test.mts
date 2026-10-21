/**
 * The assembly sequence.
 *
 *   node lib/build.test.mts
 *
 * The failure this exists for is a gear that arrives before its shaft — a part
 * hanging in mid-air waiting for something to be mounted on. It is invisible in
 * every other check, because the finished machine is correct either way; only
 * the order is wrong, and only for a second or two while someone is scrolling.
 *
 * The rest is bookkeeping with teeth: every part the scene draws has to be in
 * the sequence exactly once, or it either never appears or appears in the wrong
 * chapter with nothing to explain it.
 */

import { readFileSync } from "node:fs";
import {
  BUILD_ORDER,
  MOUNTED_ON,
  SECTION_STAGES,
  STAGES,
  installAt,
  readingFrom,
  SEAT,
  easeShown,
  MIN_PART_SECONDS,
  stageAt,
  type PartKey,
  type NoteBox,
} from "./build.ts";
import { principles, standing } from "./content.ts";
import { anglesAt } from "./drive.ts";
import { FREEWHEEL } from "./freewheel.ts";
import { TRAIN } from "./train.ts";
import { PRESETS } from "./orbit.ts";
import { anchorPoint } from "./story.ts";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name.padEnd(52)} ${detail}`);
  } else {
    fail++;
    console.log(`FAIL  ${name.padEnd(52)} ${detail}`);
  }
}

// ===========================================================================
// Nothing arrives before what it is mounted on
// ===========================================================================
{
  const arrives = new Map<PartKey, number>();
  BUILD_ORDER.forEach((p, i) => {
    if (!arrives.has(p)) arrives.set(p, i);
  });

  const early: string[] = [];
  for (const [part, shaft] of Object.entries(MOUNTED_ON) as [PartKey, PartKey][]) {
    const a = arrives.get(part);
    const b = arrives.get(shaft);
    if (a === undefined || b === undefined || b >= a) {
      early.push(`${part} before ${shaft}`);
    }
  }
  check("no part arrives before its shaft", early.length === 0,
    early.length ? early.join(", ") : `${Object.keys(MOUNTED_ON).length} mountings checked`);

  /* And the same thing in time rather than in order, because the stagger
     inside a stage could still land a gear first. */
  const overlap: string[] = [];
  for (const [part, shaft] of Object.entries(MOUNTED_ON) as [PartKey, PartKey][]) {
    for (let k = 0; k <= 400; k++) {
      const p = k / 400;
      if (installAt(p, part) > 0 && installAt(p, shaft) <= 0) {
        overlap.push(`${part} at ${p.toFixed(2)}`);
        break;
      }
    }
  }
  check("...at no point on the scroll either", overlap.length === 0,
    overlap.length ? overlap.join(", ") : "checked across 400 positions");

  check("the bed comes first", BUILD_ORDER[0] === "bed", BUILD_ORDER.slice(0, 3).join(" -> "));
}

// ===========================================================================
// Every part is accounted for
// ===========================================================================
{
  const seen = new Set(BUILD_ORDER);
  const twice = BUILD_ORDER.filter((p, i) => BUILD_ORDER.indexOf(p) !== i);
  check("no part is installed twice", twice.length === 0,
    twice.length ? twice.join(", ") : `${BUILD_ORDER.length} parts, each once`);

  /* The sequence and the scene have to agree on what exists. A part in the
     scene but not the sequence is a part that is simply always there, which in
     an assembly reads as something that was never built. */
  const src = readFileSync(
    new URL("../components/geneva/MachineScene.tsx", import.meta.url),
    "utf8",
  );
  const missing = [...seen].filter((p) => !src.includes(`"${p}"`));
  check("the scene knows every part in the sequence", missing.length === 0,
    missing.length ? missing.join(", ") : `${seen.size} parts wired`);
}

// ===========================================================================
// It arrives, and it stays
// ===========================================================================
{
  const jumpy: string[] = [];
  const incomplete: string[] = [];
  for (const part of BUILD_ORDER) {
    let prev = -1;
    for (let k = 0; k <= 600; k++) {
      const v = installAt(k / 600, part);
      if (v < prev - 1e-9) jumpy.push(part);
      prev = v;
    }
    if (installAt(1, part) !== 1) incomplete.push(part);
  }
  check("a part never un-installs itself", jumpy.length === 0,
    jumpy.length ? [...new Set(jumpy)].join(", ") : "every part only ever slides inward");
  check("the machine is complete at the end", incomplete.length === 0,
    incomplete.length ? incomplete.join(", ") : "all parts seated by the last stage");

  check("and empty at the start",
    BUILD_ORDER.every((p) => installAt(0, p) === 0),
    "nothing exists before the first scroll");

  /* It has to get more complicated, which is the whole premise. */
  const counts = STAGES.map((_, i) =>
    BUILD_ORDER.filter((p) => installAt((i + 0.95) / STAGES.length, p) > 0.99).length,
  );
  let grows = true;
  for (let i = 1; i < counts.length; i++) if (counts[i] <= counts[i - 1]) grows = false;
  check("it only ever gets more complicated", grows, counts.join(" -> "));
}

// ===========================================================================
// The words
// ===========================================================================
{
  const noView = STAGES.filter((s) => !PRESETS.some((v) => v.key === s.view));
  check("every stage is watched from a view that exists", noView.length === 0,
    noView.length ? noView.map((s) => s.view).join(", ") : STAGES.map((s) => s.view).join(" -> "));

  const FORBIDDEN =
    /\b(heloria|kr[ií]os|we|our|us|company|customer|client|product|team|founder)\b/i;
  const speaks = STAGES.filter((s) => FORBIDDEN.test(s.caption)).map((s) => s.key);
  check("no caption speaks for the company", speaks.length === 0,
    speaks.length ? speaks.join(", ") : `${STAGES.length} captions, mechanism only`);

  const silent = STAGES.filter((s) => s.caption.length < 60).map((s) => s.key);
  check("every stage explains what just arrived", silent.length === 0,
    silent.length ? silent.join(", ") : "all captions carry a sentence");

  /* The closing argument is the last stage's, and it is the section's own
     title: the freewheel, which lets go, under "Kríos is out in the field."
     One place, at the end — not a claim on every stage. */
  const last = STAGES[STAGES.length - 1];
  check("the closing argument is the last stage's, in the section's own words",
    !!last.bridge && last.bridge.includes(standing.title),
    `${last.key}: quotes "${standing.title}"`);
}

// ===========================================================================
// Labels and pacing
// ===========================================================================
{
  const bad: string[] = [];
  const collided: string[] = [];
  for (const s of STAGES) {
    const pts = s.anchors.map(anchorPoint);
    pts.forEach((p, i) => {
      if (!p.every(Number.isFinite)) bad.push(`${s.key}/${s.anchors[i].label}`);
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(
          pts[i][0] - pts[j][0],
          pts[i][1] - pts[j][1],
          pts[i][2] - pts[j][2],
        );
        if (d < 0.2) collided.push(`${s.key}: ${s.anchors[i].label}/${s.anchors[j].label}`);
      }
    }
  }
  check("every label resolves to a real point", bad.length === 0,
    bad.length ? bad.join(", ") : `${STAGES.reduce((n, s) => n + s.anchors.length, 0)} anchors`);
  check("no two labels land on top of each other", collided.length === 0,
    collided.length ? collided.join(", ") : `at most ${Math.max(...STAGES.map((s) => s.anchors.length))} at once`);

  let monotone = true;
  let last = -1;
  for (let k = 0; k <= 1000; k++) {
    const { index } = stageAt(k / 1000);
    if (index < last) monotone = false;
    last = index;
  }
  check("scrolling forward never goes back a stage", monotone, `${STAGES.length} stages`);
}

// ===========================================================================
// It has to work on a phone
// ===========================================================================
{
  /* A part label is drawn as a dot on the machine with the words beside it, and
     on a 375px screen "The pin that moves it" is more than half the width. Any
     anchor past the middle of the frame would push the text off the edge, so
     the label hangs off the other side of its dot instead. Checked here because
     the failure only shows at one viewport and only for the longest label. */
  const stage = readFileSync(
    new URL("../components/site/MachineCanvas.tsx", import.meta.url),
    "utf8",
  );
  check("labels flip rather than run off the edge",
    stage.includes("row-reverse") && stage.includes("translate(-100%") && stage.includes("offsetWidth"),
    "measured: the dot stays on the part, the words go where there is room");

  /* Worst case, in characters: uppercase at 10px with 0.16em tracking runs
     about 8px a character, and half of 375 is 187. */
  const longest = STAGES.flatMap((s) => s.anchors).reduce(
    (a, b) => (a.label.length > b.label.length ? a : b),
  );
  const widthPx = longest.label.length * 8 + 30;
  check("...and the longest one still fits half a phone", widthPx < 375 * 0.62,
    `"${longest.label}" ≈ ${widthPx}px of 375`);
}

// ===========================================================================
// The machine has to be able to mount at all
// ===========================================================================
{
  /* The bug that made the whole section a blank panel.
  
     `useApproached` gates the canvas, and it held its sentinel in a `useRef`
     with an effect keyed only on `margin`. A ref is filled in during commit and
     changing it re-runs nothing — so a component that does not render its
     sentinel on the very first pass (this one returns a placeholder until it
     knows whether reduced motion is on) ran that effect once against `null`,
     bailed, and never looked again. The element arrived a render later with
     nothing watching it, and the canvas waited forever on a signal that could
     not come.
  
     The fix is a callback ref, which re-runs the effect when the node attaches.
     Checked here because the failure is silent: everything renders, every test
     passes, and the machine is simply absent. */
  const src = readFileSync(
    new URL("../components/geneva/useDrive.ts", import.meta.url),
    "utf8",
  );
  const hook = src.slice(src.indexOf("export function useApproached"));

  check("the approach sentinel is a callback ref",
    /useState<T \| null>\(null\)/.test(hook) && /useCallback\(\(el: T \| null\)/.test(hook),
    "the element is observed whenever it arrives, not only on first render");

  check("...and its effect re-runs when the node attaches",
    /\}, \[node, margin\]\)/.test(hook),
    "node is in the dependency list");
}

// ===========================================================================
// The captions are true of the machine they sit beside
// ===========================================================================
/*
 * Two captions on this page described a machine that was not there: one
 * counted seven shafts beside a sequence that installs six, and one put the
 * Geneva's concave faces on the disc when they are cut into the wheel. Both
 * read fine. Neither survived a look at the parts. Every number and part a
 * caption names is checked here against the thing itself.
 */
{
  const byKey = (k: string) => STAGES.find((s) => s.key === k)!;
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

  const shafts = byKey("bench").parts.filter((p) => p.startsWith("shaft")).length;
  check("the bench caption counts the shafts it installs",
    byKey("bench").caption.includes(`${WORDS[shafts]} shafts`),
    `${shafts} installed, caption says "${byKey("bench").caption.match(/(\w+) shafts/)?.[1]}"`);

  /* The two stages that each bring one more shaft say "a shaft". */
  const one = ["corner2", "second"].filter(
    (k) => byKey(k).parts.filter((p) => p.startsWith("shaft")).length !== 1 || !/\ba shaft\b/.test(byKey(k).caption),
  );
  check("...and the later stages each bring the one shaft they say", one.length === 0,
    one.length ? one.join(", ") : "one each for the second corner and the second Geneva");

  const slots1 = TRAIN.stage1.slots;
  check("the Geneva caption has the right number of slots",
    byKey("geneva").caption.includes(`${WORDS[slots1]} slots`) && slots1 === 4
      && byKey("geneva").caption.includes("one whole quarter"),
    `${slots1} slots, a quarter turn per step`);
  check("...and puts the notch on the disc, not the faces",
    /disc with one notch/.test(byKey("geneva").caption) && !/disc cut with four/.test(byKey("geneva").caption),
    "the concave faces belong to the slotted wheel");

  check("the freewheel caption counts its rollers",
    byKey("freewheel").caption.includes(`${WORDS[FREEWHEEL.rollers]} small rollers`),
    `${FREEWHEEL.rollers} rollers`);

  /* "Moves once for every three moves of the one before it" — counted, off
     the real solver, rather than derived from the slot counts in a comment.
     A step is a stretch where the wheel is moving after being still. */
  let steps1 = 0;
  let steps2 = 0;
  let prev = anglesAt(0, TRAIN);
  let moving1 = false;
  let moving2 = false;
  for (let th = 0; steps1 < 12; th += 0.002) {
    const a = anglesAt(th, TRAIN);
    const m1 = Math.abs(a.cross1 - prev.cross1) > 1e-9;
    const m2 = Math.abs(a.cross2 - prev.cross2) > 1e-9;
    if (m1 && !moving1) steps1++;
    if (m2 && !moving2) steps2++;
    moving1 = m1;
    moving2 = m2;
    prev = a;
  }
  check("the second stage moves once for every three of the first",
    steps2 * 3 === steps1 && /once for every three moves/.test(byKey("second").caption),
    `${steps1} steps of the first wheel, ${steps2} of the second`);

  /* A bridge from a part to the company may only ever quote the company. It
     is assembled from content.ts for exactly this reason, and this holds it
     there: a bridge naming a principle or line that is not the site's own,
     word for word, is the invented correspondence this project has had to
     unpick twice. And there are few of them — a part that does not carry an
     idea is simply explained. */
  const owned = [...principles.map((p) => p.name), standing.title];
  const bridges = STAGES.filter((s) => s.bridge);
  const unowned = bridges.filter((s) => !owned.some((line) => s.bridge!.includes(`“${line}”`)));
  check("every bridge quotes the company word for word", unowned.length === 0,
    unowned.length ? unowned.map((s) => s.key).join(", ") : `${bridges.length} bridge(s): ${bridges.map((s) => s.key).join(", ")}`);
  check("...and not every part carries one", bridges.length < STAGES.length,
    `${bridges.length} of ${STAGES.length} stages`);

  /* Titles say what a part does. A shop term in a heading is the word a
     reader will stop at, and the heading is the one line everybody reads. */
  const JARGON = /geneva|crown|pinion|spur|cam\b|freewheel|maltese|clutch/i;
  const jargon = STAGES.filter((s) => !s.title || JARGON.test(s.title)).map((s) => `${s.key}: "${s.title}"`);
  check("every stage has a plain title", jargon.length === 0,
    jargon.length ? jargon.join(", ") : STAGES.map((s) => s.title).join(" · "));
}

// ===========================================================================
// The page, turned into a position in the build
// ===========================================================================
/*
 * The argument of the whole site is that a part lands while the words about
 * it are what you are reading — and the words about a part are its note. So
 * the build is timed against the notes, and these are the claims that makes,
 * checked against a page laid out the way the real one is: notes spread down
 * four sections, two of them sitting right on top of each other.
 */
{
  const names = STAGES.map((s) => s.key);
  const claimed = SECTION_STAGES.flatMap((s) => s.stages);

  check("every stage belongs to a section, once, in order",
    claimed.join("|") === names.join("|"),
    claimed.join(" · "));

  /* The page's own section ids, and a note per stage. A stage with no note
     has nothing to be timed against. */
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  /* Each stage's note inside the section that owns it: the source between
     that section's opening tag and the next one. A note moved into the wrong
     section would time a part against the wrong paragraph. */
  const misplaced: string[] = [];
  for (const { id, stages: mine } of SECTION_STAGES) {
    const from = page.indexOf(`<Section id="${id}"`);
    const to = page.indexOf("<Section id=", from + 1);
    const body = from < 0 ? "" : page.slice(from, to < 0 ? undefined : to);
    for (const key of mine) if (!body.includes(`<Note stage="${key}"`)) misplaced.push(`${key} (${id})`);
  }
  check("...and each stage's note sits in its own section", misplaced.length === 0,
    misplaced.length ? `missing or misplaced: ${misplaced.join(", ")}` : `${claimed.length} notes`);
  const note = readFileSync(new URL("../components/site/Section.tsx", import.meta.url), "utf8");
  check("...each marked with the stage it times", note.includes("data-stage={stage}"),
    "the note carries data-stage");

  /* Document positions of the six notes, the way the page lays them out at
     800 tall: the bench in the hero; in the two-stage sections, the first
     stage's note after the lede and the second's after the list; one in "how
     we work". */
  const VH = 800;
  const AT = [499, 1180, 1690, 2800, 3080, 3600, 4110];
  /* The last stage, and the one before it, by position — so a stage inserted
     in the middle cannot silently change which note a check is about. */
  const LAST = names.length - 1;
  const boxes = (scroll: number): NoteBox[] =>
    names.map((stage, i) => ({ stage, top: AT[i] - scroll, height: 200 }));
  const read = (scroll: number) => readingFrom(boxes(scroll), VH);
  /* The scroll at which note i's top sits `below` pixels under the reading
     line (the middle of the screen). */
  const when = (i: number, below: number) => AT[i] - VH / 2 - below;

  check("the hero arrives with the bench already built",
    STAGES[0].parts.every((part) => installAt(read(0).progress, part) === 1) &&
    STAGES[1].parts.every((part) => installAt(read(0).progress, part) === 0),
    `progress ${read(0).progress.toFixed(3)} on load`);

  /* Seated while read: once a note's first lines are at the reading line —
     its top a tenth of a screen above it — every part it describes is in,
     and nothing after it has started. */
  const early: string[] = [];
  const late: string[] = [];
  for (let i = 1; i < names.length; i++) {
    const p = read(when(i, SEAT * VH)).progress;
    if (!STAGES[i].parts.every((part) => installAt(p, part) > 0.999)) late.push(names[i]);
    if (!STAGES.slice(i + 1).every((st) => st.parts.every((part) => installAt(p, part) < 0.001)))
      early.push(names[i]);
  }
  check("every stage is seated while its note is read", late.length === 0,
    late.length ? `still arriving: ${late.join(", ")}` : "all five after the bench");
  check("...and nothing after it has started", early.length === 0,
    early.length ? `too soon after: ${early.join(", ")}` : "stages never overlap");

  /* ...even the gearing, whose note is only 280 below the flywheel's. Its
     parts must not begin until the flywheel is seated. */
  /* Its own layout: the page no longer stacks notes, but the guarantee is
     readingFrom's, not the page's, and 170px is what stacking measured at. */
  const TIGHT = [499, 1480, 1650, 2760, 3040, 3920, 4090];
  const tight = (scroll: number) =>
    readingFrom(names.map((stage, i) => ({ stage, top: TIGHT[i] - scroll, height: 130 })), VH);
  let overlap = 0;
  for (let y = 0; y < 4500; y += 2) {
    const p = tight(y).progress;
    const fly = Math.min(...STAGES[1].parts.map((part) => installAt(p, part)));
    const gear = Math.max(...STAGES[2].parts.map((part) => installAt(p, part)));
    if (fly < 0.999 && gear > 0.001) overlap++;
  }
  check("two notes 170px apart still land one after the other", overlap === 0,
    overlap ? `${overlap} scroll positions with both arriving` : "the gearing waits for the flywheel");

  /* And not before its note is on the screen at all — half a screen below
     the reading line is the bottom edge. Parts landing beside a paragraph
     that is not theirs is the thing this whole timing exists to avoid. */
  const tooSoon = names.slice(1).filter((_, k) => {
    const i = k + 1;
    const p = read(when(i, VH * 0.5 + 2)).progress;
    return STAGES[i].parts.some((part) => installAt(p, part) > 0);
  });
  check("...and none starts before its note is on screen", tooSoon.length === 0,
    tooSoon.length ? tooSoon.join(", ") : "nothing moves until its note comes up from the bottom edge");

  /* Slow enough to watch. The window a stage lands over, in scroll, at the
     spacing the real page has — the reason this block was rewritten. */
  const spans: number[] = [];
  for (let i = 1; i < names.length; i++) {
    let first = NaN;
    let last = NaN;
    for (let y = -VH; y < AT[LAST] + VH; y += 1) {
      const l = read(y).progress * STAGES.length - i;
      if (Number.isNaN(first) && l > 0) first = y;
      if (Number.isNaN(last) && l >= 1) { last = y; break; }
    }
    spans.push(last - first);
  }
  const slimmest = Math.min(...spans.map((s, k) => s / STAGES[k + 1].parts.length));
  check("each part gets a good stretch of scroll to arrive in", slimmest >= 90,
    `stages land over ${spans.map((s) => s.toFixed(0)).join(", ")}px; the busiest part gets ${slimmest.toFixed(0)}px`);

  /* The camera follows the note being read. */
  const focusWrong: string[] = [];
  for (let i = 1; i < names.length; i++) {
    const f = read(when(i, 0)).focus.index;
    if (f !== i) focusWrong.push(`${names[i]} -> ${names[f]}`);
  }
  check("the camera is on the stage whose note is being read", focusWrong.length === 0,
    focusWrong.length ? focusWrong.join(", ") : "at every note");
  check("...and on the bench until the first note arrives", read(0).focus.index === 0 &&
    read(when(1, VH * 0.5)).focus.index === 0,
    "the wide shot holds through the top of section 2");

  const end = AT[LAST] + 400;
  check("the machine is finished once the last note is read", read(when(LAST, SEAT * VH)).progress === 1,
    `${read(when(LAST, SEAT * VH)).progress.toFixed(3)}`);
  check("...and stays finished below it", read(end).progress === 1 && read(end + 4000).progress === 1,
    "1 all the way down");

  let worst = 0;
  let prev = -1;
  for (let y = -VH; y <= end + 500; y += 3) {
    const v = read(y).progress;
    worst = Math.min(worst, v - prev);
    prev = v;
  }
  check("progress never goes backwards", worst >= -1e-12, `worst step ${worst.toExponential(1)}`);

  /* The payoff: the one stretch where the machine may be brought to rest.
     While the freewheel's note is being read — and nowhere else, above all
     not in the three sections below it, which are read against a machine
     that is running. */
  const payoffs: string[] = [];
  for (let y = -VH; y <= AT[LAST] + 3000; y += 5) if (read(y).payoff) payoffs.push(String(y));
  const first = +payoffs[0];
  const lastP = +payoffs[payoffs.length - 1];
  check("the payoff is while the last note is being read",
    payoffs.length > 0 && read(when(LAST, SEAT * VH)).payoff &&
    STAGES[LAST].parts.every((part) => installAt(read(first).progress, part) === 1),
    `scroll ${first}..${lastP}, freewheel seated throughout`);
  check("...and only then", !read(when(LAST - 1, 0)).payoff && !read(0).payoff &&
    !read(AT[LAST] + 200 + VH).payoff && lastP - first < VH,
    `${lastP - first}px of it; not at the hero, the second stage, or the sections below`);

  /* A phone. The machine is a band across the top 46% of the screen and the
     text is read below it, so the reading line is the middle of what is
     left — and "on screen" is still the bottom edge, which is now much
     nearer the line. The same promises have to hold there. */
  {
    const PH = 812;
    const band = PH * 0.46;
    const eye = (band + PH) / 2;
    const P = [470, 1260, 1760, 2890, 3160, 3700, 4220];
    const pread = (scroll: number) =>
      readingFrom(names.map((stage, i) => ({ stage, top: P[i] - scroll, height: 260 })), PH, STAGES, eye);
    const at = (i: number, below: number) => P[i] - eye - below;
    const issues: string[] = [];
    for (let i = 1; i < names.length; i++) {
      const offscreen = pread(at(i, PH - eye + 2)).progress;
      if (STAGES[i].parts.some((part) => installAt(offscreen, part) > 0)) issues.push(`${names[i]} starts off screen`);
      const reading = pread(at(i, SEAT * PH)).progress;
      if (!STAGES[i].parts.every((part) => installAt(reading, part) > 0.999)) issues.push(`${names[i]} not seated when read`);
      if (pread(at(i, 0)).focus.index !== i) issues.push(`camera not on ${names[i]}`);
    }
    check("on a phone, parts arrive with their note, below the band", issues.length === 0,
      issues.length ? issues.join("; ") : `reading line at ${(eye / PH).toFixed(2)} of the screen`);
  }

  const shuffled = boxes(2400).slice().reverse();
  check("...whatever order the notes are handed over in",
    Math.abs(readingFrom(shuffled, VH).progress - read(2400).progress) < 1e-12,
    `${readingFrom(shuffled, VH).progress.toFixed(6)}`);

  /* A note that cannot be measured — hidden, renamed, not yet in the DOM —
     must not leave the reader looking at a bare plate for the whole page. A
     display:none element reports a zero rect, which would otherwise read as a
     note sitting exactly on the reading line. */
  const hidden = boxes(0).map((b) => (b.stage === "geneva" ? { ...b, top: 0, height: 0 } : b));
  check("an unmeasurable page shows a finished machine",
    readingFrom([], VH).progress === 1 && readingFrom(hidden, VH).progress === 1,
    "empty, or one note hidden, both give 1");
  check("...and never rests it", !readingFrom([], VH).payoff && !readingFrom(hidden, VH).payoff,
    "resting is an invitation the reader has to have arrived at");
}

// ===========================================================================
// The build as shown
// ===========================================================================
{
  /* However far the scroll jumps, each part takes at least half a second to
     arrive — measured on the parts themselves, as installAt shows them. */
  const DT = 1 / 60;
  let shown = 0;
  let t = 0;
  const started = new Map<string, number>();
  const seated = new Map<string, number>();
  while (shown < 1 && t < 120) {
    shown = easeShown(shown, 1, DT);
    t += DT;
    for (const part of BUILD_ORDER) {
      const a = installAt(shown, part);
      if (a > 0 && !started.has(part)) started.set(part, t);
      if (a >= 1 && !seated.has(part)) seated.set(part, t);
    }
  }
  const took = BUILD_ORDER.filter((p) => started.has(p) && seated.has(p)).map((p) => seated.get(p)! - started.get(p)!);
  const quickest = Math.min(...took);
  check("a whole build in one jump still arrives a part at a time", quickest >= MIN_PART_SECONDS - 2 * DT,
    `quickest part took ${quickest.toFixed(2)}s; the whole build ${t.toFixed(1)}s from a bare plate`);
  check("...and it lands exactly", shown === 1, `${shown}`);

  /* Leaving is brisk: scrolling back to the top takes the machine apart in
     the time the ease takes, not a part per half second. */
  let back = 1;
  let tb = 0;
  while (back > 0 && tb < 30) {
    back = easeShown(back, 0, DT);
    tb += DT;
  }
  check("...but parts leave without queueing", tb < 5, `${tb.toFixed(2)}s back to a bare plate`);
}

// ===========================================================================

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
