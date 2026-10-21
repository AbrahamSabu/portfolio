// Small cross-platform helpers for running commands (claude, npm, git).
import { spawn } from "node:child_process";

const WIN = process.platform === "win32";

// On Windows, CLIs like claude/npm/npx are .cmd shims, so they need a shell.
// Arguments here never contain user text with spaces except paths, which we quote.
const q = (a) => (WIN && /[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

export function start(cmd, args, { cwd, env, input } = {}) {
  const child = spawn(cmd, WIN ? args.map(q) : args, {
    cwd, env: { ...process.env, ...env }, shell: WIN, windowsHide: true,
  });
  if (input != null) child.stdin.end(input); else child.stdin.end();
  return child;
}

export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let out = "";
    let child;
    try { child = start(cmd, args, opts); } catch (e) { return resolve({ code: -1, out: e.message }); }
    child.stdout.on("data", (d) => { out += d; opts.onLine?.(String(d)); });
    child.stderr.on("data", (d) => { out += d; opts.onLine?.(String(d)); });
    child.on("error", (e) => resolve({ code: -1, out: out + e.message }));
    child.on("close", (code) => resolve({ code, out }));
  });
}

export function killTree(child) {
  if (!child || child.exitCode != null) return;
  if (WIN) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
  else child.kill("SIGTERM");
}

// Split a stream into lines and call fn for each complete line.
export function lines(stream, fn) {
  let buf = "";
  stream.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { fn(buf.slice(0, i).replace(/\r$/, "")); buf = buf.slice(i + 1); }
  });
  stream.on("end", () => { if (buf) fn(buf); });
}
