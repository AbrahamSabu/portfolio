// enrich.js — ICP Pass 2: resolve, crawl, brief
//
// Reads shortlist.json (from triage.js), finds each company's real website,
// crawls it, and writes a tight brief per company.
//
// Requires: Node 18+ (built-in fetch). No npm install. No API keys. Free.
//
// RUN:  node enrich.js
//
// OUTPUT (next to this script)
//   briefs.txt          <- READ THIS. One brief per company, ready to review.
//   briefs.json         <- machine-readable, feeds the demo generator.
//   needs_lookup.txt    <- companies whose website could not be verified.
//                          Paste a URL into manual_urls.json to fix.
//   enrich_cache.json   <- crawl cache so re-runs are fast and polite.
//
// HOW WEBSITE RESOLUTION WORKS
//   There is no free, reliable name-to-URL lookup. So this tries candidate
//   domains built from the company name, fetches each, and VERIFIES the page
//   really belongs to that company by checking the name appears in the title
//   or body. Unverified guesses are never presented as fact - they go to
//   needs_lookup.txt instead.
//
// MANUAL OVERRIDES
//   Create manual_urls.json next to this script:
//     { "Everest": "https://www.everest.co.uk",
//       "Your DWM": "https://example.com" }
//   Those URLs are used directly, skipping resolution.

const fs = require('fs');
const path = require('path');
const SETTINGS = require('./lib/settings.cjs').load();
const { file: dataFile, keywordRegex, countryNames } = require('./lib/settings.cjs');

const SHORTLIST_JSON = dataFile('shortlist.json');
const MANUAL_URLS    = dataFile('manual_urls.json');
const CACHE_JSON     = dataFile('enrich_cache.json');
const BRIEFS_TXT     = dataFile('briefs.txt');
const BRIEFS_JSON    = dataFile('briefs.json');
const NEEDS_LOOKUP   = dataFile('needs_lookup.txt');

// ----------------------------- CONFIG ---------------------------------------

const CONFIG = {
  // Only enrich companies at or above this triage score. Raise it to go
  // narrower and faster.
  minScore: 0,

  // Cap how many companies to process in one run (0 = all).
  limit: 0,

  delayMs: 900,          // pause between requests to any host
  timeoutMs: 12000,      // per-request timeout
  maxPagesPerSite: 5,    // homepage + up to 4 subpages

  // Subpaths worth crawling, in priority order.
  subpaths: ['/about', '/about-us', '/careers', '/jobs', '/services', '/what-we-do', '/our-story'],

  // Domain suffixes to try when guessing (UK-first since the list is UK).
  tlds: ['.co.uk', '.com', '.uk', '.ie'],

  userAgent: 'Mozilla/5.0 (compatible; GTMPipeline/1.0)',
};

// ----------------------------- HELPERS --------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugVariants(name) {
  const clean = (name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(ltd|limited|llc|inc|plc|llp|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return [];

  const words = clean.split(' ');
  const variants = new Set();

  variants.add(words.join(''));                 // anglianhomeimprovements
  if (words.length > 1) variants.add(words.join('-'));
  if (words.length > 1) variants.add(words[0]); // anglian
  if (words.length > 2) variants.add(words.slice(0, 2).join(''));

  return [...variants].filter((v) => v.length >= 3 && v.length <= 40);
}

function candidateUrls(name) {
  const urls = [];
  for (const slug of slugVariants(name)) {
    for (const tld of CONFIG.tlds) {
      urls.push(`https://www.${slug}${tld}`);
    }
  }
  return urls.slice(0, 12); // cap the guessing
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': CONFIG.userAgent, 'Accept': 'text/html' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    const html = await res.text();
    return { html, finalUrl: res.url };
  } catch (_) {
    clearTimeout(timer);
    return null;
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]).slice(0, 200) : '';
}

function getMetaDescription(html) {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  return m ? stripHtml(m[1]).slice(0, 400) : '';
}

