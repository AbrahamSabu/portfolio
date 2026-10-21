// auto-websites UI. Plain JS, no build step. Talks to server.mjs over /api.
const TOKEN = document.querySelector('meta[name="token"]').content;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch("/api" + path, { method, headers: { "x-token": TOKEN, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || res.statusText);
  return json;
}

let toastTimer;
function toast(msg, error = false) {
  const t = $("#toast");
  t.textContent = msg; t.className = "toast" + (error ? " error" : ""); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), error ? 6000 : 2800);
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

let settings = null, defaultTypes = [], S = { phase: "idle", leads: [], queue: [], log: [], sites: [] };
let checks = [];
const selected = new Set();

// ---- routing --------------------------------------------------------------
function show() {
  const id = (location.hash || "#setup").slice(1);
  const panel = document.getElementById(id) ? id : "setup";
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === panel));
  $$(".steps a").forEach((a) => a.classList.toggle("active", a.dataset.step === panel));
  if (panel === "design") loadTexts();
  window.scrollTo({ top: 0 });
}
addEventListener("hashchange", show);

// ---- settings -------------------------------------------------------------
let saveTimer;
function saveSoon(patch) {
  Object.assign(settings, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(guard(async () => { settings = { ...settings, ...(await api("/settings", { method: "POST", body: patch })) }; renderFind(); }), 400);
}

function fillSettings() {
  $("#model").value = settings.model || "";
  $("#deployEnabled").checked = settings.deploy.enabled;
  $("#repoPath").value = settings.deploy.repoPath || "";
  $("#keyHint").textContent = settings.hasGoogleKey ? `A key ending ${settings.googleKeyHint} is saved. Paste a new one to replace it.` : "No key saved yet.";
  $("#location").value = settings.location;
  $("#radiusKm").value = settings.radiusKm;
  $("#areas").value = settings.areas.join("\n");
  $("#onlyNoWebsite").checked = settings.onlyNoWebsite;
  $("#skipBuilt").checked = settings.skipBuilt;
  $("#extra").value = settings.extraInstructions || "";
  renderFind();
}

// ---- setup ----------------------------------------------------------------
const loadChecks = guard(async () => {
  $("#checks").innerHTML = '<li class="muted">Checking…</li>';
  checks = await api("/checks");
  $("#checks").innerHTML = checks.map((c) => `
    <li class="${c.ok ? "ok" : c.optional ? "opt" : "bad"}">
      <span class="dot">${c.ok ? "✓" : c.optional ? "!" : "✕"}</span>
      <span><b>${esc(c.label)}</b>${c.optional ? ' <span class="tag">optional</span>' : ""}</span>
      <span class="detail">${esc(c.detail)}</span>
      ${c.ok ? "" : `<span class="fix">${esc(c.fix)}</span>`}
    </li>`).join("");
  renderSteps();
});

$("#recheck").onclick = loadChecks;
$("#saveKey").onclick = guard(async () => {
  const key = $("#googleKey").value.trim();
  if (!key) return toast("Paste a key first", true);
  settings = { ...settings, ...(await api("/settings", { method: "POST", body: { googleKey: key } })) };
  $("#googleKey").value = "";
  fillSettings();
  await loadChecks();
  const g = checks.find((c) => c.id === "google");
  toast(g?.ok ? "Key saved and working" : "Key saved, but Google rejected it. See the checklist.", !g?.ok);
});
$("#model").onchange = (e) => saveSoon({ model: e.target.value });
$("#saveDeploy").onclick = guard(async () => {
  settings = { ...settings, ...(await api("/settings", { method: "POST", body: { deploy: { enabled: $("#deployEnabled").checked, repoPath: $("#repoPath").value.trim() } } })) };
  toast("Deploy settings saved");
  loadChecks();
});

// ---- find -----------------------------------------------------------------
function renderFind() {
  $("#radiusVal").textContent = settings.radiusKm;
  const all = [...new Set([...defaultTypes, ...settings.types])];
  $("#types").innerHTML = all.map((t) => `<span class="chip ${settings.types.includes(t) ? "on" : ""}" data-type="${esc(t)}">${esc(t)}</span>`).join("");
  $("#typeCount").textContent = `(${settings.types.length} selected)`;
  const n = settings.types.length * Math.max(1, settings.areas.length);
  $("#searchEstimate").textContent = n ? `${n} Google search${n === 1 ? "" : "es"}` : "Pick at least one business type";
  $("#selectTop").textContent = `Select top ${settings.maxSites}`;
}
$("#types").onclick = (e) => {
  const t = e.target.dataset.type; if (!t) return;
  const types = settings.types.includes(t) ? settings.types.filter((x) => x !== t) : [...settings.types, t];
  saveSoon({ types }); renderFind();
};
$("#addType").onclick = () => {
  const t = $("#newType").value.trim().toLowerCase(); if (!t) return;
  $("#newType").value = ""; saveSoon({ types: [...settings.types, t] }); renderFind();
};
$("#newType").onkeydown = (e) => { if (e.key === "Enter") $("#addType").click(); };
$("#location").oninput = (e) => saveSoon({ location: e.target.value });
$("#radiusKm").oninput = (e) => { $("#radiusVal").textContent = e.target.value; saveSoon({ radiusKm: +e.target.value }); };
$("#areas").oninput = (e) => saveSoon({ areas: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) });
$("#onlyNoWebsite").onchange = (e) => saveSoon({ onlyNoWebsite: e.target.checked });
$("#skipBuilt").onchange = (e) => saveSoon({ skipBuilt: e.target.checked });
$("#searchBtn").onclick = guard(async () => { await api("/search", { method: "POST" }); selected.clear(); });

