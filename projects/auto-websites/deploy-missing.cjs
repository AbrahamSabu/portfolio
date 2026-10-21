/*
 * Deploy any sites that were built but never pushed to GitHub.
 * Run from the AUTO folder:  node deploy-missing.cjs
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const sitesDir = path.join(projectRoot, "sites");
const PAGES_REPO = "D:\\Work\\client-sites";

if (!fs.existsSync(PAGES_REPO)) { console.error("client-sites repo not found."); process.exit(1); }

// Pull first so we're up to date before pushing.
spawnSync("git", ["pull", "--no-edit"], { cwd: PAGES_REPO, shell: true, stdio: "inherit" });

const siteFolders = fs.readdirSync(sitesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let deployed = 0;

for (const slug of siteFolders) {
  const inRepo = path.join(PAGES_REPO, slug);
  if (fs.existsSync(inRepo)) continue; // already deployed, skip

  const siteDir = path.join(sitesDir, slug);
  // Only try sites that look like a real project (have a package.json).
  if (!fs.existsSync(path.join(siteDir, "package.json"))) {
    console.log(`Skipping ${slug} (no package.json).`);
    continue;
  }

  console.log(`\n=== Deploying ${slug} ===`);

  const build = spawnSync("npx", ["vite", "build", "--base=./"], { cwd: siteDir, shell: true, stdio: "inherit" });
  const distDir = path.join(siteDir, "dist");
  if (build.status !== 0 || !fs.existsSync(distDir)) {
    console.log(`   Build failed for ${slug}, skipping.`);
    continue;
  }

  fs.rmSync(inRepo, { recursive: true, force: true });
  fs.cpSync(distDir, inRepo, { recursive: true });

  const photoSrc = path.join(siteDir, "photos");
  if (fs.existsSync(photoSrc)) fs.cpSync(photoSrc, path.join(inRepo, "photos"), { recursive: true });

  deployed++;
  console.log(`   Copied ${slug} into the repo.`);
}

if (deployed > 0) {
  console.log(`\nPushing ${deployed} site(s) to GitHub...`);
  spawnSync("git", ["add", "."], { cwd: PAGES_REPO, shell: true, stdio: "inherit" });
  spawnSync("git", ["commit", "-m", `Deploy ${deployed} missing sites`], { cwd: PAGES_REPO, shell: true, stdio: "inherit" });
  spawnSync("git", ["pull", "--no-edit"], { cwd: PAGES_REPO, shell: true, stdio: "inherit" });
  spawnSync("git", ["push", "-u", "origin", "HEAD"], { cwd: PAGES_REPO, shell: true, stdio: "inherit" });
  console.log("\nDone. Give Pages a minute, then regenerate all-links.md.");
} else {
  console.log("\nNothing missing. Everything is already deployed.");
}
