/*
 * Batch site builder
 * -------------------
 * Reads leads.txt, and for each business runs Claude Code headless to build
 * a site into its own folder under /sites, following your CLAUDE.md.
 *
 * HOW TO USE
 *   1. Put this file and leads.txt in your project root (D:\Work\Premium websites).
 *   2. Fill leads.txt (one business per line, see the template).
 *   3. In a terminal in that folder, run:  node batch-build.js
 *
 * It builds them one at a time so you can watch, and writes a results.md
 * summary at the end listing every business and whether its build finished.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ---- CONFIG (change these if you want) -------------------------------------

// Unattended runs need Claude Code to not stop and ask permission for every
// step. This flag lets it run without prompts. It is ONLY safe because this is
// a dedicated folder with nothing sensitive in it. Do not point this script at
// a folder with private files, keys, or anything you can't afford to lose.
const RUN_WITHOUT_PROMPTS = true;

// true  = deploy each site to Vercel and collect a live link (needs a one-time
//         Vercel login the first time).
// false = just build each site locally, no deploy.
const DEPLOY_TO_VERCEL = false;

// ----------------------------------------------------------------------------

const projectRoot = process.cwd();
const leadsFile = path.join(projectRoot, "leads.txt");
const sitesDir = path.join(projectRoot, "sites");

if (!fs.existsSync(leadsFile)) {
  console.error("No leads.txt found in this folder. Create one first.");
  process.exit(1);
}
if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir);

// Turn a business name into a safe folder name, e.g. "Nectar Coffee" -> "nectar-coffee"
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Read leads. Each line is pipe-separated:
// name | services | location | phone | hours | google maps link | socials
// Blank lines and lines starting with # are ignored.
const lines = fs
  .readFileSync(leadsFile, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

if (lines.length === 0) {
  console.error("leads.txt is empty. Add some businesses.");
  process.exit(1);
}

const results = [];

console.log(`\nFound ${lines.length} business(es). Starting.\n`);

for (let i = 0; i < lines.length; i++) {
  const parts = lines[i].split("|").map((p) => p.trim());
  const [name, services, location, phone, hours, maps, socials] = parts;

  if (!name) {
    console.log(`Line ${i + 1} has no business name, skipping.`);
    continue;
  }

  const slug = slugify(name);
  console.log(`\n=== [${i + 1}/${lines.length}] Building: ${name} ===\n`);

  const prompt = `
Build a complete website for this business, following the project's CLAUDE.md end to end, including the grid-reveal signature animation and the self-review loop.

Put ALL files for this site inside the folder: sites/${slug}
Keep it self-contained in that folder. Do not touch other businesses' folders.

For images, use ONLY the business's public Google listing photos (do not attempt to log into Instagram or any site that needs a login, since this is running unattended). If a good photo isn't available for a spot, use a clean colour or simple shape as per CLAUDE.md.

Business: ${name || ""}
What they do: ${services || ""}
Location: ${location || ""}
Phone: ${phone || ""}
Hours: ${hours || ""}
Google listing: ${maps || ""}
Socials: ${socials || ""}

${DEPLOY_TO_VERCEL ? "When done, deploy this site to Vercel and print the live URL." : "Build it but do not deploy."}
When finished, print one line starting with DONE: and the folder path (and the URL if you deployed).
`.trim();

  const args = ["-p", prompt];
  if (RUN_WITHOUT_PROMPTS) args.push("--dangerously-skip-permissions");

  const started = Date.now();
  const run = spawnSync("claude", args, {
    cwd: projectRoot,
    shell: true,
    stdio: "inherit", // show the build live in your terminal
  });
  const mins = ((Date.now() - started) / 60000).toFixed(1);

  const ok = run.status === 0;
  results.push({ name, slug, ok, mins });
  console.log(
    `\n--- ${name}: ${ok ? "finished" : "FAILED (check the output above)"} in ${mins} min ---`
  );
}

// Write a summary you can glance at.
let summary = `# Batch build results\n\n`;
summary += `Built ${results.length} site(s).\n\n`;
for (const r of results) {
  summary += `- **${r.name}** — ${r.ok ? "done" : "FAILED"} — folder: sites/${r.slug} — ${r.mins} min\n`;
}
fs.writeFileSync(path.join(projectRoot, "results.md"), summary);

console.log(`\nAll done. Summary written to results.md\n`);
console.log("To preview one site, open its folder and run the dev server there.\n");
