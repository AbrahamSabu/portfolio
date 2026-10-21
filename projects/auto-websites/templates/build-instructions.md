# Build instructions for {{name}}

Work in two phases: build the site, then review it against the $10K checklist and fix it.

## Phase 1 — Build
Build a complete, premium one-page website for this business into the folder sites/{{slug}}.
- Use ONLY the photos already downloaded in sites/{{slug}}/photos. Do not browse the web for images.
- IMPORTANT so images actually load: copy those photos into the site's public/photos folder, and reference them in code with a relative path like ./photos/photo-1.jpg (no leading slash). This makes them load both in the dev preview and on the deployed site.
- Follow CLAUDE.md for design quality, layout, and structure.
- Ignore any other site or files already in this project. Build ONLY inside sites/{{slug}}.
- The site must build with `npx vite build` from inside sites/{{slug}}.

### The signature showpiece
This site is a demo shown to a business owner to prove what's possible. It needs ONE genuinely impressive hero moment. Put most of your animation effort here; keep everything else quiet. This overrides any specific signature-animation default in CLAUDE.md.

Choose the ONE showpiece that best fits this business and build it with real craft using anime.js:
- Mouse-reactive hero: the hero image and its layers respond to cursor movement with subtle parallax or a gentle 3D tilt.
- Masked headline reveal: the headline unmasks into view on load via clip-path, words revealing in sequence, with the hero image settling from a slight zoom behind it.
- Scroll-choreographed hero: as the user scrolls the first screen, layers move at different speeds and the hero composes into the next section.

Rules for the showpiece:
- Pick ONE and make it excellent. Do NOT stack all three.
- It must feel handcrafted, not a generic fade-up.
- It must not break on mobile, and must respect prefers-reduced-motion (show a clean static hero instead).
- Everywhere else, motion stays quiet: small, tasteful micro-interactions only.

## Phase 2 — Review against the $10K checklist
When the build is done, run the dev server and, if Playwright is available, screenshot the site at desktop (1440px wide) and mobile (a new browser context with a 390x844 viewport). If screenshots can't be produced, review the layout by reading the code and responsive breakpoints instead and continue. Judge the site honestly against these eight things:

1. Point of view, not a template. One clear design direction, executed with taste.
2. Typography that does work. A paired display + body face, neither Inter nor Roboto.
3. A restrained colour system. Three to five colours, used consistently.
4. Hierarchy that breathes. Whitespace, scale and contrast guide the eye.
5. Imagery with intent. The photos should feel curated and commissioned.
6. Motion that whispers. Handcrafted micro-interactions, not generic fade-up slop.
7. Mobile that's designed, not shrunk.
8. The invisible expensive stuff. Sub-2s load, WCAG AA contrast, keyboard navigation, semantic HTML, real meta tags.

Then fix what falls short. Do NOT make things busier; more expensive means more restraint. Stop the dev server when you're done.

## Notes
Everything you need is here, so don't ask which business or what to build. Just build it.

{{extra}}

Business: {{name}}
What they do: {{type}}
Location: {{address}}
Phone: {{phone}}
Hours: {{hours}}
Google listing: {{mapsUrl}}
