// Lints each probe on its own, in a copy of the site, and checks the probe's rule finds something new.
// A probe marked "pass" must find nothing new, so a rule that grows to catch what it should allow fails here too.
// Prints one line per probe. Exits 1 if any probe gives the wrong result, so a rule that stops working fails here.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commands } from "./run.mjs";
import { root } from "./project.mjs";

const probeDir = join(root, "lint/probes");
const probes = readdirSync(probeDir)
  .filter((f) => f.endsWith(".probe"))
  .sort()
  .map((name) => {
    const text = readFileSync(join(probeDir, name), "utf8");
    const nl = text.indexOf("\n");
    return { name, head: JSON.parse(text.slice("probe ".length, nl)), body: text.slice(nl + 1) };
  });

const work = mkdtempSync(join(tmpdir(), "og-lint-probes-"));
try {
  for (const part of ["src", "lint", "astro.config.mjs", "stylelint.config.mjs", ".oxlintrc.json", "package.json", "tsconfig.json"]) {
    cpSync(join(root, part), join(work, part), { recursive: true });
  }
  symlinkSync(join(root, "node_modules"), join(work, "node_modules"));

  const findings = (which) => {
    const out = new Set();
    const { style, script, markup } = commands({ style: ["--formatter", "json"], script: ["--format", "json"], markup: ["--format", "json"] });
    if (which === "style" || which === "all") {
      const r = spawnSync(style[0], style[1], { cwd: work, encoding: "utf8" });
      for (const f of JSON.parse(r.stderr || r.stdout || "[]")) for (const w of f.warnings) out.add(`${w.rule}|${f.source.replace(work, "")}|${w.text}`);
    }
    if (which === "script" || which === "all") {
      const r = spawnSync(script[0], script[1], { cwd: work, encoding: "utf8" });
      for (const d of JSON.parse(r.stdout || "{}").diagnostics ?? []) out.add(`${d.code.replace(/^(\w+)\((.+)\)$/, "$1/$2")}|/${d.filename}|${d.message}`);
    }
    if (which === "markup" || which === "script" || which === "all") {
      const r = spawnSync(markup[0], markup[1], { cwd: work, encoding: "utf8" });
      for (const f of JSON.parse(r.stdout || "[]")) out.add(`${f.rule}|/${f.file}|${f.message}`);
    }
    return out;
  };

  const standing = findings("all");
  const originals = new Map();
  const edit = (file, fn) => {
    const path = join(work, file);
    if (!originals.has(file)) originals.set(file, existsSync(path) ? readFileSync(path, "utf8") : undefined);
    const before = existsSync(path) ? readFileSync(path, "utf8") : undefined;
    const after = fn(before);
    if (after === before) throw new Error(`probe edit did not apply to ${file}`);
    writeFileSync(path, after);
  };
  const apply = (e, text) =>
    edit(e.file, (s) => {
      if (e.create) return text;
      if (e.remove) return s.replace(text, "");
      if (e.replace) return s.replace(e.replace, text);
      const at = s.indexOf(e.after);
      return at === -1 ? s : s.slice(0, at + e.after.length) + text + s.slice(at + e.after.length);
    });

  let wrong = 0;
  const covered = new Set();
  for (const p of probes) {
    apply(p.head, p.body);
    for (const extra of p.head.also ?? []) apply(extra, extra.text);
    const which = p.head.rule === "og/scripts" ? "script" : /^og\/(markup|content|directive)$/.test(p.head.rule) ? "markup" : "style";
    const fresh = [...findings(p.head.pass ? "all" : which)].filter((f) => !standing.has(f));
    const hit = fresh.filter((f) => f.startsWith(`${p.head.rule}|`));
    if (p.head.pass) {
      if (fresh.length === 0) console.log(`${p.name}: passes the lint, as it should for ${p.head.rule}`);
      else {
        wrong++;
        console.log(`${p.name}: FAILS the lint. Expected it to pass ${p.head.rule}. New findings: ${fresh.join("; ")}`);
      }
    } else if (hit.length > 0) {
      covered.add(p.head.rule);
      console.log(`${p.name}: fails ${p.head.rule}. ${hit[0].split("|")[2]}`);
    } else {
      wrong++;
      console.log(`${p.name}: PASSES the lint. Expected ${p.head.rule}. New findings: ${fresh.join("; ") || "none"}`);
    }
    for (const [file, text] of originals) text === undefined ? rmSync(join(work, file)) : writeFileSync(join(work, file), text);
    originals.clear();
  }
  console.log(`${probes.length} probes, ${probes.length - wrong} give the result they should, rules covered ${covered.size}: ${[...covered].sort().join(", ")}`);
  process.exitCode = wrong === 0 ? 0 : 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
