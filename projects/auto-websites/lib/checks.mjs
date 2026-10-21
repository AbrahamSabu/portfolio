// Setup checks shown on the first screen: is everything installed and connected?
import { run } from "./proc.mjs";
import { testKey } from "./places.mjs";
import { pagesInfo } from "./deploy.mjs";

const version = (out) => (out.match(/\d+\.\d+(\.\d+)?/) || [""])[0];

export async function runChecks(settings) {
  const [node, claude, git, npm] = await Promise.all([
    Promise.resolve({ code: 0, out: process.version }),
    run("claude", ["--version"]),
    run("git", ["--version"]),
    run("npm", ["--version"]),
  ]);
  const major = parseInt(process.version.slice(1), 10);
  const checks = [
    { id: "node", label: "Node.js 18 or newer", ok: major >= 18, detail: process.version, fix: "Install Node.js from https://nodejs.org" },
    { id: "npm", label: "npm", ok: npm.code === 0, detail: version(npm.out), fix: "npm comes with Node.js. Reinstall Node if it's missing." },
    { id: "claude", label: "Claude Code CLI", ok: claude.code === 0, detail: version(claude.out), fix: "Install Claude Code (https://claude.com/claude-code), then run `claude` once to sign in." },
    { id: "git", label: "git", ok: git.code === 0, detail: version(git.out), fix: "Install git from https://git-scm.com. You only need it for deploying." , optional: true },
  ];

  let key = { id: "google", label: "Google Places API key", ok: false, detail: "Not set", fix: "Create a key with the Places API (New) enabled at https://console.cloud.google.com/google/maps-apis, then paste it in Settings." };
  if (settings.googleKey) {
    try { await testKey(settings.googleKey); key = { ...key, ok: true, detail: "Working" }; }
    catch (e) { key = { ...key, detail: e.message.slice(0, 160) }; }
  }
  checks.push(key);

  if (settings.deploy.enabled) {
    const info = await pagesInfo(settings.deploy.repoPath);
    checks.push({ id: "pages", label: "GitHub Pages repo", ok: info.ok, detail: info.ok ? info.base : info.error, fix: "Clone a GitHub repo that has Pages turned on, then set its folder in Settings → Deploy.", optional: true });
  }
  return checks;
}
