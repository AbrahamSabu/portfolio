// triage.js — ICP Pass 1 (v2): score, dedupe, classify, shortlist
//
// Reads companies_master.json (from collect.js) and turns the raw employer
// list into a ranked shortlist worth researching.
//
// No network calls. Runs in seconds. Free.
//
// RUN:  node triage.js
//
// OUTPUT (next to this script)
//   shortlist.txt    <- READ THIS. Ranked prospects, grouped by vertical.
//   shortlist.json   <- machine-readable, feeds Pass 2 (the enricher).
//   excluded.txt     <- everything filtered out, with the reason. Sanity check.
//   merged.txt       <- companies merged as duplicates. Check for bad merges.
//
// WHAT CHANGED IN v2
//   - Fuzzy dedupe: "Anglian" and "Anglian Home Improvements" now merge.
//   - Vertical classifier fixed; home improvement is a first-class vertical
//     (it is the single biggest D2D category in the UK).
//   - Noise filter for councils, estate agents, and other non-D2D employers
//     that slip through on keyword coincidence.
//   - Outsourced sales agencies are DETECTED AND KEPT, flagged separately.
//     They employ the reps and live on conversion rate, so they are a strong
//     buyer. This is different from recruitment agencies, which are excluded.

const fs = require('fs');
const path = require('path');
const SETTINGS = require('./lib/settings.cjs').load();
const { file: dataFile, keywordRegex, countryNames } = require('./lib/settings.cjs');

const MASTER_JSON    = dataFile('companies_master.json');
const SHORTLIST_TXT  = dataFile('shortlist.txt');
const SHORTLIST_JSON = dataFile('shortlist.json');
const EXCLUDED_TXT   = dataFile('excluded.txt');
const MERGED_TXT     = dataFile('merged.txt');

// ----------------------------- TUNING ---------------------------------------

const TUNING = {
  minScore: SETTINGS.minScore,
  minPostings: SETTINGS.minPostings,

  // RECRUITMENT agencies: they fill roles at other companies and do not employ
  // the reps. Not your buyer. Excluded.
  recruiterPatterns: [
    'recruit', 'staffing', 'talent', 'resourcing', 'personnel',
    'employment agency', 'manpower', 'headhunt', 'placements', 'temps',
    'workforce', 'search and selection', 'search & selection',
    'portfolio group', 'reed ', 'hays ', 'adecco', 'randstad',
    'brook street', 'office angels', 'gi group', 'blue arrow',
  ],

  // OUTSOURCED SALES agencies: they employ the reps and run the doors on
  // behalf of brands. These ARE a buyer. Kept and flagged.
  outsourcedSalesPatterns: [
    'site solutions', 'field marketing', 'sales and marketing',
    'sales & marketing', 'canvassing', 'direct marketing', 'acquisition',
    'outsourced', 'sales solutions', 'marketing solutions',
  ],

  // Employers that are clearly not D2D operations but match keywords anyway.
  noisePatterns: [
    'council', 'borough', 'county', 'district council', 'city of',
    'nhs', 'university', 'college', 'school', 'academy trust',
    'police', 'fire service', 'ambulance',
    'estate agent', 'lettings', 'spicerhaart', 'connells', 'haart',
    'hospital', 'care home', 'nursing',
  ],

  junkPatterns: [
    'confidential', 'undisclosed', 'private advertiser', 'anonymous',
    'client of', 'various', 'n/a', 'unknown',
  ],
};

// ----------------------------- DEDUPE ---------------------------------------

// Aggressive normalisation for comparison purposes only.
function dedupeKey(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(ltd|limited|llc|inc|plc|llp|co|company|group|holdings|uk|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Suffixes that are descriptive rather than identifying, so stripping them
// reveals that two records are the same business.
const DESCRIPTIVE_SUFFIXES = [
  'home improvements', 'home improvement', 'windows', 'glazing',
  'roofing', 'solar', 'energy', 'renewables', 'telecom', 'telecoms',
  'broadband', 'fibre', 'security', 'alarms', 'recruitment team',
  'sales team', 'careers', 'jobs', 'direct', 'services', 'solutions',
];

function stemName(name) {
  let s = dedupeKey(name);
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of DESCRIPTIVE_SUFFIXES) {
      if (s.endsWith(' ' + suf)) {
        s = s.slice(0, -(suf.length + 1)).trim();
        changed = true;
      }
    }
  }
  return s;
}

