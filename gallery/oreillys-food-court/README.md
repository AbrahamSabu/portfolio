# O'Reilly's Food Court — Website

A single-page site for O'Reilly's Food Court, a lively single food stall in Cork city serving wraps, pizza, burgers and more.

## What's in this folder

```
oreillys-food-court/
├── index.html      ← the whole site (HTML + CSS + JS, no build step)
├── images/         ← pre-filled with stock photos; swap in real ones when you can (see list below)
└── README.md       ← this file
```

Everything is self-contained in `index.html` — nothing to compile or install. Open it directly in a browser to preview it, or deploy it as-is.

Fonts (Anton + Inter + IBM Plex Mono) load from Google Fonts over the internet, so an internet connection is needed to see the intended typefaces — it still works offline, just with fallback fonts.

## Animations & interactions included

- Brief branded preloader on first load (fails safe — never blocks the page, skipped instantly with reduced motion)
- Subtle grain texture overlay for a tactile, less-flat finish
- Staggered hero headline reveal on load (each line fades/slides in with its own delay), plus a slow scroll-linked zoom on the hero photo
- Scroll-triggered fades on every major section (`IntersectionObserver`-based)
- Header hides on scroll-down and reappears on scroll-up, plus a scroll-spy that highlights the current section in the nav
- **Live "Open now" / "Closed · opens X" status badge** in the hero and the hours card — computed from your real opening hours in the Europe/Dublin timezone, so it's always accurate to the minute. Today's row in the hours card is also auto-highlighted.
- Menu category tabs (All / Burgers / Wraps / Pizza) filter the dish cards in place
- Cursor-follow red spotlight glow on the menu cards
- Magnetic pull on the primary buttons — they nudge toward your cursor on hover (desktop only, skipped on touch and reduced motion)
- Shimmer sweep on the main "Get Directions" button
- Animated count-up stats (84 Google reviews, 1 stall/full menu, 7 days open, 0 bookings required)
- A pausable marquee strip — there's a dedicated play/pause button, and it respects reduced motion
- A gallery section ("The Space") with a lightbox — click any shot to view it full-size, with keyboard arrow/Escape support
- Back-to-top button that appears after you scroll past the first screen
- Everything respects `prefers-reduced-motion`: animations are disabled/instant for anyone with that OS setting on

### If you change the opening hours

The live status badge and today-highlight are driven by hardcoded logic in `index.html`, not the visible text — if you edit the hours, update **both** places:
- The `HOURS` object inside the `openStatus()` function near the bottom of the `<script>` block (minutes-from-midnight per day)
- The `data-days` attributes on the `.hours-card .row` elements in the Visit section

They're deliberately kept as plain numbers (not parsed from the display text) so the logic stays simple and dependency-free — just remember to keep both in sync with whatever hours you put in the visible copy.

## About the images — these are stock, not real photos of O'Reilly's

Every photo slot except the favicon is currently filled with a **real, freely-licensed stock photo** from Wikimedia Commons — picked to be appetising and on-theme (burgers, a Korean-style chicken sandwich, a Caesar wrap, wood-fired pizza, plus two moody oven/kitchen shots for the hero and story sections). None of them are actually O'Reilly's — they're a placeholder that looks intentional rather than broken, so the site doesn't feel empty while you gather real photos.

**Swap them out when you can** — replace the file in `images/` with a real photo using the **exact same filename** and it drops straight in, no HTML edits needed. A site with real photos of your actual food and stall will always beat stock.

I specifically avoided any stock photo that showed a recognisable person's face or another real business's name/signage, since publishing those on your site could look misleading or raise privacy concerns. A couple of my first picks failed that check and got swapped for the safer ones now in place.

### Photo credits (attribution required by their licenses)

| Filename | Source | Photographer | License |
|---|---|---|---|
| `images/hero.jpg`, `images/og-image.jpg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Pizza_baking_in_Wood-fired_oven.jpg) | Jared Tarbell | CC BY 2.0 |
| `images/counter.jpg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Wood_Oven_Pizza.jpg) | Oak Wood Fire Pizza | CC BY-SA 4.0 |
| `images/dish-1.jpg` (Smash Burger) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Double_Smash_Burger_with_Fries.jpg) | Wiki.cullin | CC BY-SA 4.0 |
| `images/dish-2.jpg` (Korean Style Burger) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Korean_fried_chicken_sandwich_with_cucumber_slaw_and_gochujang,_plus_French_fries_-_Cambridge,_MA.jpg) | Daderot | CC0 (public domain, no attribution required) |
| `images/dish-3.jpg` (Caesar Chicken Wrap) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Crispy_Chick%27n_Caesar_Wrap.jpg) | Mx. Granger | CC0 (public domain, no attribution required) |
| `images/dish-4.jpg` (Stone-Baked Pizza) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:DZ6_0560_Wood-fired_pizza_topped_with_ham_peppers_and_melted_cheese_ready_to_slice_and_serve.jpg) | PattayaPatrol | CC BY-SA 4.0 |

