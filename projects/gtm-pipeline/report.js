// report.js — Kríos prospect board generator (v3)
//
// Reads the full company list, layers on enrichment, and now parses the deep
// research briefs in research/*.md so verdicts drive the board.
//
// RUN:  node report.js
// THEN: open report.html

const fs = require('fs');
const path = require('path');

const MASTER    = path.join(__dirname, 'companies_master.json');
const BRIEFS    = path.join(__dirname, 'briefs.json');
const SHORTLIST = path.join(__dirname, 'shortlist.json');
const RESEARCH  = path.join(__dirname, 'research');
const OUT       = path.join(__dirname, 'report.html');

// ---------------------------------------------------------------------------
// MANUAL NOTES — your own findings. Keys match company names.
// ---------------------------------------------------------------------------
const NOTES = {};

// ---------------------------------------------------------------------------

const RECRUITER_PATTERNS = [
  'recruit', 'staffing', 'talent', 'resourcing', 'personnel', 'employment agency',
  'manpower', 'headhunt', 'placements', 'temps', 'workforce', 'search and selection',
  'search & selection', 'portfolio group', 'reed ', 'hays ', 'adecco', 'randstad',
  'brook street', 'office angels', 'gi group', 'blue arrow', 'zachary daniels',
  'mitchell maguire', 'scarlet selection', 'wallace hind', 'simon acres',
  'choice consultants', 'staffline', 'hireful', 'sourceco', 'tate and harriss',
  'william scott consulting', 'optimum appointments', 'hsb technical', 'recsource',
  'wr logistics', 'redkite', 'fairford associates', 'ted experience', 'academics',
  'selection', 'consulting', 'appointments',
];

const NOISE_PATTERNS = [
  'council', 'borough', 'district', 'nhs', 'university', 'college', 'school',
  'academy trust', 'police', 'fire service', 'ambulance', 'hospital', 'care home',
  'nursing', 'estate agent', 'lettings', 'spicerhaart', 'connells', 'haart',
  'amazon', 'netapp', 'comcast', 'coca-cola', 'butternut box', 'toast',
  "raising cane's", 'panda', 'dairy', 'dairies', 'biffa', 'waste', 'aggreko',
  'vitalograph', 'bestway', 'stoneacre', 'niagara healthcare', 'nch europe',
  'flotek', 'omada', 'switch', 'avidity',
];

const JUNK_PATTERNS = ['confidential', 'undisclosed', 'private advertiser', 'anonymous', 'client of', 'various', 'n/a', 'unknown'];
const OUTSOURCED_PATTERNS = ['site solutions', 'field marketing', 'sales and marketing', 'sales & marketing', 'canvassing', 'direct marketing', 'acquisition', 'outsourced', 'field sales solutions'];

// ---------------------------------------------------------------------------
// RESEARCH PARSING
// ---------------------------------------------------------------------------

function safeName(s) {
  return s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

// Pull the verdict from the section 7 area specifically, not the first
// mention anywhere in the document.
function extractVerdict(md) {
  const order = ['STRONG FIT', 'WORTH CONTACTING', 'NOT A BUYER', 'WEAK'];

  // Prefer the tail of the document, where section 7 lives.
  const idx = md.search(/#+\s*7[.\s)]|VERDICT/i);
  const tail = idx >= 0 ? md.slice(idx) : md.slice(-1800);

  for (const v of order) {
    const re = new RegExp('\\*\\*' + v.replace(' ', '\\s+') + '\\*\\*', 'i');
    if (re.test(tail)) return v;
  }
  for (const v of order) {
    if (new RegExp(v.replace(' ', '\\s+'), 'i').test(tail)) return v;
  }
  // Last resort: whole document, bolded only.
  for (const v of order) {
    const re = new RegExp('\\*\\*' + v.replace(' ', '\\s+') + '\\*\\*', 'i');
    if (re.test(md)) return v;
  }
  return null;
}

// One-line reasoning that follows the verdict.
function extractVerdictReason(md, verdict) {
  if (!verdict) return '';
  const re = new RegExp('\\*\\*' + verdict.replace(' ', '\\s+') + '\\*\\*\\s*[—\\-–:]*\\s*([^\\n]+)', 'i');
  const m = md.match(re);
  return m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 600) : '';
}

// Split the brief into its numbered sections for display.
function extractSections(md) {
  const out = [];
  const re = /^#{1,4}\s*(\d)[.\s)]+\s*(.+)$/gim;
  const marks = [];
  let m;
  while ((m = re.exec(md)) !== null) marks.push({ num: m[1], title: m[2].trim(), start: m.index, end: m.index + m[0].length });
  for (let i = 0; i < marks.length; i++) {
    const body = md.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : md.length).trim();
    if (body) out.push({ num: marks[i].num, title: marks[i].title, body });
  }
  return out;
}