// Merge records whose stemmed names match, or where one name is a prefix of
// the other and the shared part is substantial (guards against "A" matching
// everything starting with A).
function dedupe(records) {
  const merges = [];
  const byStem = new Map();

  for (const r of records) {
    const stem = stemName(r.company);
    if (!stem || stem.length < 3) {
      byStem.set('__unique__' + r.key, [r]);
      continue;
    }
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(r);
  }

  const merged = [];
  for (const [stem, group] of byStem) {
    if (group.length === 1) { merged.push(group[0]); continue; }

    // Keep the record with the most postings as the canonical one.
    group.sort((a, b) => b.postings - a.postings);
    const primary = { ...group[0] };
    primary.locations  = [...(primary.locations || [])];
    primary.phrases    = [...(primary.phrases || [])];
    primary.categories = [...(primary.categories || [])];
    primary.merged_from = [];

    for (let i = 1; i < group.length; i++) {
      const other = group[i];
      primary.postings += other.postings;
      for (const l of other.locations || []) if (!primary.locations.includes(l)) primary.locations.push(l);
      for (const p of other.phrases || [])   if (!primary.phrases.includes(p))   primary.phrases.push(p);
      for (const c of other.categories || []) if (!primary.categories.includes(c)) primary.categories.push(c);
      if (other.first_seen < primary.first_seen) primary.first_seen = other.first_seen;
      if (other.last_seen > primary.last_seen)   primary.last_seen  = other.last_seen;
      primary.merged_from.push(other.company);
    }

    merges.push({
      kept: primary.company,
      absorbed: primary.merged_from,
      stem,
      total_postings: primary.postings,
    });
    merged.push(primary);
  }

  return { merged, merges };
}

// ----------------------------- CLASSIFY -------------------------------------

const VERTICAL_RULES = [
  ['Home improvement',      /home improvement|window|glazing|conservator|roof|insulat|driveway|door.?s? and window|fascia|soffit|guttering|kitchen|bathroom|everest|anglian|safestyle|weatherseal/],
  ['Solar / renewables',    /solar|photovolt|renewable|heat pump|pv panel|green energy/],
  ['Telecoms / broadband',  /broadband|fibre|fiber|telecom|internet|voneus|openreach|virgin media|gigabit|connectivity/],
  ['Energy',                /energy|utilit|\bgas\b|electric|eco4|boiler|smart meter/],
  ['Fundraising (F2F)',     /charit|fundrais|donor|ngo|street team/],
  ['Security / alarms',     /alarm|security|cctv|burglar|smart home/],
  ['Pest control',          /pest|rodent|infestation/],
  ['Insurance / financial', /insur|mortgage|financial services|protection/],
  ['Water',                 /water softener|water treatment|filtration/],
];

function guessVertical(r) {
  const hay = [
    r.company || '',
    r.sample_title || '',
    (r.phrases || []).join(' '),
    (r.categories || []).join(' '),
    (r.merged_from || []).join(' '),
  ].join(' ').toLowerCase();

  for (const [label, re] of VERTICAL_RULES) {
    if (re.test(hay)) return label;
  }
  return 'Unclassified';
}

// ----------------------------- SCORING --------------------------------------

