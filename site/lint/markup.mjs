// Checks what oxlint cannot read. The markup of each Astro file is read with Astro's own parser and checked against
// og/markup, and the expressions in it against og/scripts. The markup of each Markdown and MDX doc is read with the
// parser the site renders it with, so fenced and inline code is never checked, and is held to og/markup. Each MDX
// doc is also held to og/content. Every file
// fails og/directive on a comment that would switch a lint rule off, since disable comments must have no effect.
// Prints one line per finding, or a JSON list with --format json. Exits 1 on any finding.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@astrojs/compiler-rs";
import { fromHtml } from "hast-util-from-html";
import { markdownToMdast, mdxToMdast } from "satteri";
import { includedFiles, root } from "./project.mjs";
import { markupVisitors, rawControl, scriptVisitors, styleAttribute, styleValueOk } from "./rules.mjs";

const lineAt = (text, offset) => text.slice(0, offset).split("\n").length;

/** Calls `visit` on every node of an ESTree tree, skipping the subtrees `skip` names. */
function walk(node, visit, skip) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit, skip);
    return;
  }
  if (typeof node.type === "string") {
    if (skip(node)) return;
    visit(node);
  }
  for (const key in node) if (key !== "parent") walk(node[key], visit, skip);
}

/** The markup of an Astro file, without its frontmatter and script blocks, which oxlint checks. */
function astro(file, text, say) {
  const { ast, diagnostics } = parse(text);
  // A file Astro cannot parse fails, so a parse error never hides markup from the check.
  for (const d of diagnostics) if (d.severity === "error") say("og/markup", 1, `Astro could not parse this file. ${d.text} (og/markup)`);
  // The top-level consts of the frontmatter, which the expressions of the markup can read.
  const consts = new Map();
  for (const s of ast.frontmatter?.program?.body ?? []) {
    if (s.type !== "VariableDeclaration" || s.kind !== "const") continue;
    for (const d of s.declarations) if (d.id.type === "Identifier") consts.set(d.id.name, d.init);
  }
  const at = (node) => lineAt(text, node.start);
  const report = (rule) => (node, message) => say(rule, at(node), message);
  const visitors = [
    scriptVisitors({ file, say: report("og/scripts"), constInit: (_, id) => consts.get(id.name) }),
    markupVisitors({ file, say: report("og/markup") }),
  ];
  const skip = (node) => node.type === "AstroFrontmatter" || node.type === "AstroScript";
  walk(ast.body, (node) => visitors.forEach((v) => v[node.type]?.(node)), skip);
}

/** The HTML written in a Markdown doc, outside code. */
function markdown(file, text, say) {
  const visit = (node) => {
    if (node.type === "html") {
      const offset = node.position.start.line - 1;
      const check = (el) => {
        if (el.type === "element") {
          const line = offset + (el.position?.start.line ?? 1);
          const control = rawControl(el.tagName, file);
          if (control) say("og/markup", line, control);
          if (el.properties?.style !== undefined && !styleValueOk({ type: "Literal", value: el.properties.style })) say("og/markup", line, styleAttribute);
        }
        for (const c of el.children ?? []) check(c);
      };
      check(fromHtml(node.value, { fragment: true }));
    }
    for (const c of node.children ?? []) visit(c);
  };
  visit(markdownToMdast(text, { features: { frontmatter: true, gfm: true } }));
}

// Docs prose draws only these components from the frame and only under their original names.
const proseParts = new Set(["Tabs", "TabItem"]);
const frameComponents = "@astrojs/starlight/components";

/** The imports, JSX and style expressions written in an MDX doc, outside code. */
function mdx(file, text, say) {
  const visit = (node) => {
    if (node.type === "mdxjsEsm") {
      const { ast } = parse(`---
${node.value}
---`);
      for (const declaration of ast.frontmatter?.program?.body ?? []) {
        if (declaration.type !== "ImportDeclaration") continue;
        const line = node.position.start.line + lineAt(node.value, declaration.start - 4) - 1;
        const source = declaration.source.value;
        if (source !== frameComponents) {
          say("og/content", line, `An MDX page imports from ${source}. Docs content takes only the frame's ${[...proseParts].join(", ")}, which the docs prose draws through the system`);
          continue;
        }
        for (const specifier of declaration.specifiers) {
          const { imported, local } = specifier;
          if (!proseParts.has(local.name) || imported?.name !== local.name) {
            say("og/content", line, `An MDX page imports ${local.name}, which the docs prose cannot draw. Use ${[...proseParts].join(", ")} or Markdown`);
          }
        }
      }
    }
    if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
      const line = node.position.start.line;
      const control = rawControl(node.name, file);
      if (control) say("og/markup", line, control);
      if (node.name && !proseParts.has(node.name)) {
        if (/^[a-z]/.test(node.name)) say("og/content", line, `An MDX page writes the element <${node.name}>. Write Markdown, so the docs prose draws it through the system`);
        else say("og/content", line, `An MDX page uses <${node.name}>, which the docs prose cannot draw. Use ${[...proseParts].join(", ")} or Markdown`);
      }
      for (const a of node.attributes ?? []) {
        if (a.type !== "mdxJsxAttribute") continue;
        if (["style", "class", "className"].includes(a.name)) say("og/content", line, `An MDX page sets a look on <${node.name}> with an attribute. Style lives in the system's components`);
        if (a.name !== "style") continue;
        let value = { type: "Literal", value: a.value ?? "" };
        if (typeof a.value === "object" && a.value !== null) {
          const el = parse(`<p style={${a.value.value}} />`).ast.body[0];
          value = el?.openingElement?.attributes?.[0]?.value;
        }
        if (!styleValueOk(value)) say("og/markup", line, styleAttribute);
      }
    }
    for (const c of node.children ?? []) visit(c);
  };
  visit(mdxToMdast(text, { features: { frontmatter: true, gfm: true } }));
}

const directive = /\b(?:oxlint|eslint)-disable\b/g;

/** The findings for every included file, as { rule, file, line, message }. */
export function check(files = includedFiles()) {
  const out = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    const say = (rule, line, message) => out.push({ rule, file, line, message });
    for (const m of text.matchAll(directive)) {
      say("og/directive", lineAt(text, m.index), `${m[0]} would switch a lint rule off. Disable comments have no effect, so fix the finding instead (og/directive)`);
    }
    if (file.endsWith(".astro")) astro(file, text, say);
    else if (file.endsWith(".md")) markdown(file, text, say);
    else if (file.endsWith(".mdx")) mdx(file, text, say);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = check();
  if (process.argv.includes("--format") && process.argv[process.argv.indexOf("--format") + 1] === "json") {
    process.stdout.write(JSON.stringify(found));
  } else {
    for (const f of found) console.log(`${f.file}:${f.line} ${f.message}`);
    console.log(`markup: ${found.length} finding${found.length === 1 ? "" : "s"}`);
  }
  process.exit(found.length === 0 ? 0 : 1);
}
