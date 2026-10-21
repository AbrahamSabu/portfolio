// Renders SUMMARY.md + FULL-REPORT.md into a single readable HTML page.
// Re-run after every research refresh:  node render.mjs
//
// Deliberately dependency-free. The markdown in these reports uses a known
// subset (headings, paragraphs, lists, tables, rules, bold, links, inline code,
// the odd blockquote) so a focused converter is more predictable here than a
// general library, and it lets us do report-specific things a library cannot:
// threat pills, effort tags, source-status chips, and anchor slugs that match
// the ones SUMMARY.md already links to.

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// GitHub-style slugs. SUMMARY.md already links to FULL-REPORT.md#23-where-the-
// category-is-heading and friends, so this has to keep producing those exact
// strings or every cross-link in the summary silently dies.
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

function inline(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    // In-page: the two files become one document, so cross-file links resolve
    // to anchors rather than to a file that is not being served.
    let h = href
      .replace(/^\.\/FULL-REPORT\.md/, '')
      .replace(/^\.\/SUMMARY\.md/, '#top')
      .replace(/^FULL-REPORT\.md/, '');
    if (h === '') h = '#top';
    const ext = /^https?:/.test(h);
    return `<a href="${esc(h)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
  });
  return out;
}

// Threat levels and effort tags carry meaning the reader scans for, so they get
// encoded in form as well as words rather than sitting as plain table text.
function decorate(cell) {
  const bare = cell.replace(/<[^>]+>/g, '').trim();
  const threat = bare.match(/^(High|Medium-High|Medium|Low-Medium|Low)\b/i);
  if (threat) {
    const key = threat[1].toLowerCase();
    const level = key.startsWith('high') ? 'high' : key.startsWith('low-') || key === 'low' ? 'low' : 'med';
    const rest = cell.replace(/^(<strong>)?(High|Medium-High|Medium|Low-Medium|Low)(<\/strong>)?/i, '');
    return `<span class="pill pill--${level}">${threat[1]}</span>${rest}`;
  }
  if (/^(<strong>)?[SML](<\/strong>)?$/.test(cell.trim())) {
    const size = bare;
    return `<span class="tag tag--${size.toLowerCase()}">${size}</span>`;
  }
  return cell;
}

function renderTable(rows) {
  const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(rows[0]);
  const align = cells(rows[1]).map((s) =>
    s.startsWith(':') && s.endsWith(':') ? 'center' : s.endsWith(':') ? 'right' : 'left'
  );
  const body = rows.slice(2).map(cells);
  const th = head.map((h, i) => `<th style="text-align:${align[i]}">${inline(h)}</th>`).join('');
  const tr = body
    .map((r) => {
      const tds = r
        .map((c, i) => `<td style="text-align:${align[i] || 'left'}">${decorate(inline(c))}</td>`)
        .join('');
      const bare = r.join(' ');
      const sev = /\bHigh\b/.test(bare) ? ' data-sev="high"' : /\bMedium\b/.test(bare) ? ' data-sev="med"' : /\bLow\b/.test(bare) ? ' data-sev="low"' : '';
      return `<tr${sev}>${tds}</tr>`;
    })
    .join('');
  return `<div class="scroll"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

function convert(md, { anchorPrefix = '', skipH1 = false, skipContents = false } = {}) {
  const lines = md.split('\n');
  const out = [];
  const toc = [];
  let i = 0;
  let inContents = false;

  const flushList = (type, items) =>
    `<${type}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${type}>`;

  while (i < lines.length) {
    const line = lines[i];
    const s = line.replace(/\s+$/, '');

    if (!s.trim()) { i++; continue; }

    const h = s.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2];
      // The markdown Contents list is replaced by the live rail, so drop it.
      if (skipContents && level === 2 && /^contents$/i.test(text.trim())) {
        inContents = true; i++; continue;
      }
      inContents = false;
      if (skipH1 && level === 1) { i++; continue; }
      const id = anchorPrefix + slug(text);
      if (level <= 3) toc.push({ level, text: text.replace(/\*\*/g, ''), id });
      const num = text.match(/^(\d+(?:\.\d+)?)\.?\s+(.*)$/);
      const label = num ? `<span class="num">${num[1]}</span>${inline(num[2])}` : inline(text);
      out.push(`<h${level} id="${id}" class="h h--${level}">${label}</h${level}>`);
      i++; continue;
    }

    if (inContents) { i++; continue; }

    if (/^-{3,}$/.test(s.trim())) { out.push('<hr />'); i++; continue; }

    if (s.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i].trim()), i++;
      out.push(rows.length >= 2 ? renderTable(rows) : `<p>${inline(rows.join(' '))}</p>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(s)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*[-*]\s+/, '');
        i++;
        // continuation lines of a wrapped bullet
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*]\s/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i])) {
          item += ' ' + lines[i].trim(); i++;
        }
        items.push(item);
      }
      out.push(flushList('ul', items));
      continue;
    }

    if (/^\s*\d+\.\s+/.test(s)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*\d+\.\s+/, '');
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i]) && !/^\s*[-*]\s/.test(lines[i])) {
          item += ' ' + lines[i].trim(); i++;
        }
        items.push(item);
      }
      out.push(flushList('ol', items));
      continue;
    }

    if (s.startsWith('>')) {
      const q = [];
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i].replace(/^>\s?/, '')), i++;
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
      continue;
    }

    const para = [s];
    i++;
    while (
      i < lines.length && lines[i].trim() &&
      !/^[#|>]/.test(lines[i]) && !/^\s*[-*]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i]) && !/^-{3,}$/.test(lines[i].trim())
    ) { para.push(lines[i].trim()); i++; }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  return { html: out.join('\n'), toc };
}

const summary = convert(read('SUMMARY.md'), { anchorPrefix: 's-', skipH1: true });
const full = convert(read('FULL-REPORT.md'), { skipH1: true, skipContents: true });

const railGroup = (title, href, items) => `
  <div class="rail__group">
    <a class="rail__head" href="${href}">${title}</a>
    <ol class="rail__list">
      ${items
        .filter((t) => t.level <= 3)
        .map((t) => {
          const num = t.text.match(/^(\d+(?:\.\d+)?)\.?\s+(.*)$/);
          return `<li class="rail__item rail__item--l${t.level}"><a href="#${t.id}">${
            num ? `<span class="rail__num">${num[1]}</span>${esc(num[2])}` : esc(t.text)
          }</a></li>`;
        })
        .join('')}
    </ol>
  </div>`;

const stat = (label, value) =>
  `<div class="stat"><span class="stat__label">${label}</span><span class="stat__value">${value}</span></div>`;

const page = `<title>Kríos market and competitive research</title>
<style>
:root {
  /* Inherited from the Kríos design system in marketing/src/styles/global.css.
     Same tokens the product uses, so this reads as company material. */
  --cream: oklch(0.98 0.004 95);
  --surface: oklch(1 0 0);
  --surface-2: oklch(0.965 0.004 95);
  --ink: oklch(0.23 0.006 75);
  --steel: oklch(0.45 0.01 78);
  --line: oklch(0.23 0.006 75 / 11%);
  --line-strong: oklch(0.23 0.006 75 / 20%);
  --ember: oklch(0.76 0.155 64);
  --ember-ink: oklch(0.53 0.16 48);
  --ember-soft: oklch(0.76 0.155 64 / 0.12);
  --positive: oklch(0.50 0.115 150);
  --positive-soft: oklch(0.50 0.115 150 / 0.10);
  --negative: oklch(0.52 0.16 28);
  --negative-soft: oklch(0.52 0.16 28 / 0.09);

  --font-display: "Bricolage Grotesque Variable", "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Prompt", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace;

  --rail: 20rem;
  --measure: 72ch;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --cream: oklch(0.135 0.004 270);
    --surface: oklch(0.18 0.004 270);
    --surface-2: oklch(0.22 0.004 270);
    --ink: oklch(0.965 0.003 95);
    --steel: oklch(0.72 0.006 95);
    --line: oklch(1 0 0 / 9%);
    --line-strong: oklch(1 0 0 / 18%);
    --ember-ink: oklch(0.80 0.145 66);
    --positive: oklch(0.78 0.15 152);
    --positive-soft: oklch(0.78 0.15 152 / 0.14);
    --negative: oklch(0.72 0.17 27);
    --negative-soft: oklch(0.72 0.17 27 / 0.13);
    color-scheme: dark;
  }
}
/* The viewer's own toggle has to win over the OS preference in both directions. */
:root[data-theme="dark"] {
  --cream: oklch(0.135 0.004 270);
  --surface: oklch(0.18 0.004 270);
  --surface-2: oklch(0.22 0.004 270);
  --ink: oklch(0.965 0.003 95);
  --steel: oklch(0.72 0.006 95);
  --line: oklch(1 0 0 / 9%);
  --line-strong: oklch(1 0 0 / 18%);
  --ember-ink: oklch(0.80 0.145 66);
  --positive: oklch(0.78 0.15 152);
  --positive-soft: oklch(0.78 0.15 152 / 0.14);
  --negative: oklch(0.72 0.17 27);
  --negative-soft: oklch(0.72 0.17 27 / 0.13);
  color-scheme: dark;
}
:root[data-theme="light"] {
  --cream: oklch(0.98 0.004 95);
  --surface: oklch(1 0 0);
  --surface-2: oklch(0.965 0.004 95);
  --ink: oklch(0.23 0.006 75);
  --steel: oklch(0.45 0.01 78);
  --line: oklch(0.23 0.006 75 / 11%);
  --line-strong: oklch(0.23 0.006 75 / 20%);
  --ember-ink: oklch(0.53 0.16 48);
  --positive: oklch(0.50 0.115 150);
  --positive-soft: oklch(0.50 0.115 150 / 0.10);
  --negative: oklch(0.52 0.16 28);
  --negative-soft: oklch(0.52 0.16 28 / 0.09);
  color-scheme: light;
}