// Very small markdown to HTML pass, enough for these briefs.
function mdToHtml(s) {
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = esc(s).split('\n');
  let html = '';
  let inList = false;
  for (let line of lines) {
    const t = line.trim();
    if (!t) { if (inList) { html += '</ul>'; inList = false; } continue; }
    if (/^[-*]\s+/.test(t)) {
      if (!inList) { html += '<ul class="rl">'; inList = true; }
      html += '<li>' + inline(t.replace(/^[-*]\s+/, '')) + '</li>';
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<p>' + inline(t) + '</p>';
    }
  }
  if (inList) html += '</ul>';
  return html;

  function inline(t) {
    return t
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }
}

function loadResearch() {
  const map = new Map();
  if (!fs.existsSync(RESEARCH)) return map;
  for (const f of fs.readdirSync(RESEARCH)) {
    if (!f.endsWith('.md')) continue;
    const md = fs.readFileSync(path.join(RESEARCH, f), 'utf8');
    if (md.length < 800) continue; // failed run
    const verdict = extractVerdict(md);
    map.set(f.replace(/\.md$/, ''), {
      verdict,
      reason: extractVerdictReason(md, verdict),
      sections: extractSections(md),
      raw: md,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------

function dedupeKey(name) {
  return (name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(ltd|limited|llc|inc|plc|llp|co|company|group|holdings|uk|the)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

const DESCRIPTIVE_SUFFIXES = ['home improvements', 'home improvement', 'windows', 'glazing', 'roofing', 'solar', 'energy', 'renewables', 'telecom', 'telecoms', 'broadband', 'fibre', 'security', 'alarms', 'recruitment team', 'sales team', 'careers', 'jobs', 'direct', 'services', 'solutions'];

function stemName(name) {
  let s = dedupeKey(name), changed = true;
  while (changed) {
    changed = false;
    for (const suf of DESCRIPTIVE_SUFFIXES) {
      if (s.endsWith(' ' + suf)) { s = s.slice(0, -(suf.length + 1)).trim(); changed = true; }
    }
  }
  return s;
}

function dedupe(records) {
  const byStem = new Map();
  for (const r of records) {
    const stem = stemName(r.company);
    const k = (!stem || stem.length < 3) ? '__u__' + r.key : stem;
    if (!byStem.has(k)) byStem.set(k, []);
    byStem.get(k).push(r);
  }
  const out = [];
  for (const group of byStem.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    group.sort((a, b) => b.postings - a.postings);
    const p = { ...group[0] };
    p.locations = [...(p.locations || [])]; p.phrases = [...(p.phrases || [])]; p.merged_from = [];
    for (let i = 1; i < group.length; i++) {
      const o = group[i];
      p.postings += o.postings;
      for (const l of o.locations || []) if (!p.locations.includes(l)) p.locations.push(l);
      for (const ph of o.phrases || []) if (!p.phrases.includes(ph)) p.phrases.push(ph);
      p.merged_from.push(o.company);
    }
    out.push(p);
  }
  return out;
}

const lower = (s) => (s || '').toLowerCase();
const hits = (name, list) => list.find((p) => (' ' + lower(name) + ' ').includes(p)) || null;

const VERTICAL_RULES = [
  ['Home improvement', /home improvement|window|glazing|conservator|roof|insulat|driveway|fascia|soffit|kitchen|bathroom|everest|anglian|safestyle/],
  ['Solar / renewables', /solar|photovolt|renewable|heat pump/],
  ['Telecoms / broadband', /broadband|fibre|fiber|telecom|internet|voneus|virgin media|gigabit/],
  ['Energy', /energy|utilit|\bgas\b|electric|eco4|boiler|smart meter/],
  ['Fundraising (F2F)', /charit|fundrais|donor|hospice|lottery|rnli/],
  ['Security / alarms', /alarm|security|cctv/],
  ['Payments / B2B', /sumup|payment|merchant|viva/],
  ['Insurance / financial', /insur|mortgage|financial/],
];

function guessVertical(r, brief) {
  if (brief && brief.vertical_from_site && brief.vertical_from_site !== 'Unclassified') return brief.vertical_from_site;
  const hay = [r.company, r.sample_title, (r.phrases || []).join(' '), (r.merged_from || []).join(' ')].join(' ').toLowerCase();
  for (const [label, re] of VERTICAL_RULES) if (re.test(hay)) return label;
  return 'Unclassified';
}

function scoreCompany(r) {
  const reasons = []; let score = 0;
  const p = r.postings;
  if (p >= 50) { score += 6; reasons.push(`${p} postings, major operation`); }
  else if (p >= 20) { score += 5; reasons.push(`${p} postings, very high volume`); }
  else if (p >= 10) { score += 4; reasons.push(`${p} postings, high volume`); }
  else if (p >= 5) { score += 3; reasons.push(`${p} postings, steady hiring`); }
  else if (p >= 3) { score += 2; reasons.push(`${p} postings`); }
  else { score += 1; reasons.push(`${p} posting${p === 1 ? '' : 's'}, low`); }

  const locs = (r.locations || []).length;
  if (locs >= 5) { score += 3; reasons.push(`${locs}+ hiring locations, multi-region`); }
  else if (locs >= 3) { score += 2; reasons.push(`${locs} hiring locations`); }
  else if (locs === 2) { score += 1; reasons.push('2 hiring locations'); }

  const ph = (r.phrases || []).length;
  if (ph >= 4) { score += 3; reasons.push(`matched ${ph} D2D phrases, strong fit`); }
  else if (ph >= 2) { score += 2; reasons.push(`matched ${ph} D2D phrases`); }

  const hay = [(r.phrases || []).join(' '), r.sample_title || ''].join(' ').toLowerCase();
  if (/door to door|canvass/.test(hay)) { score += 3; reasons.push('job ads explicitly door-to-door'); }
  return { score, reasons };
}

// Research verdict overrides everything. Tiers only apply where there is none.
function assignTier(r, brief, research, score) {
  if (research && research.verdict) {
    const map = {
      'STRONG FIT': { tier: 0, label: 'Strong fit' },
      'WORTH CONTACTING': { tier: 1, label: 'Worth contacting' },
      'WEAK': { tier: 4, label: 'Weak' },
      'NOT A BUYER': { tier: 5, label: 'Not a buyer' },
    };
    const m = map[research.verdict];
    return { ...m, extra: [research.reason ? 'Research verdict: ' + research.reason : 'Verdict from deep research'] };
  }

  const name = r.company || '';
  if (hits(name, JUNK_PATTERNS)) return { tier: 5, label: 'Not a company', extra: ['Placeholder name, real employer hidden'] };
  if (!hits(name, OUTSOURCED_PATTERNS) && hits(name, RECRUITER_PATTERNS)) return { tier: 5, label: 'Recruiter', extra: ['Recruiters do not employ the reps, so they cannot buy sales training'] };
  if (hits(name, NOISE_PATTERNS)) return { tier: 5, label: 'Not D2D', extra: ['Matched on generic sales wording'] };

  const d2dSite = brief && (brief.d2d_evidence || []).some((t) => /door|canvass|doorstep/.test(t));
  const adsD2D = /door to door|canvass/.test([(r.phrases || []).join(' '), r.sample_title || ''].join(' ').toLowerCase());
  const classified = brief && brief.vertical_from_site && brief.vertical_from_site !== 'Unclassified';
  const extra = [];
  if (d2dSite) extra.push('Their own website uses door-to-door language');

  if ((d2dSite || adsD2D) && score >= 10) return { tier: 2, label: 'Needs research', extra };
  if (d2dSite || adsD2D) return { tier: 2, label: 'Needs research', extra };
  if (classified && score >= 10) return { tier: 2, label: 'Needs research', extra };
  if (score >= 8) { extra.push('No door-to-door language found yet'); return { tier: 3, label: 'Unverified', extra }; }
  extra.push('Weak signals, likely generic sales wording');
  return { tier: 4, label: 'Weak', extra };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------

function build() {
  if (!fs.existsSync(MASTER)) { console.error('No companies_master.json. Run collect.js first.'); process.exit(1); }

  const masterRaw = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
  const rawRecords = Object.entries(masterRaw).map(([key, r]) => ({ key, ...r }));
  const deduped = dedupe(rawRecords);

  const briefs = fs.existsSync(BRIEFS) ? JSON.parse(fs.readFileSync(BRIEFS, 'utf8')) : [];
  const briefBy = new Map(briefs.map((b) => [b.company, b]));
  const shortlist = fs.existsSync(SHORTLIST) ? JSON.parse(fs.readFileSync(SHORTLIST, 'utf8')) : [];
  const shortBy = new Map(shortlist.map((s) => [s.company, s]));
  const researchBy = loadResearch();

  const rows = deduped.map((r) => {
    const brief = briefBy.get(r.company) || null;
    const short = shortBy.get(r.company) || null;
    const research = researchBy.get(safeName(r.company)) || null;
    const { score, reasons } = scoreCompany(r);
    const { tier, label, extra } = assignTier(r, brief, research, score);

    return {
      company: r.company,
      postings: r.postings,
      locations: r.locations || [],
      merged_from: r.merged_from || [],
      sample_title: r.sample_title || '',
      sample_url: r.sample_url || '',
      score,
      reasons: [...(extra || []), ...reasons],
      tier, label,
      verdict: research ? research.verdict : null,
      researched: !!research,
      sections: research ? research.sections : [],
      vertical: guessVertical(r, brief),
      buyer_type: (short && short.buyer_type) || (hits(r.company, OUTSOURCED_PATTERNS) ? 'Outsourced sales agency' : 'Brand'),
      website: brief ? brief.website : '',
      description: brief ? brief.description : '',
      note: NOTES[r.company] || null,
    };
  });

  rows.sort((a, b) => {
    if (a.note && b.note) return a.note.pin - b.note.pin;
    if (a.note) return -1;
    if (b.note) return 1;
    return a.tier - b.tier || b.score - a.score;
  });

  const counts = { researched: rows.filter((r) => r.researched).length, worth: 0, weak: 0, notbuyer: 0, needs: 0 };
  rows.forEach((r) => {
    if (r.verdict === 'WORTH CONTACTING' || r.verdict === 'STRONG FIT') counts.worth++;
    else if (r.verdict === 'WEAK') counts.weak++;
    else if (r.verdict === 'NOT A BUYER') counts.notbuyer++;
    else if (r.tier === 2) counts.needs++;
  });

  fs.writeFileSync(OUT, template({ rows, counts, generated: new Date().toLocaleString() }), 'utf8');

  console.log('');
  console.log('report.html written');
  console.log(`  Total companies    : ${rows.length}`);
  console.log(`  Deep researched    : ${counts.researched}`);
  console.log(`  Worth contacting   : ${counts.worth}`);
  console.log(`  Needs research     : ${counts.needs}`);
  console.log(`  Weak               : ${counts.weak}`);
  console.log(`  Not a buyer        : ${counts.notbuyer}`);
}

function template(d) {
  const rowsJson = JSON.stringify(d.rows.map((r) => ({
    ...r,
    sectionsHtml: r.sections.map((s) => ({ num: s.num, title: s.title, html: mdToHtml(s.body) })),
    sections: undefined,
  })));

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kríos — UK prospect board</title>
<style>
  :root{--ink:#10131f;--ink-2:#1a1f33;--ink-3:#262d47;--lamp:#f0a836;--lamp-dim:#8a6224;
    --paper:#eceef5;--paper-dim:#9aa1b8;--edge:#2c3350;--good:#5fc9a0;--bad:#c9605a;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--ink);color:var(--paper);font:15px/1.55 ui-sans-serif,"Inter","Segoe UI",system-ui,sans-serif;padding:0 0 80px}
  .wrap{max-width:1080px;margin:0 auto;padding:0 22px}
  header{border-bottom:1px solid var(--edge);padding:38px 0 26px;margin-bottom:24px}
  .eyebrow{font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--lamp);margin-bottom:14px}
  h1{margin:0 0 6px;font-size:clamp(28px,4.4vw,44px);font-weight:700;letter-spacing:-.02em;line-height:1.05}
  .sub{color:var(--paper-dim);font-size:14px;margin:0}
  .summary{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
  .stat{background:var(--ink-2);border:1px solid var(--edge);border-radius:3px;padding:12px 16px;min-width:104px;flex:1 1 104px}
  .stat b{display:block;font-size:26px;line-height:1.1;font-weight:700}
  .stat span{font:600 10px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--paper-dim)}
  .stat.hi b{color:var(--good)}
  .controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:24px 0 8px}
  .tab{background:transparent;border:1px solid var(--edge);color:var(--paper-dim);padding:8px 14px;border-radius:3px;cursor:pointer;font:inherit;font-size:13px;transition:.15s}
  .tab:hover{color:var(--paper);border-color:var(--lamp-dim)}
  .tab[aria-selected="true"]{background:var(--lamp);border-color:var(--lamp);color:var(--ink);font-weight:600}
  .tab:focus-visible{outline:2px solid var(--lamp);outline-offset:2px}
  .row2{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:20px}
  select,#search{background:var(--ink-2);border:1px solid var(--edge);color:var(--paper);padding:8px 12px;border-radius:3px;font:inherit;font-size:13px}
  #search{flex:1 1 200px}
  #search::placeholder{color:var(--paper-dim)}
  #search:focus-visible,select:focus-visible{outline:2px solid var(--lamp);outline-offset:1px}
  .count{color:var(--paper-dim);font-size:13px;margin-left:auto}
  .card{border:1px solid var(--edge);border-radius:3px;background:var(--ink-2);margin-bottom:10px;overflow:hidden}
  .card.pinned{border-color:var(--lamp)}
  .head{display:flex;align-items:stretch;cursor:pointer;background:none;border:0;width:100%;text-align:left;color:inherit;font:inherit;padding:0}
  .head:focus-visible{outline:2px solid var(--lamp);outline-offset:-2px}
  .signal{width:6px;flex:none;background:var(--ink-3);position:relative}
  .signal i{position:absolute;left:0;right:0;bottom:0;background:var(--edge);display:block}
  .card.v-strong .signal i,.card.v-worth .signal i{background:var(--good)}
  .card.v-weak .signal i{background:var(--lamp-dim)}
  .card.v-none .signal i{background:var(--lamp)}
  .head-body{padding:15px 18px;flex:1;min-width:0}
  .name{font-size:16px;font-weight:650;letter-spacing:-.01em;margin:0 0 4px}
  .meta{color:var(--paper-dim);font-size:13px;margin:0}
  .tag{display:inline-block;font:600 10px/1.6 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;padding:1px 7px;border-radius:2px;border:1px solid var(--edge);color:var(--paper-dim);margin-right:6px;vertical-align:1px}
  .tag.worth{background:var(--good);color:var(--ink);border-color:var(--good)}
  .tag.pin{background:var(--lamp);color:var(--ink);border-color:var(--lamp)}
  .chev{align-self:center;padding-right:16px;color:var(--paper-dim);font-size:12px;flex:none;transition:transform .15s;display:inline-block}
  .body{display:none;padding:4px 18px 18px 24px;border-top:1px solid var(--edge)}
  .card.open .body{display:block}
  .card.open .chev{transform:rotate(90deg)}
  .pin{background:var(--ink-3);border-left:2px solid var(--lamp);padding:12px 16px;margin:14px 0 0;border-radius:0 3px 3px 0}
  .pin h4{margin:0 0 8px;font-size:13px}
  .pin ul{margin:0;padding-left:18px}
  .pin li{margin-bottom:5px;font-size:14px}
  .angle{margin:10px 0 0;font-size:14px;color:var(--lamp)}
  h4.sec{margin:18px 0 6px;font:600 10px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--paper-dim)}
  .why{margin:10px 0 0;padding:0;list-style:none}
  .why li{padding-left:16px;position:relative;margin-bottom:5px;font-size:14px}
  .why li::before{content:"";position:absolute;left:3px;top:9px;width:4px;height:4px;background:var(--lamp);border-radius:50%}
  .rsec{border-top:1px solid var(--ink-3);padding-top:12px;margin-top:14px}
  .rsec h5{margin:0 0 6px;font-size:13px;font-weight:650;color:var(--paper)}
  .rsec p{margin:0 0 8px;font-size:14px}
  ul.rl{margin:0 0 8px;padding-left:18px}
  ul.rl li{margin-bottom:4px;font-size:14px}
  a{color:var(--lamp);text-decoration:none;border-bottom:1px solid var(--lamp-dim)}
  a:hover{border-bottom-color:var(--lamp)}
  code{background:var(--ink-3);padding:1px 4px;border-radius:2px;font-size:12px}
  .quote{color:var(--paper-dim);font-style:italic}
  .empty{color:var(--paper-dim);padding:40px 0;text-align:center}
  .hidden{display:none!important}
  @media (max-width:620px){.count{margin-left:0}}
  @media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head><body>
<div class="wrap">
  <header>
    <div class="eyebrow">Kríos · UK discovery</div>
    <h1>Prospect board</h1>
    <p class="sub">${d.rows.length} companies · ${d.counts.researched} deep researched · ${esc(d.generated)}</p>
    <div class="summary">
      <div class="stat hi"><b>${d.counts.worth}</b><span>Worth contacting</span></div>
      <div class="stat"><b>${d.counts.needs}</b><span>Needs research</span></div>
      <div class="stat"><b>${d.counts.weak}</b><span>Weak</span></div>
      <div class="stat"><b>${d.counts.notbuyer}</b><span>Not a buyer</span></div>
      <div class="stat"><b>${d.rows.length}</b><span>Total</span></div>
    </div>
  </header>

  <div class="controls" role="tablist">
    <button class="tab" role="tab" data-view="worth" aria-selected="true">Worth contacting</button>
    <button class="tab" role="tab" data-view="needs" aria-selected="false">Needs research</button>
    <button class="tab" role="tab" data-view="weak" aria-selected="false">Weak</button>
    <button class="tab" role="tab" data-view="notbuyer" aria-selected="false">Not a buyer</button>
    <button class="tab" role="tab" data-view="researched" aria-selected="false">All researched</button>
    <button class="tab" role="tab" data-view="all" aria-selected="false">All ${d.rows.length}</button>
  </div>
  <div class="row2">
    <select id="vertical" aria-label="Filter by vertical"><option value="">All verticals</option></select>
    <input id="search" type="search" placeholder="Filter by name…" aria-label="Filter by name">
    <span class="count" id="count"></span>
  </div>
  <div id="list"></div>
  <p class="empty hidden" id="empty">Nothing matches those filters.</p>
</div>
<script>
const DATA = ${rowsJson};
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

const vsel=document.getElementById('vertical');
[...new Set(DATA.map(r=>r.vertical))].sort().forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;vsel.appendChild(o);});

function vclass(r){
  if(r.verdict==='STRONG FIT')return'v-strong';
  if(r.verdict==='WORTH CONTACTING')return'v-worth';
  if(r.verdict==='WEAK')return'v-weak';
  if(r.verdict==='NOT A BUYER')return'v-not';
  return'v-none';
}

function cardHtml(r){
  const good=r.verdict==='WORTH CONTACTING'||r.verdict==='STRONG FIT';
  let pinned='';
  if(r.note){
    pinned='<div class="pin"><h4>'+esc(r.note.headline)+'</h4><ul>'+
      r.note.bullets.map(b=>'<li>'+esc(b)+'</li>').join('')+'</ul>'+
      (r.note.angle?'<p class="angle"><strong>Angle:</strong> '+esc(r.note.angle)+'</p>':'')+'</div>';
  }
  const research=r.sectionsHtml&&r.sectionsHtml.length
    ? r.sectionsHtml.map(s=>'<div class="rsec"><h5>'+esc(s.num)+'. '+esc(s.title)+'</h5>'+s.html+'</div>').join('')
    : '<p class="quote" style="margin-top:14px">Not deep researched yet. Add to research-pipeline.cjs and re-run.</p>';

  const h=Math.round((Math.min(15,r.score)/15)*100);
  return '<article class="card '+vclass(r)+(r.note?' pinned':'')+'" data-view="'+viewKey(r)+'" data-vertical="'+esc(r.vertical)+'" data-name="'+esc(r.company.toLowerCase())+'" data-researched="'+(r.researched?'1':'0')+'">'+
    '<button class="head" aria-expanded="false"><span class="signal"><i style="height:'+h+'%"></i></span>'+
    '<span class="head-body"><p class="name">'+esc(r.company)+'</p>'+
    '<p class="meta">'+(r.note?'<span class="tag pin">Top pick</span>':'')+
      '<span class="tag'+(good?' worth':'')+'">'+esc(r.label)+'</span>'+
      esc(r.vertical)+' · '+r.postings+' postings · '+r.locations.length+' locations</p></span>'+
    '<span class="chev">▶</span></button>'+
    '<div class="body">'+pinned+
      '<h4 class="sec">Why it is here</h4><ul class="why">'+r.reasons.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+
      (r.researched?'<h4 class="sec">Deep research</h4>':'')+research+
      (r.website?'<h4 class="sec">Website</h4><p><a href="'+esc(r.website)+'" target="_blank" rel="noopener">'+esc(r.website)+'</a></p>':'')+
    '</div></article>';
}

function viewKey(r){
  if(r.verdict==='WORTH CONTACTING'||r.verdict==='STRONG FIT')return'worth';
  if(r.verdict==='WEAK')return'weak';
  if(r.verdict==='NOT A BUYER')return'notbuyer';
  if(r.tier===2)return'needs';
  return'other';
}

const list=document.getElementById('list'),empty=document.getElementById('empty'),countEl=document.getElementById('count');
let view='worth',query='',vertical='';

function render(){
  let rows=DATA.slice();
  if(view==='all'){}
  else if(view==='researched')rows=rows.filter(r=>r.researched);
  else rows=rows.filter(r=>viewKey(r)===view);
  if(vertical)rows=rows.filter(r=>r.vertical===vertical);
  if(query)rows=rows.filter(r=>r.company.toLowerCase().includes(query));

  list.innerHTML=rows.map(cardHtml).join('');
  empty.classList.toggle('hidden',rows.length>0);
  countEl.textContent=rows.length+' shown';
  list.querySelectorAll('.head').forEach(h=>{
    h.addEventListener('click',()=>{const c=h.closest('.card');const o=c.classList.toggle('open');h.setAttribute('aria-expanded',o?'true':'false');});
  });
}
document.querySelectorAll('.tab').forEach(t=>{
  t.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(x=>x.setAttribute('aria-selected','false'));
    t.setAttribute('aria-selected','true');view=t.dataset.view;render();
  });
});
document.getElementById('search').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();render();});
vsel.addEventListener('change',e=>{vertical=e.target.value;render();});
render();
</script></body></html>`;
}

build();