The CC BY / CC BY-SA files technically require attribution wherever they're used — this table satisfies that. Once you replace a file with your own real photo, you can delete its row here. `images/favicon.png` was left as a placeholder since a stock photo doesn't make sense as a logo mark — that one genuinely needs your own branding (see table below).

## Image reference (filenames the site expects)

| Filename | Used for | Recommended size |
|---|---|---|
| `images/hero.jpg` | Full-bleed hero background (top of page) | 1920×1080 or larger, landscape |
| `images/counter.jpg` | Story section image + the location card in "Find Us" | 1200×1500, portrait-ish |
| `images/dish-1.jpg` | "Smash Burger" card in the menu grid | 900×1200, portrait |
| `images/dish-2.jpg` | "Korean Style Burger" card | 900×1200, portrait |
| `images/dish-3.jpg` | "Caesar Chicken Wrap" card | 900×1200, portrait |
| `images/dish-4.jpg` | "Stone-Baked Pizza" card | 900×1200, portrait |
| `images/og-image.jpg` | Social share preview (link unfurl on WhatsApp/Instagram/etc.) — no on-page fallback, just skipped if missing | 1200×630, landscape |
| `images/favicon.png` | Browser tab icon — **not currently filled in**, browser just shows its default icon until you add one | 512×512, square, ideally your logo mark on a solid background |

Tips:
- Keep photos bright and true-to-life — the black-and-red palette does the "premium" work, so avoid heavy filters that fight it.
- Filenames are case-sensitive on GitHub Pages — match them exactly.
- Large JPGs slow the page down — aim to export photos at roughly 200–500KB each (most photo editors' "web/export" quality ~75–85% gets you there).

## Assumptions I made — please check these

You gave me the name, concept, location, vibe, brand colours and one real review, but a few operational details weren't specified. I made reasonable, editable guesses so the site doesn't ship with empty gaps — **please verify/correct them**:

- **Reservations**: you left this blank, so I built the site as **walk-in only** (matches "no queue, no fuss" food-court energy). If it's actually phone or booking-link, search `index.html` for "Walk-ins only" / "No booking needed" / "No bookings, no table service" and swap in your real reservation method + link.
- **Opening hours**: guessed as Mon–Thu 12pm–9pm, Fri–Sat 12pm–11pm, Sun 1pm–8pm. Edit the `.hours-card` block and the footer's "Hours" column, plus the `openingHoursSpecification` near the top of `index.html`.
- **Exact address**: I only had "Cork" to go on, so all "Get Directions" links point to a Google Maps **search** for "O'Reilly's Food Court Cork" rather than a precise pin. Once you have your Google Business Profile link (or exact address), replace every occurrence of `https://www.google.com/maps/search/?api=1&query=O%27Reilly%27s+Food+Court+Cork` in `index.html` with your real Maps link, and add a `streetAddress` to the JSON-LD block near the top of the file.
- **Social links**: none were provided, so none are on the page. Add them to the footer (`.footer__col`) if you have Instagram/Facebook/etc.

## Editing content

Everything is plain text inside `index.html` — search for the text you want to change (e.g. `Cork City Centre` or `12pm – 9pm`) and edit it directly. The address, opening hours, the review, and the Google Maps link are all near the top third of the `<body>`, and the Maps link is repeated in a few places (nav, hero, location card, CTA, footer) — search-and-replace all instances if it ever changes.

## Deploying free on GitHub Pages

This folder is separate from any other site you already host on this machine, so give O'Reilly's its **own** GitHub repository.

1. **Create a new empty repository on GitHub** named `oreillys-food-court` (via github.com → New repository — do not initialize it with a README).

2. **From inside this folder**, initialize git and push:

```bash
cd "D:/Work/Webistes/oreillys-food-court"
git init
git add .
git commit -m "Initial O'Reilly's Food Court site"
git branch -M main
git remote add origin https://github.com/<your-username>/oreillys-food-court.git
git push -u origin main
```

3. **Turn on GitHub Pages**:
   - Go to the repo on GitHub → **Settings** → **Pages**
   - Under "Build and deployment" → **Source**, choose **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)** → **Save**

4. Wait 1–2 minutes, then your site is live at:

```
https://<your-username>.github.io/oreillys-food-court/
```

To publish updates later (e.g. after adding real photos):

```bash
git add .
git commit -m "Add real photos"
git push
```

GitHub Pages redeploys automatically within a minute or two of every push to `main`.