body {
  margin: 0;
  background: var(--cream);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 1.0625rem;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
.layout { display: grid; grid-template-columns: var(--rail) minmax(0, 1fr); align-items: start; }

/* Contents rail --------------------------------------------------------- */
.rail {
  position: sticky; top: 0; height: 100vh; overflow-y: auto;
  border-right: 1px solid var(--line);
  padding: 2rem 1.25rem 4rem 2rem;
  display: flex; flex-direction: column; gap: 1.75rem;
  font-size: 0.8125rem;
}
.rail__brand { display: flex; flex-direction: column; gap: 0.25rem; }
.rail__mark {
  font-family: var(--font-display); font-weight: 800; font-size: 1.0625rem;
  letter-spacing: -0.02em; color: var(--ink); text-decoration: none;
}
.rail__sub { font-family: var(--font-mono); font-size: 0.6875rem; color: var(--steel); letter-spacing: 0.04em; text-transform: uppercase; }
.filter {
  width: 100%; box-sizing: border-box; padding: 0.5rem 0.6875rem;
  background: var(--surface); color: var(--ink);
  border: 1px solid var(--line-strong); border-radius: 6px;
  font-family: var(--font-body); font-size: 0.8125rem;
}
.filter:focus-visible { outline: 2px solid var(--ember); outline-offset: 1px; }
.rail__group { display: flex; flex-direction: column; gap: 0.5rem; }
.rail__head {
  font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--steel); text-decoration: none;
}
.rail__head:hover { color: var(--ember-ink); }
.rail__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.rail__item a {
  display: flex; gap: 0.5rem; padding: 0.28rem 0 0.28rem 0.75rem;
  color: var(--steel); text-decoration: none; border-left: 2px solid var(--line);
  line-height: 1.4;
}
.rail__item a:hover { color: var(--ink); border-left-color: var(--line-strong); }
.rail__item--l3 a { padding-left: 1.5rem; font-size: 0.78125rem; }
.rail__item.is-active a { color: var(--ember-ink); border-left-color: var(--ember); font-weight: 500; }
.rail__num { font-family: var(--font-mono); font-size: 0.6875rem; opacity: 0.75; min-width: 1.75rem; font-variant-numeric: tabular-nums; }