let leadsKey = "";
function renderLeads(force = false) {
  const key = S.phase + "|" + S.leads.map((l) => l.slug).join() + "|" + [...selected].join() + "|" + $("#leadFilter").value;
  if (!force && key === leadsKey) return;
  leadsKey = key;
  $("#leadsCard").hidden = !S.leads.length;
  $("#leadsTitle").textContent = `${S.leads.length} business${S.leads.length === 1 ? "" : "es"} found`;
  const f = $("#leadFilter").value.toLowerCase();
  const rows = S.leads.filter((l) => !f || (l.name + l.type + l.address).toLowerCase().includes(f));
  $("#leads").innerHTML = rows.map((l) => `
    <tr data-slug="${esc(l.slug)}" class="${selected.has(l.slug) ? "sel" : ""}">
      <td><input type="checkbox" ${selected.has(l.slug) ? "checked" : ""} aria-label="Select ${esc(l.name)}"></td>
      <td><div class="name">${esc(l.name)}</div>${l.alreadyBuilt ? '<span class="tag">built before</span> ' : ""}${l.website ? '<span class="tag warn">has a website</span>' : ""}${l.mapsUrl ? ` <a href="${esc(l.mapsUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Maps ↗</a>` : ""}</td>
      <td>${esc(l.type)}</td>
      <td>${l.photoNames.length >= 3 ? l.photoNames.length : `<span class="tag warn">${l.photoNames.length}</span>`}</td>
      <td>${l.rating ? `★ ${l.rating} <span class="muted">(${l.reviews})</span>` : '<span class="muted">—</span>'}</td>
      <td>${l.km} km</td>
      <td class="addr">${esc(l.address)}</td>
    </tr>`).join("");
  const n = selected.size;
  $("#buildBar").hidden = !n;
  $("#selectedCount").innerHTML = `<b>${n}</b> selected${n ? ` · about ${n * 30} min of building` : ""}`;
  $("#buildBtn").disabled = !n || S.phase !== "idle";
  $("#buildBtn").textContent = n ? `Build ${n} site${n === 1 ? "" : "s"}` : "Build selected";
}
$("#leads").onclick = (e) => {
  const tr = e.target.closest("tr"); if (!tr) return;
  const s = tr.dataset.slug; selected.has(s) ? selected.delete(s) : selected.add(s); renderLeads();
};
$("#leadFilter").oninput = () => renderLeads();
$("#selectTop").onclick = () => { selected.clear(); S.leads.slice(0, settings.maxSites).forEach((l) => selected.add(l.slug)); renderLeads(); };
$("#selectNone").onclick = () => { selected.clear(); renderLeads(); };
$("#buildBtn").onclick = guard(async () => {
  await api("/build", { method: "POST", body: { slugs: [...selected] } });
  selected.clear(); location.hash = "#build";
});

function renderSearch() {
  const p = $("#searchProgress"), s = S.search;
  p.hidden = !(S.phase === "searching" || s?.error);
  if (!s) return;
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  p.firstElementChild.style.width = pct + "%";
  p.lastElementChild.textContent = s.error && S.phase !== "searching" ? s.error : `Searching ${s.done}/${s.total} · ${s.found || 0} found${s.query ? " · " + s.query : ""}`;
  $("#searchBtn").disabled = S.phase !== "idle";
}

// ---- design ---------------------------------------------------------------
let textsLoaded = false;
const loadTexts = guard(async () => {
  if (textsLoaded) return;
  for (const name of ["CLAUDE.md", "build-instructions.md"]) document.getElementById("text-" + name).value = (await api("/text/" + name)).text;
  textsLoaded = true;
});
$$("[data-save]").forEach((b) => (b.onclick = guard(async () => {
  const name = b.dataset.save;
  await api("/text/" + name, { method: "PUT", body: { text: document.getElementById("text-" + name).value } });
  toast("Saved");
})));
$$("[data-reset]").forEach((b) => (b.onclick = guard(async () => {
  if (!confirm("Replace your edits with the default text?")) return;
  const name = b.dataset.reset;
  document.getElementById("text-" + name).value = (await api(`/text/${name}/reset`, { method: "POST" })).text;
  toast("Reset to default");
})));
$("#saveExtra").onclick = guard(async () => { settings = { ...settings, ...(await api("/settings", { method: "POST", body: { extraInstructions: $("#extra").value } })) }; toast("Saved"); });

// ---- build ----------------------------------------------------------------
const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function renderQueue() {
  const q = S.queue || [];
  $("#queue").innerHTML = q.length ? q.map((j) => `
    <div class="job ${j.status}">
      <span class="ic">${{ done: "✓", failed: "✕", working: "●", stopped: "■", skipped: "–" }[j.status] || "…"}</span>
      <div><b>${esc(j.name)}</b><div class="act">${esc(j.activity || { queued: "Waiting", done: "Finished", skipped: "Skipped", stopped: "Stopped" }[j.status] || "")}</div></div>
      <span class="time" data-start="${j.status === "working" ? j.startedAt : ""}">${j.status === "working" ? fmt(Date.now() - j.startedAt) : ""}</span>
    </div>`).join("") : '<div class="empty">Nothing building. Pick businesses in <a href="#find">Find businesses</a>.</div>';
  const t = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  $("#log").innerHTML = [...S.log].reverse().map((l) => `<li><time>${t(l.t)}</time><span class="${l.level}">${esc(l.msg)}</span></li>`).join("") || '<li class="muted">No activity yet.</li>';
}
setInterval(() => $$(".time[data-start]").forEach((el) => { if (el.dataset.start) el.textContent = fmt(Date.now() - +el.dataset.start); }), 1000);

// ---- sites ----------------------------------------------------------------
let sitesKey = "";
function renderSites() {
  const key = JSON.stringify(S.sites);
  if (key === sitesKey) return;
  sitesKey = key;
  const canDeploy = settings?.deploy?.repoPath;
  $("#siteGrid").innerHTML = S.sites.length ? S.sites.map((s) => `
    <article class="site">
      <div class="frame">${s.hasPreview ? `<iframe src="/preview/${s.slug}/" loading="lazy" tabindex="-1" title="Preview of ${esc(s.name)}"></iframe>` : `<div class="none">${s.status === "building" ? "Building…" : "No preview yet"}</div>`}</div>
      <div class="body">
        <h3>${esc(s.name)}</h3>
        <div class="meta">${esc(s.type || "")}${s.mins ? ` · ${s.mins} min` : ""}${s.cost ? ` · $${Number(s.cost).toFixed(2)}` : ""} · <span class="tag">${esc(s.status || "unknown")}</span></div>
        ${s.error ? `<div class="err">${esc(s.error)}</div>` : ""}
        ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>` : ""}
        <div class="actions">
          ${s.hasPreview ? `<a class="btn small primary" href="/preview/${s.slug}/" target="_blank" rel="noopener">Open preview</a>` : ""}
          <button class="btn small" data-act="preview" data-slug="${s.slug}">${s.hasPreview ? "Rebuild preview" : "Build preview"}</button>
          ${canDeploy && s.hasPreview ? `<button class="btn small" data-act="deploy" data-slug="${s.slug}">${s.url ? "Redeploy" : "Deploy"}</button>` : ""}
          <button class="btn small" data-act="open" data-slug="${s.slug}">Open folder</button>
        </div>
      </div>
    </article>`).join("") : '<div class="empty">No sites yet. Build some from <a href="#find">Find businesses</a>.</div>';
}
$("#siteGrid").onclick = guard(async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  b.disabled = true; const label = b.textContent; b.textContent = "Working…";
  try {
    const r = await api(`/sites/${b.dataset.slug}/${b.dataset.act}`, { method: "POST" });
    if (r.ok === false) throw new Error(r.error);
    if (b.dataset.act === "deploy") toast("Deployed. Live in a minute or two.");
    if (b.dataset.act === "preview") toast("Preview rebuilt");
  } finally { b.disabled = false; b.textContent = label; sitesKey = ""; renderSites(); }
});

