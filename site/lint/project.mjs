// What the lint knows about the site: the files it checks, the token files, the budget and who reads what.
// Every rule reads the project through here, so the token files are read like any other file.
import { globSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import ts from "typescript";

export const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** The files the lint checks, relative to site/. */
export const include = ["src/**"];

export const tokenDir = "src/styles/tokens/";
export const tokenFiles = ["primitives.css", "roles.css", "components.css", "host.css"].map((f) => tokenDir + f);
export const primitivesFile = tokenDir + "primitives.css";
export const hostFile = tokenDir + "host.css";
export const systemFiles = (file) => file === "src/pages/system.astro" || file.startsWith("src/components/system/");

export const rel = (file) => relative(root, file).split("\\").join("/");
export const isTokenFile = (file) => tokenFiles.includes(file);

export const budget = JSON.parse(readFileSync(join(root, "lint/budget.json"), "utf8"));
export const groups = Object.entries(budget.groups).map(([name, g]) => ({ name, ...g, re: new RegExp(g.pattern) }));

/** Every file the include list covers, as paths relative to site/. */
export function includedFiles() {
  const out = new Set();
  for (const pattern of include) {
    for (const f of globSync(pattern, { cwd: root })) {
      if (/\.(css|astro|ts|mjs|js)$/.test(f)) out.add(f.split("\\").join("/"));
    }
  }
  return [...out].sort();
}

/** The style text of a file: the whole of a CSS file, or the style blocks of an Astro file. */
export function styleOf(file, text = readFileSync(join(root, file), "utf8")) {
  if (file.endsWith(".css")) return text;
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
}

/** The script text of a file: frontmatter and script blocks of an Astro file, or a whole script file. */
export function scriptOf(file, text = readFileSync(join(root, file), "utf8")) {
  if (/\.(ts|mjs|js)$/.test(file)) return text;
  if (!file.endsWith(".astro")) return "";
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  return [front, ...[...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])].join("\n");
}

/** Every token name the token files define. */
export function definedNames() {
  return tokenFiles.flatMap((f) => [...readFileSync(join(root, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
}

export function groupOf(name) {
  return groups.find((g) => g.re.test(name));
}

/** Every var() read in a file, from the declarations of its style and the strings of its scripts. A name in a
    comment is not a read, so it never counts as a reader. */
export function readsIn(file) {
  const text = readFileSync(join(root, file), "utf8");
  const names = new Set();
  const style = styleOf(file, text);
  if (style.trim()) {
    postcss.parse(style).walkDecls((d) => {
      for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) names.add(m[1]);
    });
  }
  const script = scriptOf(file, text);
  if (script.trim()) {
    const visit = (node) => {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /^--[\w-]+$/.test(node.text)) names.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile(file, script, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS));
  }
  return names;
}

/** For each token, the included files that read it. */
export function readers() {
  const map = new Map();
  for (const file of includedFiles()) {
    for (const name of readsIn(file)) {
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(file);
    }
  }
  return map;
}

/** The variables the docs frame reads, from the frame's own styles and components. */
let frameReads;
export function frameVariables() {
  if (frameReads) return frameReads;
  frameReads = new Set();
  const base = join(root, "node_modules/@astrojs/starlight/dist");
  for (const f of globSync("**/*.{css,astro,js}", { cwd: base })) {
    for (const m of readFileSync(join(base, f), "utf8").matchAll(/var\(\s*(--sl-[\w-]+)/g)) frameReads.add(m[1]);
  }
  return frameReads;
}

/** Class names our own markup gives out, so a selector can only reach markup we wrote. */
let owned;
export function ownedClasses() {
  if (owned) return owned;
  owned = new Set();
  for (const f of globSync("src/**/*.{astro,ts}", { cwd: root })) {
    const text = readFileSync(join(root, f), "utf8");
    const add = (s) => s.split(/\s+/).filter(Boolean).forEach((c) => owned.add(c));
    for (const m of text.matchAll(/\bclass="([^"]*)"/g)) add(m[1]);
    for (const m of text.matchAll(/\bclass:\s*"([^"]*)"/g)) add(m[1]);
    for (const m of text.matchAll(/class:list=\{\[([^\]]*)\]/g)) for (const s of m[1].matchAll(/"([^"]*)"/g)) add(s[1]);
  }
  return owned;
}
