// Publishes a built site into a local clone of a GitHub Pages repo and pushes it.
import fs from "node:fs";
import path from "node:path";
import { SITES_DIR } from "./config.mjs";
import { run } from "./proc.mjs";

export async function pagesInfo(repoPath) {
  if (!repoPath) return { ok: false, error: "No Pages repo folder set." };
  if (!fs.existsSync(path.join(repoPath, ".git"))) return { ok: false, error: "That folder isn't a git repository." };
  const r = await run("git", ["remote", "get-url", "origin"], { cwd: repoPath });
  const m = r.out.match(/github\.com[:/]([^/]+)\/([^/.\s]+)/);
  if (!m) return { ok: false, error: "The repo has no GitHub 'origin' remote." };
  const base = m[2].toLowerCase() === `${m[1].toLowerCase()}.github.io`
    ? `https://${m[1].toLowerCase()}.github.io/` : `https://${m[1].toLowerCase()}.github.io/${m[2]}/`;
  return { ok: true, base };
}

export async function deploySite(slug, repoPath, onActivity = () => {}) {
  const info = await pagesInfo(repoPath);
  if (!info.ok) return info;
  const dist = path.join(SITES_DIR, slug, "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) return { ok: false, error: "No preview build yet. Rebuild the preview first." };

  onActivity("Copying into the Pages repo");
  const target = path.join(repoPath, slug);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(dist, target, { recursive: true });

  onActivity("Pushing to GitHub");
  await run("git", ["pull", "--no-edit"], { cwd: repoPath });
  await run("git", ["add", "--", slug], { cwd: repoPath });
  const c = await run("git", ["commit", "-m", `Add ${slug}`], { cwd: repoPath });
  if (c.code !== 0 && !/nothing to commit/.test(c.out)) return { ok: false, error: "git commit failed: " + c.out.slice(-300) };
  const p = await run("git", ["push", "-u", "origin", "HEAD"], { cwd: repoPath });
  if (p.code !== 0) return { ok: false, error: "git push failed (are you signed in to GitHub?): " + p.out.slice(-300) };
  return { ok: true, url: `${info.base}${slug}/` };
}
