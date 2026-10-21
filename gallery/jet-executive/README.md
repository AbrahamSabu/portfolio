# Jet Executive Travel — static site

A rebuild of jetexecutivetravel.ie as plain static HTML. No WordPress, no page
builder, no plugins. Eleven pages, one stylesheet, one script.

## Why it looks like this

The brand gold measures **1.83:1** against white and **10.41:1** against the
house black. The old site put gold on a near-white page, which is why it read as
washed out. This build is dark-committed: the ground is always dark, gold is
only ever an accent, and every text/background pair passes WCAG AA.

## Running it

Open `index.html` directly in a browser — everything is relative, so it works
from the filesystem. For a proper local server:

```bash
node dev-server.mjs
```

## Deploying

Upload the whole folder to any static host (Netlify, Cloudflare Pages, Vercel,
or plain Apache/nginx). There is no build step and no server-side code.

Before switching DNS, set up redirects from the old WordPress URLs:

| Old | New |
| --- | --- |
| `/services/airport-transfer/` | `/airport-transfers.html` |
| `/services/corporate-chauffeur-services-dublin/` | `/corporate-travel.html` |
| `/services/business-travel/` | `/business-travel.html` |
| `/services/wedding-chauffeur-services/` | `/weddings.html` |
| `/services/premium-event-chauffeur-services/` | `/events.html` |
| `/about-us/` | `/about.html` |
| `/contact/` | `/contact.html` |
| `/review-gallery/` | `/index.html#reviews` |
| `/luxury-chauffeur-services-dublin/` | `/index.html` |
| `/blogs/` | *(no equivalent — decide whether to rebuild the two posts)* |

---

## Before you go live

Everything below shows on the site as a red dashed **TODO chip**, so you cannot
ship it by accident. Search the HTML for `class="todo"` to find them all.

### 1. Fares — `index.html`
Six journeys are listed with `Set fare` placeholders. These are deliberately
blank: publishing invented prices for a real business would be worse than
publishing none. Fill in your real fares in `build.mjs` (the `#fares` table) and
re-run the build, or edit `index.html` directly.

### 2. Star rating — `index.html`
The **117** review count is real (taken from your live Trustindex widget). The
average rating is not — I could not read it reliably, so it is a placeholder.
Get the real figure from your Google Business Profile and put it in two places:

- the visible `Confirm rating` chip, and
- the commented-out `aggregateRating` block in the `LocalBusiness` JSON-LD at
  the top of `index.html`.

**Do not guess this number.** An invented `ratingValue` is schema spam and risks
a manual action. Once the real one is in, you get star ratings in Google
results — the single highest-value change available to you, and you have
already paid for the reviews.

### 3. Opening hours — footer and `contact.html`
Your old site said "7 days, 9am to 5pm" while its own FAQ promised real-time
flight tracking for delayed arrivals. Those cannot both be true. Decide which it
is and put it in `BIZ` in `build.mjs`, plus `openingHoursSpecification` in the
schema.

### 4. Car capacity — `about.html` and `index.html`
Passenger seats and luggage capacity are placeholders. Fill in what you actually
carry comfortably, not the manufacturer's maximum.

### 5. Sprinter and partner vehicles — `fleet.html`, `index.html`
Passenger count, luggage capacity and on-board amenities for the Sprinter are
placeholders, because they depend on which vehicle the partner chauffeur brings.
Either pin them to the configuration you usually get, or reword to a range.

The copy is deliberately explicit that the Sprinter is **not owned** — it says
"arranged through chauffeurs we work with and vouch for". Do not soften that into
implying it is your own vehicle; it is both untrue and the kind of thing a
customer notices on the day.

### 6. Form delivery — `assets/js/site.js`
At the top of the file:

```js
var FORM_ENDPOINT = "";   // e.g. "https://formspree.io/f/xxxxxxx"
```

While this is empty the booking form falls back to opening the visitor's mail
client — it never pretends a booking was sent when it was not. Set an endpoint
(Formspree, Netlify Forms, Web3Forms, or your own handler) before launch.

### 7. Analytics — `assets/js/site.js`

