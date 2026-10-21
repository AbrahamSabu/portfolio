#!/usr/bin/env node
// gtm-pipeline: local web app.  Run `node server.mjs`, then open the URL it prints.
// Same safety model as auto-websites: 127.0.0.1 only, Host check, per-launch token.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { run, lines, killTree } from "./lib/proc.mjs";

const require = createRequire(import.meta.url);
const settingsLib = require("./lib/settings.cjs");
const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA = settingsLib.DATA;
const PORT = Number(process.env.PORT) || 4322;
const TOKEN = crypto.randomBytes(18).toString("hex");

const STEPS = [
  { id: "collect", script: "collect.js", title: "Collect job ads", blurb: "Pulls matching job ads from Adzuna and builds a list of employers." },
  { id: "triage", script: "triage.js", title: "Rank", blurb: "Scores each employer, removes recruiters and noise, and makes a shortlist." },
  { id: "enrich", script: "enrich.js", title: "Crawl websites", blurb: "Finds each shortlisted company's website and checks it for your keywords." },
  { id: "research", script: "research-pipeline.cjs", title: "AI research", blurb: "One Claude Code web-research session per company, with a verdict." },
  { id: "report", script: "report.js", title: "Build the board", blurb: "Combines everything into an interactive prospect board." },
];

// ---- state ------------------------------------------------------------------
const events = new EventEmitter();
const STATE_FILE = path.join(DATA, "runs.json");
const state = { running: null, steps: {}, log: [] };
try { Object.assign(state.steps, JSON.parse(fs.readFileSync(STATE_FILE, "utf8"))); } catch {}
let child = null, stopRequested = false;

const emit = () => events.emit("state");
function log(msg, level = "info") {
  state.log.push({ t: Date.now(), level, msg });
  if (state.log.length > 600) state.log.splice(0, state.log.length - 600);
  emit();
}
function setStep(id, patch) {
  state.steps[id] = { ...(state.steps[id] || {}), ...patch };
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state.steps, null, 2));
  emit();
}

const count = (file, fn) => { try { return fn(JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8"))); } catch { return 0; } };
function stats() {
  const len = (d) => (Array.isArray(d) ? d.length : Object.keys(d || {}).length);
  let research = 0;
  try { research = fs.readdirSync(path.join(DATA, "research")).filter((f) => f.endsWith(".md")).length; } catch {}
  return {
    companies: count("companies_master.json", (d) => len(d.companies || d)),
    shortlist: count("shortlist.json", (d) => len(d.companies || d)),
    briefs: count("briefs.json", (d) => len(d.companies || d)),
    research,
    hasReport: fs.existsSync(path.join(DATA, "report.html")),
  };
}
const snapshot = () => ({ running: state.running, steps: state.steps, log: state.log, stats: stats() });

function runStep(step) {
  return new Promise((resolve) => {
    const started = Date.now();
    setStep(step.id, { status: "running", startedAt: started, lastLine: "" });
    log(`▶ ${step.title}`);
    child = spawn(process.execPath, [path.join(APP_DIR, step.script)], {
      cwd: APP_DIR, env: { ...process.env, GTM_WORKSPACE: DATA, FORCE_COLOR: "0" }, windowsHide: true,
    });
    const onLine = (l) => { const t = l.trimEnd(); if (!t) return; log(t, /error|fail/i.test(t) ? "warn" : "info"); setStep(step.id, { lastLine: t.slice(0, 160) }); };
    lines(child.stdout, onLine);
    lines(child.stderr, onLine);
    child.on("close", (code) => {
      child = null;
      const ok = code === 0 && !stopRequested;
      setStep(step.id, { status: stopRequested ? "stopped" : ok ? "done" : "failed", finishedAt: Date.now(), secs: Math.round((Date.now() - started) / 1000), exitCode: code });
      log(ok ? `✓ ${step.title} finished` : stopRequested ? `■ ${step.title} stopped` : `✕ ${step.title} failed (exit ${code})`, ok ? "ok" : "error");
      resolve(ok);
    });
  });
}

async function runSteps(ids) {
  if (state.running) throw new Error("A step is already running.");
  stopRequested = false;
  const list = STEPS.filter((s) => ids.includes(s.id));
  state.running = list[0]?.id || null;
  (async () => {
    for (const s of list) {
      state.running = s.id; emit();
      if (!(await runStep(s)) || stopRequested) break;
    }
    state.running = null; emit();
  })();
}

// ---- checks -------------------------------------------------------------------
async function checks() {
  const s = settingsLib.load();
  const claude = await run("claude", ["--version"]);
  const out = [
    { id: "node", label: "Node.js 18 or newer", ok: parseInt(process.version.slice(1), 10) >= 18, detail: process.version, fix: "Install Node.js from https://nodejs.org" },
    { id: "claude", label: "Claude Code CLI", ok: claude.code === 0, detail: (claude.out.match(/\d+\.\d+\.\d+/) || [""])[0], fix: "Only needed for the AI research step. Install Claude Code, then run `claude` once to sign in.", optional: true },
  ];
  let adz = { id: "adzuna", label: "Adzuna API keys", ok: false, detail: "Not set", fix: "Register free at https://developer.adzuna.com and paste your app ID and key below." };
  if (s.adzunaId && s.adzunaKey) {
    try {
      const c = s.countries[0] || "gb";
      const r = await fetch(`https://api.adzuna.com/v1/api/jobs/${c}/search/1?app_id=${encodeURIComponent(s.adzunaId)}&app_key=${encodeURIComponent(s.adzunaKey)}&results_per_page=1&what=sales`);
      adz = { ...adz, ok: r.ok, detail: r.ok ? "Working" : `Adzuna said ${r.status}` };
    } catch (e) { adz = { ...adz, detail: e.message }; }
  }
  out.push(adz);
  return out;
}

const publicSettings = (s) => ({ ...s, adzunaKey: "", hasAdzunaKey: Boolean(s.adzunaKey), adzunaKeyHint: s.adzunaKey ? "…" + s.adzunaKey.slice(-3) : "" });

// ---- http ---------------------------------------------------------------------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let b = ""; req.on("data", (d) => { b += d; if (b.length > 1e6) req.destroy(); });
  req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error("Invalid JSON")); } });
});
const clients = new Set();
events.on("state", () => { const p = `data: ${JSON.stringify(snapshot())}\n\n`; for (const r of clients) r.write(p); });

