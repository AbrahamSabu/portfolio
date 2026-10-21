// The engine: holds live state, runs searches and builds one at a time, and
// tells listeners (the UI) about every change.
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { SITES_DIR, WORKSPACE, loadSettings } from "./config.mjs";
import { findLeads, downloadPhotos } from "./places.mjs";
import { writeBrief, buildWithClaude, buildPreview } from "./builder.mjs";
import { deploySite } from "./deploy.mjs";

export const events = new EventEmitter();
const LEADS_FILE = path.join(WORKSPACE, "leads.json");

const state = {
  phase: "idle",             // idle | searching | building
  search: null,              // { done, total, found, error }
  center: null,
  leads: [],
  queue: [],                 // [{ slug, name, status, activity, startedAt }]
  log: [],
};
try { Object.assign(state, JSON.parse(fs.readFileSync(LEADS_FILE, "utf8"))); } catch {}

let stopRequested = false;
let current = null;

const emit = () => events.emit("state");
function log(msg, level = "info") {
  state.log.push({ t: Date.now(), level, msg });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
  emit();
}

export function getState() { return { ...state, sites: listSites() }; }

// ---- sites on disk ---------------------------------------------------------

const metaPath = (slug) => path.join(SITES_DIR, slug, "site.json");
function readMeta(slug) { try { return JSON.parse(fs.readFileSync(metaPath(slug), "utf8")); } catch { return null; } }
function writeMeta(slug, patch) {
  const m = { ...(readMeta(slug) || { slug }), ...patch };
  fs.writeFileSync(metaPath(slug), JSON.stringify(m, null, 2));
  return m;
}

export function listSites() {
  if (!fs.existsSync(SITES_DIR)) return [];
  return fs.readdirSync(SITES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const m = readMeta(d.name) || { slug: d.name, name: d.name };
      return { ...m, hasPreview: fs.existsSync(path.join(SITES_DIR, d.name, "dist", "index.html")) };
    })
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
}
const builtSlugs = () => new Set(listSites().filter((s) => s.status === "built" || s.status === "deployed").map((s) => s.slug));

// ---- search ----------------------------------------------------------------

export async function search() {
  if (state.phase !== "idle") throw new Error("Busy. Wait for the current job or press Stop.");
  const settings = loadSettings();
  if (!settings.googleKey) throw new Error("Add your Google Places API key in Settings first.");
  if (!settings.types.length) throw new Error("Add at least one business type.");
  stopRequested = false;
  state.phase = "searching";
  state.search = { done: 0, total: settings.types.length * Math.max(1, settings.areas.length), found: 0 };
  log(`Searching ${settings.location} for ${settings.types.length} business type(s)`);
  (async () => {
    try {
      const r = await findLeads(settings, {
        builtSlugs: builtSlugs(),
        isStopped: () => stopRequested,
        onProgress: (p) => { state.search = { ...state.search, ...p }; if (p.error) log(`"${p.query}": ${p.error}`, "warn"); else emit(); },
      });
      state.center = r.center;
      state.leads = r.leads;
      fs.writeFileSync(LEADS_FILE, JSON.stringify({ center: r.center, leads: r.leads }, null, 2));
      log(`Found ${r.leads.length} business(es)${settings.onlyNoWebsite ? " with no website" : ""}. Skipped ${r.stats.withSite} with a website and ${r.stats.tooFar} too far away.`, "ok");
    } catch (e) {
      state.search = { ...state.search, error: e.message };
      log(e.message, "error");
    } finally {
      state.phase = "idle";
      emit();
    }
  })();
}

// ---- build -----------------------------------------------------------------

export function build(slugs) {
  if (state.phase !== "idle") throw new Error("Busy. Wait for the current job or press Stop.");
  const picked = slugs.map((s) => state.leads.find((l) => l.slug === s)).filter(Boolean);
  if (!picked.length) throw new Error("Pick at least one business to build.");
  stopRequested = false;
  state.phase = "building";
  state.queue = picked.map((l) => ({ slug: l.slug, name: l.name, status: "queued", activity: "" }));
  log(`Building ${picked.length} site(s), one at a time`);
  (async () => {
    for (const lead of picked) {
      if (stopRequested) break;
      await buildOne(lead);
    }
    for (const q of state.queue) if (q.status === "queued") q.status = "skipped";
    state.phase = "idle";
    current = null;
    log(stopRequested ? "Stopped." : "All done.", stopRequested ? "warn" : "ok");
  })();
}

async function buildOne(lead) {
  const settings = loadSettings();
  const item = state.queue.find((q) => q.slug === lead.slug);
  const set = (patch) => { Object.assign(item, patch); emit(); };
  const startedAt = Date.now();
  set({ status: "working", activity: "Downloading photos", startedAt });

  const dir = path.join(SITES_DIR, lead.slug);
  fs.mkdirSync(dir, { recursive: true });
  const { photoNames, ...info } = lead;
  writeMeta(lead.slug, { ...info, status: "building", startedAt });

  const photos = await downloadPhotos(settings.googleKey, lead, path.join(dir, "photos"), settings.photosPerSite);
  log(`${lead.name}: ${photos} photo(s) downloaded`);
  writeBrief(lead, settings);

  set({ activity: "Starting Claude Code" });
  current = buildWithClaude(lead, settings, (a) => set({ activity: a }));
  const r = await current.done;
  current = null;
  const mins = Math.round((Date.now() - startedAt) / 6000) / 10;

  if (stopRequested) { writeMeta(lead.slug, { status: "stopped", finishedAt: Date.now(), mins }); set({ status: "stopped", activity: "" }); return; }
  if (!r.ok) {
    writeMeta(lead.slug, { status: "failed", error: r.error, finishedAt: Date.now(), mins, cost: r.cost });
    set({ status: "failed", activity: r.error });
    log(`${lead.name}: build failed. ${r.error}`, "error");
    return;
  }

  const p = await buildPreview(lead.slug, (a) => set({ activity: a }));
  const meta = writeMeta(lead.slug, { status: p.ok ? "built" : "failed", error: p.ok ? null : p.error, finishedAt: Date.now(), mins, cost: r.cost, photos });
  log(`${lead.name}: ${p.ok ? `built in ${mins} min` : p.error}`, p.ok ? "ok" : "error");

  if (p.ok && settings.deploy.enabled) {
    const d = await deploySite(lead.slug, settings.deploy.repoPath, (a) => set({ activity: a }));
    if (d.ok) { writeMeta(lead.slug, { status: "deployed", url: d.url }); log(`${lead.name}: live soon at ${d.url}`, "ok"); }
    else log(`${lead.name}: deploy failed. ${d.error}`, "error");
  }
  set({ status: meta.status === "failed" ? "failed" : "done", activity: "" });
}

export function stop() {
  stopRequested = true;
  current?.stop();
  log("Stopping…", "warn");
}

export async function rebuildPreview(slug) {
  const r = await buildPreview(slug);
  writeMeta(slug, r.ok ? { status: readMeta(slug)?.status === "deployed" ? "deployed" : "built", error: null } : { error: r.error });
  emit();
  return r;
}

export async function deploy(slug) {
  const settings = loadSettings();
  const r = await deploySite(slug, settings.deploy.repoPath, (a) => log(`${slug}: ${a}`));
  if (r.ok) { writeMeta(slug, { status: "deployed", url: r.url }); log(`${slug}: live soon at ${r.url}`, "ok"); }
  else log(`${slug}: ${r.error}`, "error");
  emit();
  return r;
}
