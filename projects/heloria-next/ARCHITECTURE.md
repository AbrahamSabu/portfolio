# The site, built around the machine

The machine is not a figure on this site. It is the substrate: one fixed
canvas beside the whole document, assembling itself from nothing at the top
to complete at the bottom, while the page's own content scrolls past it.

Everything below follows from that one decision.

---

## The idea in a sentence

You arrive at a bare plate and some shafts. By the time you have read what the
company does, the machine is finished and running — and the last thing to go in
is the part that lets its output go.

---

## Page structure

One `<main>`, seven sections, one fixed canvas beside all of them. Each of
the first four sections prints a short note per stage — what just went in,
and where there is one, the claim a reader can test. **The build is timed
against those notes**, not against the sections: a stage's parts land as its
note approaches the reading line and are seated just before it is read, and
the camera watches the stage whose note is being read. `readingFrom` in
`lib/build.ts` does the measuring; the rest of the build code still speaks
one 0..1 and knows nothing about the page.

Timing against the sections was tried first and was wrong where it mattered:
a section carrying two stages has both notes at its bottom, so the flywheel
was seated and the camera had moved on to the gearing before anyone reached
the sentence about the flywheel.

| # | Section | What the machine is doing | Copy |
|---|---------|---------------------------|------|
| 1 | Hero | plate, shafts, the standard | `hero` |
| 2 | What we do | flywheel, then the gearing | `stages` (Build / Run / Hold) |
| 3 | How we work | the first Geneva | `principles` |
| 4 | Where it stands | second stage, then the freewheel | `standing` |
| 5 | Kríos | complete, running | `krios` |
| 6 | Company | running, receded | `company` |
| 7 | Contact | running | `contact` |

Assembly finishes at the end of §4, around 60% of the way down. The last three
sections are read against a machine that is **already built and running**,
which is the point: you watched it being made, now it works.

### What the machine may claim

Only three correspondences are real, and they are the ones the mechanism cannot
help but demonstrate:

- **The order is forced.** The plate and shafts go in first because nothing can
  be mounted until there is something to mount it on. That is "structure before
  surface" as a fact rather than a metaphor.
- **A Geneva cannot creep.** It moves one whole step or it does not move. That
  is "a release has to justify itself" in steel.
- **A freewheel outruns its drive.** That is "a product is finished when it can
  leave", near exactly.

The flywheel's indifference to a shove rhymes with "we answer to the work, not
to a quarter" and is worth stating once. **Everything else is just mechanism**
and is described as such. Two earlier passes forced a part onto every idea and
both had to be unpicked; the rule now is that a part which does not carry an
idea is simply explained, and §5–7 make no claim at all.

### Every claim is true before it is printed

Each claim is something the reader is invited to test, so each was checked
against the machine first, and two of the six captions carried over from
the prototype failed: one counted seven shafts beside a sequence that
installs six, one put the Geneva's concave faces on the disc rather than
the wheel. Both are fixed and every number a caption names is now asserted
in `build.test.mts`. The flywheel's claim was false of the drive itself —
a hard scroll put the train at five times idle within a frame — so the site
drives it with `SITE_DRIVE`, which has real inertia: flat out, it surges
about a fifth over idle, over most of a second. The freewheel's claim waits
for step 4, because until the drive can wind down nothing comes to rest.

### Every claim is checkable

Each of the three is something the reader can verify with the gesture they are
already making:

- scroll hard — the flywheel barely responds
- scroll erratically — the cross is never caught mid-step
- stop scrolling — everything comes to rest except the last wheel

The third needed the drive to be able to stop. A machine that idles forever
can never demonstrate that something kept going after it stopped — but a
machine that stops as a function of scroll position is dead for everything
below the payoff, and one that stops wherever it happens to be breaks the
second claim one time in four. So the rest is an event, it lands in a dwell,
and the machine recovers from it: see `lib/rest.ts`.

---

## The canvas contract

**One WebGL context for the entire page.** Not one per section. Browsers cap
live contexts and take one back at the limit — silently, leaving a blank panel —
and this page cannot afford to lose the one it has.

```
lib/build.ts       the sequence: stages, parts, install timing, idle wind-down
lib/assembly.ts    where every part sits; the only file that decides layout
lib/drive.ts       every angle, from one input angle
components/geneva/MachineScene.tsx   the parts, shared with the workbench
```

- **Progress** is measured from the document, not taken from scroll events.
  Measurement is ground truth; events are an optimisation and in at least one
  embedded browser they never arrive at all.
- **The text loop is the page's own `requestAnimationFrame`**, never the
  renderer's. Driving copy opacity from inside the canvas makes every word on
  the page depend on WebGL starting.
- **Nothing ships invisible.** Sections start readable and are dimmed from
  there. A background tab suspends rAF entirely, and the failure mode of the
  other order is a reader scrolling through blank screens.
- **The camera is driven, never offered.** No orbit controls, no view buttons,
  no drag surface. A camera the reader can put anywhere is a camera usually
  pointed at nothing. The workbench at `/geneva` keeps its controls, because
  interrogating a mechanism is what a workbench is for.

### Framing

Presets carry an angle and a subject; the *distance* is solved per panel by
`fitDistance`, because one number cannot know the shape of the frame it will be
shown in. Whole-machine views are fitted; detail views keep their own distance,
since cropping in is what they are for. The look-at point is dropped below the
subject so the machine sits above centre — the middle of the frame is where the
text is.

---

## Responsive

The machine is 3.0 wide × 1.9 deep × 3.2 tall — taller than it is wide, which
is why it was re-laid upright. A landscape object on a portrait page crops at
every viewport and no amount of camera tuning fixes it.

