# Coffee Brothers — Website

A single-page site for Coffee Brothers, a cosy coffee stand on Western Road, by the Mardyke, Cork.

## What's in this folder

```
coffee-brothers/
├── index.html      ← the whole site (HTML + CSS + JS, no build step)
├── images/         ← drop your real photos in here (see list below)
└── README.md       ← this file
```

Everything is self-contained in `index.html` — nothing to compile or install. Open it directly in a browser to preview it, or deploy it as-is.

Fonts (Instrument Serif + Inter + IBM Plex Mono) load from Google Fonts over the internet, so an internet connection is needed to see the intended typefaces — it still works offline, just with fallback fonts.

## Design

Palette is black, wood, and silver — matching the brand colours you gave: a near-black ink base, warm walnut-wood accents (eyebrow marks, tags, the nav dot, the divider under the hero), and cool silver touches on the dark sections (opening-hours times, the marquee text).

## Animations included

- Staggered hero headline reveal on load (each line fades/slides in with its own delay)
- Scroll-triggered fades on every major section (`IntersectionObserver`-based)
- Cursor-follow spotlight glow on the menu cards
- Shimmer sweep on the main "Get Directions" button
- Animated count-up stats (1 stand, 7 days open, 8am weekday opening, 0 bookings required)
- A pausable marquee strip — hover pauses it, and there's a dedicated play/pause button for accessibility
- Everything respects `prefers-reduced-motion`: animations are disabled/instant for anyone with that OS setting on

## Images

All photo slots are filled with real photos of Coffee Brothers (resized and compressed for web — 60–150KB each). Here's what's where and what to swap it for if you get a better shot later:

| Filename | Used for | Currently shows |
|---|---|---|
| `images/hero.jpg` | Full-bleed hero background (top of page) | The stand at night, lit up with fairy lights |
| `images/stand.jpg` | Story section image + the location card in "Find Us" | The stand's exterior in daylight, chevron wood cladding and sign |
| `images/dish-1.jpg` | "Flat White" card | Latte art heart in a Coffee Brothers cup |
| `images/dish-2.jpg` | "Takeaway Coffee" card | A Coffee Brothers cup held up over the river |
| `images/dish-3.jpg` | "Iced Coffee" card | Iced coffee with a caramel-crumb traybake |
| `images/dish-4.jpg` | "Daily Bake" card | A plate of fresh muffins and traybakes |
| `images/og-image.jpg` | Social share preview (link unfurl on WhatsApp/Instagram/etc.) | Cropped from the night hero shot |
| `images/favicon.png` | Browser tab icon | A generated "CB" monogram in the brand colours |

To swap any of these for a better photo later, just overwrite the file with a new one using the **same filename** — no HTML edits needed. Keep photos warm and true-to-life, and filenames case-sensitive (GitHub Pages is case-sensitive even though Windows isn't).

## Editing content

Everything is plain text inside `index.html` — search for the text you want to change (e.g. `Western Road` or `8:00am`) and edit it directly. The address, opening hours, phone number, the review, and the Google Maps link are all near the top third of the `<body>`, and the Maps link is repeated in a few places (nav, hero, location card, CTA, footer) — search-and-replace all instances if it ever changes.

The Google Maps link is a search link built from the business name and address (`Coffee Brothers, Western Rd, Mardyke, Cork, T12 CA34`), so it doesn't depend on a specific Google Place ID — it'll work as soon as the listing exists on Google Maps.

## Deploying free on GitHub Pages

This folder is separate from any other site you already host on this machine, so give Coffee Brothers its **own** GitHub repository.

1. **Create a new empty repository on GitHub** named `coffee-brothers` (via github.com → New repository — do not initialize it with a README).

2. **From inside this folder**, initialize git and push:

```bash
cd "D:/Work/Webistes/coffee-brothers"
git init
git add .
git commit -m "Initial Coffee Brothers site"
git branch -M main
git remote add origin https://github.com/<your-username>/coffee-brothers.git
git push -u origin main
```

3. **Turn on GitHub Pages**:
   - Go to the repo on GitHub → **Settings** → **Pages**
   - Under "Build and deployment" → **Source**, choose **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)** → **Save**

4. Wait 1–2 minutes, then your site is live at:

```
https://<your-username>.github.io/coffee-brothers/
```

To publish updates later (e.g. after adding real photos):

```bash
git add .
git commit -m "Add real photos"
git push
```

GitHub Pages redeploys automatically within a minute or two of every push to `main`.