// Does this page plausibly belong to this company?
function verifyOwnership(companyName, html, text) {
  const tokens = (companyName || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['ltd', 'limited', 'group', 'the', 'and'].includes(w));

  if (!tokens.length) return { ok: false, confidence: 'none', note: 'no usable name tokens' };

  const title = getTitle(html).toLowerCase();
  const body = text.toLowerCase().slice(0, 6000);

  const inTitle = tokens.filter((t) => title.includes(t)).length;
  const inBody  = tokens.filter((t) => body.includes(t)).length;

  if (inTitle === tokens.length) return { ok: true, confidence: 'high',   note: 'full name in page title' };
  if (inTitle >= 1 && inBody >= tokens.length) return { ok: true, confidence: 'high', note: 'name in title and body' };
  if (inBody >= tokens.length) return { ok: true, confidence: 'medium', note: 'full name in page body' };
  if (inTitle >= 1) return { ok: true, confidence: 'low', note: 'partial name match in title' };

  return { ok: false, confidence: 'none', note: 'company name not found on page' };
}

// ----------------------------- EXTRACTION -----------------------------------

const VERTICAL_RULES = [
  ['Home improvement',      /\b(window|glazing|conservatory|conservatories|roofline|roofing|fascia|soffit|guttering|double glaz|home improvement|driveway|kitchen|bathroom)\b/g],
  ['Solar / renewables',    /\b(solar|photovoltaic|\bpv\b|renewable|heat pump|battery storage)\b/g],
  ['Telecoms / broadband',  /\b(broadband|fibre|fiber|full fibre|telecom|isp|connectivity|gigabit)\b/g],
  ['Energy',                /\b(energy|utility|utilities|boiler|smart meter|eco4|insulation grant|tariff)\b/g],
  ['Security / alarms',     /\b(alarm|cctv|burglar|security system|smart home security)\b/g],
  ['Fundraising (F2F)',     /\b(charity|charities|fundraising|donor|donation|supporter)\b/g],
  ['Insurance / financial', /\b(insurance|mortgage|financial protection|life cover)\b/g],
  ['Pest control',          /\b(pest control|rodent|infestation)\b/g],
  ['Water treatment',       /\b(water softener|water filtration|water treatment)\b/g],
];

function classifyFromText(text) {
  const hay = text.toLowerCase();
  const scores = [];
  for (const [label, re] of VERTICAL_RULES) {
    const matches = hay.match(re);
    if (matches && matches.length) scores.push({ label, hits: matches.length });
  }
  scores.sort((a, b) => b.hits - a.hits);
  if (!scores.length) return { vertical: 'Unclassified', evidence: [] };
  return {
    vertical: scores[0].label,
    evidence: scores.slice(0, 3).map((s) => `${s.label} (${s.hits} mentions)`),
  };
}

// Look for numbers that hint at team size or scale.
function findScaleSignals(text) {
  const signals = [];
  const patterns = [
    /\b(\d{2,5})\+?\s+(employees|staff|people|colleagues|team members)\b/gi,
    /\b(\d{2,5})\+?\s+(sales\s+)?(reps|representatives|advisors|advisers|consultants|canvassers|installers)\b/gi,
    /\bteam of\s+(\d{2,5})\b/gi,
    /\bover\s+(\d{2,5})\s+(employees|staff|people|customers|installations)\b/gi,
    /\b(\d{1,3})\s+(branches|depots|offices|showrooms|regional centres|locations)\b/gi,
    /\bestablished (?:in )?(\d{4})\b/gi,
    /\bsince (\d{4})\b/gi,
    /\b(\d{1,3}(?:\.\d)?)\s*(?:m|million)\s+(?:customers|homes|installations)\b/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const snippet = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).trim();
      if (!signals.some((s) => s.includes(m[0]))) signals.push(`"${m[0].trim()}"  ...${snippet}...`);
      if (signals.length >= 6) return signals;
    }
  }
  return signals;
}

// Does the site itself confirm they sell door to door?
function findD2DEvidence(text) {
  const hay = text.toLowerCase();
  const terms = SETTINGS.siteKeywords.map((t) => t.toLowerCase());
  const found = terms.filter((t) => hay.includes(t));
  return found;
}

// ----------------------------- RESOLUTION -----------------------------------