function scoreCompany(r) {
  const reasons = [];
  let score = 0;

  const p = r.postings;
  if (p >= 50)      { score += 6; reasons.push(`${p} postings (major operation)`); }
  else if (p >= 20) { score += 5; reasons.push(`${p} postings (very high volume)`); }
  else if (p >= 10) { score += 4; reasons.push(`${p} postings (high volume)`); }
  else if (p >= 5)  { score += 3; reasons.push(`${p} postings (steady hiring)`); }
  else if (p >= 3)  { score += 2; reasons.push(`${p} postings`); }
  else              { score += 1; reasons.push(`${p} postings (low)`); }

  const locs = (r.locations || []).length;
  if (locs >= 5)       { score += 3; reasons.push(`${locs}+ locations (multi-region field force)`); }
  else if (locs >= 3)  { score += 2; reasons.push(`${locs} locations`); }
  else if (locs === 2) { score += 1; reasons.push('2 locations'); }

  const ph = (r.phrases || []).length;
  if (ph >= 4)      { score += 3; reasons.push(`matched ${ph} D2D phrases (strong fit)`); }
  else if (ph >= 2) { score += 2; reasons.push(`matched ${ph} D2D phrases`); }

  const hay = [(r.phrases || []).join(' '), r.sample_title || ''].join(' ').toLowerCase();
  if (keywordRegex(SETTINGS.strongKeywords).test(hay)) {
    score += 3;
    reasons.push('job ads use your strong-fit keywords');
  }

  if (r.first_seen && r.last_seen && r.first_seen !== r.last_seen) {
    score += 1;
    reasons.push('hiring sustained across multiple runs');
  }

  return { score, reasons };
}

function matchesAny(name, patterns) {
  const n = ' ' + name.toLowerCase() + ' ';
  return patterns.find((p) => n.includes(p)) || null;
}

// ----------------------------- MAIN -----------------------------------------

function main() {
  if (!fs.existsSync(MASTER_JSON)) {
    console.error('Cannot find companies_master.json. Run collect.js first.');
    process.exit(1);
  }

  const master = JSON.parse(fs.readFileSync(MASTER_JSON, 'utf8'));
  const raw = Object.entries(master).map(([key, r]) => ({ key, ...r }));

  const { merged: all, merges } = dedupe(raw);

  const shortlist = [];
  const excluded = [];

  for (const r of all) {
    const name = r.company || '';

    const junkHit = matchesAny(name, TUNING.junkPatterns);
    if (junkHit) {
      excluded.push({ ...r, exclusion: `non-company name (matched "${junkHit.trim()}")` });
      continue;
    }

    const noiseHit = matchesAny(name, TUNING.noisePatterns);
    if (noiseHit) {
      excluded.push({ ...r, exclusion: `not a D2D operation (matched "${noiseHit.trim()}")` });
      continue;
    }

    // Outsourced sales agencies are checked FIRST so they are not caught by
    // the recruiter filter. They employ reps, so they are a real buyer.
    const outsourcedHit = matchesAny(name, TUNING.outsourcedSalesPatterns);

    if (!outsourcedHit) {
      const recruiterHit = matchesAny(name, TUNING.recruiterPatterns);
      if (recruiterHit) {
        excluded.push({ ...r, exclusion: `recruitment agency, does not employ the reps (matched "${recruiterHit.trim()}")` });
        continue;
      }
    }

    if (r.postings < TUNING.minPostings) {
      excluded.push({ ...r, exclusion: `only ${r.postings} posting (minimum is ${TUNING.minPostings})` });
      continue;
    }

    const { score, reasons } = scoreCompany(r);
    if (score < TUNING.minScore) {
      excluded.push({ ...r, exclusion: `score ${score} below threshold of ${TUNING.minScore}`, score, reasons });
      continue;
    }

    shortlist.push({
      ...r,
      score,
      reasons,
      vertical: guessVertical(r),
      buyer_type: outsourcedHit ? 'Outsourced sales agency' : 'Brand (owns product)',
    });
  }

  shortlist.sort((a, b) => b.score - a.score || b.postings - a.postings);
  excluded.sort((a, b) => (b.postings || 0) - (a.postings || 0));

  writeShortlist(shortlist, raw.length, all.length);
  writeExcluded(excluded);
  writeMerges(merges);

  fs.writeFileSync(SHORTLIST_JSON, JSON.stringify(shortlist, null, 2), 'utf8');

  const byVertical = {};
  for (const s of shortlist) byVertical[s.vertical] = (byVertical[s.vertical] || 0) + 1;

  console.log('');
  console.log('='.repeat(60));
  console.log('TRIAGE COMPLETE (v2)');
  console.log(`  Raw companies       : ${raw.length}`);
  console.log(`  After dedupe        : ${all.length}  (${merges.length} merge groups)`);
  console.log(`  Shortlisted         : ${shortlist.length}`);
  console.log(`  Excluded            : ${excluded.length}`);
  console.log('');
  console.log('  Shortlist by vertical:');
  Object.entries(byVertical)
    .sort((a, b) => b[1] - a[1])
    .forEach(([v, n]) => console.log(`    ${String(n).padStart(4)}  ${v}`));
  console.log('='.repeat(60));
  console.log('');
  console.log('Read shortlist.txt  — ranked prospects.');
  console.log('Read excluded.txt   — check nothing good got binned.');
  console.log('Read merged.txt     — check no bad merges happened.');
}

