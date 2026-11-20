// Runs both linters with --max-warnings 0 over the include list in lint/project.mjs, the one list both read.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { include, root } from "./project.mjs";

const expand = (exts) => include.flatMap((p) => (p.endsWith("**") ? exts.map((e) => `${p}/*.${e}`) : [p]));

/** The command line of each linter, run in a site directory on the runtime that runs this file. Extra arguments go before the files. */
export function commands(extra = { style: [], script: [] }) {
  const styles = expand(["css", "astro"]).filter((p) => /\.(css|astro)$/.test(p));
  const scripts = expand(["astro", "ts", "mjs", "mdx"]).filter((p) => /\.(astro|ts|mjs|mdx)$/.test(p));
  return {
    style: [process.execPath, ["node_modules/stylelint/bin/stylelint.mjs", "--max-warnings", "0", "--allow-empty-input", ...extra.style, ...styles]],
    script: [process.execPath, ["node_modules/eslint/bin/eslint.js", "--max-warnings", "0", "--no-error-on-unmatched-pattern", ...extra.script, ...scripts]],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { style, script } = commands();
  const run = ([cmd, args]) => spawnSync(cmd, args, { cwd: root, stdio: "inherit" }).status ?? 1;
  const results = [run(style), run(script)];
  process.exit(results.every((s) => s === 0) ? 0 : 1);
}