async function resolveWebsite(company, manual) {
  if (manual && manual[company]) {
    const r = await fetchText(manual[company]);
    if (r) {
      return { url: r.finalUrl, html: r.html, confidence: 'manual', note: 'URL supplied manually' };
    }
    return null;
  }

  for (const url of candidateUrls(company)) {
    const r = await fetchText(url);
    await sleep(CONFIG.delayMs);
    if (!r) continue;

    const text = stripHtml(r.html);
    if (text.length < 200) continue;

    const v = verifyOwnership(company, r.html, text);
    if (v.ok && (v.confidence === 'high' || v.confidence === 'medium')) {
      return { url: r.finalUrl, html: r.html, confidence: v.confidence, note: v.note };
    }
  }
  return null;
}

async function crawlSite(baseUrl, firstHtml) {
  const pages = [{ url: baseUrl, text: stripHtml(firstHtml), html: firstHtml }];
  let origin;
  try { origin = new URL(baseUrl).origin; } catch (_) { return pages; }

  for (const sub of CONFIG.subpaths) {
    if (pages.length >= CONFIG.maxPagesPerSite) break;
    const r = await fetchText(origin + sub);
    await sleep(CONFIG.delayMs);
    if (!r) continue;
    const text = stripHtml(r.html);
    if (text.length < 200) continue;
    pages.push({ url: r.finalUrl, text, html: r.html });
  }
  return pages;
}

// ----------------------------- MAIN -----------------------------------------

function loadJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (_) { return fallback; }
}

async function main() {
  if (!fs.existsSync(SHORTLIST_JSON)) {
    console.error('Cannot find shortlist.json. Run triage.js first.');
    process.exit(1);
  }

  const shortlist = loadJson(SHORTLIST_JSON, []);
  const manual = loadJson(MANUAL_URLS, {});
  const cache = loadJson(CACHE_JSON, {});

  let targets = shortlist.filter((c) => (c.score || 0) >= CONFIG.minScore);
  if (CONFIG.limit > 0) targets = targets.slice(0, CONFIG.limit);

  console.log(`Enriching ${targets.length} companies. This makes live web requests, so it will take a while.`);
  console.log('');

  const briefs = [];
  const unresolved = [];

  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    const label = `[${i + 1}/${targets.length}] ${c.company}`;

    if (cache[c.company] && cache[c.company].resolved) {
      console.log(`${label} -> cached`);
      briefs.push(cache[c.company].brief);
      continue;
    }

    process.stdout.write(`${label} ... `);

    let site;
    try {
      site = await resolveWebsite(c.company, manual);
    } catch (e) {
      site = null;
    }

    if (!site) {
      console.log('no verified website');
      unresolved.push(c);
      cache[c.company] = { resolved: false };
      continue;
    }

    const pages = await crawlSite(site.url, site.html);
    const allText = pages.map((p) => p.text).join(' ').slice(0, 120000);

    const { vertical, evidence } = classifyFromText(allText);
    const scale = findScaleSignals(allText);
    const d2d = findD2DEvidence(allText);

    const brief = {
      company: c.company,
      website: site.url,
      url_confidence: site.confidence,
      url_note: site.note,
      triage_score: c.score,
      buyer_type: c.buyer_type,
      postings: c.postings,
      locations: c.locations || [],
      vertical_from_site: vertical,
      vertical_evidence: evidence,
      vertical_from_ads: c.vertical,
      tagline: getTitle(site.html),
      description: getMetaDescription(site.html),
      scale_signals: scale,
      d2d_evidence: d2d,
      pages_crawled: pages.map((p) => p.url),
      sample_ad: c.sample_title || '',
      sample_ad_url: c.sample_url || '',
    };

    briefs.push(brief);
    cache[c.company] = { resolved: true, brief };
    fs.writeFileSync(CACHE_JSON, JSON.stringify(cache, null, 2), 'utf8');

    console.log(`${site.url}  [${site.confidence}]  -> ${vertical}`);
  }

  writeBriefs(briefs);
  writeUnresolved(unresolved);
  fs.writeFileSync(BRIEFS_JSON, JSON.stringify(briefs, null, 2), 'utf8');

  const byVertical = {};
  for (const b of briefs) byVertical[b.vertical_from_site] = (byVertical[b.vertical_from_site] || 0) + 1;

  console.log('');
  console.log('='.repeat(60));
  console.log('ENRICHMENT COMPLETE');
  console.log(`  Briefs written      : ${briefs.length}`);
  console.log(`  Website unresolved  : ${unresolved.length}`);
  console.log('');
  console.log('  Vertical (from their own site):');
  Object.entries(byVertical).sort((a, b) => b[1] - a[1])
    .forEach(([v, n]) => console.log(`    ${String(n).padStart(4)}  ${v}`));
  console.log('='.repeat(60));
  console.log('');
  console.log('Read briefs.txt        — the company briefs.');
  console.log('Read needs_lookup.txt  — companies needing a manual URL.');
}