/* Main ------------------------------------------------------------------ */
main { padding: 0 3rem 8rem; min-width: 0; }
.masthead { padding: 3.5rem 0 2rem; border-bottom: 1px solid var(--line-strong); }
.masthead h1 {
  font-family: var(--font-display); font-weight: 800; letter-spacing: -0.035em;
  font-size: clamp(2rem, 4vw, 3rem); line-height: 1.05; margin: 0 0 0.75rem;
  text-wrap: balance; max-width: 20ch;
}
.masthead p { margin: 0; color: var(--steel); max-width: var(--measure); }
.strip { display: flex; flex-wrap: wrap; gap: 2.5rem; margin-top: 2rem; }
.stat { display: flex; flex-direction: column; gap: 0.2rem; }
.stat__label { font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--steel); }
.stat__value { font-family: var(--font-display); font-weight: 700; font-size: 1.0625rem; font-variant-numeric: tabular-nums; }

/* min-width:0 on both the flex container and its children, otherwise a wide
   table's intrinsic width wins over the column and the whole page scrolls
   sideways instead of just the table. */
.doc { max-width: var(--measure); min-width: 0; }
.doc > * { margin-block: 0; min-width: 0; }
.doc { display: flex; flex-direction: column; gap: 1.15rem; padding-top: 2.5rem; }