- **768px and up** — text in a column to the left, machine in a fixed well to
  the right. The canvas *is* the well, transparent, not a full-bleed canvas
  with a scrim over the text side: that would have drawn twice the pixels to
  render a machine that then had to be shoved off-centre and half covered.
  The well's inner edge is feathered with a mask. Side-by-side starts at 768,
  not 1024, because 1024 handed the phone layout to every laptop browser that
  was not fullscreen. Painted text clears the well at every width from 768 to
  1440 (5px at the tightest).
- **Phone, below 768** — the machine is a fixed band from under the header to
  46% of the screen, drawn *above* the text and opaque, so the words pass
  beneath it rather than across the machine; its lower edge fades, so a line
  slides under softly instead of being sliced. The page opens with room for
  the band, so the headline starts below it. The build is timed against the
  middle of what the band leaves (`readingFrom`'s `eye`), measured off the
  band itself. With no machine — reduced motion, no WebGL — band and room both
  go. A left-to-right scrim on a narrow screen has to be opaque most of the
  way across to stay legible, which is why this is a band and not a wash.
- **Parts arrive no faster than one per half second**, however far a flick
  jumps (`easeShown`). On a phone a stage gets about 300px of scroll, which
  is five parts in a flick; the limit turns that into a procession.
- **No drag surface anywhere.** One finger always scrolls the page. The
  strongest version of not trapping someone inside a section that is several
  screens tall.
- Narrow screens get a lower pixel ratio and no shadows. A quarter of a million
  vertices with a 2048² shadow map is a warm phone and a dropped frame rate,
  and nobody inspects a chamfer at 375 points wide.

## Reduced motion

No canvas, no sticky stage, no scroll-driven anything: every section becomes
ordinary text, and the machine is absent rather than frozen. A story that only
exists as an animation is one that half the readers never get.

## Rendering and SEO

Only the canvas skips the server. Every word — hero, principles, product,
people — is server-rendered. An earlier version put `ssr: false` on a whole
section and a crawler saw an empty one where real copy belonged.

---

## Routes

| Route | Fate |
|-------|------|
| `/` | **the site.** Rebuilt around the machine. |
| `/geneva` | **kept.** The workbench: view buttons, readouts, every figure. |
| `/blend` `/blueprint` `/depth` `/precision` | **removed** in step 6. Superseded prototype directions; in git history. |

The prototypes were five ways of looking at the same copy and served their
purpose. Leaving them in place leaves four pages to rot, and the machine now
renders from a shared scene that they would each need updating against. What
only they used went with them: the prototype-only copy, the reveal hook, the
per-stage quotes and meters, the progress-driven idle (replaced by
`lib/rest.ts`), and two fonts every visitor was downloading for nothing.

---

## Build order

Each step ends green and looking at something.

1. **Scaffold** — new `/` with all seven sections, real copy, server-rendered,
   no canvas. Proves the content and the layout before anything moves.
2. **The canvas behind it** — one context, document progress, the machine
   assembling across §1–4. No copy changes.
3. **Words to stages** — per-section camera, part labels, the three checkable
   claims. This is where the writing is done.
4. **Running** — §5–7 against the finished machine; the wind-down and the
   freewheel payoff at the end of §4. Done as an event, not a position: when
   the reader stops scrolling at the freewheel's note, `lib/rest.ts` plans a
   stop onto the first input angle where both slotted wheels are locked with
   margin, decelerates onto it, and holds it while the output coasts on; when
   they move on, the idle ramps back from wherever the drive is. Tested at
   forty moments across two cycles of the slowest wheel — rest within four
   seconds, never mid-step, never reversing, and the hub still at forty
   degrees a second twenty seconds in.
5. **Phone** — the responsive pass, verified at 375. Done: band above,
   text below, measured at 375×812 — band 52–374px, headline from 458px, no
   horizontal overflow; timing invariants hold on the real phone layout;
   labels framed and measured to fit at 360, 375 and 414 wide.
6. **Cut the prototypes**, point the nav at real anchors, ship a preview.
   Done: every in-page link resolves to a section on the page (the hero's
   "How we work" pointed at "What we do"), and a Vercel preview is deployed.
   Still a preview: `robots` is `noindex` in both the layout and the page, and
   the live site remains the botanical build until that is decided.

---

## How parts arrive

One at a time, each sliding along its own shaft from whichever end is free,
over roughly a third to a half of a screen of scroll, eased in and out and
a quarter of a second behind the scroll so a flick still shows travel.
`lib/approach.ts` says which end and how far; `approach.test.mts` builds the
real geometry and sweeps every part's whole path against everything fitted
before it, judged by the ring each part sweeps as it turns so the answer holds
at any angle.

Building that check changed the mechanism, which this section used to promise
would never happen:

- **Every part got a bore.** Nearly all of them were solid where their shaft
  passes — the shaft was drawn through them. Seated it read as a keyed fit;
  sliding on, it would have been a shaft growing out of a gear's face.
- **Shafts are defined once**, in `assembly.ts`, and run through what they
  carry. The upper crown sat above the top of its shaft and the freewheel past
  the end of the output shaft.
- **The second crank was clipping the output shaft**, on every revolution of
  the running machine: the shaft reached back into the crank's plane. It now
  starts outboard of it and runs out to the standard it rests in.
- **The slot floors were cut 0.035 deeper than the pin ever reaches**, which
  is why the three-slot cross had no room for a bore. They now clear the pin
  by about 0.014; every kinematics check still passes.
- **The standard moved outboard**, so the freewheel has room to slide onto a
  free shaft end — the order a real machine is assembled in.

The kinematics — every angle, the Genevas, the crowns, the clutch — are as
verified, and remain the net under all of it.
