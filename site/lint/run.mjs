// Runs both linters with --max-warnings 0 over the include list in lint/project.mjs, the one list both read.
// With --usage it runs rule 5 alone, every token read.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { include, root } from "./project.mjs";

const expand = (exts) => include.flatMap((p) => (p.endsWith("**") ? exts.map((e) => `${p}/*.${e}`) : [p]));

/** The command line of each linter, run in a site directory. Extra arguments go before the files. */
export function commands(extra = { style: [], script: [] }) {
  const styles = expand(["css", "astro"]).filter((p) => /\.(css|astro)$/.test(p));
  return {
    style: ["node_modules/.bin/stylelint", ["--max-warnings", "0", "--allow-empty-input", ...extra.style, ...styles]],
    usage: ["node_modules/.bin/stylelint", ["--max-warnings", "0", "--allow-empty-input", "--config", "lint/usage.config.mjs", ...extra.style, ...styles]],
    script: ["node_modules/.bin/eslint", ["--max-warnings", "0", "--no-error-on-unmatched-pattern", ...extra.script, ...expand(["astro", "ts", "mjs"])]],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { style, usage, script } = commands();
  const run = ([cmd, args]) => spawnSync(cmd, args, { cwd: root, stdio: "inherit" }).status ?? 1;
  const results = process.argv.includes("--usage") ? [run(usage)] : [run(style), run(script)];
  process.exit(results.every((s) => s === 0) ? 0 : 1);
}
