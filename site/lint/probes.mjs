// Lints each probe on its own, in a copy of the site, and checks the probe's rule finds something new.
// Prints one failing rule per probe. Exits 1 if any probe passes the lint, so a rule that stops working fails here.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  for (const part of ["src", "lint", "stylelint.config.mjs", "eslint.config.mjs", "package.json", "tsconfig.json"]) {
    cpSync(join(root, part), join(work, part), { recursive: true });
  }
  symlinkSync(join(root, "node_modules"), join(work, "node_modules"));

  const findings = (which) => {
    const out = new Set();
    const { style, script } = commands({ style: ["--formatter", "json"], script: ["--format", "json"] });
    if (which !== "script") {
      const r = spawnSync(style[0], style[1], { cwd: work, encoding: "utf8" });
      for (const f of JSON.parse(r.stderr || r.stdout || "[]")) for (const w of f.warnings) out.add(`${w.rule}|${f.source.replace(work, "")}|${w.text}`);
    }
    if (which !== "style") {
      const r = spawnSync(script[0], script[1], { cwd: work, encoding: "utf8" });
      for (const f of JSON.parse(r.stdout || "[]")) for (const m of f.messages) out.add(`${m.ruleId}|${f.filePath.replace(work, "")}|${m.message}`);
    }
    return out;
  };

  const standing = findings("both");
  const originals = new Map();
  const edit = (file, fn) => {
    const path = join(work, file);
    if (!originals.has(file)) originals.set(file, readFileSync(path, "utf8"));
    const before = readFileSync(path, "utf8");
    const after = fn(before);
    if (after === before) throw new Error(`probe edit did not apply to ${file}`);
    writeFileSync(path, after);
  };
  const apply = (e, text) =>
    edit(e.file, (s) => {
      if (e.remove) return s.replace(text, "");
      if (e.replace) return s.replace(e.replace, text);
      const at = s.indexOf(e.after);
      return at === -1 ? s : s.slice(0, at + e.after.length) + text + s.slice(at + e.after.length);
    });

  let passed = 0;
  const covered = new Set();
  for (const p of probes) {
    apply(p.head, p.body);
    for (const extra of p.head.also ?? []) apply(extra, extra.text);
    const which = /og\/(scripts|markup)/.test(p.head.rule) ? "script" : "style";
    const fresh = [...findings(which)].filter((f) => !standing.has(f));
    const hit = fresh.filter((f) => f.startsWith(`${p.head.rule}|`));
    if (hit.length > 0) {
      covered.add(p.head.rule);
      console.log(`${p.name}: fails ${p.head.rule}. ${hit[0].split("|")[2]}`);
    } else {
      passed++;
      console.log(`${p.name}: PASSES the lint. Expected ${p.head.rule}. New findings: ${fresh.join("; ") || "none"}`);
    }
    for (const [file, text] of originals) writeFileSync(join(work, file), text);
    originals.clear();
  }
  console.log(`${probes.length} probes, ${probes.length - passed} fail the lint as they should, rules covered ${covered.size}: ${[...covered].sort().join(", ")}`);
  process.exitCode = passed === 0 ? 0 : 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
