/**
 * The machine, assembled as you read.
 *
 * ── Why building it beats showing it ─────────────────────────────────────────
 *
 * Every previous version handed the reader a finished mechanism and then talked
 * about it. That has two problems. A complete gear train is forty parts at
 * once, which is not a thing anyone parses; and nothing about a finished object
 * explains why it is shaped the way it is.
 *
 * Assembling it fixes both. Complexity arrives at a rate a person can follow —
 * a plate, then shafts, then one wheel, then a pair of gears — and every part
 * can be named as it lands, when the reader is already looking at the gap it
 * goes into. The machine stops being a diagram to decode and becomes something
 * being made.
 *
 * ── It also rescues an analogy I had given up on ─────────────────────────────
 *
 * "Structure before surface" had no honest mechanism in a finished machine, and
 * was cut for being padding. In an assembly it is not an analogy at all: the
 * bed and the shafts genuinely go in before anything that turns, because
 * nothing can be mounted until there is something to mount it on. The order is
 * forced by the mechanism rather than chosen to fit the copy, which is the only
 * kind of correspondence worth having.
 *
 * ── Sliding along the shaft ──────────────────────────────────────────────────
 *
 * Parts arrive along their own shaft's axis, because that is how you actually
 * put a machine together: a gear goes onto a shaft by sliding down it. Dropping
 * them from above or fading them up would both be cheaper and would both be
 * animation rather than assembly.
 *
 * ── Order is a constraint, not a preference ──────────────────────────────────
 *
 * A part cannot arrive before the shaft it is mounted on. That is checked in
 * `build.test.mts` against the real frames, so the sequence cannot drift into
 * something that would show a gear hanging in mid-air waiting for its shaft.
 */

import { principles, standing } from "./content.ts";
import type { Anchor } from "./story.ts";

/** Everything the scene draws, as a name the sequence can order. */
export type PartKey =
  | "bed"
  | "shaftInput"
  | "shaftLow"
  | "shaftDriver1"
  | "shaftCross1"
  | "shaftDriver2"
  | "shaftCross2"
  | "standard"
  | "flywheel"
  | "spurTop"
  | "spurLow"
  | "pinionIn"
  | "crownIn"
  | "crank1"
  | "disc1"
  | "pin1"
  | "cross1"
  | "crownOut"
  | "pinionOut"
  | "crank2"
  | "disc2"
  | "pin2"
  | "cross2"
  | "star"
  | "hub";

/** Which shaft each part is mounted on, so the order can be checked. */
export const MOUNTED_ON: Partial<Record<PartKey, PartKey>> = {
  flywheel: "shaftInput",
  spurTop: "shaftInput",
  spurLow: "shaftLow",
  pinionIn: "shaftLow",
  crownIn: "shaftDriver1",
  crank1: "shaftDriver1",
  disc1: "shaftDriver1",
  pin1: "shaftDriver1",
  cross1: "shaftCross1",
  crownOut: "shaftCross1",
  pinionOut: "shaftDriver2",
  crank2: "shaftDriver2",
  disc2: "shaftDriver2",
  pin2: "shaftDriver2",
  cross2: "shaftCross2",
  star: "shaftCross2",
  hub: "shaftCross2",
};

export type Stage = {
  key: string;
  /** what arrives here, in the order it should land */
  parts: PartKey[];
  /** the view this stage is watched from */
  view: string;
  /**
   * What the parts do, in a few words — the heading over the caption.
   *
   * Function, not shop terms. "Geneva" and "crown gear" are names a machinist
   * would use and noise to anybody else; what a part does is what the
   * sentence beside it is about anyway.
   */
  title: string;
  /** what just went in, and why */
  caption: string;
  /**
   * The one sentence that ties this stage to the company, where one is true.
   *
   * Built from the site's own words rather than written here, so it can only
   * ever point at something the company already says about itself. Six of
   * the seven stages carry one; the second Geneva does not, because the only
   * thing it could stand for is a second product, and there is not one yet.
   */
  bridge?: string;
  /** what the reader can do to check the claim */
  check?: string;
  anchors: Anchor[];
};

/** The first sentence of the long-game section's lede, quoted by the flywheel. */

