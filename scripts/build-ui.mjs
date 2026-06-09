// Build the deployed UI in public/open-geocode/ from the pinned engine submodule
// (open-geocode/demo/), applying the two things this repo overrides: the prod
// config (deploy/web/config.js) and the sub-path <base>. Everything else loads
// from CDN. public/open-geocode/ is gitignored — a build artifact. Run before
// `wrangler deploy`.
//
//   node scripts/build-ui.mjs

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const demo = join(root, "open-geocode", "demo");
const out = join(root, "public", "open-geocode");

if (!existsSync(join(demo, "index.html"))) {
  console.error("engine submodule not initialized — run: git submodule update --init");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
copyDemoTree(demo, out);

// prod config: the gitignored local config.js if present, else the committed
// example template (placeholder values)
const cfgLocal = join(root, "deploy", "web", "config.js");
const cfgExample = join(root, "deploy", "web", "config.example.js");
copyFileSync(existsSync(cfgLocal) ? cfgLocal : cfgExample, join(out, "config.js"));

console.log("Built public/open-geocode/ UI files from the engine submodule + prod config.");

function copyDemoTree(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDemoTree(srcPath, destPath);
      continue;
    }

    if (entry.endsWith(".html")) {
      const src = readFileSync(srcPath, "utf8");
      const html = src.replace('<base href="/" />', '<base href="/open-geocode/" />');
      if (html === src) {
        console.error(`could not set <base> in ${srcPath} — update this script`);
        process.exit(1);
      }
      writeFileSync(destPath, html);
      continue;
    }

    copyFileSync(srcPath, destPath);
  }
}
