/*
 * Auto pipeline (hands-off)
 * -------------------------
 * One command, no input needed:
 *   1. Searches Google Places across Cork verticals.
 *   2. Keeps only businesses with NO website.
 *   3. Downloads each business's real photos via the Google Places Photo API
 *      (no browser, no logins) into sites/<slug>/photos.
 *   4. Runs Claude Code fully headless to build each site using those local photos.
 *
 * RUN THIS IN A COPY of your project, not the working folder, because it runs
 * Claude Code with permission prompts turned off.
 *
 * USE:  node auto-pipeline.cjs
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ---- CONFIG ----------------------------------------------------------------

const MAX_LEADS = 20;       // builds this many businesses per run, back to back
const PHOTOS_PER_SITE = 6;  // how many real photos to pull per business
const MAX_KM_FROM_CORK = 15; // discard any business further than this from Cork city
const DEPLOY = true;                          // push each finished site live to GitHub Pages
const PAGES_REPO = "D:\\Work\\client-sites";  // local clone of your client-sites repo (see setup)

// Business types to search for. Each is crossed with the areas below, so the real
// number of searches is (types x areas). Add or remove freely.
const TYPES = [
  ["landscaping and garden design", "landscaping and garden design"],
  ["cafe", "cafe and coffee"],
  ["barber shop", "barber shop"],
  ["hair salon", "hair salon"],
  ["beauty salon", "beauty salon"],
  ["nail salon", "nail salon"],
  ["electrician", "electrical services"],
  ["plumber", "plumbing services"],
  ["roofer", "roofing services"],
  ["painter and decorator", "painting and decorating"],
  ["tiler", "tiling services"],
  ["carpenter", "carpentry and joinery"],
  ["builder", "building and construction"],
  ["driveway and paving", "driveways and paving"],
  ["window cleaner", "window cleaning"],
  ["cleaning service", "cleaning services"],
  ["car mechanic garage", "car servicing and repair"],
  ["car valeting", "car valeting"],
  ["dog groomer", "dog grooming"],
  ["personal trainer", "personal training"],
  ["takeaway", "takeaway and food"],
  ["florist", "florist"],
  ["tattoo studio", "tattoo studio"],
  ["photographer", "photography"],
  ["driving instructor", "driving lessons"],
];

// Cork city and its immediate suburbs only, so leads stay reachable.
const AREAS = [
  "Cork city",
  "Ballincollig, Cork",
  "Douglas, Cork",
  "Carrigaline, Cork",
  "Bishopstown, Cork",
  "Blackpool, Cork",
  "Wilton, Cork",
  "Glanmire, Cork",
  "Togher, Cork",
  "Mahon, Cork",
];

// Build the full search list by combining every type with every area.
const VERTICALS = [];
for (const area of AREAS) {
  for (const [type, label] of TYPES) {
    VERTICALS.push([`${type} in ${area}, Ireland`, label]);
  }
}

const CORK = { latitude: 51.8985, longitude: -8.4756, radius: 8000 };

// ----------------------------------------------------------------------------

const projectRoot = process.cwd();
const keyFile = path.join(projectRoot, "google-key.txt");

if (!fs.existsSync(keyFile)) {
  console.error("No google-key.txt found in this folder.");
  process.exit(1);
}
const API_KEY = fs.readFileSync(keyFile, "utf8").trim();
if (!API_KEY) { console.error("google-key.txt is empty."); process.exit(1); }

const sitesDir = path.join(projectRoot, "sites");
if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir);

// Memory of businesses already built, so future runs pick fresh ones.
const builtFile = path.join(projectRoot, "built.txt");
const builtSet = new Set(
  fs.existsSync(builtFile)
    ? fs.readFileSync(builtFile, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : []
);

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
function clean(t) { return (t || "").replace(/[\r\n]+/g, " ").trim(); }

async function search(query) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours.weekdayDescriptions,places.googleMapsUri,places.photos,places.location",
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: { circle: { center: { latitude: CORK.latitude, longitude: CORK.longitude }, radius: MAX_KM_FROM_CORK * 1000 } },
    }),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`);
  return (await res.json()).places || [];
}

// Distance in km between two lat/lng points (haversine).
function kmFromCork(loc) {
  if (!loc || loc.latitude == null || loc.longitude == null) return Infinity;
  const R = 6371;
  const dLat = (loc.latitude - CORK.latitude) * Math.PI / 180;
  const dLng = (loc.longitude - CORK.longitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(CORK.latitude * Math.PI / 180) * Math.cos(loc.latitude * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Download one photo (image bytes) via the Places Photo API. No browser needed.
async function downloadPhoto(photoName, destPath) {
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1600&key=${API_KEY}`;
  const res = await fetch(url); // follows the redirect to the actual image
  if (!res.ok) throw new Error(`photo ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
}

// Build the site with relative asset paths and push it into the client-sites repo.
function deploySite(slug, siteDir) {
  if (!DEPLOY) return null;
  if (!fs.existsSync(PAGES_REPO)) {
    console.log(`\n   Skipping deploy: ${PAGES_REPO} not found. Do the one-time repo setup first.`);
    return null;
  }
  console.log(`\n   Deploying ${slug} to GitHub Pages...`);

  // 1. Build with relative paths so it works inside a subfolder on Pages.
  const build = spawnSync("npx", ["vite", "build", "--base=./"], { cwd: siteDir, shell: true, stdio: "inherit" });
  const distDir = path.join(siteDir, "dist");
  if (build.status !== 0 || !fs.existsSync(distDir)) {
    console.log("   Build failed, skipping deploy for this site.");
    return null;
  }

  // 2. Copy the built files into the repo under this site's folder (fresh each time).
  const target = path.join(PAGES_REPO, slug);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(distDir, target, { recursive: true });

  // Belt-and-braces: also copy the real photos in, so the live site can load them.
  const photoSrc = path.join(siteDir, "photos");
  if (fs.existsSync(photoSrc)) fs.cpSync(photoSrc, path.join(target, "photos"), { recursive: true });

  // 3. Commit and push (pull first so we never hit a "fetch first" rejection).
  spawnSync("git", ["add", "."], { cwd: PAGES_REPO, shell: true, stdio: "inherit" });
  spawnSync("git", ["commit", "-m", `Add ${slug}`], { cwd: PAGES_REPO, shell: true, stdio: "inherit" });
  spawnSync("git", ["pull", "--no-edit"], { cwd: PAGES_REPO, shell: true, stdio: "inherit" });
  const push = spawnSync("git", ["push", "-u", "origin", "HEAD"], { cwd: PAGES_REPO, shell: true, stdio: "inherit" });
  if (push.status !== 0) { console.log("   Push failed (check you're signed into GitHub)."); return null; }

  // 4. Work out the live URL from the repo's remote.
  let url = `(your Pages URL)/${slug}/`;
  try {
    const remote = spawnSync("git", ["remote", "get-url", "origin"], { cwd: PAGES_REPO, shell: true, encoding: "utf8" }).stdout || "";
    const m = remote.match(/github\.com[:/]([^/]+)\/([^/.\s]+)/);
    if (m) url = `https://${m[1].toLowerCase()}.github.io/${m[2]}/${slug}/`;
  } catch {}
  console.log(`   Live in a minute or two at: ${url}`);
  return url;
}

async function main() {
  console.log("\nSearching Cork city...\n");
  const seen = new Set();
  const leads = [];

  for (const [query, servicesLabel] of VERTICALS) {
    let places = [];
    try { places = await search(query); }
    catch (e) { console.error(`  "${query}" failed: ${e.message}`); continue; }

    for (const p of places) {
      if (p.websiteUri) continue;
      if (kmFromCork(p.location) > MAX_KM_FROM_CORK) continue; // too far from Cork, drop it
      const name = clean(p.displayName && p.displayName.text);
      if (!name) continue;
      const key = (name + clean(p.formattedAddress)).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      leads.push({ p, name, servicesLabel });
    }
    console.log(`  ${servicesLabel}: ${places.length} found`);
  }

  const fresh = leads.filter((l) => !builtSet.has(slugify(l.name)));
  const skipped = leads.length - fresh.length;
  console.log(`\nNo-website leads: ${leads.length} (${skipped} already built, skipped). Building ${Math.min(MAX_LEADS, fresh.length)}.\n`);
  const chosen = fresh.slice(0, MAX_LEADS);
  const results = [];

  if (chosen.length === 0) {
    console.log("Every no-website lead found has already been built. Add new verticals/areas to VERTICALS, or delete built.txt to start over.");
    return;
  }

  for (let i = 0; i < chosen.length; i++) {
    const { p, name, servicesLabel } = chosen[i];
    const slug = slugify(name);
    const siteDir = path.join(sitesDir, slug);
    const photoDir = path.join(siteDir, "photos");
    fs.mkdirSync(photoDir, { recursive: true });

    console.log(`\n=== [${i + 1}/${chosen.length}] ${name} ===`);

    // Download real photos.
    let got = 0;
    const photos = (p.photos || []).slice(0, PHOTOS_PER_SITE);
    for (let j = 0; j < photos.length; j++) {
      try {
        await downloadPhoto(photos[j].name, path.join(photoDir, `photo-${j + 1}.jpg`));
        got++;
      } catch (e) { console.error(`   photo ${j + 1} skipped: ${e.message}`); }
    }
    console.log(`   downloaded ${got} photo(s)`);

    const hours = (p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions
      ? p.regularOpeningHours.weekdayDescriptions.join("; ") : "");

    // Write the full build brief to a file the Claude Code session will read.
    // (Passing a long multi-line prompt through the shell mangles it; a file avoids that.)
    const brief = `# Build instructions for ${name}

Work in two phases: build the site, then review it against the $10K checklist and fix it.

## Phase 1 — Build
Build a complete, premium one-page website for this business into the folder sites/${slug}.
- Use ONLY the photos already downloaded in sites/${slug}/photos. Do not browse the web for images.
- IMPORTANT so images actually load: copy those photos into the site's public/photos folder, and reference them in code with a relative path like ./photos/photo-1.jpg (no leading slash). This makes them load both in the dev preview and on the deployed site.
- Follow CLAUDE.md for design quality, layout, and structure.
- Ignore any other site or files already in this project. Build ONLY inside sites/${slug}.

### The signature showpiece (this is what wins the pitch)
This site is a demo shown to a business owner to prove we can build anything they want. It needs ONE genuinely impressive hero moment that makes them think "how did they do that." Put most of your animation effort here; keep everything else quiet. This overrides any specific signature-animation default in CLAUDE.md.

Choose the ONE showpiece that best fits this business and build it with real craft using anime.js:
- Mouse-reactive hero: the hero image and its layers respond to cursor movement with subtle parallax or a gentle 3D tilt, so it feels alive and bespoke.
- Masked headline reveal: the headline unmasks into view on load via clip-path, words revealing in sequence, with the hero image settling from a slight zoom behind it.
- Scroll-choreographed hero: as the user scrolls the first screen, layers move at different speeds and the hero composes into the next section, so scrolling feels directed.

Rules for the showpiece:
- Pick ONE and make it excellent. Do NOT stack all three.
- It must feel handcrafted, not a generic fade-up. A designer should nod, not roll their eyes.
- It must not break on mobile, and must respect prefers-reduced-motion (show a clean static hero instead).
- Everywhere else, motion stays quiet: small, tasteful micro-interactions only. The wow comes from one thing done beautifully, not lots of things moving.

## Phase 2 — Review against the $10K checklist
When the build is done, run the dev server and use Playwright to screenshot the site at desktop (1440px wide) and mobile. For the mobile shot, do NOT try to resize the existing window. Instead open a new Playwright browser context with the viewport set to 390x844 (or emulate an iPhone) and load the page in that, then screenshot. If the mobile screenshot still can't be produced for any reason, do not ask about it, just review the mobile layout by reading the CSS and responsive breakpoints instead and continue. Look at the screenshots and judge the site honestly against these eight things that separate a $10,000 site from a $200 one:

1. Point of view, not a template. Commit to one clear design direction and execute it with taste. Generic is failure.
2. Typography that does work. A paired display + body face, neither Inter nor Roboto. Scale and weight carry hierarchy; headlines feel chosen, not defaulted.
3. A restrained colour system. Three to five colours, used consistently. Premium signals through restraint, not decoration.
4. Hierarchy that breathes. Whitespace, scale and contrast guide the eye effortlessly. Clear primary, secondary, tertiary, no flat walls of content.
5. Imagery with intent. No stock defaults. The photos should feel curated and commissioned.
6. Motion that whispers. Handcrafted micro-interactions and scroll behaviour, not generic fade-up slop. A designer should nod, not roll their eyes.
7. Mobile that's designed, not shrunk. Real layout decisions for phone, not a compressed desktop. This is where cheap sites collapse.
8. The invisible expensive stuff. Sub-2s load, WCAG AA contrast, keyboard navigation, semantic HTML, real meta tags.

Then fix what falls short, with these priorities:
- Add more handcrafted micro-interactions.
- The lower sections tend to feel generic. Give them the same care as the hero.
- Do NOT make things busier or more decorated. Fix tastefully. More expensive means more restraint, not more stuff.

Re-screenshot after fixing to confirm it actually improved.

## Notes
Everything you need is here, so don't ask which business or what to build. Just build it.

Business: ${name}
What they do: ${servicesLabel}
Location: ${clean(p.formattedAddress)}
Phone: ${clean(p.nationalPhoneNumber)}
Hours: ${clean(hours)}
Google listing: ${clean(p.googleMapsUri)}
`;
    fs.writeFileSync(path.join(siteDir, "BUILD-INSTRUCTIONS.md"), brief);

    // Open INTERACTIVE Claude Code, pre-loaded with a short instruction to read the brief.
    // Short, single-line, no newlines, so it survives being passed through the shell.
    const launchMsg = `Read the file sites/${slug}/BUILD-INSTRUCTIONS.md and follow it exactly to build the website now.`;
    console.log(`\nOpening Claude Code to build ${name}.`);
    console.log(`Approve prompts as they come up. When the site is finished, type /exit to continue.\n`);

    const started = Date.now();
    const run = spawnSync("claude", [`"${launchMsg}"`, "--dangerously-skip-permissions"], {
      cwd: projectRoot, shell: true, stdio: "inherit",
    });
    const mins = ((Date.now() - started) / 60000).toFixed(1);
    const ok = run.status === 0;
    results.push({ name, slug, ok, photos: got, mins });
    console.log(`\n--- ${name}: session ended (${got} photos, ${mins} min) ---`);

    const liveUrl = deploySite(slug, siteDir);
    if (liveUrl) results[results.length - 1].url = liveUrl;

    // Append the link to a permanent list that is never overwritten.
    if (liveUrl) {
      fs.appendFileSync(path.join(projectRoot, "all-links.md"), `- ${name}: ${liveUrl}\n`);
    }

    // Remember this business so future runs don't rebuild it.
    fs.appendFileSync(builtFile, slug + "\n");
    builtSet.add(slug);
  }

  let summary = `# Auto build results\n\n`;
  for (const r of results) {
    summary += `- **${r.name}** — ${r.ok ? "built" : "FAILED"} — ${r.photos} photos — sites/${r.slug} — ${r.mins} min${r.url ? " — " + r.url : ""}\n`;
  }
  fs.writeFileSync(path.join(projectRoot, "results.md"), summary);
  console.log(`\nDone. Summary in results.md. Preview a site by running the dev server in its folder.\n`);
}

main().catch((e) => { console.error("\nError:", e.message); process.exit(1); });
