// Settings live in workspace/settings.json (gitignored). Everything the UI can
// change is here, with defaults that work out of the box.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WORKSPACE = path.resolve(process.env.AUTO_WEBSITES_WORKSPACE || path.join(APP_DIR, "workspace"));
export const SITES_DIR = path.join(WORKSPACE, "sites");
const SETTINGS_FILE = path.join(WORKSPACE, "settings.json");

export const TEMPLATES = {
  designBrief: path.join(APP_DIR, "templates", "design-brief.md"),
  buildInstructions: path.join(APP_DIR, "templates", "build-instructions.md"),
};

export const DEFAULT_TYPES = [
  "landscaping and garden design", "cafe", "barber shop", "hair salon", "beauty salon",
  "nail salon", "electrician", "plumber", "roofer", "painter and decorator", "tiler",
  "carpenter", "builder", "driveway and paving", "window cleaner", "cleaning service",
  "car mechanic garage", "car valeting", "dog groomer", "personal trainer", "takeaway",
  "florist", "tattoo studio", "photographer", "driving instructor",
];

export const DEFAULTS = {
  googleKey: "",
  location: "Cork, Ireland",
  areas: [],                 // optional neighbourhoods; empty = search the location itself
  radiusKm: 15,
  types: ["cafe", "barber shop", "nail salon", "electrician", "painter and decorator"],
  onlyNoWebsite: true,
  skipBuilt: true,
  maxSites: 3,
  photosPerSite: 6,
  model: "",                 // blank = Claude Code's default model
  extraInstructions: "",     // appended to every site's build brief
  deploy: { enabled: false, repoPath: "" },
};

export function ensureWorkspace() {
  fs.mkdirSync(SITES_DIR, { recursive: true });
  // Claude Code reads CLAUDE.md from its working directory, so the design brief lives there.
  const brief = path.join(WORKSPACE, "CLAUDE.md");
  if (!fs.existsSync(brief)) fs.copyFileSync(TEMPLATES.designBrief, brief);
  const instr = path.join(WORKSPACE, "build-instructions.md");
  if (!fs.existsSync(instr)) fs.copyFileSync(TEMPLATES.buildInstructions, instr);
}

export function loadSettings() {
  ensureWorkspace();
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")); } catch {}
  const s = { ...DEFAULTS, ...saved, deploy: { ...DEFAULTS.deploy, ...(saved.deploy || {}) } };
  if (process.env.GOOGLE_PLACES_KEY && !s.googleKey) s.googleKey = process.env.GOOGLE_PLACES_KEY;
  return s;
}

export function saveSettings(patch) {
  ensureWorkspace();
  // Merge onto what's on disk, not loadSettings(), so a key from the environment is never written to the file.
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")); } catch {}
  const current = { ...DEFAULTS, ...saved, deploy: { ...DEFAULTS.deploy, ...(saved.deploy || {}) } };
  const next = { ...current, ...patch, deploy: { ...current.deploy, ...(patch.deploy || {}) } };
  next.maxSites = clampInt(next.maxSites, 1, 50);
  next.photosPerSite = clampInt(next.photosPerSite, 0, 10);
  next.radiusKm = clampInt(next.radiusKm, 1, 100);
  next.types = cleanList(next.types);
  next.areas = cleanList(next.areas);
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return loadSettings();
}

// What the browser gets: the key is masked so it never sits in page memory.
export function publicSettings(s) {
  return { ...s, googleKey: "", hasGoogleKey: Boolean(s.googleKey), googleKeyHint: s.googleKey ? "…" + s.googleKey.slice(-4) : "" };
}

export function readText(name) {
  ensureWorkspace();
  return fs.readFileSync(path.join(WORKSPACE, name), "utf8");
}
export function writeText(name, text) {
  ensureWorkspace();
  fs.writeFileSync(path.join(WORKSPACE, name), text);
}
export function resetText(name) {
  const src = name === "CLAUDE.md" ? TEMPLATES.designBrief : TEMPLATES.buildInstructions;
  fs.copyFileSync(src, path.join(WORKSPACE, name));
  return readText(name);
}

function clampInt(v, lo, hi) { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; }
function cleanList(v) {
  const arr = Array.isArray(v) ? v : String(v || "").split(/[\n,]/);
  return [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))];
}
