// clipping UI. Plain JS, no build step. Talks to app.py over /api.
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

let settings, S = { running: null, queue: [], log: [], inbox: [], groups: [] }, checks = [];

function show() {
  const id = (location.hash || "#setup").slice(1);
  const panel = document.getElementById(id) ? id : "setup";
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === panel));
  $$(".steps a").forEach((a) => a.classList.toggle("active", a.dataset.step === panel));
  scrollTo({ top: 0 });
}
addEventListener("hashchange", show);

// ---- setup
const loadChecks = guard(async () => {
  $("#checks").innerHTML = '<li class="muted">Checking…</li>';
  checks = await api("/checks");
  $("#checks").innerHTML = checks.map((c) => `<li class="${c.ok ? "ok" : "bad"}"><span class="dot">${c.ok ? "✓" : "✕"}</span><span><b>${esc(c.label)}</b></span><span class="detail">${esc(c.detail)}</span>${c.ok ? "" : `<span class="fix">${esc(c.fix)}</span>`}</li>`).join("");
  $("#install").hidden = !checks.some((c) => c.installable);
  renderNav();
});
$("#recheck").onclick = loadChecks;
$("#install").onclick = guard(async () => { await api("/install", { method: "POST" }); toast("Installing… follow along under Make clips → Activity"); location.hash = "#process"; });

// ---- add videos
const drop = $("#drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => upload([...e.dataTransfer.files]));
$("#file").onchange = (e) => { upload([...e.target.files]); e.target.value = ""; };

function upload(files) {
  const bar = $("#upProgress");
  (async () => {
    for (const [i, f] of files.entries()) {
      bar.hidden = false;
      await new Promise((resolve) => {
        const x = new XMLHttpRequest();
        x.open("POST", "/api/upload?name=" + encodeURIComponent(f.name));
        x.setRequestHeader("x-token", TOKEN);
        x.upload.onprogress = (e) => {
          const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
          bar.firstElementChild.style.width = pct + "%";
          bar.lastElementChild.textContent = `Uploading ${f.name} (${i + 1}/${files.length}) · ${pct}%`;
        };
        x.onload = () => { try { const j = JSON.parse(x.responseText); if (j.error) toast(j.error, true); } catch {} resolve(); };
        x.onerror = () => { toast("Upload failed", true); resolve(); };
        x.send(f);
      });
    }
    bar.hidden = true;
    if (files.length) toast(`Added ${files.length} video${files.length > 1 ? "s" : ""}. Click "Make clips" when ready.`);
  })();
}
$("#addUrl").onclick = guard(async () => {
  const url = $("#url").value.trim(); if (!url) return;
  await api("/url", { method: "POST", body: { url } });
  $("#url").value = ""; location.hash = "#process";
});
$("#url").onkeydown = (e) => { if (e.key === "Enter") $("#addUrl").click(); };
$("#processAll").onclick = guard(async () => { await api("/process", { method: "POST", body: {} }); location.hash = "#process"; });
$("#inbox").onclick = guard(async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  if (b.dataset.act === "process") { await api("/process", { method: "POST", body: { names: [b.dataset.name] } }); location.hash = "#process"; }
  if (b.dataset.act === "remove") await api("/remove", { method: "POST", body: { name: b.dataset.name } });
});

