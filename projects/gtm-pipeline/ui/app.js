// gtm-pipeline UI. Plain JS, no build step. Talks to server.mjs over /api.
const TOKEN = document.querySelector('meta[name="token"]').content;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch("/api" + path, { method, headers: { "x-token": TOKEN, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || res.statusText);
  return json;
}
let toastTimer;
function toast(msg, error = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast" + (error ? " error" : ""); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), error ? 6000 : 2600);
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

let settings, countries = {}, STEPS = [], S = { running: null, steps: {}, log: [], stats: {} }, checks = [];

// ---- routing
function show() {
  const id = (location.hash || "#setup").slice(1);
  const panel = document.getElementById(id) ? id : "setup";
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === panel));
  $$(".steps a").forEach((a) => a.classList.toggle("active", a.dataset.step === panel));
  if (panel === "results") renderReport(true);
  scrollTo({ top: 0 });
}
addEventListener("hashchange", show);

// ---- settings
let saveTimer;
function saveSoon(patch) {
  Object.assign(settings, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(guard(async () => { settings = await api("/settings", { method: "POST", body: patch }); }), 400);
}
const FIELDS = ["product", "qualifier", "reportTitle"];
const NUMS = ["minPostings", "minScore", "researchLimit"];
const LISTS = ["strongKeywords", "siteKeywords"];
function fill() {
  $("#adzunaId").value = settings.adzunaId || "";
  $("#keyHint").textContent = settings.hasAdzunaKey ? `A key ending ${settings.adzunaKeyHint} is saved. Paste a new one to replace it.` : "No key saved yet.";
  FIELDS.forEach((f) => ($("#" + f).value = settings[f] || ""));
  NUMS.forEach((f) => ($("#" + f).value = settings[f]));
  LISTS.forEach((f) => ($("#" + f).value = settings[f].join(", ")));
  $("#mode").value = settings.mode;
  renderChips();
}
FIELDS.forEach((f) => ($("#" + f).oninput = (e) => saveSoon({ [f]: e.target.value })));
NUMS.forEach((f) => ($("#" + f).oninput = (e) => saveSoon({ [f]: +e.target.value })));
LISTS.forEach((f) => ($("#" + f).onchange = (e) => saveSoon({ [f]: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })));
$("#mode").onchange = (e) => saveSoon({ mode: e.target.value });

function renderChips() {
  $("#phrases").innerHTML = settings.phrases.map((p) => `<span class="chip on" data-phrase="${esc(p)}" title="Click to remove">${esc(p)} ✕</span>`).join("") || '<span class="muted">No phrases yet.</span>';
  $("#phraseCount").textContent = `(${settings.phrases.length})`;
  $("#countries").innerHTML = Object.entries(countries).map(([c, n]) => `<span class="chip ${settings.countries.includes(c) ? "on" : ""}" data-country="${c}">${esc(n)}</span>`).join("");
}
$("#phrases").onclick = (e) => { const p = e.target.dataset.phrase; if (!p) return; saveSoon({ phrases: settings.phrases.filter((x) => x !== p) }); renderChips(); };
$("#addPhrase").onclick = () => { const p = $("#newPhrase").value.trim().toLowerCase(); if (!p) return; $("#newPhrase").value = ""; saveSoon({ phrases: [...settings.phrases, p] }); renderChips(); };
$("#newPhrase").onkeydown = (e) => { if (e.key === "Enter") $("#addPhrase").click(); };
$("#countries").onclick = (e) => {
  const c = e.target.dataset.country; if (!c) return;
  const next = settings.countries.includes(c) ? settings.countries.filter((x) => x !== c) : [...settings.countries, c];
  if (!next.length) return toast("Pick at least one country", true);
  saveSoon({ countries: next }); renderChips();
};

// ---- setup
const loadChecks = guard(async () => {
  $("#checks").innerHTML = '<li class="muted">Checking…</li>';
  checks = await api("/checks");
  $("#checks").innerHTML = checks.map((c) => `<li class="${c.ok ? "ok" : c.optional ? "opt" : "bad"}"><span class="dot">${c.ok ? "✓" : c.optional ? "!" : "✕"}</span><span><b>${esc(c.label)}</b>${c.optional ? ' <span class="tag">optional</span>' : ""}</span><span class="detail">${esc(c.detail)}</span>${c.ok ? "" : `<span class="fix">${esc(c.fix)}</span>`}</li>`).join("");
  renderNav();
});
$("#recheck").onclick = loadChecks;
$("#saveKeys").onclick = guard(async () => {
  const body = { adzunaId: $("#adzunaId").value.trim() };
  const key = $("#adzunaKey").value.trim(); if (key) body.adzunaKey = key;
  settings = await api("/settings", { method: "POST", body });
  $("#adzunaKey").value = ""; fill(); await loadChecks();
  const a = checks.find((c) => c.id === "adzuna");
  toast(a?.ok ? "Keys saved and working" : "Saved, but Adzuna rejected them. See the checklist.", !a?.ok);
});

// ---- run
const fmtSecs = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
function renderPipeline() {
  $("#pipeline").innerHTML = STEPS.map((st, i) => {
    const r = S.steps[st.id] || {};
    const status = r.status || "idle";
    const meta = status === "running" ? "Running…" : r.finishedAt ? `${{ done: "Done", failed: "Failed", stopped: "Stopped" }[status] || ""} · ${fmtSecs(r.secs || 0)} · ${new Date(r.finishedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}` : "Not run yet";
    return `<div class="stepcard ${status}">
      <span class="num">${status === "done" ? "✓" : status === "failed" ? "✕" : i + 1}</span>
      <div><b>${esc(st.title)}</b> <span class="muted">· ${esc(meta)}</span><p>${esc(st.blurb)}</p>${r.lastLine ? `<div class="last">${esc(r.lastLine)}</div>` : ""}</div>
      <button class="btn small" data-run="${st.id}" ${S.running ? "disabled" : ""}>Run${r.finishedAt ? " again" : ""}</button>
    </div>`;
  }).join("");
  $("#runAll").disabled = Boolean(S.running);
  const t = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("#log").innerHTML = [...S.log].reverse().slice(0, 300).map((l) => `<li><time>${t(l.t)}</time><span class="${l.level}">${esc(l.msg)}</span></li>`).join("") || '<li class="muted">Nothing yet.</li>';
}
$("#pipeline").onclick = guard(async (e) => { const b = e.target.closest("[data-run]"); if (b) await api("/run", { method: "POST", body: { steps: [b.dataset.run] } }); });
$("#runAll").onclick = guard(async () => { await api("/run", { method: "POST", body: { steps: STEPS.map((s) => s.id) } }); });
$("#stop").onclick = guard(async () => api("/stop", { method: "POST" }));
$("#openFolder").onclick = guard(async () => api("/open", { method: "POST" }));

// ---- results
let lastReport = "";
function renderReport(force) {
  const st = S.stats || {};
  $("#stats").innerHTML = [["companies", "companies found"], ["shortlist", "on the shortlist"], ["briefs", "websites checked"], ["research", "researched by AI"]]
    .map(([k, l]) => `<div class="stat"><b>${st[k] || 0}</b><span>${l}</span></div>`).join("");
  const key = String(S.steps.report?.finishedAt || "") + st.hasReport;
  if (!force && key === lastReport) return;
  lastReport = key;
  $("#reportWrap").innerHTML = st.hasReport ? `<iframe class="reportframe" src="/report?v=${Date.now()}" title="Prospect board"></iframe>` : '<div class="empty">No board yet. <a href="#run">Run the pipeline</a> to build one.</div>';
}

function renderNav() {
  const req = checks.filter((c) => !c.optional);
  $('[data-step="setup"]').classList.toggle("done", req.length > 0 && req.every((c) => c.ok));
  const done = STEPS.filter((s) => S.steps[s.id]?.status === "done").length;
  $('[data-step="run"] i').textContent = done ? `${done}/${STEPS.length}` : "";
  $('[data-step="results"] i').textContent = S.stats?.shortlist || "";
  const running = STEPS.find((s) => s.id === S.running);
  $("#phase").textContent = running ? running.title : "Idle";
  $("#phase").classList.toggle("busy", Boolean(running));
  $("#stop").hidden = !running;
}

function renderAll() { renderPipeline(); renderNav(); if (location.hash === "#results") renderReport(); }

(async function init() {
  try {
    const st = await api("/state");
    settings = st.settings; countries = st.countries; STEPS = st.stepDefs; S = st;
    fill(); renderAll(); show(); loadChecks();
  } catch (e) { toast(e.message, true); }
  const es = new EventSource("/api/events?token=" + TOKEN);
  es.onmessage = (e) => { S = { ...S, ...JSON.parse(e.data) }; renderAll(); };
})();
