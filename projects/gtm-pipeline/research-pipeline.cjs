// research-pipeline.cjs — deep research via Claude Code sessions
//
// Loops over shortlist.json and spawns one Claude Code session per company to
// research it properly, then writes a brief per company plus a combined report.
//
// Uses your existing `claude` CLI login. No API key in this script.
//
// SETUP
//   Make sure Claude Code works first:   claude --version
//   If that errors, install it and log in before running this.
//
// RUN
//   node research-pipeline.cjs
//
// RESUMABLE
//   Each brief is written to research/<company>.md as it completes. Re-running
//   skips anything already on disk, so you can stop and restart freely.
//
// OUTPUT
//   research/*.md          one brief per company
//   research_report.md     all briefs concatenated
//   research_failed.txt    companies that errored, for a retry pass

const fs = require('fs');
const path = require('path');
const SETTINGS = require('./lib/settings.cjs').load();
const { file: dataFile, keywordRegex, countryNames } = require('./lib/settings.cjs');
const { spawn } = require('child_process');

const SHORTLIST = dataFile('shortlist.json');
const OUTDIR    = dataFile('research');
const REPORT    = dataFile('research_report.md');
const FAILED    = dataFile('research_failed.txt');

const CONFIG = {
  // Only research companies at or above this triage score.
  minScore: SETTINGS.minScore,
  // 0 = all. Set to e.g. 5 for a test run first.
  limit: SETTINGS.researchLimit,
  // Minutes before giving up on a single company.
  timeoutMin: SETTINGS.timeoutMin,
  // Pause between sessions.
  delaySec: 5,
  // The CLI command. Change if yours differs.
  command: 'claude',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeName(s) {
  return s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

// ---------------------------------------------------------------------------
// THE PROMPT — this is the important part. Edit freely.
// ---------------------------------------------------------------------------
function buildPrompt(c) {
  const locations = (c.locations || []).slice(0, 6).join(', ');
  const phrases = (c.phrases || []).join(', ');

  return `Research the company "${c.company}" (hiring in ${countryNames(SETTINGS.countries)}) as a potential customer for ${SETTINGS.product}.

What I already know from job board data:
- Job postings: ${c.postings}
- Hiring locations: ${locations || 'unknown'}
- Matched these search phrases: ${phrases || 'none'}
- Sample job title: ${c.sample_title || 'unknown'}

Search the web and answer the following. Be sceptical and prioritise recent information. If you cannot verify something, say so rather than guessing.

1. WHAT THEY ACTUALLY DO
   Official website URL. What they sell. Which vertical.

2. DO THEY GENUINELY ${SETTINGS.qualifier.toUpperCase()}?
   This is the key qualifier. Is there real evidence they ${SETTINGS.qualifier}, or did they just appear in job data because of generic wording? Are they a recruitment agency posting on behalf of someone else? Quote any evidence.

3. SIZE OF THE FIELD FORCE
   Employee count, number of branches or depots, revenue if public, and any indication of how many canvassers or field reps they run.

4. OWNERSHIP AND FINANCIAL HEALTH
   Who owns them. Private equity involved? Any administration, insolvency, restructuring, redundancies, or rumoured sale in the last three years? A company in distress will not buy software, so this can disqualify an otherwise perfect fit.

5. HOW THEY TRAIN REPS
   Do job ads mention training provided, no experience needed, commission-only pay, or high turnover? Any Glassdoor or Indeed reviews mentioning training quality or sales pressure.

6. THE PITCH ANGLE
   If they are a good fit, what is the sharpest angle for ${SETTINGS.product}? Reference something specific about how they sell or what they measure.

7. VERDICT
   One of: STRONG FIT, WORTH CONTACTING, WEAK, or NOT A BUYER. Give one sentence of reasoning.

Write the answer as markdown with those seven headings. Be concise, use bullets, no preamble. Do not create any files, just output the research. Do not read or list files in the current directory. Use web search only.`;
}

// ---------------------------------------------------------------------------

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    // -p runs a single non-interactive prompt and prints the result.
        const child = spawn(CONFIG.command, ['-p', '--allowedTools', 'WebSearch,WebFetch', '--permission-mode', 'dontAsk'], {
      shell: true,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.write(prompt);
    child.stdin.end();

    let out = '';
    let err = '';
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill(); } catch (_) {}
      reject(new Error(`timed out after ${CONFIG.timeoutMin} min`));
    }, CONFIG.timeoutMin * 60 * 1000);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });

    child.on('error', (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(e);
    });

    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) {
        return reject(new Error(`exit ${code}: ${err.slice(0, 300)}`));
      }
      resolve(out.trim());
    });
  });
}

async function main() {
  if (!fs.existsSync(SHORTLIST)) {
    console.error('No shortlist.json. Run triage.js first.');
    process.exit(1);
  }
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR);

  const all = JSON.parse(fs.readFileSync(SHORTLIST, 'utf8'));
  let targets = all
    .filter((c) => (c.score || 0) >= CONFIG.minScore)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  if (CONFIG.limit > 0) targets = targets.slice(0, CONFIG.limit);

  console.log(`${targets.length} companies to research (score >= ${CONFIG.minScore}).`);
  console.log(`Roughly ${Math.round(targets.length * 1.5)}-${targets.length * 3} minutes. Safe to stop and restart.\n`);

  const failed = [];
  let done = 0, skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    const file = path.join(OUTDIR, safeName(c.company) + '.md');
    const label = `[${i + 1}/${targets.length}] ${c.company}`;

    if (fs.existsSync(file)) {
      console.log(`${label} -> already done, skipping`);
      skipped++;
      continue;
    }

    process.stdout.write(`${label} ... researching `);
    const started = Date.now();

    try {
            const result = await runClaude(buildPrompt(c));
      if (/failed to authenticate|oauth session expired/i.test(result)) {
        throw new Error('Claude Code auth expired mid-run, re-login and rerun');
      }
      const secs = Math.round((Date.now() - started) / 1000);

      const md = `# ${c.company}\n\n` +
        `_Triage score ${c.score} · ${c.postings} postings · ` +
        `${(c.locations || []).length} locations · researched ${new Date().toISOString().slice(0, 10)}_\n\n` +
        result + '\n';

      fs.writeFileSync(file, md, 'utf8');
      console.log(`done (${secs}s)`);
      done++;
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      failed.push(`${c.company} — ${e.message}`);
    }

    if (i < targets.length - 1) await sleep(CONFIG.delaySec * 1000);
  }

  // Combine everything on disk into one report.
  const files = fs.readdirSync(OUTDIR).filter((f) => f.endsWith('.md')).sort();
  const combined = [`# Deep research\n`, `Generated ${new Date().toLocaleString()} · ${files.length} companies\n`]
    .concat(files.map((f) => fs.readFileSync(path.join(OUTDIR, f), 'utf8') + '\n\n---\n'))
    .join('\n');
  fs.writeFileSync(REPORT, combined, 'utf8');

  if (failed.length) fs.writeFileSync(FAILED, failed.join('\n'), 'utf8');

  console.log('\n' + '='.repeat(50));
  console.log(`Researched this run : ${done}`);
  console.log(`Already had         : ${skipped}`);
  console.log(`Failed              : ${failed.length}`);
  console.log(`Total briefs        : ${files.length}`);
  console.log('='.repeat(50));
  console.log('\nresearch_report.md has everything combined.');
  if (failed.length) console.log('Re-run to retry the failures.');
}

main().catch((e) => { console.error(e); process.exit(1); });
