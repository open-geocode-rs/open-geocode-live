// Runs the three checks over the include list in lint/project.mjs, the one list all of them read. Stylelint checks
// styles, oxlint checks scripts, and lint/markup.mjs checks the markup oxlint cannot read. Warnings fail as errors.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { include, root } from "./project.mjs";

const expand = (exts) => include.flatMap((p) => (p.endsWith("**") ? exts.map((e) => `${p}/*.${e}`) : [p]));

/** The command line of each check, run in a site directory on the runtime that runs this file. Extra arguments go before the files. */
export function commands(extra = { style: [], script: [], markup: [] }) {
  const styles = expand(["css", "astro"]).filter((p) => /\.(css|astro)$/.test(p));
  // oxlint walks each directory itself and reads every script file in it, and the frontmatter and script blocks of
  // every Astro file.
  const scripts = include.map((p) => p.replace(/\/\*\*$/, ""));
  return {
    style: [process.execPath, ["node_modules/stylelint/bin/stylelint.mjs", "--max-warnings", "0", "--allow-empty-input", ...extra.style, ...styles]],
    script: [process.execPath, ["node_modules/oxlint/bin/oxlint", "-c", ".oxlintrc.json", "--max-warnings", "0", ...extra.script, ...scripts]],
    markup: [process.execPath, ["lint/markup.mjs", ...extra.markup]],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = ([cmd, args]) => spawnSync(cmd, args, { cwd: root, stdio: "inherit" }).status ?? 1;
  const results = Object.values(commands()).map(run);
  process.exit(results.every((s) => s === 0) ? 0 : 1);
}