.h { font-family: var(--font-display); letter-spacing: -0.02em; text-wrap: balance; scroll-margin-top: 1.5rem; }
.h--2 {
  font-size: 1.75rem; font-weight: 800; line-height: 1.15;
  margin-top: 3.25rem; padding-top: 1.5rem; border-top: 1px solid var(--line-strong);
  display: flex; gap: 0.75rem; align-items: baseline;
}
.h--3 { font-size: 1.1875rem; font-weight: 700; margin-top: 1.75rem; display: flex; gap: 0.625rem; align-items: baseline; }
.h--4 { font-size: 0.9375rem; font-weight: 700; margin-top: 1rem; color: var(--ember-ink); }
.num {
  font-family: var(--font-mono); font-weight: 500; color: var(--ember-ink);
  font-size: 0.75em; font-variant-numeric: tabular-nums; flex: none;
}
.doc > .h--2:first-child { border-top: 0; margin-top: 0; padding-top: 0; }

.doc p { max-width: var(--measure); }
.doc ul, .doc ol { max-width: var(--measure); padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.45rem; }
.doc li { padding-left: 0.25rem; }
.doc li::marker { color: var(--steel); font-family: var(--font-mono); font-size: 0.875em; }
.doc a { color: var(--ember-ink); text-decoration-color: var(--ember-soft); text-underline-offset: 2px; }
.doc a:hover { text-decoration-color: var(--ember); }
.doc strong { font-weight: 700; }
code { font-family: var(--font-mono); font-size: 0.85em; background: var(--surface-2); padding: 0.1em 0.35em; border-radius: 4px; }
hr { border: 0; border-top: 1px solid var(--line); margin: 1rem 0; width: 100%; }
blockquote {
  margin: 0; padding: 0.75rem 0 0.75rem 1.25rem;
  border-left: 2px solid var(--ember); color: var(--steel); max-width: var(--measure);
}

/* Tables ---------------------------------------------------------------- */
.scroll { overflow-x: auto; max-width: min(100%, 90ch); border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
/* Below this width the columns crush into one word per line, which is harder to
   read than scrolling, so let the container scroll instead of squeezing. */
table { border-collapse: collapse; width: 100%; min-width: 42rem; font-size: 0.875rem; }
thead th {
  font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--steel); font-weight: 500;
  padding: 0.75rem 0.875rem; border-bottom: 1px solid var(--line-strong); white-space: nowrap;
}
tbody td { padding: 0.75rem 0.875rem; border-top: 1px solid var(--line); vertical-align: top; line-height: 1.5; }
tbody tr:first-child td { border-top: 0; }
tbody tr[data-sev="high"] td:first-child { box-shadow: inset 3px 0 0 var(--negative); }
tbody tr[data-sev="med"] td:first-child { box-shadow: inset 3px 0 0 var(--ember); }
tbody tr[data-sev="low"] td:first-child { box-shadow: inset 3px 0 0 var(--positive); }
tbody td a { color: var(--ember-ink); }

.pill {
  display: inline-block; font-family: var(--font-mono); font-size: 0.6875rem;
  letter-spacing: 0.04em; text-transform: uppercase; padding: 0.15rem 0.5rem;
  border-radius: 999px; white-space: nowrap;
}
.pill--high { background: var(--negative-soft); color: var(--negative); }
.pill--med { background: var(--ember-soft); color: var(--ember-ink); }
.pill--low { background: var(--positive-soft); color: var(--positive); }
.tag {
  display: inline-block; font-family: var(--font-mono); font-size: 0.75rem; font-weight: 500;
  width: 1.5rem; height: 1.5rem; line-height: 1.5rem; text-align: center; border-radius: 5px;
}
.tag--s { background: var(--positive-soft); color: var(--positive); }
.tag--m { background: var(--ember-soft); color: var(--ember-ink); }
.tag--l { background: var(--negative-soft); color: var(--negative); }

