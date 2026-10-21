// collect.js — Kríos ICP discovery collector (Tier 2, v2)
//
// Pulls door-to-door / field-sales job listings from the Adzuna API across
// multiple countries, dedupes by employer, and MERGES into a persistent
// master list that grows over time.
//
// Requires: Node 18+ (built-in fetch). No npm install needed.
//
// SETUP
//   1. Register free at https://developer.adzuna.com -> app_id + app_key
//   2. Paste them into the CREDENTIALS block below.
//   3. Run:  node collect.js
//
// OUTPUT (written next to this script)
//   companies_master.txt   <- READ THIS ONE. Human-readable, grouped, ranked.
//   companies_master.json  <- the persistent memory. Do not delete.
//   companies_master.csv   <- same data, for spreadsheets.
//
// HOW REPEAT RUNS WORK
//   The JSON file is the memory. On every run, companies you already have get
//   their counts and last_seen updated; only genuinely NEW employers are added
//   and flagged [NEW] in the text report. The run summary tells you how many
//   were new vs already known.
//
// RECOMMENDED USAGE
//   First run:   MODE = 'deep'    (drains the current pool, ~300-450 calls)
//   Then weekly: MODE = 'weekly'  (catches new entrants, ~60-120 calls)
//   Free tier is ~1000 calls/month, so budget accordingly.

// ----------------------------- CREDENTIALS ----------------------------------
// Paste between the quotes. Keep the quotes.
const ADZUNA_APP_ID  = 'PASTE_YOUR_APP_ID_HERE';
const ADZUNA_APP_KEY = 'PASTE_YOUR_APP_KEY_HERE';

// ----------------------------- CONFIG ---------------------------------------

// 'deep'   = exhaust the current pool. Use for your first run.
// 'weekly' = shallow sweep for new postings. Use on a schedule after that.
const MODE = 'deep';

const CONFIG = {
  countries: ['gb'],

  // These phrases ARE your ICP definition. Tune freely.
  phrases: [
    'door to door sales',
    'field sales representative',
    'canvasser',
    'direct sales',
    'door to door canvasser',
    'field sales agent',
    'solar sales',
    'broadband field sales',
    'energy field sales',
    'face to face fundraiser',
  ],

  resultsPerPage: 50,        // Adzuna max
  delayMs: 1200,             // politeness pause between calls

  deep:   { maxPages: 20, maxDaysOld: 90, callBudget: 450 },
  weekly: { maxPages: 3,  maxDaysOld: 14, callBudget: 120 },
};

// ----------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const MASTER_JSON = path.join(__dirname, 'companies_master.json');
const MASTER_TXT  = path.join(__dirname, 'companies_master.txt');
const MASTER_CSV  = path.join(__dirname, 'companies_master.csv');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

let CREDS = { id: '', key: '' };

// Optional .env support, if you prefer keys out of the code.
function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

