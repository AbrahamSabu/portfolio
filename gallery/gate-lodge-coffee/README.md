# Gate Lodge Coffee Shop — Website

A single-page site for Gate Lodge Coffee Shop, a coffee and brunch spot built inside a shipping container on Model Farm Road, Cork.

## What's in this folder

```
gate-lodge-coffee/
├── index.html      ← the whole site (HTML + CSS + JS, no build step)
├── images/         ← drop your real photos in here (see list below)
└── README.md       ← this file
```

Everything is self-contained in `index.html` — nothing to compile or install. Open it directly in a browser to preview it, or deploy it as-is.

Fonts (Instrument Serif + Inter + IBM Plex Mono) load from Google Fonts over the internet, so an internet connection is needed to see the intended typefaces — it still works offline, just with fallback fonts.

## Animations & polish included

- Staggered hero headline reveal on load (each line fades/slides in with its own delay)
- Scroll-triggered fades on every major section (`IntersectionObserver`-based)
- Cursor-follow spotlight glow on the menu and gallery cards
- Shimmer sweep + a gentle "magnetic" pull toward the cursor on the main "Get Directions" buttons
- Animated count-up stats (1 container, 7 days open, 7am weekday opening, 0 bookings required)
- A pausable marquee strip — hover pauses it, and there's a dedicated play/pause button for accessibility
- A **live open/closed status badge** in the hero and hours card — computed from your real opening hours in Cork's local time (Europe/Dublin), so it always says "Open now · til 5pm" or "Closed · opens 9am" correctly, no manual updates needed
- Header hides on scroll-down and reappears on scroll-up, with the current section highlighted in the nav as you scroll
- Subtle parallax drift on the story and location photos, and a soft film-grain texture over the whole page
- A lightbox photo gallery (click any thumbnail in "A Closer Look" — arrow keys and Escape work too)
- A back-to-top button once you've scrolled past the hero
- Everything respects `prefers-reduced-motion`: animations, parallax and the magnetic buttons are disabled for anyone with that OS setting on

## About the image slots

Every photo slot on the page has a graceful fallback built in: if the file at a given filename is missing, that slot shows a clean, on-brand placeholder (a thin dashed tag with the filename it's waiting for) instead of a stock photo or a broken-image icon. As soon as a real file with the **exact filename** below exists in `images/`, it swaps in automatically — no HTML edits needed. That also means you can safely replace any of the current photos later just by overwriting the file.

`hero.jpg`, `container.jpg`, `dish-1.jpg` through `dish-4.jpg`, and `og-image.jpg` are currently filled with real photos of the actual shop (converted from the screenshots you dropped in). `favicon.png` is still a placeholder — see the note below.

## Images in place / to update

| Filename | Used for | Currently |
|---|---|---|
| `images/hero.jpg` | Full-bleed hero background (top of page) | The wide exterior shot with the "Gate Lodge Coffee Shop" signage |
| `images/container.jpg` | Story section image + the location card in "Find Us" | The patio/seating exterior shot |
| `images/dish-1.jpg` | "The Spice Sandwich" card in the menu grid | The stacked sandwich + pink drink photo |
| `images/dish-2.jpg` | "Flat White" card | The heart latte-art flat white in the smiley cup |
| `images/dish-3.jpg` | "Strawberry Matcha Latte" card | The matcha latte photo |
| `images/dish-4.jpg` | "Daily Bake" card | The caramel-drizzled bake — rename the card in `index.html` if it has an official name |
| `images/og-image.jpg` | Social share preview (link unfurl on WhatsApp/Instagram/etc.) | A copy of `hero.jpg` — swap in a proper 1200×630 landscape crop if you want a sharper unfurl |
| `images/favicon.png` | Browser tab icon — no on-page fallback, browser just shows its default icon if missing | Not set — drop in a 512×512 square version of the Gate Lodge gate logo (visible on the cups in your photos) |
| `images/gallery-1.jpg` – `gallery-5.jpg` | The "A Closer Look" lightbox gallery | Your other 5 real photos (sandwiches, latte art close-up, branded cup, hot matcha) |

Your other 5 photos (the two other sandwiches, the close-up latte art, the branded cup on the table, and the hot matcha latte) are now in the **"A Closer Look" gallery** near the bottom of the page as `gallery-1.jpg` through `gallery-5.jpg` — click any of them to open the lightbox. Swap any of these out the same way as the rest: overwrite the file with a new photo of the same name.

Tips:
- Keep photos bright, true-to-life, and consistent with the black-and-white minimal look — no heavy color filters.
- Filenames are case-sensitive on GitHub Pages — match them exactly.
- Large JPGs slow the page down — aim to export photos at roughly 200–500KB each (most photo editors' "web/export" quality ~75–85% gets you there).

## Editing content

Everything is plain text inside `index.html` — search for the text you want to change (e.g. `Model Farm Road` or `7:00am`) and edit it directly. The address, opening hours, the review, and the Google Maps link are all near the top third of the `<body>`, and the Maps link is repeated in a few places (nav, hero, location card, CTA, footer) — search-and-replace all instances if it ever changes.

## Deploying free on GitHub Pages

This folder is separate from any other site you already host on this machine, so give Gate Lodge its **own** GitHub repository.

1. **Create a new empty repository on GitHub** named `gate-lodge-coffee` (via github.com → New repository — do not initialize it with a README).

2. **From inside this folder**, initialize git and push:

```bash
cd "D:/Work/Webistes/gate-lodge-coffee"
git init
git add .
git commit -m "Initial Gate Lodge Coffee Shop site"
git branch -M main
git remote add origin https://github.com/<your-username>/gate-lodge-coffee.git
git push -u origin main
```

3. **Turn on GitHub Pages**:
   - Go to the repo on GitHub → **Settings** → **Pages**
   - Under "Build and deployment" → **Source**, choose **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)** → **Save**

4. Wait 1–2 minutes, then your site is live at:

```
https://<your-username>.github.io/gate-lodge-coffee/
```

To publish updates later (e.g. after adding real photos):

```bash
git add .
git commit -m "Add real photos"
git push
```

GitHub Pages redeploys automatically within a minute or two of every push to `main`.
