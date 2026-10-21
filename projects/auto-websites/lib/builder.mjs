// Runs Claude Code headless to build one site, streaming what it's doing.
import fs from "node:fs";
import path from "node:path";
import { WORKSPACE, SITES_DIR, readText } from "./config.mjs";
import { start, run, lines, killTree } from "./proc.mjs";

export function writeBrief(lead, settings) {
  const template = readText("build-instructions.md");
  const vals = { ...lead, extra: settings.extraInstructions ? `Extra instructions from the operator:\n${settings.extraInstructions}` : "" };
  const brief = template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vals[k] ?? ""));
  fs.writeFileSync(path.join(SITES_DIR, lead.slug, "BUILD-INSTRUCTIONS.md"), brief);
}

// Describe a tool call in a few words for the progress feed.
function describe(tool, input = {}) {
  const rel = (p) => (p ? String(p).replace(WORKSPACE, "").replace(/^[\\/]+/, "") : "");
  switch (tool) {
    case "Write": return `Writing ${rel(input.file_path)}`;
    case "Edit": case "MultiEdit": return `Editing ${rel(input.file_path)}`;
    case "Read": return `Reading ${rel(input.file_path)}`;
    case "Bash": return `Running: ${String(input.command || "").slice(0, 90)}`;
    case "Glob": case "Grep": return `Searching ${input.pattern || ""}`;
    case "TodoWrite": return "Planning the build";
    default: return tool.startsWith("mcp__") ? `Using ${tool.split("__").pop()}` : `Using ${tool}`;
  }
}

// Returns { done: Promise<{ok, cost, error}>, stop() }.
export function buildWithClaude(lead, settings, onActivity) {
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"];
  if (settings.model) args.push("--model", settings.model);
  const prompt = `Read the file sites/${lead.slug}/BUILD-INSTRUCTIONS.md and follow it exactly to build the website now.`;
  const child = start("claude", args, { cwd: WORKSPACE, input: prompt });
  const logFile = fs.createWriteStream(path.join(SITES_DIR, lead.slug, "build-log.jsonl"));
  let result = null, stderr = "";

  lines(child.stdout, (line) => {
    logFile.write(line + "\n");
    let ev;
    try { ev = JSON.parse(line); } catch { return; }
    if (ev.type === "assistant") {
      for (const c of ev.message?.content || []) {
        if (c.type === "tool_use") onActivity(describe(c.name, c.input));
        else if (c.type === "text" && c.text.trim()) onActivity(c.text.trim().split("\n")[0].slice(0, 140));
      }
    } else if (ev.type === "result") {
      result = ev;
    }
  });
  child.stderr.on("data", (d) => { stderr += d; });

  const done = new Promise((resolve) => {
    child.on("error", (e) => resolve({ ok: false, error: `Couldn't start Claude Code: ${e.message}` }));
    child.on("close", (code) => {
      logFile.end();
      if (result) resolve({ ok: !result.is_error, cost: result.total_cost_usd, turns: result.num_turns, error: result.is_error ? String(result.result || "Claude reported an error").slice(0, 300) : null });
      else resolve({ ok: false, error: (stderr.trim() || `Claude Code exited with code ${code}`).slice(0, 300) });
    });
  });
  return { done, stop: () => killTree(child) };
}

// Build the site with relative paths so it previews locally and works in a Pages subfolder.
export async function buildPreview(slug, onActivity = () => {}) {
  const dir = path.join(SITES_DIR, slug);
  if (!fs.existsSync(path.join(dir, "package.json"))) return { ok: false, error: "Claude didn't produce a package.json" };
  if (!fs.existsSync(path.join(dir, "node_modules"))) {
    onActivity("Installing dependencies");
    const i = await run("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir });
    if (i.code !== 0) return { ok: false, error: "npm install failed: " + i.out.slice(-300) };
  }
  onActivity("Building the preview");
  const b = await run("npx", ["vite", "build", "--base=./"], { cwd: dir });
  if (b.code !== 0 || !fs.existsSync(path.join(dir, "dist", "index.html"))) return { ok: false, error: "vite build failed: " + b.out.slice(-300) };
  const photos = path.join(dir, "photos");
  if (fs.existsSync(photos) && !fs.existsSync(path.join(dir, "dist", "photos"))) fs.cpSync(photos, path.join(dir, "dist", "photos"), { recursive: true });
  return { ok: true };
}
