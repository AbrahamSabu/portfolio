/**
 * The sound check for the sky score (client/src/sound/):
 *
 *   npm run sound-check -w @watchfloor/server -- [--wav path/to/score.wav]
 *
 * Node has no Web Audio, so this bundles client/src/sound/renderCheck.ts
 * with esbuild, runs it in headless Chrome, and prints what it measured in
 * a rendered minute of scripted pictures: silence when empty, loudness in a
 * band, notes on the scale, tone rather than noise, climbers higher than
 * descenders, ships low, alert calls on top, no clipping, no clicks. Exits
 * non-zero if any check fails. `--wav` keeps the render to listen to.
 *
 * CHROME_PATH picks the browser; CDP_PORT the debugging port (default 9404).
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = fileURLToPath(new URL('../../../client/src/sound/renderCheck.ts', import.meta.url));
const PORT = Number(process.env.CDP_PORT ?? 9404);
const CHROMES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

interface Check {
  name: string;
  value: string;
  limit: string;
  pass: boolean;
}

/** Just enough of the DevTools protocol: send a command, await its answer. */
async function devtools(url: string): Promise<{ send: (method: string, params?: object) => Promise<any>; close: () => void }> {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let next = 0;
  const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    const call = waiting.get(message.id);
    if (!call) return;
    waiting.delete(message.id);
    if (message.error) call.reject(new Error(message.error.message));
    else call.resolve(message.result);
  };
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++next;
        waiting.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      }),
    close: () => socket.close(),
  };
}

async function pageSocket(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Chrome's DevTools didn't answer on port ${PORT}`);
}

async function main(): Promise<void> {
  const wavAt = process.argv.indexOf('--wav');
  const wavPath = wavAt > 0 ? process.argv[wavAt + 1] : undefined;
  const chrome = CHROMES.find((p): p is string => !!p && fs.existsSync(p));
  if (!chrome) throw new Error('No Chrome or Edge found: set CHROME_PATH');

  const bundle = await build({ entryPoints: [ENTRY], bundle: true, write: false, format: 'iife', target: 'es2022', logLevel: 'error' });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'watchfloor-sound-'));
  const browser = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    'about:blank',
  ]);
  try {
    const page = await devtools(await pageSocket());
    await page.send('Runtime.evaluate', { expression: bundle.outputFiles[0]!.text });
    const started = Date.now();
    const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
      expression: 'window.soundCheck()',
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    const { checks, seconds, wavChars } = result.value as { checks: Check[]; seconds: number; wavChars: number };
    console.log(`Rendered ${seconds} s of score in ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
    const width = Math.max(...checks.map((c) => c.name.length));
    for (const c of checks) console.log(`${c.pass ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(width)}  ${c.value.padStart(12)}   (${c.limit})`);
    if (wavPath) {
      let base64 = '';
      for (let i = 0; i < wavChars; i += 4_000_000) {
        const piece = await page.send('Runtime.evaluate', { expression: `window.soundCheckWav.slice(${i}, ${i + 4_000_000})`, returnByValue: true });
        base64 += piece.result.value as string;
      }
      fs.writeFileSync(wavPath, Buffer.from(base64, 'base64'));
      console.log(`\nWrote ${wavPath}`);
    }
    page.close();
    const failed = checks.filter((c) => !c.pass).length;
    console.log(failed ? `\n${failed} of ${checks.length} checks failed` : `\nAll ${checks.length} checks passed`);
    process.exitCode = failed ? 1 : 0;
  } finally {
    browser.kill();
    // Chrome can hold its profile a moment after exiting.
    setTimeout(() => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }), 500);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
