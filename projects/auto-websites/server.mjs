#!/usr/bin/env node
// auto-websites: local web app.  Run `node server.mjs`, then open the URL it prints.
//
// Security: binds to 127.0.0.1 only, checks the Host header (blocks DNS rebinding),
// and requires a per-launch token on every API call, so other websites open in
// your browser can't start builds.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { APP_DIR, SITES_DIR, loadSettings, saveSettings, publicSettings, readText, writeText, resetText, DEFAULT_TYPES } from "./lib/config.mjs";
import * as pipeline from "./lib/pipeline.mjs";
import { runChecks } from "./lib/checks.mjs";

const PORT = Number(process.env.PORT) || 4321;
const TOKEN = crypto.randomBytes(18).toString("hex");
const UI_DIR = path.join(APP_DIR, "ui");
const TEXTS = new Set(["CLAUDE.md", "build-instructions.md"]);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon", ".mp4": "video/mp4", ".txt": "text/plain" };

const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

function serveFile(res, root, rel) {
  const file = path.resolve(root, "." + path.posix.normalize("/" + decodeURIComponent(rel)));
  if (!file.startsWith(path.resolve(root))) return send(res, 403, "Forbidden", "text/plain");
  let target = file;
  try { if (fs.statSync(target).isDirectory()) target = path.join(target, "index.html"); } catch { return send(res, 404, "Not found", "text/plain"); }
  fs.readFile(target, (err, data) => err ? send(res, 404, "Not found", "text/plain")
    : send(res, 200, data, TYPES[path.extname(target).toLowerCase()] || "application/octet-stream"));
}

const readBody = (req) => new Promise((resolve, reject) => {
  let b = "";
  req.on("data", (d) => { b += d; if (b.length > 2e6) { reject(new Error("Body too large")); req.destroy(); } });
  req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error("Invalid JSON")); } });
});

const clients = new Set();
pipeline.events.on("state", () => {
  const payload = `data: ${JSON.stringify(pipeline.getState())}\n\n`;
  for (const res of clients) res.write(payload);
});

function openPath(p) {
  const cmd = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [p], { detached: true, stdio: "ignore" }).unref();
}

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  if (p === "/api/state" && m === "GET") return send(res, 200, { settings: publicSettings(loadSettings()), defaultTypes: DEFAULT_TYPES, ...pipeline.getState() });
  if (p === "/api/events" && m === "GET") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(`data: ${JSON.stringify(pipeline.getState())}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => { clients.delete(res); clearInterval(ping); });
    return;
  }
  if (p === "/api/checks" && m === "GET") return send(res, 200, await runChecks(loadSettings()));
  if (p === "/api/settings" && m === "POST") {
    const body = await readBody(req);
    if (body.googleKey === "") delete body.googleKey;       // blank field = keep the saved key
    if (body.clearGoogleKey) { body.googleKey = ""; delete body.clearGoogleKey; }
    return send(res, 200, publicSettings(saveSettings(body)));
  }
  const t = p.match(/^\/api\/text\/([\w.-]+)(\/reset)?$/);
  if (t && TEXTS.has(t[1])) {
    if (t[2] && m === "POST") return send(res, 200, { text: resetText(t[1]) });
    if (m === "GET") return send(res, 200, { text: readText(t[1]) });
    if (m === "PUT") { const { text } = await readBody(req); writeText(t[1], String(text ?? "")); return send(res, 200, { ok: true }); }
  }
  if (p === "/api/search" && m === "POST") { await pipeline.search(); return send(res, 200, { ok: true }); }
  if (p === "/api/build" && m === "POST") { const { slugs } = await readBody(req); pipeline.build(Array.isArray(slugs) ? slugs : []); return send(res, 200, { ok: true }); }
  if (p === "/api/stop" && m === "POST") { pipeline.stop(); return send(res, 200, { ok: true }); }
  const s = p.match(/^\/api\/sites\/([a-z0-9-]+)\/(deploy|preview|open)$/);
  if (s && m === "POST") {
    const dir = path.join(SITES_DIR, s[1]);
    if (!fs.existsSync(dir)) return send(res, 404, { error: "No such site" });
    if (s[2] === "deploy") return send(res, 200, await pipeline.deploy(s[1]));
    if (s[2] === "preview") return send(res, 200, await pipeline.rebuildPreview(s[1]));
    if (s[2] === "open") { openPath(dir); return send(res, 200, { ok: true }); }
  }
  return send(res, 404, { error: "Unknown endpoint" });
}

const server = http.createServer(async (req, res) => {
  const host = (req.headers.host || "").toLowerCase();
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return send(res, 403, "Forbidden host", "text/plain");
  const url = new URL(req.url, `http://${host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const token = req.headers["x-token"] || url.searchParams.get("token");
      if (token !== TOKEN) return send(res, 401, { error: "Missing or wrong token. Reload the page." });
      return await api(req, res, url);
    }
    const pv = url.pathname.match(/^\/preview\/([a-z0-9-]+)(\/.*)?$/);
    if (pv) {
      if (!pv[2]) { res.writeHead(302, { Location: `/preview/${pv[1]}/` }); return res.end(); }
      return serveFile(res, path.join(SITES_DIR, pv[1], "dist"), pv[2]);
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = fs.readFileSync(path.join(UI_DIR, "index.html"), "utf8").replace("__TOKEN__", TOKEN);
      return send(res, 200, html, "text/html; charset=utf-8");
    }
    return serveFile(res, UI_DIR, url.pathname);
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  auto-websites is running at ${url}\n  Press Ctrl+C to stop.\n`);
  if (!process.argv.includes("--no-open")) openPath(url);
});