export const STAGES: Stage[] = [
  {
    key: "bench",
    /* Four shafts, not six. The second stage's two went in here as well, and
       in a still of this stage they hung in mid-air — a horizontal shaft with
       nothing under either end, at the one moment the caption is saying that
       nothing can be mounted until there is something to mount it on. They
       arrive with the stage whose parts they carry. */
    parts: [
      "bed",
      "shaftInput",
      "shaftLow",
      "shaftDriver1",
      "shaftCross1",
      "standard",
    ],
    view: "level",
    title: "Before anything turns",
    /* The count is asserted against `parts` in build.test.mts. This said seven
       for as long as it existed, beside a sequence that installed six — a
       caption that miscounts the thing it is printed next to is the cheapest
       way there is to stop being believed. */
    caption:
      "A flat plate, four shafts, and a standing post for the far end of one that comes later. Nothing here turns yet, and nothing can be mounted until it exists — the whole shape of the machine is decided at this point, before a single working part is chosen.",
    bridge: `The same order here: “${principles[0].name}”. The problem came before the product.`,
    anchors: [
      { label: "Where it will start", frame: "inputTop", at: "flywheel" },
      { label: "Where it will step", frame: "cross1", at: "datum1" },
      { label: "Where it will let go", frame: "cross2", at: "freewheel" },
    ],
  },
  {
    key: "flywheel",
    parts: ["flywheel"],
    view: "flywheel",
    title: "Something heavy",
    caption:
      "One heavy wheel goes on first: a rim weighted so that once it is turning it takes real effort to stop, and spoked so that you can see it turning at all.",
    check: "Scroll as hard as you like. It will barely notice.",
    anchors: [{ label: "Flywheel", frame: "inputTop", at: "flywheel" }],
  },
  {
    key: "gearing",
    /* The pinion first. It sits behind the lower spur gear on the same
       shaft, and a part slides on from the free end — so arriving after the
       spur, it came in straight through it. */
    parts: ["pinionIn", "spurLow", "spurTop", "crownIn"],
    view: "input",
    title: "Turning the corner",
    caption:
      "Then the gearing. A pair of wheels to step the drive across, and a crown gear — teeth standing on a face rather than a rim — to turn it through a right angle. From here to the far end every turn is carried by metal touching metal: nothing leaves the machine, and nothing is picked up from outside it.",
    anchors: [
      { label: "Turns the corner", frame: "driver1", at: "crownIn" },
      { label: "Steps it across", frame: "inputLow", at: "spurLow" },
    ],
  },
  {
    key: "geneva",
    parts: ["crank1", "pin1", "disc1", "cross1"],
    view: "geneva",
    title: "Waits, then moves",
    /* "A disc cut with four concave faces" described the wrong part. The
       concave faces are on the slotted wheel — cut by the disc, which is a
       plain round disc with one notch taken out of it for the pin to pass. */
    caption:
      "An arm with a single pin, a round disc with one notch cut out of it, and a wheel with four slots. Together they make a mechanism that cannot creep: the wheel waits, dead still, then snaps round one whole quarter, then waits again.",
    /* The one correspondence in the build that is a property of the part,
       not a resemblance: a Geneva cannot move a fraction of a step, and the
       principle printed directly above this note says a release has to
       justify itself before it ships. Quoted, never paraphrased. */
    bridge: `The same rule as “${principles[1].name}”, in steel: there is no such thing as half a step.`,
    check: "Scroll as unevenly as you like. You will never catch it resting mid-step.",
    /* Two, not three. A third label for the locking disc sat on the same shaft
       as the arm, a sixth of a unit away, and the two collided into one
       unreadable smear — and it was pointing at the shaft's axis rather than at
       the pin, because an anchor with no offset is always on the centreline. */
    anchors: [
      { label: "The arm that moves it", frame: "driver1", at: "crank1" },
      { label: "Waits, then moves", frame: "cross1", at: "datum1" },
    ],
  },
  /* Split off from the second Geneva, which carried eight parts in one stage
     — and with parts arriving one at a time, eight parts in one stage's worth
     of scroll is 60px each: a flick. These three do a different job anyway:
     they carry the drive out to where there is room for the second stage. */
  {
    key: "corner2",
    parts: ["crownOut", "shaftDriver2", "pinionOut"],
    view: "output",
    title: "Another corner",
    caption:
      "A second right angle, taken off the slotted wheel itself, and a shaft to carry the drive out past its rim — to where there is room for what comes next.",
    anchors: [
      { label: "Turns it again", frame: "cross1", at: "crownOut" },
      { label: "Carries it out", frame: "driver2", at: "pinionOut" },
    ],
  },
  {
    key: "second",
    parts: ["crank2", "pin2", "disc2", "shaftCross2", "cross2"],
    view: "slow",
    title: "Slower still",
    caption:
      "The whole thing again on a smaller scale, on a shaft of its own — a second Geneva, driven by the first. It takes its timing from the stage immediately beside it rather than from the input end, and moves once for every three moves of the one before it.",
    anchors: [
      { label: "Slower still", frame: "cross2", at: "datum2" },
      { label: "Driven by the first", frame: "geneva2", at: "crank2" },
    ],
  },
  {
    key: "freewheel",
    parts: ["star", "hub"],
    view: "clutch",
    title: "Lets go",
    caption:
      "Last, six small rollers in a wedge that narrows one way only, and the wheel they carry. They grip when the drive pushes and slip when it does not, so this wheel can be driven hard and then let go entirely.",
    /* "This one does not" was false as written: the output coasts, and in the
       end it stops. What is true, and asserted at forty different moments in
       rest.test.mts, is that the drive comes to rest within four seconds of
       the reader stopping — in a dwell, both wheels locked — while this wheel
       is still turning at forty degrees a second twenty seconds later, at the
       worst moment to have stopped. */
    check: "Stop scrolling. Everything else comes to rest. This one keeps turning.",
    /* The second of the two correspondences in the build, and the one the
       whole machine is here for. The section this note sits in is titled with
       the line it quotes. */
    bridge: `“${standing.title}” Every part before this one was put in to control the motion. This is the one put in to let it go.`,
    anchors: [
      { label: "Grips one way only", frame: "cross2", at: "freewheel" },
      { label: "Keeps turning", frame: "cross2", at: "freewheel", offset: [0, 0.55] },
    ],
  },
];

