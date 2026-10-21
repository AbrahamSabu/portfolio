[← Portfolio](https://abrahamsabu.github.io/portfolio/) · [All projects](../../README.md) · [Live site](https://heloria-labs.vercel.app)

> **Portfolio note:** the earlier static build of the Heloria Labs site, set aside in favour of [heloria-next](../heloria-next).
> Preview: https://heloria-labs.vercel.app · Run: `python -m http.server 4321` in this folder, then open http://localhost:4321.

![Home page](screenshots/home.jpg)

# Heloria Labs — site

A replacement for helorialabs.com. Static HTML/CSS/JS, no build step, no framework.
Motion is driven by [anime.js v4.5.0](https://animejs.com) (MIT), vendored into
`assets/vendor/`.

## Deploy

Drop-in replacement for the current site — same shape, same host.

```bash
vercel deploy --prod
```

Or point the existing Vercel project at this directory. There is nothing to build:
every file ships as-is. `vercel.json` adds immutable caching for `/assets/*` plus
two security headers.

## Local preview

The page uses root-absolute paths (`/main.js`, `/assets/...`), so open it through a
server rather than `file://`:

```bash
python -m http.server 4321 --directory .
```

## Files

| Path | What it is |
|---|---|
| `index.html` | The whole page. One document, five sections. |
| `styles.css` | Design tokens + layout. Single breakpoint at 767px. |
| `main.js` | The motion system. ES module. |
| `assets/vendor/anime.esm.min.js` | anime.js v4.5.0, vendored (118 KB) |
| `assets/fonts/` | Bricolage Grotesque, variable, subset to latin |
| `robots.txt`, `sitemap.xml` | Were missing from the old site (both 404'd) |

## Design

Bright cream ground, because that is the company's identity. One dark section —
Kríos — so the "first bloom" reads as a product spotlight rather than another band
of the same page. The nav inverts while that section is behind it, and the vine
shifts from ember to a hot peach as it crosses, via a `userSpaceOnUse` gradient
whose bright stops are positioned from the section's measured offset.

Colour is the original palette, sampled from the logo, kept as a contrast-tiered
ladder: `--ember` for large text only (4.1:1 on cream), `--ember-btn` for button
fills (4.7:1), `--ember-deep` for small accent text (5.9:1). The sharp-edge shape
system from the old site is preserved deliberately — no rounded cards anywhere,
hairlines instead of boxes.

## Sections

| # | Section | Ground | Graphic |
|---|---|---|---|
| 1 | Hero | cream | layered flower, 3D pointer tilt |
| 2 | What we do | cream | Plant / Grow / Bloom stage icons |
| 3 | How we build | cream | four line-art tenet glyphs |
| 4 | Kríos | soil (dark) | abstract conversation rhythm |
| 5 | The long game | peach | four-stage lifecycle diagram |
| 6 | Company | cream | — |
| 7 | Contact | cream | three routes out |
| — | Footer | soil (dark) | procedural roots |

Grounds run cream → cream → cream → dark → peach → cream → cream → dark, so the
page has a rhythm rather than one long stretch of the same colour.

### The new graphics

- **Tenet glyphs** — four marks drawn from the same botanical vocabulary as the
  vine (a seed ringed by arcs, one stem kept and two pruned, a closed loop with a
  leaf, a long low horizon). Their strokes draw themselves and their solid parts
  spring in.
- **The lifecycle diagram** — one plant at each of four stages along a baseline
  that deliberately *stops short of the last one*, which carries its own roots
  instead. The diagram is the argument: a product is finished when it can leave.
- **The Kríos rhythm** — the rep's turns above the line, the prospect's below,
  with the objections marked. Deliberately not a mock of the product: it is a
  rhythm, not an interface, so it makes no claim about what the software looks
  like or does.

## Adding a section

The vine is section-agnostic. To add one:

1. Give its content wrapper `data-band`. The vine measures the gaps between
   every `[data-band]` block and places its loops in them.
2. Drop a `<span class="vine-node">` in the section and position it in CSS.
   Add `data-nobloom` if it should only steer the vine without carrying a flower.

That is the whole contract — no lists to update in JS.

## The vine

The centrepiece. Entirely procedural — move a section and it re-routes itself.

1. Reads `#vine-origin` and every `.vine-node` (invisible 1×1px waypoints placed
   in CSS, one per section).
2. Weaves alternating swings between each pair of anchors and, in every gap
   large enough to hold one, a two- or three-turn spiral curl the stem winds
   through — then splines the result
   through Catmull-Rom. On desktop it roams across ~92% of the page width.

   The swing is weighted by `sin(t·π)`: widest halfway between two anchors, zero
   at the anchors themselves. Anchors sit on section content and the halfway
   point lands in the padding between sections, so the vine throws its biggest
   gestures through empty space and draws in tight where the text is.

   That envelope does not hold on a phone, where sections are tall and stacked
   and a midpoint lands inside a block of copy rather than in a gap. So the phone
   swings stay narrow and the character comes from a single curl placed in the
   one genuinely large gap, company → contact, where ~300px of padding meet.
3. Generates a **tapered outline** by walking the centreline, taking normals, and
   offsetting by a width that falls from 13px at the base to 5.5px at the tip
   (10 to 4.5 on mobile). The taper is deliberately gentle: the leaves grow as
   the vine descends, and a stem thinning to nothing beneath them read as broken
   rather than botanical.
4. Draws only the grown portion of that ribbon, sliced at the tip and scrubbed
   by scroll position.
5. Scatters leaves, thorns and self-drawing tendrils along it, each rotated to the
   path tangent, each skipped where it would collide with a bloom.
6. Opens a layered flower at every waypoint, with a pollen burst and a
   desynchronised idle sway.
7. Sends out **branch offshoots** — short secondary stems, each drawing itself
   and unfurling its own pair of leaves.
8. Throws **sparks** off the growing point, and carries a **lit edge** down one
   side of the stem so it reads as round rather than flat.
9. Carries a **pool of light** at the growing tip. As that light reaches each
   element — headings, eyebrows, stage icons, chips, the contact address — the
   element wakes: it lifts from a desaturated dormant state to full colour with a
   one-shot glow. 21 elements are wired to it.

Each bloom is a four-beat sequence rather than a single pop: a calyx of three
sepals swells, petals burst out of it, stamens and centre fill in, then pollen
scatters and shed petals drift away on their own loop. Leaves carry veins, petals
carry a crease.

Growth is reversible: scroll up and the stem retracts, blooms close back into
their buds, leaves fold, and everything the light has passed goes back to sleep.

### Ignition

Dormant elements are drained almost entirely of colour (`saturate(0.12)`) while
their luminance barely moves (`opacity(0.86)`) — asleep, but never hard to read.
When the light arrives, colour floods *past* its resting value to
`saturate(1.75) brightness(1.14)`, the element swells 3%, and it throws a warm
glow, before everything settles back. Overshooting and returning is what makes
it read as igniting rather than as a cross-fade.

### Bringing the surroundings to life

The vine does not just decorate the page, it wakes it:

- **A field of 70 motes** (30 on a phone) lies off to either side of the stem,
  dark until the tip's light reaches them, then flaring and settling to a low
  glow. This is what makes the area *around* the vine feel alive rather than
  just the vine itself.
- **A ring of light** is thrown outward as the stem winds through each curl.
- 21 elements of real content ignite as the light passes — see below.

### Roots

The stem finishes at the contact bloom, and below it the page turns to soil —
which is what the footer is already coloured as. So the footer grows a root
system: fifteen strokes from a recursive generator, splitting into thinner,
shorter branches over four levels, drawing themselves when the footer arrives.
It starts where the last bloom sat: centred on desktop, and on a phone wherever
the route put the final bloom — its height is chosen from the scroll bottom now,
not from a percentage down the section.

Their dash is driven by hand rather than through `createDrawable()`, which
measures a path against its rendered box and returns a nonsense length for short
strokes inside an absolutely positioned overlay — the same trap the stem's mask
hit.

### Hierarchy and rhythm

A few things an audit turned up that were worth correcting:

- **The address is the call to action, so it leads.** "Get in touch." was set at
  the same 58px as every other H2 with the address at 54px beneath it, which read
  flat. The heading is now a 35px lead-in and the address is 80px display type.
- **`.contact-mail` was inheriting the body's `line-height: 1.6`** onto 54px
  display text. It is 1.03 now.
- **The hero flower sat in ~155px of dead space** on either side of its column.
  It is larger and right-aligned, which halves that.
- **Every section had identical 135px padding**, so the page read as a metronome.
  Kríos is now the largest block (it is the point of the page), Company is the
  quiet beat between two loud ones.
- **Dormancy drained luminance as well as colour.** Saturation carries nearly all
  of the drama and costs almost no legibility; opacity is the reverse. The colour
  drain is now harder and the dimming much lighter.
- **The stages block never closed** at the bottom.
- On phones the address wrapped and would break mid-string; it is sized to sit on
  one line.

### Elsewhere on the page

- The hero flower tilts in 3D toward the pointer, driven by `createAnimatable` so
  there is one live tween per axis rather than a new animation per mouse move.
- An accent ring trails the cursor with its own damping and swells over anything
  interactive. The native cursor is left alone.
- The marquee takes its cue from the scroll — it speeds up in the direction you
  are travelling and settles back to its resting pace when you stop. On a phone
  it is a plain CSS keyframe loop instead: same movement, no main-thread work,
  and the scroll coupling is given up because it cannot run off-thread.
- Stage panels draw an accent rule as they arrive and count their index up.
- The Kríos chips flip up out of the dark ground; the mark's halo breathes.
- The badge and founder mark drift on a slow parallax. The hero stage is
  deliberately excluded — `#vine-origin` is anchored inside it, so moving it would
  drag the stem away from the flower it grows out of.

Element-to-stem mapping is done by sampling the centreline into a y-to-fraction
table once per build, so any element can ask "when does the light reach me?".
Dormancy lives entirely inside `filter` (including its opacity) — the split-text
helper writes inline `opacity` on those same elements, and an inline value would
beat any class rule.

### Mobile

The phone layout used to give the vine its own lane — a 96px corridor down the
left with the content indented out of its way. That is gone. It made the stem a
thing the page had to make room for, and it cost the copy a quarter of its
measure on the narrowest screen there is: a 257px column inside a 375px
viewport, about 34 characters a line.

The lane existed because the stem had nowhere to go that was not text. The fix
was the premise, not the layout: on a phone the router treats body copy as
something it may pass *behind* and only headings, section numbers and the
contact address as hard obstacles. So the vine threads the page instead of being
given a corridor beside it, and the section padding is symmetric like every
other layout.

Measured after: 3.1% of the route over a heading, 14.4% behind body copy, 55
characters a line, and the page 8% shorter. The desktop route this is modelled
on spends 18% of its length over text.

The spine crosses the page rather than hugging one side. Every `.vine-node`
resolves to the left gutter on a phone — measured at x = 31, 27, 33, 31, 25, 35
across the six sections — so buildVine overrides them with two alternating
lanes. The crossing takes a whole section, about 1400px of scrolling, which is a
lateral slope of 0.15: gentler than anything the sways produce, so the wandering
costs nothing in twitchiness.

Leaves scale with depth (`0.72 + 0.95·f`), so the vine is visibly lusher the
further it grows. On mobile, leaves growing toward the text column are held to 60%
scale and 70% opacity while the gutter side grows full size — a leaf's tip lands
at `-30·sin(angle)` on x, which is what tells the two apart. Thorns are thinned
right down on phones, where they read as noise rather than detail.

### Why the curls looked blocky

The centreline was always a smooth spline — but the **ribbon drawn on top of it
was a polygon**. `ribbonSlice` emitted ` L ` segments between offset samples, and
around a tight curl those straight hops were plainly visible as flat facets. Both
edges are cubic fragments now, precomputed per segment so a sliced path is still
assembled by string concatenation.

Sampling follows **curvature** rather than arc length. Uniform sampling spends its
budget on the long easy stretches and arrives at a loop with a handful of points,
which is exactly where they are needed. Walking `ds + S·dθ` and stepping through
it evenly puts them where the curve bends, at no extra cost — which also means
far fewer samples overall.

Measured on the rendered outline, away from the tip cap and base seam: average
turn 2.2° between 7px samples, and 0.25% of samples above 25°.

### Routing through negative space

The route used to be a shape drawn near the content; now it is a shape drawn
*around* it.

- **Obstacles are text runs, not containers.** Measured from `Range` boxes, so a
  paragraph blocks only the width its lines actually occupy — a container spans
  the page while its text may fill half a line.
- **Waypoints slide into the nearest free interval** at their height, wide enough
  to hold the stem.
- **A vertical lookahead window.** Checking a point's exact y is not enough: a
  waypoint could sit in a clear gap between two paragraphs while the curve
  through it sliced across both. Each point accounts for text roughly 80px above
  and below.
- **Dense waypoints.** Pinning the corners does not pin the curve — the spline
  interpolates and bows straight back across a paragraph. A point every ~130px of
  descent leaves it nowhere to wander. Loop geometry carries a lock and passes
  through untouched.
- **Graphics are obstacles, and the check is ink, not boxes.** Measuring the
  stem against each figure's bounding box said the arc figure was crossed 43
  times; measuring it against the figure's actual drawn strokes said 4.21% of
  its ink on desktop, 0.91% on a phone. The box is `width: 100%` and mostly
  empty, so the box count was noise in one direction and the low mobile figure
  hid a real desktop problem. `#arcSvg` was the one graphic missing from the
  obstacle list; everything on the list overlaps 0% of its own ink. Adding it
  took the arc to 0% too.
- **Clearance is sized to the device.** A phone has no free column at all — the
  copy runs from 22px to 353px of a 375px viewport — so a desktop-sized
  clearance rejected every interval and the router silently fell back to
  unconstrained. It is tighter there, and body copy is passable rather than
  solid.

Text crossings, measured as the share of centreline samples landing on glyphs:
**19.7% → 2.2% on desktop** while keeping 92% of the page width. The phone
figure is no longer comparable and is not meant to be — it deliberately passes
behind body copy now (3.1% over headings, 14.4% behind paragraphs), because on a
375px screen the only alternative is a corridor beside the content.

### Graphics the stem shoulders aside

Stage icons and tenet glyphs drift sideways as the growing tip passes, then
settle back. Written through the standalone `translate` property rather than
`transform`, so it cannot collide with the reveal animations that write
`transform` on those same elements. They are also excluded from the obstacle set
— the vine avoids words, but pushes past graphics.

### Loops, not spirals

A curl is one wide, flat crossing that drifts downward as it goes — the width
from `rx`, the flatness from `ry`, and the drift is what keeps it an open loop
rather than something that closes back on its own start. Two or three turns of
shrinking radius read as a coiled spring; one crossing is what a vine actually
does.

Waypoints are placed **by y, not by fraction of the segment**. A loop fills a
band of its gap, and a sway positioned at a fixed fraction could land above
where the loop had already reached — the path then ran down past it and jumped
back up 149px, a 134-degree reversal near the final bloom. Working in y keeps
the whole run monotonically descending; the largest backward step is now 6px,
which is the loop's own curvature.

This used to be forced to one side on a phone, because the stem lived in a lane
down the left edge where a leftward sway would only pin against the clamp and
leave a flat spot the spline overshot coming off. With the lane gone it leans
either way, like the desktop route.

Measured on desktop: 93% of the viewport width, six crossings of the centre
line, average turn 1.9° between 6px samples, and **no turn above 30° anywhere**.

### Making the curls smooth

Three fixes, in order of how much they mattered:

1. **Centripetal Catmull-Rom.** The uniform form takes each tangent from the raw
   neighbour difference, which falls apart when consecutive spacings differ a
   lot — and they differ hugely here, with a spiral sampled every few pixels
   sitting between sway points hundreds of pixels apart. Centripetal
   parameterisation (alpha = 0.5) weights the tangents by distance and is
   provably free of cusps and self-intersections. Worst turn 176° → 51°.
2. **Integer turns, entered on the horizon of the circle.** With fractional
   turns the spiral exited at an arbitrary angle and the path had to hairpin
   back toward the next anchor — a 162° spike sitting on the outside of the
   loop. At a whole number of turns, starting at `dir > 0 ? π : 0`, the tangent
   points straight down at both entry and exit, matching the direction the path
   is already travelling. Worst turn 51° → 35°, and 30°+ kinks from 3 to 1.
3. **Not resampling.** Levelling the control-point spacing seemed like the
   obvious fix and made things *worse*: it turns a sway corner from "rounded
   generously because its neighbours are far away" into a sharp corner at 14px
   spacing. Removed.

Measured across the whole path, the average turn between 7px samples is 3.4°
with a single sample above 30°, and that one is the terminal point.

### Three things the curls broke

**A spline overshoots its control points.** Clamping the points inside the page
was not enough — on the curls' sharp reversals the curve itself bulged off the
left edge. `splinePath` takes a tension below 1, which shortens the tangents.

**A curl travels back upwards**, so raw y is not monotonic and cannot be binary
searched. Each sample is forced to advance by a minimum proportional to its own
arc length, and the result is rescaled so the last sample still lands on the true
bottom — see the growth-speed section below for why the minimum is proportional
rather than constant.

**The stem now crosses body copy.** Rather than pulling the swirl back in, the
text is lifted off it: a `text-shadow` halo in the ground colour, switched to
`--soil` inside the dark section. Invisible where nothing is behind it, and the
difference between crisp and muddy where the stem passes. The ignition keyframes
carry the halo through the pulse so it never drops out.

Three refinements since. The dark Kríos panel gets a third stop — near-white
text on near-black with a full-strength ember stem across it is the highest
contrast pair on the site, and two stops left the letterforms sitting *in* the
stem. The phone pair is tighter than the desktop 6/12 (3 and 10), because a
denser near stop is what separates a glyph from something directly behind it,
and the phone is where the stem crosses most. And the chat-thread figure's SVG
labels had no halo at all — every rule targeted HTML text — while the route
crosses that figure 60 times, more than any block of copy on the page; they get
it as a `paint-order: stroke fill` stroke instead of a blur, which is crisper on
11px type and costs no offscreen buffer.

### Why growth is keyed to y, not arc length

Scroll is linear in y; arc length along the stem is not. Wherever the vine
meanders sideways it consumes length without descending, so a stem driven by arc
length drifts away from what the reader is actually looking at — and blooms fire
early or late for the section they belong to. The centreline is therefore sampled
into a monotonic y-to-fraction table once per build and binary-searched (with
interpolation, so the tip glides rather than steps). The tip rides a fixed line
72% down the viewport.

This mattered most on wide screens, where the meander is up to 260px per segment
versus 22px on a phone.

### Why ornaments are scrubbed, never played

Every bloom, leaf, thorn and tendril is a paused timeline that gets `seek()`ed to
a position derived from scroll. Nothing is ever played or reversed, because
play/reverse carries hidden state: `reverse()` flips a tickable's direction
permanently, so after scrolling up and back down a later `play()` resumes
backwards and closes a bloom instead of opening it — and once a timeline has
completed, flipping it back does nothing at all. That is how flowers end up
appearing and vanishing at seemingly random points on the page. Scrubbing has no
state to desync and is exactly reversible.

Only the two or three ornaments currently under the tip re-render; everything
fully open or fully closed short-circuits.

### Three bugs the blooms were hiding

**`utils.random()` returns integers.** Its `decimalLength` argument defaults to
0, so every fractional call was silently rounding. All the per-flower size and
opacity jitter collapsed to exactly 1 — every bloom identical — and
`utils.random(0.22, 0.36)` for the shed petals rounded to **zero**, scaling them
out of existence. They had never once been visible. Any call needing decimals
now passes a precision.

**Ornament timing has to be measured in scroll pixels, not path fraction.** A
curl packs enormous path length into a few vertical pixels, so a fixed fraction
meant a bloom sitting beside one snapped open over about 40px of scrolling —
a pop, not an opening — while the same fraction on a straight run took ten times
as long. The smoother now damps in pixel space and every ornament carries a
`pxSpan`, so all of them open at the same rate wherever they sit.

**A bloom's petals settle in roughly the first quarter of its timeline.** The
springs stretch the tween durations well past their nominal values and the
pollen burst and shed petals trail after, so the window has to be wide enough
for that opening quarter to read as an unfurl. Measured: petals now ramp
0.01 → 0.10 → 0.29 → 0.54 → 0.79 → 0.97 across ~200px of scroll, against a
single 0 → 1 jump before.

### Nothing is symmetric

Each flower sits at its own angle, is a little larger or smaller than its
neighbours, and opens at its own tempo. Petals carry individual rotation and
scale jitter, as do the sepals. Leaf angle, size and opacity are genuinely
random rather than following the repeating `(j % 3)` pattern that was visible
down the stem. Four identical flowers on one stem read as clip art.

### Three traps that bite in production

**Clamp `deltaTime` on both ends.** The smoother damps on real elapsed time.
`deltaTime` can come back as a large *negative* number after a timer parks and
resumes, or after the tab is backgrounded — and `exp(-dt/95)` then overflows to
`Infinity`, making progress `NaN`. `NaN` never recovers, so the vine freezes for
the rest of the session. Anything outside one plausible frame falls back to 16ms.

**Never rebuild on viewport *height*.** On iOS, scrolling collapses the URL bar,
which fires `resize` with a new height. Rebuilding on that tears down and
regenerates the whole vine mid-scroll. Section padding is a fixed pixel value on
mobile for the same reason — with `vh` units the URL bar changes the page height
and the layout reflows as you scroll.

**A paused timeline renders its targets at full value.** The stem used to be
revealed by a mask that hid unplayed ornaments for free. Without it, closed
states have to be set explicitly (`utils.set(..., { scale: 0 })`), or every
flower renders fully open until the moment it is first touched.

### Two non-obvious things worth keeping

**There is no SVG mask.** The stem was originally revealed by masking the ribbon
with a dash-animated stroke, which re-rasterised an area the size of the whole
document every frame — the most expensive thing on the page on a phone. Instead
the ribbon's two edges are precomputed as path fragments and the grown portion is
assembled by string concatenation, only when the tip crosses a whole sample.
(That also retired a `createDrawable()` mis-measurement: a path inside `<defs>`
is never rendered, so its bounding rect is `0×0` and the measured length came out
1010px against a true 4612px.) `createDrawable` is still used for the tendrils,
sprouts and headline swash, which are all really rendered.

**The light pool is contained at its source, not by clipping.** It is 560px
wide and rides the tip, so near the right edge it pushed the document wider —
and `overflow-x: clip` on `<html>` did *not* actually stop the page panning
sideways. `#main` clips its own overflow instead, which is why the pollen canvas
lives outside `<main>`: it is `position: fixed` and would otherwise risk being
clipped with everything else.

**`html` uses `overflow-x: clip`, not `hidden`.** `hidden` would make it a scroll
container, and anime's `ScrollObserver` would then bind to it and read a
`scrollTop` that never changes — the vine would silently never grow. `clip`
contains the overflow without creating a scroll box.

## The trap that broke the stage icons

**An inline `transform` style silently overrides an SVG `transform` attribute.**
The Grow icon positioned its leaves with `transform="translate(48 58)"` on the
group, then anime animated `scale` on that same group. anime writes transforms as
an inline style — `style.transform = "scale(1)"` — and inline style beats a
presentation attribute, so the translate was wiped the instant the intro played.
The leaves jumped to the icon's top-left corner and stayed there; because
`.stage-icon svg` sets `overflow: visible`, they rendered *outside* the icon at
viewBox (-2.4, -18) rather than being clipped away.

It was invisible in a settled-state inspection: `getAttribute('transform')` still
returns the untouched attribute, and if the intro has not fired yet there is no
inline style to see. It only shows up if you read `style.transform` *after*
triggering the animation, or compare `getBoundingClientRect` against where the
element is supposed to be.

The same bug was in the Bloom icon, where each petal carried
`transform="rotate(72) scale(0.62)"` and was animated on `scale` and `rotate` —
which would have collapsed all five petals onto one angle at full size.

**The fix is the pattern the hero flower already used:** one group holds the
placement as an attribute, a nested group is what anime animates. The two
compose instead of competing. The animated groups also need
`transform-origin: 0 0`, because the CSS default of `50% 50%` resolves against
the *SVG viewport* under `transform-box: view-box`, not the element — so a leaf
would slide sideways as it grew.

An audit for the pattern site-wide (`svg [transform]` carrying any inline
`transform`/`scale`/`rotate`/`translate`, after scrolling the whole page to fire
every intro) now reports zero conflicts.

While in there, the three icons were drawn on three different ground lines —
y = 70, 78 and 82 in identical 96-unit viewBoxes — so the horizon visibly stepped
across the row. They share y = 78 now. Plant's seed was also floating 14 units
above its own soil with its ripples drawn *below* the line; it rests on the
ground and the ripples break from it. Both stems were dead-straight vertical
rods and now carry a slight S-curve, and the Bloom flower's fan is offset 36
degrees so a notch, not a petal, sits where the stem enters.

## Triggering strategy

- **anime `onScroll()`** for anything scrubbed: the vine, the Kríos word reveal.
  Thresholds are `"[container] [target]"` — `enter: 'top top'` / `leave: 'bottom
  bottom'` puts progress 0 at `<main>`'s top and 1 at its bottom.
- **IntersectionObserver** for one-shot reveals, where an exact visibility
  threshold matters more than scrubbing.

The vine's scrub is smoothed through an anime `createTimer` that lerps toward the
observer's raw progress and parks itself once caught up, so no timer runs at idle.

## Two silent failures worth remembering

**The chips flip-in never ran.** The IntersectionObserver was given each
`<li data-reveal>`, but the special case that flips them checked
`classList.contains('chips')` — which is the `<ul>`. So the branch was dead and
the chips fell through to the generic fade. The list is the reveal target now.

**The ignite keyframes animated `transform`.** Ten of the elements they apply to
are also revealed by anime, which writes an inline transform — and a CSS
animation outranks inline styles. Igniting an element whose reveal was still in
flight hijacked it for 1.5s and snapped it back at the end. The flare gets its
punch from colour and glow only; it does not touch transform.

Both were invisible in the sense that nothing errored — the page just quietly
did less than it claimed to.

## Performance

Measured, not guessed. The frame cost of one engine tick while scrolling, at
1440px, median of 40 samples taken a real frame apart:

| | before | after |
|---|---|---|
| scrolling, median | 17.0ms | **6.6ms** |
| scrolling, p90 | 26.0ms | 13.4ms |
| scrolling, worst | 46.6ms | 19.8ms |

Budget is 16.7ms. Three things were responsible, in order of size:

**A geometry query in the render loop.** `getPointAtLength` on the 15,000px
centreline costs **1.7ms on its own**, and it was called every frame to place the
tip — immediately *after* writing path data, which forced a full geometry flush
of a 700-node SVG. The centreline samples are already computed when the ribbon is
built, so the tip is interpolated from that table and the path is never queried at
render time. Same fix for the parallax layers, which were calling
`getBoundingClientRect` on every scroll event and forcing a synchronous layout of
the whole page before anything could be written.

**Ambient loops belonged in CSS.** Forty anime tweens cost 10.4ms of every frame
(with all of them paused: 0ms). Twenty-five targeted `<g>` elements inside the
vine, and writing SVG transforms from JS forces geometry work across the whole
SVG on each tick. The flower sways, shed petals, tip sparks, hero breathing,
aurora drift, halo, kicker dot and scroll cue are all CSS keyframes now, handed to
the compositor — and on a phone the marquee too. They use the standalone `rotate` / `translate` / `scale`
properties, never `transform`, so they cannot collide with a scrubbed transform on
the same element. anime keeps what it is uniquely good at: the scroll-scrubbed
timelines. Active tweens went from 40 to 9.

**The ribbon's bounding box is the height of the document**, so rewriting its `d`
invalidated a page-sized raster region every frame. It is drawn as two paths now:
a settled body that only changes every 14 samples, and a short piece at the tip
that changes each frame. Per-frame path data went from 35,500 characters to 891.

Timers park themselves rather than idling: the cursor ring stops once it has
caught up, the marquee's rate timer once it has eased back to normal, and the
hero's motion-path seeds pause when the hero scrolls away.

Two things measured cheap and were left alone: the pollen canvas paints a frame in
0.04ms, and swapping the ribbon's path string is 0.97ms.

## Second pass: paint, not script

The script budget was fine after the first pass; what remained was paint. These
were reasoned about rather than measured, because the tooling here can time
JavaScript but not rasterisation.

**The settled ribbon is now fixed chunks.** Rebuilding one long path handed the
browser 36KB and 840 fresh curves to tessellate roughly thirty times per scroll,
and that path's bounding box is the height of the document, so each rebuild
dirtied a page-sized region. The stem is built once as chunks that are only
switched on as the tip passes, plus one short live path at the tip. Nothing else
is rewritten while scrolling.

The chunk count is a frame budget, not a cosmetic setting: the live tip spans
from the last settled boundary to the growing end, so chunk size *is* the
repaint rectangle. It was 22 on desktop and 14 on a phone, which is backwards —
a narrow screen turns the same arc length into a much taller slice, and that
rectangle measured 151x513px on a 375px viewport, two thirds of the viewport
height re-rasterised every frame. Now 56 and 68. Per-frame repaint area:
**143,052 → 32,336 px² on desktop, 77,463 → 18,377 px² on mobile**, and the path
string rebuilt each frame roughly halves with it. The cost is static `<path>`
nodes, drawn once and then only switched on.

**Off-screen flowers are parked.** Moving the ambient loops to CSS took them off
the main thread, but a keyframe step on a bloom halfway down the page still
dirties the SVG it lives in. Each bloom carries `vine-idle` until it is within
260px of the viewport, which pauses its sway and its shed petals.

**The sticky nav was re-blurring the page behind it every frame.** A
`backdrop-filter` of 14px plus a saturate pass, recomputed against the scrolling
content. It is gone entirely now — see the third pass below.

Smaller: the vine sheds nodes — motes 70 → 44, thorns 44 → 28, and veins only on
leaves large enough to show them. (Node counts have since risen again with the
chunk change above, deliberately: static nodes traded for per-frame raster.)

**One change considered and rejected:** making the vine a viewport-sized fixed
SVG translated by `-scrollY`. It would cut the rasterised area from a
1425 × 6400 surface to one screen, but the vine would then be positioned by
script rather than scrolled by the compositor — and on a phone, where scrolling
is async, it would visibly lag behind the page it is drawn over. Being
absolutely positioned means it scrolls in perfect sync for free.

## Third pass: windowed viewports and the last of the paint

Reported as "the stem goes too fast and goes beyond the page", plus still laggy,
plus a note that most people don't browse fullscreen. Three separate things.

**Off the page at windowed widths.** The vine's horizontal inset was a flat 40px.
The spline bows past its own control points on the sharp reversals, so at a
1165px window the curve was reaching about 17px off the left edge and getting
clipped flat against it — a straight vertical scar where a curl should be. The
inset is now `max(70, W * 0.055)`, which gives the overshoot room to exist at any
width. Measured after: visible vine spans x 45 → 1099 on a 1165px page.

**"Too fast" was the smoother catching up.** The obvious suspect was the growth
curve — the tip advances in y, and a minimum-step clamp rescales it — so I
measured the distortion end to end expecting ~25%. It came back at 1.7%, which
nobody can see. The real cause was the exponential damping on `curY`: it closes
the gap at a rate *proportional to the gap*, so a hard fling that leaves the tip
2000px behind makes it race down at roughly 21,000 px/s to catch up — about ten
times a brisk scroll.

The step is now clamped to `dt * 6` px, i.e. 6000 px/s, and the time constant
dropped 95ms → 70ms so there is less backlog to work off in the first place.
Normal scrolling never touches the cap: at 3000 px/s the tip settles about 234px
behind, needing 48px per frame against a 96px ceiling. Only the teleport case is
tamed — pressing End now runs the vine down the full 5273px page in about two
seconds instead of whipping through it.

**`backdrop-filter` removed entirely.** Reducing it to 6px was not enough. Any
radius at all means the compositor re-reads the page underneath the nav and
re-blurs it on every frame of every scroll, on a strip that spans the full width.
The nav is now flat `rgba(253, 248, 242, 0.94)`. At that opacity, over this
palette, the difference is invisible; the cost is not.

**The ignition flare was a 1.5s filter animation on text.** Every element the
vine lights ran `saturate` + `brightness` for a second and a half, and filters on
text force a re-raster of the glyphs each frame. Ten of them could overlap. The
flare is 0.8s now and the `brightness` component is gone — `saturate` alone gives
the same "it woke up" read, and the settled state is `filter: none` so nothing
lingers.

**Fewer things in the SVG.** Thorns 28 → 18, tendrils 14 → 9, ribbon samples 420
→ 340. `#vineLight` — a 720px radial-gradient div riding the tip, i.e. the single
largest continuously-repainted surface on the page — is 520px (300 on mobile).
`will-change: translate` came off `[data-push]`, which was promoting a dozen
elements to their own layers permanently to serve an animation that runs once.

SVG nodes are 698 on desktop at a windowed width.

## Fourth pass: the idle cost, and the logo

**The page was burning 6ms a frame doing nothing.** A single `onScroll`
observer — one, for the scrubbed Kríos word reveal — re-read its target's rect
on every engine tick, for the whole session, at every scroll position,
including while the page sat still at the top nowhere near that section. A
forced layout on this page costs about **22ms** because of the vine's SVG, so
that one observer was paying a slice of it sixty times a second.

It is now scrubbed from a cached document offset the same way the parallax
layers already were: measure once, refresh on resize, and derive progress from
`scrollY` with no layout reads. Idle cost went **6.00ms -> 0.87ms per tick**,
and after the second fix below, to zero.

**Three more permanent tweens came from `createAnimatable`.** The hero flower's
pointer tilt held one live tween per property, and they ticked for the life of
the page whether or not the pointer had ever been near the hero. Replaced with
the self-parking timer pattern the cursor ring already used — it eases
identically, then stops itself. The hero's box is now read on `pointerenter`
rather than on every `pointermove`, for the same reason as above.

Desktop idle went **5.41ms -> 0ms**; mobile **6.00ms -> 0ms**. The marquee is
the one permanent tween left on desktop, and it earns it there: a visible ticker
whose rate reacts to scrolling. On a phone it was the opposite trade — a
permanent main-thread tenant competing with the vine for frames to move a
decoration — so it is a CSS animation there instead.

Smaller, in the same pass: `shoulder()` wrote `style.translate` on every
pushable every frame, re-writing the same empty string for the ones nowhere
near the stem — now only written when it changes. On phones the tip's light
pool (a 300px gradient riding the stem across a 375px screen) and the aurora's
three drifting blur layers are off; they are atmosphere, and not worth being
the reason the page stutters.

**A measurement worth not repeating.** An early attempt to find the vine's
horizontal extent read the raw `d` strings of every path in the SVG. That is
wrong: a path's `d` is in its own local coordinate system, so the petal shape —
literally `M0 0 C -11 8, -13 28, 0 38` — reported x = -13 and looked exactly
like the vine hanging off the left edge. Rendered geometry is the only honest
source for where something actually is.

**The real overflow was the flowers, not the stem.** `inset` constrains the
control points, and a centripetal spline bows past them on the sharp reversals,
so `fitPathX` now measures the curve's true extrema — endpoints plus the roots
of each cubic's derivative — and maps them into the page. A cubic is
affine-equivariant, so scaling every control-point x scales the curve's extent
by exactly the same factor; the correction is typically under 4% and it is
correct at any width instead of tuned for one. But a flower is centred *on* the
centreline and its petals reach ~38 units times its scale, so on a phone the
blooms still hung off the edge. The mobile band is now 12% of the width and the
mobile bloom scale eased slightly. Petals measured at x = 24..328 on a 375px
page, and 55..1243 on a 1265px one.

**The Kríos logo is vectors now.** It was a 500px white PNG recoloured by a
six-function CSS filter chain (`brightness(0) invert(86%) sepia(24%)
saturate(600%) hue-rotate(315deg)`), which meant a filter pass on every paint,
softness at any size, and no way for the vine to light it. The mark was traced
from the PNG's own alpha channel — row-by-row opaque runs, fitted to straight
edges — and rebuilt as five paths. Rasterising the result and comparing it
against the original gives **97.5% pixel overlap**, with the remainder a
single-cell antialiasing fringe.

Worth knowing if you ever redraw it: the mark is *not* vertically symmetric.
The leg splays about 8px further right than a mirror of the arm would. A first
pass "corrected" that and the overlap sat at 89% with a systematic offset down
the whole lower half; matching the original letterform took it to 97.5%.

## Fifth pass: growth speed, and the Kríos graphic

**Why the stem bolted at the curls.** How fast the stem *appears* to grow is
(arc length per sample) / (y per sample). Samples are uniform in arc length, so
the stem races wherever the y-table advances slowly — which is precisely what
the minimum-step clamp creates: inside a curl, which travels back upwards, y is
forced along at a fraction of a normal step while the stem still has a whole
loop of ribbon to draw.

Measured at a windowed 1165x720: median 2.2 arc-px per scroll-px, with spikes to
**4.67x** the median, the worst of them mid-Kríos — exactly where it was
reported.

That whole approach was eventually thrown away. Every version of it was the same
shape — a single constant floor on how far the table may descend per sample —
and a constant floor cannot win: set high (0.85, 0.55) it does spread the loops,
but it drives the table down the page faster than the path descends
*everywhere*, and since the table is then rescaled to end in the right place the
tip drifts off the line being read (measured at 144px, then 924px on the phone).
Set near zero (0.02) the tip tracks perfectly and the loops snap open in a single
scroll position. Re-measured with a finer probe, that last setting was spiking to
**71x** the median rate at the curls on desktop and 63x on mobile. That is the
teleporting.

**The floor is now proportional to arc length rather than constant:**
`dy_min = α·ds`. On a vertical run `ds ≈ dy`, so with α below 1 the real path
wins and the table is untouched — no drift, which is what a constant floor could
never offer. Inside a loop `ds` is all there is, so the loop is handed scroll
distance in proportion to its length and the rate there is capped at `1/α`. One
rule, binding only where the stem was racing.

α is read off the path rather than guessed: it is set from the rate the stem
draws at where it is simply descending, so the cap is expressed as a multiple of
the vine's own natural speed and means the same thing on any layout. The
trade-off curve, measured on desktop where the natural rate is 1.55 arc-px per
scroll-px:

| cap | fastest stretch | tip lag |
|---|---|---|
| none | 71x | 129px |
| 6x | 4.4x | 169px |
| **3x (shipped)** | **2.0x** | 222px |
| 2x | 1.0x | 285px |

A 2x cap makes the speed literally constant, but then nothing follows the path's
own descent and the lag is a third of a screen everywhere rather than only while
a loop unwinds. Simulating the tip's on-screen position across the whole scroll
range at the shipped setting: desktop median 753px → 750px of a 900px window,
worst case 641px → 557px; mobile median 669px → 667px, worst case unchanged;
never off screen on either.

One thing tried and rejected, measured: **blending the whole table toward a
straight ramp.** Mathematically tidy — both curves are monotonic so any blend is
too — but it re-anchors the entire mapping rather than only the curls. The table
has to keep following the real path wherever the path is behaving, or the tip
stops agreeing with what you are reading.

**The Kríos graphic was a waveform.** A run of bars across a REP / PROSPECT
timeline, with some marked OBJECTION. It looked like audio, and if you had never
seen Kríos there was nothing in it that told you what the product does. It is
now literal: a door, three objections coming back at it, the rep's answer to
each, and a dashed loop round to run it again, captioned
"EVERY OBJECTION, REHEARSED" — the site's own wording.

The three objection lines ("Not interested", "No time right now", "Already
sorted") are ordinary door-to-door objections, not claims about Kríos. They are
there so the picture reads without prior knowledge; swap them for the real ones.

The animated groups deliberately carry **no** `transform` attribute, so they are
immune to the inline-style-beats-attribute trap that broke the stage icons.

## A note on verifying in a hidden preview pane

Several things silently do not work when the Browser pane is hidden, and each
one cost a wrong conclusion at least once:

- **`IntersectionObserver` never fires.** Not late — never. A fresh observer on
  an element scrolled into view reported nothing at all. Every `data-reveal` on
  this page therefore measures as opacity 0, which looks exactly like a broken
  reveal. Drive the animation by hand to check the end state.
- **Screenshots return stale frames.** The pane composites nothing while hidden,
  so `computer{screenshot}` hands back whatever was last painted.
- **`setTimeout` is clamped to ~1s**, so any poll loop blows the tool timeout.
- **Subresources come from cache.** `location.replace('?v=N')` busts the HTML but
  `/main.js` has no query string and is served from cache, so edits appear not to
  take effect. The tell is a rate profile that comes back *byte-identical* across
  three different versions of the code. Always `fetch(url, {cache:'reload'})`
  first, then reload, and check `performance.getEntriesByType('resource')`.
- **Absolute per-tick timings are not trustworthy.** Large relative deltas are.
- **`resize_window` preset "desktop" collapses the viewport to 0 width**, and the
  vine refuses to build below 1px. Set an explicit width/height instead.

## Housekeeping

Things a polish pass turned up, kept here because they are the kind of thing
that quietly comes back:

- **Loops must be reverted on rebuild.** A rebuild empties the vine's SVG, and
  any looping tween left playing goes on animating detached nodes for the rest
  of the session — a leak that grows with every resize. Every continuous
  animation (sways, shed petals, tip sparks, the tip's pulse) is collected
  alongside the scrubbed timelines so teardown can stop them. Verified: three
  forced rebuilds leave the active-animation count and DOM node count unchanged.
- **Idle cost.** Shed petals are parked while their flower is shut and the tip's
  sparks while the tip is off screen, which took the resting animation count
  from 50 to 26 on desktop and 30 on mobile.
- **The roots observer** is disconnected before a rebuild makes a new one.
- **The reduced-motion build was drawing the stem but not its lit edge**, so the
  highlight was a single point. It now mirrors the ribbon, and the motes settle
  to a low glow rather than being absent, so the static render is the finished
  plant rather than a half-built one.
- **Focus rings** use the hot ember tone on the dark grounds, where the standard
  ember only reaches 4.3:1 against 11.5:1.
- Removed: an unused `.hf-pollen` group, a dead `.hero-lede .word` rule, and
  four unreferenced custom properties.

## Boot

Two ways the page could come up dead, both fixed, both worth not reintroducing:

**Never gate boot on `document.fonts.ready` alone.** Waiting for it gives the best
measurements, since every geometry here is taken against laid-out text. But that
promise can sit pending indefinitely — an inlined data-URI face reports
`unloaded` while `document.fonts.status` already says `loaded`, and it never
settles. `start()` was then never called, nothing was built, and the 2.5s guard
stripped `.js`, leaving bare static HTML with no vine and no graphics. Fonts are
a preference now, with a `load` listener and a 1.2s hard backstop; if they settle
late the vine simply re-measures. The hang is intermittent, which is exactly why
the backstop matters rather than a fix aimed at the font itself.

**A ResizeObserver only fires on a change.** `buildVine` bails when `<main>` has
no width (hidden container, print, pre-layout) and used to rely solely on the
observer to try again — but if the size settles before boot runs, the observer
sees nothing and the vine never appears. It now retries every 250ms until it has
real dimensions.

## Degradation

- `prefers-reduced-motion: reduce` → the vine builds fully grown, every bloom open,
  all content visible. No loops, no scrubbing.
- Module fails to load → an inline `<head>` guard strips the `.js` class after
  2.5s and every animated element falls back to visible.
- `splitText` throws → the parent is simply made visible and the animation skipped.
- `<main>` measures zero (hidden container, print) → the vine skips the build and a
  `ResizeObserver` rebuilds it as soon as there are real dimensions.

## Accessibility

Skip link (the old site had none), `aria-hidden` on every decorative SVG, real alt
text and explicit dimensions on the Kríos logo, visible `:focus-visible` rings,
`scroll-margin-top` on sections so anchors clear the sticky nav, and `Organization`
JSON-LD.

## Copy

**Everything on this page is derived from the original site's own wording.** The
tenets restate lines that were already there ("built and led by its founder",
"patience and precision", "releasing only what earns its place", "we answer to
the work, not to a quarter"). The lifecycle stages restate Plant / Grow / Bloom.
The Kríos additions restate the existing paragraph.

**Nothing was invented** — no metrics, no customer counts, no founding year, no
product features beyond what the site already claimed. The new prose is still
*new prose*, though, and it speaks for the company: it needs your sign-off before
it ships.

## Original copy notes

All factual claims are carried over verbatim from the existing site — company
description, the Plant/Grow/Bloom text, the Kríos paragraph, the founder's name and
role. The three Kríos chips are rephrasings of that same paragraph. **Nothing was
invented**: no metrics, no customer counts, no founding year. If you want figures on
the page, they need to come from you.