async function api(req, res, p) {
  const m = req.method;
  if (p === "/api/state") return send(res, 200, { settings: publicSettings(settingsLib.load()), countries: settingsLib.COUNTRIES, stepDefs: STEPS, ...snapshot() });
  if (p === "/api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`); clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => { clients.delete(res); clearInterval(ping); });
    return;
  }
  if (p === "/api/checks") return send(res, 200, await checks());
  if (p === "/api/settings" && m === "POST") {
    const body = await readBody(req);
    if (body.adzunaKey === "") delete body.adzunaKey;
    return send(res, 200, publicSettings(settingsLib.save(body)));
  }
  if (p === "/api/run" && m === "POST") {
    const { steps } = await readBody(req);
    await runSteps(Array.isArray(steps) && steps.length ? steps : STEPS.map((s) => s.id));
    return send(res, 200, { ok: true });
  }
  if (p === "/api/stop" && m === "POST") { stopRequested = true; killTree(child); log("Stopping…", "warn"); return send(res, 200, { ok: true }); }
  if (p === "/api/open" && m === "POST") {
    const cmd = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
    spawn(cmd, [DATA], { detached: true, stdio: "ignore" }).unref();
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: "Unknown endpoint" });
}

http.createServer(async (req, res) => {
  const host = (req.headers.host || "").toLowerCase();
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return send(res, 403, "Forbidden host", "text/plain");
  const url = new URL(req.url, `http://${host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      if ((req.headers["x-token"] || url.searchParams.get("token")) !== TOKEN) return send(res, 401, { error: "Missing or wrong token. Reload the page." });
      return await api(req, res, url.pathname);
    }
    if (url.pathname === "/report") {
      const f = path.join(DATA, "report.html");
      return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f), "text/html; charset=utf-8") : send(res, 404, "No report yet. Run the pipeline first.", "text/plain");
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return send(res, 200, fs.readFileSync(path.join(APP_DIR, "ui", "index.html"), "utf8").replace("__TOKEN__", TOKEN), "text/html; charset=utf-8");
    }
    const file = path.resolve(APP_DIR, "ui", "." + path.posix.normalize("/" + decodeURIComponent(url.pathname)));
    if (!file.startsWith(path.join(APP_DIR, "ui")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "Not found", "text/plain");
    return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || "application/octet-stream");
  } catch (e) { return send(res, 400, { error: e.message }); }
}).listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  gtm-pipeline is running at ${url}\n  Press Ctrl+C to stop.\n`);
  if (!process.argv.includes("--no-open")) {
    const cmd = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
  }
});
