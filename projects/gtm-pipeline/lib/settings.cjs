// Shared settings for every pipeline step. The app writes workspace/settings.json;
// each script reads it here, so nothing about your target market is hard-coded.
const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');
const DATA = path.resolve(process.env.GTM_WORKSPACE || path.join(APP_DIR, 'workspace'));
const SETTINGS_FILE = path.join(DATA, 'settings.json');

const COUNTRIES = {
  gb: 'UK', us: 'US', ie: 'Ireland', au: 'Australia', ca: 'Canada', nz: 'New Zealand', de: 'Germany',
  fr: 'France', nl: 'Netherlands', be: 'Belgium', at: 'Austria', ch: 'Switzerland', es: 'Spain', it: 'Italy',
  pl: 'Poland', in: 'India', sg: 'Singapore', za: 'South Africa', br: 'Brazil', mx: 'Mexico',
};

// The defaults are a worked example: finding companies that run door-to-door sales teams.
const DEFAULTS = {
  adzunaId: '',
  adzunaKey: '',
  mode: 'deep',                          // deep = first run, weekly = new postings only
  countries: ['gb'],
  phrases: [
    'door to door sales', 'field sales representative', 'canvasser', 'direct sales',
    'door to door canvasser', 'field sales agent', 'solar sales', 'broadband field sales',
    'energy field sales', 'face to face fundraiser',
  ],
  // Words in job ads that strongly confirm a fit (triage + report scoring).
  strongKeywords: ['door to door', 'canvass'],
  // Words on a company's own website that confirm a fit (enrich step).
  siteKeywords: ['door to door', 'door-to-door', 'canvasser', 'canvassing', 'field sales', 'in-home', 'home visit', 'doorstep', 'direct sales', 'face to face'],
  minPostings: 2,
  minScore: 4,
  product: 'an AI sales-training platform for door-to-door and field sales teams',
  qualifier: 'run door-to-door or field sales teams (reps who sell face to face, not just generic sales roles)',
  researchLimit: 0,                      // 0 = research every company at or above minScore
  timeoutMin: 6,
  reportTitle: 'Prospect board',
};

function load() {
  fs.mkdirSync(DATA, { recursive: true });
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (_) {}
  const s = { ...DEFAULTS, ...saved };
  s.adzunaId = s.adzunaId || process.env.ADZUNA_APP_ID || '';
  s.adzunaKey = s.adzunaKey || process.env.ADZUNA_APP_KEY || '';
  return s;
}

function save(patch) {
  fs.mkdirSync(DATA, { recursive: true });
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (_) {}
  const next = { ...DEFAULTS, ...saved, ...patch };
  for (const k of ['countries', 'phrases', 'strongKeywords', 'siteKeywords']) {
    next[k] = [...new Set((Array.isArray(next[k]) ? next[k] : String(next[k] || '').split(/[\n,]/)).map((x) => String(x).trim()).filter(Boolean))];
  }
  for (const k of ['minPostings', 'minScore', 'researchLimit', 'timeoutMin']) next[k] = Math.max(0, parseInt(next[k], 10) || 0);
  if (!['deep', 'weekly'].includes(next.mode)) next.mode = 'deep';
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return load();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keywordRegex = (words) => (words.length ? new RegExp(words.map(escapeRe).join('|'), 'i') : /$^/);
const countryNames = (codes) => codes.map((c) => COUNTRIES[c] || c.toUpperCase()).join(', ');

module.exports = { APP_DIR, DATA, DEFAULTS, COUNTRIES, load, save, keywordRegex, countryNames, file: (name) => path.join(DATA, name) };