function writeShortlist(list, rawCount, dedupedCount) {
  const lines = [];
  lines.push('KRIOS ICP SHORTLIST  (Pass 1, v2)');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`${list.length} shortlisted from ${dedupedCount} companies (${rawCount} before dedupe)`);
  lines.push('');
  lines.push('Ranked by fit score: hiring volume, geographic spread, number of');
  lines.push('D2D phrases matched, and explicit door-to-door language.');
  lines.push('');
  lines.push('BUYER TYPE tells you who you are selling to:');
  lines.push('  Brand                    - owns the product, employs its own canvassers');
  lines.push('  Outsourced sales agency  - runs the doors for other brands, lives on');
  lines.push('                             conversion rate, often the sharper pitch');
  lines.push('');

  const groups = {};
  for (const r of list) (groups[r.vertical] = groups[r.vertical] || []).push(r);
  const order = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

  for (const [vertical, rows] of order) {
    lines.push('');
    lines.push('='.repeat(70));
    lines.push(`${vertical.toUpperCase()}  —  ${rows.length} companies`);
    lines.push('='.repeat(70));
    lines.push('');

    rows.forEach((r, i) => {
      lines.push(`${String(i + 1).padStart(3)}. ${r.company}    [score ${r.score}]`);
      lines.push(`     buyer type: ${r.buyer_type}`);
      lines.push(`     why       : ${r.reasons.join('; ')}`);
      if (r.merged_from && r.merged_from.length) {
        lines.push(`     also seen as: ${r.merged_from.join(', ')}`);
      }
      if (r.locations && r.locations.length) {
        lines.push(`     locations : ${r.locations.slice(0, 5).join(' | ')}`);
      }
      if (r.sample_title) lines.push(`     sample ad : ${r.sample_title}`);
      if (r.sample_url)   lines.push(`     ad link   : ${r.sample_url}`);
      lines.push('');
    });
  }

  fs.writeFileSync(SHORTLIST_TXT, lines.join('\n'), 'utf8');
}

function writeExcluded(list) {
  const lines = [];
  lines.push('EXCLUDED COMPANIES  (Pass 1, v2)');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`${list.length} filtered out`);
  lines.push('');
  lines.push('SANITY CHECK: scan this. If real prospects are here, adjust the');
  lines.push('TUNING block in triage.js. Sorted by posting count, so the most');
  lines.push('costly mistakes are at the top.');
  lines.push('');

  list.forEach((r, i) => {
    lines.push(`${String(i + 1).padStart(4)}. ${r.company}`);
    lines.push(`      excluded because : ${r.exclusion}`);
    lines.push(`      postings         : ${r.postings}`);
    if (r.sample_title) lines.push(`      sample ad        : ${r.sample_title}`);
    lines.push('');
  });

  fs.writeFileSync(EXCLUDED_TXT, lines.join('\n'), 'utf8');
}

function writeMerges(merges) {
  const lines = [];
  lines.push('MERGED DUPLICATES  (Pass 1, v2)');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`${merges.length} merge groups`);
  lines.push('');
  lines.push('SANITY CHECK: these were treated as the same company. If two');
  lines.push('genuinely different businesses got merged, add a guard or rename');
  lines.push('in DESCRIPTIVE_SUFFIXES in triage.js.');
  lines.push('');

  merges.sort((a, b) => b.total_postings - a.total_postings);
  merges.forEach((m, i) => {
    lines.push(`${String(i + 1).padStart(3)}. KEPT: ${m.kept}   (${m.total_postings} postings combined)`);
    lines.push(`      absorbed: ${m.absorbed.join(', ')}`);
    lines.push('');
  });

  fs.writeFileSync(MERGED_TXT, lines.join('\n'), 'utf8');
}

main();