// Normalise so "ACME Solar Ltd" and "Acme Solar Limited" merge into one record.
function normaliseCompany(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(ltd|limited|llc|inc|plc|llp|co|company|group|holdings)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function csvField(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ----------------------------- PERSISTENCE ----------------------------------

function loadMaster() {
  if (!fs.existsSync(MASTER_JSON)) return {};
  try {
    return JSON.parse(fs.readFileSync(MASTER_JSON, 'utf8'));
  } catch (e) {
    console.warn('Could not read existing master file, starting fresh. ' + e.message);
    return {};
  }
}

function saveMaster(master) {
  fs.writeFileSync(MASTER_JSON, JSON.stringify(master, null, 2), 'utf8');
}

// ----------------------------- COLLECTION -----------------------------------

async function fetchPage(country, phrase, page, settings) {
  const url =
    `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}` +
    `?app_id=${CREDS.id}&app_key=${CREDS.key}` +
    `&results_per_page=${CONFIG.resultsPerPage}` +
    `&what_phrase=${encodeURIComponent(phrase)}` +
    `&max_days_old=${settings.maxDaysOld}` +
    `&content-type=application/json`;

  const res = await fetch(url);
  const body = await res.text();

  if (!res.ok) {
    // Surface the real reason instead of silently skipping.
    let reason = body.slice(0, 200);
    try {
      const parsed = JSON.parse(body);
      reason = parsed.display || parsed.exception || reason;
    } catch (_) { /* keep raw */ }
    const err = new Error(`HTTP ${res.status}: ${reason}`);
    err.status = res.status;
    throw err;
  }

  return JSON.parse(body);
}

async function run() {
  loadEnv();

  CREDS.id  = ADZUNA_APP_ID  !== 'PASTE_YOUR_APP_ID_HERE'  ? ADZUNA_APP_ID  : (process.env.ADZUNA_APP_ID  || '');
  CREDS.key = ADZUNA_APP_KEY !== 'PASTE_YOUR_APP_KEY_HERE' ? ADZUNA_APP_KEY : (process.env.ADZUNA_APP_KEY || '');
  CREDS.id = CREDS.id.trim();
  CREDS.key = CREDS.key.trim();

  if (!CREDS.id || !CREDS.key) {
    console.error('No credentials. Paste them into the CREDENTIALS block at the top of this file.');
    process.exit(1);
  }

  const settings = CONFIG[MODE];
  if (!settings) {
    console.error(`MODE must be 'deep' or 'weekly'. Got: ${MODE}`);
    process.exit(1);
  }

  const master = loadMaster();
  const knownBefore = Object.keys(master).length;
  const seenThisRun = new Set();
  const runDate = today();

  let calls = 0;
  let listingsSeen = 0;
  let authFailed = false;

  console.log(`Mode: ${MODE}  |  countries: ${CONFIG.countries.join(', ')}  |  phrases: ${CONFIG.phrases.length}`);
  console.log(`Existing companies in master: ${knownBefore}`);
  console.log('');

  outer:
  for (const country of CONFIG.countries) {
    for (const phrase of CONFIG.phrases) {
      for (let page = 1; page <= settings.maxPages; page++) {
        if (calls >= settings.callBudget) {
          console.log(`\nReached call budget (${settings.callBudget}). Stopping early.`);
          break outer;
        }

        calls++;
        let data;
        try {
          data = await fetchPage(country, phrase, page, settings);
        } catch (e) {
          console.warn(`  [${country}] "${phrase}" p${page} -> ${e.message}`);
          if (e.status === 401 || /AUTH/i.test(e.message)) {
            console.error('\nAuthorisation failed. Check your app_id and app_key are correct and active.');
            authFailed = true;
            break outer;
          }
          await sleep(CONFIG.delayMs);
          continue;
        }

        const results = data.results || [];
        listingsSeen += results.length;

        let newHere = 0;
        for (const job of results) {
          const display = job.company && job.company.display_name;
          if (!display) continue;
          const key = normaliseCompany(display);
          if (!key) continue;

          seenThisRun.add(key);

          if (!master[key]) {
            master[key] = {
              company: display,
              countries: [],
              postings: 0,
              phrases: [],
              locations: [],
              categories: [],
              first_seen: runDate,
              last_seen: runDate,
              sample_title: job.title || '',
              sample_url: job.redirect_url || '',
            };
            newHere++;
          }

          const rec = master[key];
          rec.postings++;
          rec.last_seen = runDate;
          if (!rec.countries.includes(country)) rec.countries.push(country);
          if (!rec.phrases.includes(phrase)) rec.phrases.push(phrase);

          const loc = job.location && job.location.display_name;
          if (loc && !rec.locations.includes(loc) && rec.locations.length < 8) rec.locations.push(loc);

          const cat = job.category && job.category.label;
          if (cat && !rec.categories.includes(cat)) rec.categories.push(cat);
        }

        console.log(`[${country}] "${phrase}" p${page}: ${results.length} listings, ${newHere} new companies (call ${calls})`);

        // Fewer results than a full page means we've hit the end for this phrase.
        if (results.length < CONFIG.resultsPerPage) {
          await sleep(CONFIG.delayMs);
          break;
        }
        await sleep(CONFIG.delayMs);
      }
    }
  }

  if (authFailed) process.exit(1);

  saveMaster(master);
  writeReports(master, seenThisRun, runDate);

  const knownAfter = Object.keys(master).length;
  const added = knownAfter - knownBefore;

  console.log('');
  console.log('='.repeat(60));
  console.log(`RUN COMPLETE (${MODE})`);
  console.log(`  API calls used        : ${calls}`);
  console.log(`  Listings processed    : ${listingsSeen}`);
  console.log(`  Companies seen        : ${seenThisRun.size}`);
  console.log(`    - already known     : ${Math.max(0, seenThisRun.size - added)}`);
  console.log(`    - NEW this run      : ${added}`);
  console.log(`  Master list total     : ${knownAfter}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('Open companies_master.txt to read the list.');
}

// ----------------------------- REPORTING ------------------------------------

function writeReports(master, seenThisRun, runDate) {
  const rows = Object.entries(master)
    .map(([key, r]) => ({ key, ...r }))
    .sort((a, b) => b.postings - a.postings || a.company.localeCompare(b.company));

  // ---- plain text, the one you actually read ----
  const lines = [];
  lines.push('KRIOS ICP MASTER LIST');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Total companies: ${rows.length}`);
  lines.push('');
  lines.push('Sorted by number of job postings, which is a rough proxy for team');
  lines.push('size and hiring intensity, so the top of each list is where the');
  lines.push('largest D2D operations sit.');
  lines.push('');

  for (const country of CONFIG.countries) {
    const inCountry = rows.filter((r) => r.countries.includes(country));
    if (!inCountry.length) continue;

    lines.push('');
    lines.push('='.repeat(70));
    lines.push(`${country.toUpperCase()}  —  ${inCountry.length} companies`);
    lines.push('='.repeat(70));
    lines.push('');

    inCountry.forEach((r, i) => {
      const isNew = r.first_seen === runDate;
      lines.push(`${String(i + 1).padStart(4)}. ${r.company}${isNew ? '   [NEW]' : ''}`);
      lines.push(`      postings   : ${r.postings}`);
      lines.push(`      matched on : ${r.phrases.join(', ')}`);
      if (r.locations.length) lines.push(`      locations  : ${r.locations.slice(0, 5).join(' | ')}`);
      if (r.categories.length) lines.push(`      category   : ${r.categories.join(', ')}`);
      lines.push(`      seen       : ${r.first_seen} -> ${r.last_seen}`);
      if (r.sample_url) lines.push(`      sample ad  : ${r.sample_url}`);
      lines.push('');
    });
  }

  fs.writeFileSync(MASTER_TXT, lines.join('\n'), 'utf8');

  // ---- csv, for spreadsheets ----
  const header = ['company', 'countries', 'postings', 'phrases', 'locations', 'categories', 'first_seen', 'last_seen', 'sample_title', 'sample_url'];
  const csv = [header.join(',')].concat(
    rows.map((r) => [
      r.company,
      r.countries.join(' | '),
      r.postings,
      r.phrases.join(' | '),
      r.locations.join(' | '),
      r.categories.join(' | '),
      r.first_seen,
      r.last_seen,
      r.sample_title,
      r.sample_url,
    ].map(csvField).join(','))
  ).join('\n');

  fs.writeFileSync(MASTER_CSV, csv, 'utf8');
}

run().catch((e) => { console.error(e); process.exit(1); });