```js
var GA_MEASUREMENT_ID = "";   // e.g. "G-XXXXXXXXXX"
```

Empty means no analytics at all. When set, the tag loads **only** after the
visitor accepts the consent banner. Nothing third-party fires before that.

### 8. Privacy notice — `privacy.html`
Written from what the site actually does, with a retention period left blank.
Have someone check it before launch.

### 9. Reviews widget — `index.html#reviews`
There is a bordered slot waiting for your existing Trustindex embed. Drop it in.
It is placed after first paint deliberately, so it costs nothing on load.

---

## What changed, measured

Both columns measured in a real browser against the actual pages.

| | Old site | This build |
| --- | --- | --- |
| Requests | 156 | **9** |
| Page weight | 4.22 MB | **396 KB** |
| DOM nodes | 1,765 | **552** |
| Stylesheets | 62 | **1** |
| Third-party hosts | 7 | **0** |
| Width in a 375px viewport | 552 px (47% overflow) | **375 px** |
| Typefaces | 7 | **2** |
| Golds | 3 | **1** |
| Headings on the homepage | 37 (7 were contact details) | **28 (0 are)** |
| Generic "read more" links | 6 | **0** |
| Images with camera-roll alt text | 2 | **0** |
| Unlabelled form inputs | 2 | **0** |
| Cookie consent | none | **blocks everything until accepted** |
| Schema | `Article` | `LocalBusiness` + `Service` + `FAQPage` |
| `lang` | `en-US` | `en-IE` |

Largest single image went from **1.94 MB** to **147 KB**. The entire image
library — 12 photographs at three widths each — is 2.6 MB, less than half of
what one photo used to cost.

The homepage grew from 305 KB to 396 KB when the fleet selector, the
how-it-works steps and the coverage grid were added. That is still one
twenty-fifth of what the old site shipped, and the vehicle drawings are inline
SVG, so they cost bytes but no extra requests.

---

## Structure

```
index.html              home
services.html           services hub
airport-transfers.html  ┐
corporate-travel.html   │
business-travel.html    ├ five service pages
weddings.html           │
events.html             ┘
fleet.html              the fleet + vehicle selector
about.html              the standard, how it works
contact.html            booking form
privacy.html            privacy & cookies
sitemap.xml, robots.txt

assets/css/site.css     design system + self-hosted @font-face
assets/js/site.js       behaviour + motion, ~16 KB unminified
assets/fonts/           6 woff2 files, 196 KB, self-hosted
assets/img/             12 photographs × 3 widths, WebP

build.mjs               regenerates the HTML from shared templates
build-images.sh         regenerates the image set from originals (needs ffmpeg)
dev-server.mjs          local preview only
```

Editing the HTML directly is fine. If you would rather keep the pages
consistent, edit `build.mjs` and run `node build.mjs .` from this folder — it
rewrites all eleven pages from the same templates.

### The vehicle drawings

The three silhouettes in the fleet selector are **traced from photographs**, not
drawn by hand, so the proportions are the real vehicles' rather than an
impression of them.

How they were made (`build.mjs` holds the finished paths; the tracer itself is
in the project scratch, and can be re-run if you get better source photos):

1. A true side-elevation photograph is segmented — flood-fill from seed points
   on the paintwork for a light vehicle, or a luminance threshold plus largest
   connected component for a dark one.
2. The roofline is median-smoothed, which removes wing mirrors, aerials and roof
   beacons — things that belong to that particular vehicle, not to the model.
3. The outline is simplified with Ramer–Douglas–Peucker.
4. Wheels are found separately: a Hough-style circle search for dark tyres, or
   bright-alloy blob detection on a dark car.
5. Tyre radius is then **solved from published dimensions** rather than trusted
   from the detector, so the wheels, arches and ride height all agree:
   for `2r / H = p`, `r = p(axle − roof) / (2 − p)`.

| Vehicle | Source | Ratio checked |
| --- | --- | --- |
| E-Class | Traced from a side-on photo of a black W213 | tyre/height 0.479 vs 0.479 real |
| Sprinter | Traced from a side-on photo of a Sprinter panel van | 0.285 vs 0.282 real |
| S-Class | **Derived**, not traced — see below | 0.462 vs 0.479 real |