function writeBriefs(briefs) {
  const lines = [];
  lines.push('KRIOS PROSPECT BRIEFS  (Pass 2)');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`${briefs.length} companies`);
  lines.push('');
  lines.push('Each brief combines job-ad signals (hiring volume, locations) with');
  lines.push('what the company says about itself on its own website.');
  lines.push('');
  lines.push('URL CONFIDENCE: high/medium means the company name was verified on');
  lines.push('the page. Always eyeball the link before using a brief for outreach.');
  lines.push('');

  const sorted = [...briefs].sort((a, b) => (b.triage_score || 0) - (a.triage_score || 0));
  const groups = {};
  for (const b of sorted) (groups[b.vertical_from_site] = groups[b.vertical_from_site] || []).push(b);

  for (const [vertical, rows] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
    lines.push('');
    lines.push('#'.repeat(72));
    lines.push(`##  ${vertical.toUpperCase()}  —  ${rows.length} companies`);
    lines.push('#'.repeat(72));

    for (const b of rows) {
      lines.push('');
      lines.push('-'.repeat(72));
      lines.push(`${b.company}    [triage score ${b.triage_score}]`);
      lines.push('-'.repeat(72));
      lines.push(`  Website     : ${b.website}   (confidence: ${b.url_confidence})`);
      if (b.tagline) lines.push(`  Page title  : ${b.tagline}`);
      if (b.description) lines.push(`  They say    : ${b.description}`);
      lines.push(`  Buyer type  : ${b.buyer_type}`);
      lines.push(`  Vertical    : ${b.vertical_from_site}${b.vertical_evidence.length ? '  (' + b.vertical_evidence.join(', ') + ')' : ''}`);
      lines.push(`  Hiring      : ${b.postings} postings across ${b.locations.length} locations`);
      if (b.locations.length) lines.push(`  Locations   : ${b.locations.slice(0, 6).join(' | ')}`);
      if (b.d2d_evidence.length) {
        lines.push(`  D2D on site : ${b.d2d_evidence.join(', ')}`);
      } else {
        lines.push('  D2D on site : no explicit door-to-door language found');
      }
      if (b.scale_signals.length) {
        lines.push('  Scale       :');
        b.scale_signals.forEach((s) => lines.push(`      - ${s}`));
      }
      if (b.sample_ad) lines.push(`  Sample ad   : ${b.sample_ad}`);
      lines.push(`  Crawled     : ${b.pages_crawled.length} pages`);
      lines.push('');
    }
  }

  fs.writeFileSync(BRIEFS_TXT, lines.join('\n'), 'utf8');
}

function writeUnresolved(list) {
  const lines = [];
  lines.push('NEEDS MANUAL URL LOOKUP');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`${list.length} companies`);
  lines.push('');
  lines.push('No website could be found and verified automatically. This is');
  lines.push('expected: guessing domains from a company name is unreliable, and');
  lines.push('a wrong URL is worse than none.');
  lines.push('');
  lines.push('TO FIX: search the company, then add it to manual_urls.json:');
  lines.push('  {');
  lines.push('    "Company Name Exactly As Below": "https://theirsite.co.uk"');
  lines.push('  }');
  lines.push('Then re-run enrich.js. Cached companies are skipped, so it is fast.');
  lines.push('');

  list.sort((a, b) => (b.score || 0) - (a.score || 0));
  list.forEach((c, i) => {
    lines.push(`${String(i + 1).padStart(3)}. ${c.company}    [score ${c.score}, ${c.postings} postings]`);
    if (c.sample_title) lines.push(`     sample ad : ${c.sample_title}`);
    if (c.sample_url)   lines.push(`     ad link   : ${c.sample_url}`);
    lines.push('');
  });

  fs.writeFileSync(NEEDS_LOOKUP, lines.join('\n'), 'utf8');
}

main().catch((e) => { console.error(e); process.exit(1); });