.is-hidden { display: none !important; }
.rail__empty { color: var(--steel); font-style: italic; padding: 0.5rem 0.75rem; }

.railtoggle { display: none; }

@media (max-width: 60rem) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .rail {
    position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line);
    padding: 1.5rem 1.25rem;
  }
  .rail__scroll { max-height: 18rem; overflow-y: auto; }
  main { padding: 0 1.25rem 5rem; }
  .railtoggle {
    display: block; font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.08em;
    text-transform: uppercase; background: none; border: 0; color: var(--steel);
    padding: 0; cursor: pointer; text-align: left; align-self: flex-start;
  }
  .rail.is-collapsed .rail__scroll, .rail.is-collapsed .filter { display: none; }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
html { scroll-behavior: smooth; }
a:focus-visible, button:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; border-radius: 3px; }
</style>

<div class="layout" id="top">
  <nav class="rail" id="rail" aria-label="Contents">
    <div class="rail__brand">
      <a class="rail__mark" href="#top">Kríos research</a>
      <span class="rail__sub">Run 9–10 Aug 2026</span>
      <button class="railtoggle" id="railtoggle" aria-expanded="true">Contents</button>
    </div>
    <input class="filter" id="filter" type="search" placeholder="Filter contents" aria-label="Filter contents" />
    <div class="rail__scroll" id="railscroll">
      ${railGroup('Summary', '#top', summary.toc)}
      ${railGroup('Full report', '#1-methodology-and-confidence-note', full.toc)}
    </div>
  </nav>

  <main>
    <header class="masthead">
      <h1>Market and competitive research</h1>
      <p>Kríos, by Heloria Labs. Where the category is going, who is already standing on the doorstep, and what to do about it.</p>
      <div class="strip">
        ${stat('Researched', '9–10 Aug 2026')}
        ${stat('Competitors profiled', '20+')}
        ${stat('Highest threat', 'Rilla · Siro')}
        ${stat('Open questions', '8')}
      </div>
    </header>

    <div class="doc section-open">
      ${summary.html}
    </div>

    <div class="doc">
      ${full.html}
    </div>
  </main>
</div>

<script>
(function () {
  // Scroll spy: mark the section currently being read in the rail.
  var links = Array.prototype.slice.call(document.querySelectorAll('.rail__item a'));
  var map = {};
  links.forEach(function (a) {
    var el = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (el) map[a.hash.slice(1)] = a.parentElement;
  });
  var heads = Object.keys(map).map(function (id) { return document.getElementById(id); });
  var current = null;
  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var item = map[e.target.id];
      if (!item || item === current) return;
      if (current) current.classList.remove('is-active');
      item.classList.add('is-active');
      current = item;
      if (item.offsetTop < rail.scrollTop || item.offsetTop > rail.scrollTop + rail.clientHeight - 60) {
        rail.scrollTop = item.offsetTop - rail.clientHeight / 2;
      }
    });
  }, { rootMargin: '0px 0px -75% 0px', threshold: 0 });
  heads.forEach(function (h) { spy.observe(h); });

  var rail = document.getElementById('rail');

  // Filter is for finding a section fast in a long report, not full-text search.
  var filter = document.getElementById('filter');
  var items = Array.prototype.slice.call(document.querySelectorAll('.rail__item'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('.rail__group'));
  filter.addEventListener('input', function () {
    var q = filter.value.trim().toLowerCase();
    items.forEach(function (li) {
      li.classList.toggle('is-hidden', q !== '' && li.textContent.toLowerCase().indexOf(q) === -1);
    });
    groups.forEach(function (g) {
      var any = g.querySelectorAll('.rail__item:not(.is-hidden)').length > 0;
      g.classList.toggle('is-hidden', !any);
    });
  });

  var toggle = document.getElementById('railtoggle');
  toggle.addEventListener('click', function () {
    var collapsed = rail.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
  });
  if (window.matchMedia('(max-width: 60rem)').matches) {
    rail.classList.add('is-collapsed');
    toggle.setAttribute('aria-expanded', 'false');
  }
})();
</script>
`;

fs.writeFileSync(path.join(DIR, 'report.html'), page, 'utf8');
console.log('report.html written,', (page.length / 1024).toFixed(1) + 'KB');
console.log('summary sections:', summary.toc.length, '| full report sections:', full.toc.length);