// ---- global ---------------------------------------------------------------
function renderSteps() {
  const required = checks.filter((c) => !c.optional);
  $('[data-step="setup"]').classList.toggle("done", required.length > 0 && required.every((c) => c.ok));
  $('[data-step="find"] i').textContent = S.leads.length ? S.leads.length : "";
  const q = S.queue || [];
  $('[data-step="build"] i').textContent = q.length ? `${q.filter((j) => ["done", "failed", "stopped", "skipped"].includes(j.status)).length}/${q.length}` : "";
  $('[data-step="sites"] i').textContent = S.sites.length || "";
  const phase = { idle: "Idle", searching: "Searching", building: "Building" }[S.phase] || S.phase;
  $("#phase").textContent = phase;
  $("#phase").classList.toggle("busy", S.phase !== "idle");
  $("#stop").hidden = S.phase === "idle";
}
$("#stop").onclick = guard(async () => { await api("/stop", { method: "POST" }); });

function renderAll() { renderSearch(); renderLeads(); renderQueue(); renderSites(); renderSteps(); }

(async function init() {
  try {
    const st = await api("/state");
    settings = st.settings; defaultTypes = st.defaultTypes; S = st;
    fillSettings(); renderAll(); show(); loadChecks();
  } catch (e) { toast(e.message, true); }
  const es = new EventSource("/api/events?token=" + TOKEN);
  es.onmessage = (e) => { S = { ...S, ...JSON.parse(e.data) }; renderAll(); };
})();
