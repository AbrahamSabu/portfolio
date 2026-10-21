#!/usr/bin/env node
// Run the weekly blog agent once against a website repo.
//
//   node run.mjs --repo <path to your site repo>            write a post and open a PR
//   node run.mjs --repo <path> --check                      just check everything is ready
//   node run.mjs --repo <path> --instructions my-agent.md   use your own instructions
//   node run.mjs --repo <path> --model sonnet               pick a Claude model
//
// The agent can only use git, gh, npm, file edits and web search, and AGENT.md tells it
// never to push to main or merge. Publishing stays a human action: you merge the PR.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WIN = process.platform === "win32";
const arg = (name, fallback = null) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const flag = (name) => process.argv.includes("--" + name);

const repo = arg("repo") ? path.resolve(arg("repo")) : null;
const instructions = path.resolve(HERE, arg("instructions", "AGENT.md"));
const model = arg("model");

const sh = (cmd, args, cwd) => {
  const r = spawnSync(WIN ? [cmd, ...args].join(" ") : cmd, WIN ? [] : args, { cwd, encoding: "utf8", shell: WIN });
  return { ok: r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).trim() };
};

function checks() {
  const list = [
    ["Site repo given (--repo)", Boolean(repo), "Pass the path to your website's git repo: node run.mjs --repo ../my-site"],
    ["Site repo is a git repo", repo && fs.existsSync(path.join(repo, ".git")), "That folder has no .git. Clone your site repo first."],
    ["Instructions file exists", fs.existsSync(instructions), `Couldn't find ${instructions}. Copy AGENT.template.md and fill it in.`],
    ["Claude Code installed", sh("claude", ["--version"]).ok, "Install Claude Code (https://claude.com/claude-code) and run `claude` once to sign in."],
    ["GitHub CLI signed in", sh("gh", ["api", "user", "--jq", ".login"]).ok, "Install the GitHub CLI (https://cli.github.com) and run `gh auth login`."],
  ];
  if (repo && fs.existsSync(path.join(repo, ".git"))) {
    list.push(["Repo has no uncommitted changes", sh("git", ["status", "--porcelain"], repo).out === "", "Commit or stash your local changes first so the agent starts clean."]);
  }
  let ok = true;
  for (const [label, pass, fix] of list) {
    console.log(`  ${pass ? "✓" : "✕"} ${label}${pass ? "" : `\n      → ${fix}`}`);
    if (!pass) ok = false;
  }
  return ok;
}

console.log("\nBlog agent: checking setup\n");
if (!checks()) { console.log("\nFix the items above, then run again.\n"); process.exit(1); }
if (flag("check")) { console.log("\nAll good. Run again without --check to write a post.\n"); process.exit(0); }

const allowed = ["Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch", "TodoWrite", "Bash(git *)", "Bash(gh pr create *)", "Bash(gh pr view *)", "Bash(npm *)", "Bash(npx *)", "Bash(ls *)"];
const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", "--allowedTools", allowed.join(",")];
if (model) args.push("--model", model);
const prompt = `Read the file ${instructions.replace(/\\/g, "/")} and follow it exactly to write this week's blog post in this repository and open a pull request. Do not merge it.`;

fs.mkdirSync(path.join(HERE, "runs"), { recursive: true });
const logPath = path.join(HERE, "runs", new Date().toISOString().replace(/[:.]/g, "-") + ".jsonl");
const logFile = fs.createWriteStream(logPath);
console.log(`\nWriting this week's post in ${repo}\nFull log: ${logPath}\n`);

const quote = (a) => (/[\s"*(),]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const child = WIN
  ? spawn(["claude", ...args.map(quote)].join(" "), { cwd: repo, shell: true, windowsHide: true })
  : spawn("claude", args, { cwd: repo });
child.stdin.end(prompt);

let buf = "", result = null;
child.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    logFile.write(line + "\n");
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === "assistant") for (const c of ev.message?.content || []) {
      if (c.type === "tool_use") console.log(`  · ${c.name}${c.input?.file_path ? " " + path.relative(repo, c.input.file_path) : c.input?.command ? ": " + String(c.input.command).slice(0, 80) : ""}`);
    }
    if (ev.type === "result") result = ev;
  }
});
child.stderr.on("data", (d) => process.stderr.write(d));
child.on("close", (code) => {
  logFile.end();
  if (result) {
    console.log(`\n${result.is_error ? "✕ Something went wrong" : "✓ Done"}${result.total_cost_usd ? ` · $${result.total_cost_usd.toFixed(2)}` : ""}\n`);
    console.log(String(result.result || "").slice(0, 1500));
  } else console.log(`\nClaude Code exited with code ${code}. See ${logPath}`);
  const pr = sh("gh", ["pr", "list", "--author", "@me", "--state", "open", "--limit", "1", "--json", "url", "--jq", ".[0].url"], repo).out;
  if (pr.startsWith("http")) console.log(`\nReview the post here: ${pr}\n`);
  process.exit(result && !result.is_error ? 0 : 1);
});