**The S-Class is the honest exception.** Every usable reference photo of one is
a dark car against a dark or textured background, and no segmentation method I
tried separated it cleanly. Rather than ship a third hand-drawing, it is the
traced E-Class stretched horizontally by the real length-to-height ratio
(W213 4923/1468 = 3.354 → W223 5289/1503 = 3.519, so 4.9% longer at the same
height). That gives a correct *proportion* but not the S-Class's own roofline
and C-pillar.

**If you send one side-on photo of your actual S-Class**, it can be traced
properly like the other two — and being your own car, it would be more accurate
than any stock reference anyway. The same goes for the E-Class.

On the reference photos: they came from Wikimedia Commons and were used only as
tracing references. What ships is original path geometry, not the photographs,
and none of them are redistributed with the site.

### The vehicle morph

Switching vehicles does not swap one drawing for another; it morphs the outline,
so the E-Class visibly lengthens into the S-Class and grows into the Sprinter.
The fleet reads as a range rather than three separate pictures.

Path morphing normally looks awful because the two shapes have different point
counts and the outline writhes as it interpolates. That is avoided here by
construction: each traced outline splits into an x-monotonic top run and an
x-monotonic bottom run over the same x range, so all three are resampled onto
**one shared 97-column x-grid** (`morph.mjs`). Nose maps to nose and roof maps
to roof automatically, and the animation reduces to interpolating two arrays of
y values. Every intermediate frame is a coherent vehicle.

The whole dataset is **4 KB** of JSON and there is one SVG in the DOM instead of
three. The markup ships the E-Class drawn statically, so the component is
correct before — and without — JavaScript.

Two details worth keeping if you edit it:

- Once a path morphs, its length changes, so the draw-in dash pattern is
  cleared. Leaving it set clips the far end of the outline.
- The animation runs on `requestAnimationFrame`, which is paused in a hidden or
  throttled tab. A timer forces the final state independently, so a switch can
  never leave the car frozen half-way between two shapes.

### Fonts

Bodoni Moda (display) and Archivo (body) are **self-hosted**, not loaded from
Google. That is deliberate: serving Google Fonts from an EU site discloses every
visitor's IP address to Google before they have consented to anything. Six files,
196 KB, no third-party connection.

---

## The motion

Everything moves for a reason, and the reason is always the same one: **light
travelling across a polished surface.** Nothing bounces or spins.

| Effect | Where | Notes |
| --- | --- | --- |
| Headlight sweep | Homepage hero | Once per session (`sessionStorage`), then the photo settles lit |
| Gold-leaf wipe | Section headings | Gradient clipped to the text, no JS per heading |
| Route spine | Homepage services | Line fills and stops light as you scroll |
| Specular sweep | Service cards | Highlight crosses the card on hover |
| Odometer | Stat strip | Counts to 117, tabular figures so digits do not jitter |
| Magnetic button | One CTA per page | Pointer devices only, max 9px of travel |
| Parallax | Hero | 11% of scroll, capped — depth, not a gimmick |
| Vehicle line-art | Fleet selector | The outline draws itself in on first view |
| **Vehicle morph** | Fleet selector | Switching vehicles **morphs** one outline into the next — the car lengthens and grows — with the highlight crossing it as it settles |
| View transitions | Between pages | Native API where supported, ignored elsewhere |

All of it is transform/opacity/mask only, and **all of it stops** under
`prefers-reduced-motion: reduce`.

---

## Known trade-offs

- **Single visual theme.** There is no light mode. The contrast measurement
  above is the reason; a light version of this brand needs a different, darker
  gold, which is a separate design decision.
- **`backdrop-filter` on the sticky header.** It looks good and costs a little
  compositing work on low-end phones. Drop `backdrop-filter` from `.hdr.is-stuck`
  if you would rather have the frames back.
- **One photograph is reused** across the contact page and the homepage gallery.
  Twelve usable images is not many; a half-day shoot would fix it.
- **The two Adobe Firefly images from the old site are not used here.**
  Generated imagery mixed into a portfolio of real work undermines the real
  work, and the real photography is the best asset the business owns.
