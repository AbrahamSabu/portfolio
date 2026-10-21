# Thrive Coffee — Website

A single-page site for Thrive Coffee, a drive-thru coffee spot in Bishopstown and at Blarney GAA, Cork.

## What's in this folder

```
thrive-coffee/
├── index.html      ← the whole site (HTML + CSS + JS, no build step)
├── images/         ← drop your real photos in here (see list below)
└── README.md        ← this file
```

Everything is self-contained in `index.html` — there's nothing to compile or install. Open it directly in a browser to preview it, or deploy it as-is.

Fonts (Fraunces + Inter) load from Google Fonts over the internet, so an internet connection is needed to see the intended typefaces — it still works offline, just with fallback fonts.

## Animations included

- Staggered hero headline reveal on load (each line fades/slides in with its own delay)
- Scroll-triggered fades on every major section (`IntersectionObserver`-based)
- Cursor-follow spotlight glow on the signature-drinks cards
- Shimmer sweep on the main "Find Your Window" button
- Animated count-up stats (2 locations, 7 days, 6:30am open, 0 minutes out of the car)
- A pausable marquee strip — hover pauses it, and there's a dedicated play/pause button for accessibility
- Everything respects `prefers-reduced-motion`: animations are disabled/instant for anyone with that OS setting on

## Images to drop in

Most slots are now filled with **real Thrive Coffee photos** (cropped down from screenshots you provided). One slot is still a generic stock stand-in — replace it whenever you get a real shot of that location, same filename, no HTML edits needed:

| Filename | Used for | Status |
|---|---|---|
| `images/hero.jpg` | Full-bleed hero background (top of page) | Real photo — the "collect here" pickup moment |
| `images/exterior-bishopstown.jpg` | Bishopstown location — story section + location card | Real photo — the collection window/counter |
| `images/exterior-blarney.jpg` | Blarney GAA location card | **Still stock** — swap for a real photo of the Blarney GAA spot when you can |
| `images/dish-1.jpg` | "Flat White" card | Real photo |
| `images/dish-2.jpg` | "Iced Matcha" card | Real photo |
| `images/dish-3.jpg` | "Acai Bowl" card | Real photo |
| `images/dish-4.jpg` | "Fresh Pastry" card | Real photo |
| `images/og-image.jpg` | Social share preview (link unfurl on WhatsApp/Instagram/etc.) | Real photo, cropped to 1200×630 |
| `images/favicon.png` | Browser tab icon | Generated logo mark ("T" on olive) |

The menu grid shows what was actually pictured (flat white, iced matcha, acai bowl, pastry) rather than a generic "Cold Brew / Oat Latte" lineup — edit the `<div class="name">` / `<div class="note">` text directly in `index.html` if your actual menu differs.

Tips:
- If a filename doesn't match exactly (case-sensitive on GitHub Pages), the image won't show.
- The real photos were cropped down from phone-screenshot resolution (~600–800px wide), so `hero.jpg` may look slightly soft on very large monitors — swap in a higher-resolution original of the same shot if you have one, for a crisper full-bleed hero.
- Large JPGs slow the page down — aim to export photos at roughly 200–500KB each (any photo editor's "web/export" quality ~75-85% gets you there).

## Editing content

Everything is plain text inside `index.html` — search for the text you want to change (e.g. `Bishopstown` or `6:30am`) and edit it directly. The two locations, opening hours, the review, and the Instagram handle are all near the top of the `<body>`.

## Deploying free on GitHub Pages

This folder is separate from any other site you already host (your existing `Ammos` repo serves a different site from its root), so give Thrive Coffee its **own** GitHub repository.

1. **Create a new empty repository on GitHub** named `thrive-coffee` (via github.com → New repository — do not initialize it with a README).

2. **From inside this folder**, initialize git and push:

```bash
cd "D:/Work/Webistes/thrive-coffee"
git init
git add .
git commit -m "Initial Thrive Coffee site"
git branch -M main
git remote add origin https://github.com/<your-username>/thrive-coffee.git
git push -u origin main
```

3. **Turn on GitHub Pages**:
   - Go to the repo on GitHub → **Settings** → **Pages**
   - Under "Build and deployment" → **Source**, choose **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)** → **Save**

4. Wait 1–2 minutes, then your site is live at:

```
https://<your-username>.github.io/thrive-coffee/
```

To publish updates later (e.g. after adding real photos):

```bash
git add .
git commit -m "Add real photos"
git push
```

GitHub Pages redeploys automatically within a minute or two of every push to `main`.