// ---- settings
function fillSettings() {
  $("#model").value = settings.model;
  $("#min_secs").value = settings.min_secs; $("#minVal").textContent = settings.min_secs;
  $("#max_secs").value = settings.max_secs; $("#maxVal").textContent = settings.max_secs;
  $("#max_clips").value = settings.max_clips;
}
let saveTimer;
function saveSoon(patch) {
  Object.assign(settings, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(guard(async () => { settings = await api("/settings", { method: "POST", body: patch }); fillSettings(); }), 350);
}
$("#model").onchange = (e) => saveSoon({ model: e.target.value });
$("#min_secs").oninput = (e) => { $("#minVal").textContent = e.target.value; saveSoon({ min_secs: +e.target.value }); };
$("#max_secs").oninput = (e) => { $("#maxVal").textContent = e.target.value; saveSoon({ max_secs: +e.target.value }); };
$("#max_clips").oninput = (e) => saveSoon({ max_clips: +e.target.value });

// ---- render
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function renderInbox() {
  $("#inbox").innerHTML = S.inbox.length ? S.inbox.map((n) => {
    const busy = S.queue.some((j) => j.source === n && ["queued", "working"].includes(j.status));
    return `<li><span>🎬 ${esc(n)}</span>${busy ? '<span class="tag">in the queue</span>' : `<button class="btn small primary" data-act="process" data-name="${esc(n)}">Make clips</button><button class="btn small" data-act="remove" data-name="${esc(n)}">Remove</button>`}</li>`;
  }).join("") : '<li class="muted">Nothing waiting. Drop a video above.</li>';
  $("#processAll").disabled = !S.inbox.length;
}
function renderQueue() {
  const q = S.queue;
  $("#queue").innerHTML = q.length ? [...q].reverse().map((j) => `
    <div class="job ${j.status === "done" ? "done" : j.status}">
      <span class="ic">${{ done: "✓", failed: "✕", working: "●", stopped: "■", skipped: "–" }[j.status] || "…"}</span>
      <div><b>${esc(j.label)}</b><div class="act">${esc(j.activity || { queued: "Waiting", done: "Finished", skipped: "Skipped", stopped: "Stopped" }[j.status] || "")}</div></div>
      <span class="time" data-start="${j.status === "working" ? j.started : ""}">${j.status === "working" ? fmt(Date.now() / 1000 - j.started) : j.secs ? fmt(j.secs) : ""}</span>
    </div>`).join("") : '<div class="empty">Nothing processing. Add a video in <a href="#add">Add videos</a>.</div>';
  const t = (s) => new Date(s * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("#log").innerHTML = [...S.log].reverse().slice(0, 250).map((l) => `<li><time>${t(l.t)}</time><span class="${l.level}">${esc(l.msg)}</span></li>`).join("") || '<li class="muted">Nothing yet.</li>';
}
setInterval(() => $$(".time[data-start]").forEach((el) => { if (el.dataset.start) el.textContent = fmt(Date.now() / 1000 - +el.dataset.start); }), 1000);

let groupsKey = "";
function renderGroups() {
  const key = JSON.stringify(S.groups); if (key === groupsKey) return; groupsKey = key;
  $("#groups").innerHTML = S.groups.length ? S.groups.map((g) => `
    <div class="group card">
      <h2><span>${esc(g.video)}</span><span class="tag">${g.clips.length} clip${g.clips.length === 1 ? "" : "s"}</span></h2>
      <div class="cliprow">${g.clips.map((c) => {
        const src = `/clips/${encodeURIComponent(g.video)}/${encodeURIComponent(c)}?token=${TOKEN}`;
        return `<div class="clip"><video src="${src}" controls preload="metadata" playsinline></video><div class="cap"><span title="${esc(c)}">${esc(c.replace(/\.mp4$/i, ""))}</span><a class="btn small" href="${src}" download="${esc(c)}">Save</a></div></div>`;
      }).join("")}</div>
    </div>`).join("") : '<div class="empty">No clips yet. Process a video and they\'ll appear here.</div>';
  // A clip can be requested while it's still being written; retry once.
  $$("#groups video").forEach((v) => v.addEventListener("error", () => { if (!v.dataset.retried) { v.dataset.retried = "1"; setTimeout(() => v.load(), 1000); } }));
}
$("#openOut").onclick = guard(async () => api("/open", { method: "POST" }));
$("#stop").onclick = guard(async () => api("/stop", { method: "POST" }));

function renderNav() {
  $('[data-step="setup"]').classList.toggle("done", checks.length > 0 && checks.every((c) => c.ok));
  $('[data-step="add"] i').textContent = S.inbox.length || "";
  const active = S.queue.filter((j) => ["queued", "working"].includes(j.status)).length;
  $('[data-step="process"] i').textContent = active || "";
  $('[data-step="clips"] i').textContent = S.groups.reduce((n, g) => n + g.clips.length, 0) || "";
  const working = S.queue.find((j) => j.status === "working");
  $("#phase").textContent = working ? "Making clips" : "Idle";
  $("#phase").classList.toggle("busy", Boolean(working));
  $("#stop").hidden = !working;
}
function renderAll() { renderInbox(); renderQueue(); renderGroups(); renderNav(); }

(async function init() {
  try {
    const st = await api("/state");
    settings = st.settings; S = st;
    fillSettings(); renderAll(); show(); loadChecks();
  } catch (e) { toast(e.message, true); }
  const es = new EventSource("/api/events?token=" + TOKEN);
  es.onmessage = (e) => { S = { ...S, ...JSON.parse(e.data) }; renderAll(); };
})();