/** Every part the sequence installs, in the order it installs them. */
export const BUILD_ORDER: PartKey[] = STAGES.flatMap((s) => s.parts);

/** Which stage a scroll position is in, and how far through it. */
export function stageAt(progress: number, stages: Stage[] = STAGES) {
  const p = Math.min(1, Math.max(0, progress));
  const index = Math.min(stages.length - 1, Math.floor(p * stages.length));
  return { index, stage: stages[index], within: p * stages.length - index };
}

/**
 * How far a part has slid into place: 0 absent, 1 seated.
 *
 * Strictly one at a time. Each part in a stage gets an equal share of the
 * stage, in turn, and does not start until the one before it is seated.
 *
 * It used to overlap them, and squeeze the whole stage into the first 55% of
 * its slice — a leftover from when this was the only thing giving the reader
 * time to read. The page's own timing does that now (`readingFrom`), so the
 * two stacked: a gearing part got about 40px of scroll to arrive in, a single
 * flick of the wheel. And overlapping parts can meet each other in mid-air in
 * a way neither meets anything already seated, which the clearance check in
 * `approach.test.mts` can only rule out if nothing moves at the same time.
 *
 * Eased in and out, not out alone. An ease-out covers most of the distance in
 * its first moments, which reads as a part snapping in; this one visibly sets
 * off, travels, and settles.
 */
export function installAt(
  progress: number,
  part: PartKey,
  stages: Stage[] = STAGES,
): number {
  const index = stages.findIndex((s) => s.parts.includes(part));
  if (index < 0) return 1; // not in the sequence: always present
  const stage = stages[index];
  const slot = stage.parts.indexOf(part);

  const p = Math.min(1, Math.max(0, progress));
  const local = p * stages.length - index;
  const t = local * stage.parts.length - slot;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * The build as shown, one frame on: chasing the build as scrolled, eased, and
 * never arriving faster than a part per `minPartSeconds`.
 *
 * A flick can move the reader a whole stage in a frame, and on a phone a
 * stage is only about 300px of scroll — five parts in one flick. Easing alone
 * smooths that into a burst; the limit turns it into a procession, each part
 * taking at least this long however far the scroll jumped. Leaving is not
 * limited: parts can go briskly when the reader scrolls back up.
 *
 * One number, not a value per part: `installAt` keeps parts strictly one at a
 * time for any progress it is given, so this keeps that too — and with it the
 * clearance guarantee in approach.test.mts.
 */
export const EASE_SECONDS = 0.28;
export const MIN_PART_SECONDS = 0.5;

export function easeShown(
  shown: number,
  target: number,
  dt: number,
  stages: Stage[] = STAGES,
  minPartSeconds = MIN_PART_SECONDS,
): number {
  const step = Math.min(0.1, Math.max(0, dt));
  const k = 1 - Math.exp(-step / EASE_SECONDS);
  let next = shown + (target - shown) * k;
  if (next > shown) {
    /* One part's share of the whole build, for the stage the next arriving
       part belongs to — the one `stageAt` puts a boundary into. */
    const { stage } = stageAt(Math.min(shown + 1e-9, 1), stages);
    const share = 1 / (stages.length * Math.max(1, stage.parts.length));
    next = Math.min(next, shown + (share / minPartSeconds) * step);
  }
  return Math.abs(target - next) < 1e-5 ? target : next;
}

// ===========================================================================
// Where the document is, turned into where the assembly is
// ===========================================================================

/**
 * Which section of the site owns which stages of the build.
 *
 * Six stages across four sections, and deliberately not evenly. A stage is a
 * group of parts that belongs with a paragraph, and the paragraphs are not all
 * the same length — "what we do" is three things and gets the flywheel and
 * then the gearing, "how we work" is one idea and gets the first Geneva.
 *
 * Tying the two together is the whole argument of the page: a part lands while
 * the words that describe it are what you are reading. A uniform slice of the
 * document would put the second Geneva halfway through a paragraph about the
 * founders, and then the machine really would be a random mechanism beside
 * some text.
 *
 * Sections 5 and 6 are absent on purpose. The machine is finished by then and
 * they are read against it running.
 */
export const SECTION_STAGES: { id: string; stages: string[] }[] = [
  { id: "top", stages: ["bench"] },
  { id: "krios", stages: ["flywheel", "gearing"] },
  { id: "how", stages: ["geneva", "corner2"] },
  { id: "field", stages: ["second", "freewheel"] },
];

/** A stage's note as the browser reports it: top relative to the viewport. */
export type NoteBox = { stage: string; top: number; height: number };

/** Where the reader is in the build, and which stage they are reading about. */
export type Reading = {
  /** 0..1 through the build, in the form `installAt` speaks */
  progress: number;
  /** the stage whose note is being read — the camera and labels follow it */
  focus: { index: number; within: number };
  /**
   * The reader is at the last stage's note, with its parts all in.
   *
   * The one place the machine may be brought to rest. Not "the last stage has
   * focus", which stays true for the whole rest of the page: the last three
   * sections are read against a machine that is running, so the payoff is the
   * stretch where that note is actually under the reading line.
   */
  payoff: boolean;
  /**
   * The reader has read past the last stage's note: the build is over, and
   * the rest of the page is read against the whole machine rather than a
   * close-up of the last part put into it.
   */
  past: boolean;
};

/*
 * The reading line is the middle of the viewport, where the text column is.
 * A stage's parts start arriving as its note comes onto the screen — LEAD of
 * a screen below the line is the bottom edge — and are seated once it is SEAT
 * above the line, while its first lines are being read. The camera turns to a
 * stage once its note is within FOCUS of the line, so it watches most of the
 * landing rather than arriving to find the parts already in.
 *
 * The window was 0.42 to 0.06 below the line, and the parts shared the first
 * half of it; a gearing part had about 40px of scroll to arrive in. This is
 * about twice the window, one part at a time.
 */
export const LEAD = 0.5;
export const SEAT = -0.1;
const FOCUS = 0.2;
/* The payoff lasts until the last note's foot is this far above the line. */
const PAST = 0.45;

/**
 * How far through the build the reader is, and what they are looking at,
 * from where the stages' notes are on the page.
 *
 * ── Why the notes and not the sections ───────────────────────────────────────
 *
 * This measured sections first, with each section's stages sharing its first
 * half. Where a section carries two stages, both of its notes sit at the
 * bottom of it — so by the time a reader got down to "scroll as hard as you
 * like, it will barely notice", the flywheel had been seated for a screen and
 * the camera had already swung to the gearing, which does not have the
 * flywheel in shot. The words that describe a part are its note, so the note
 * is what the part is timed against.
 *
 * ── Measured, not accumulated ────────────────────────────────────────────────
 *
 * The alternative is to add up scroll events, and events are an optimisation
 * that at least one embedded browser does not deliver at all — a machine that
 * never assembles because a listener never fired looks broken.
 *
 * ── Strictly in order ────────────────────────────────────────────────────────
 *
 * Two notes can sit closer together than the landing window, and the gearing's
 * does, right under the flywheel's. So each stage's window starts no earlier
 * than the moment the stage before it is seated: parts never overlap between
 * stages, however the page lays the notes out.
 *
 * The first stage is simply there. "You arrive at a bare plate and some
 * shafts" — the hero is the starting state, not something to scroll into.
 */
export function readingFrom(
  notes: NoteBox[],
  viewport: number,
  stages: Stage[] = STAGES,
  /**
   * Where the reading line is, from the top of the viewport.
   *
   * The middle of the screen wherever the text has the whole screen. On a
   * phone it does not: the machine is a band across the top and the text is
   * read in what is left below it, so the line is the middle of that — and a
   * note "coming onto the screen" means reaching the bottom edge, which is
   * nearer to it. See `useDocumentProgress`.
   */
  eye = viewport / 2,
): Reading {
  const n = stages.length;
  /* Parts may start once their note is on the screen: the bottom edge. */
  const lead = Math.min(LEAD * viewport, viewport - eye);
  /* A page that cannot be measured is never at the payoff: resting the
     machine is an invitation the reader has to have arrived at. */
  const done: Reading = { progress: 1, focus: { index: n - 1, within: 1 }, payoff: false, past: false };
  if (n === 0 || viewport <= 0) return done;

  /* A note with no height is not on the page as far as layout goes —
     `display: none` reports a zero rect at the origin, which would read as a
     note sitting on the reading line. Treated as missing, and a missing note
     means a finished machine: an empty stage is the worse failure. */
  const tops = stages.map((s) => {
    const box = notes.find((b) => b.stage === s.key);
    return box && box.height > 0 ? box.top : null;
  });
  if (tops.some((t) => t === null)) return done;
  const t = tops as number[];
  const lastBox = notes.find((b) => b.stage === stages[n - 1].key)!;

  let total = 0;
  let focus = 0;
  for (let i = 0; i < n; i++) {
    const d = t[i] - eye; // how far below the reading line the note is
    let local: number;
    if (i === 0) {
      local = 1;
    } else {
      /* Starts at LEAD below the line, or later if the previous note is so
         close that its stage would not yet be seated. */
      /* The previous stage is seated when its note is SEAT from the line, so
         this one's note is `gap` further down: gap + SEAT. This read
         gap − SEAT, which only made stages start a little late while SEAT
         was below the line, and started them early — overlapping the stage
         before — once it moved above it. */
      const gap = t[i] - t[i - 1];
      const from = Math.min(lead, gap + SEAT * viewport);
      const to = SEAT * viewport;
      local = from <= to ? (d <= to ? 1 : 0) : Math.min(1, Math.max(0, (from - d) / (from - to)));
    }
    total += local;
    if (i > 0 && d <= FOCUS * viewport && local > 0) focus = i;
  }

  const within = focus === 0 ? 1 : Math.min(1, Math.max(0, total - focus));
  const progress = Math.min(1, total / n);
  const lastTop = t[n - 1] - eye;
  const payoff =
    progress >= 1 &&
    lastTop <= FOCUS * viewport &&
    lastTop + lastBox.height >= -PAST * viewport;
  const past = progress >= 1 && lastTop + lastBox.height < -PAST * viewport;
  return { progress, focus: { index: focus, within }, payoff, past };
}
