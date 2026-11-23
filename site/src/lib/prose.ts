// The docs prose as our own parts. The frame renders a page's Markdown with its own code blocks, asides,
// heading links and tabs. This reads that HTML once at build time and names each of those parts, so the
// prose renders them with our components and every other element stays as written.
import type { Element, ElementContent, RootContent } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";
import { find, html as schema } from "property-information";
import type { Props as CodeBlockProps } from "../components/ui/CodeBlock.astro";

type Language = NonNullable<CodeBlockProps["lang"]>;
const levels = [2, 3, 4, 5, 6] as const;
export type Level = (typeof levels)[number];
export type Tone = "accent" | "success" | "warning" | "danger";
export type Attributes = Record<string, string | true>;

export type ProseNode =
  | { kind: "html"; html: string }
  | { kind: "element"; tag: string; attrs: Attributes; children: ProseNode[] }
  | { kind: "link"; href: string; attrs: Attributes; children: ProseNode[] }
  | { kind: "heading"; level: Level; id: string; label: string; children: ProseNode[] }
  | { kind: "code"; code: string; lang: Language }
  | { kind: "aside"; tone: Tone; title: string; children: ProseNode[] }
  | { kind: "tabs"; id: string; label: string; tabs: { id: string; label: string; children: ProseNode[] }[] };

// The languages the docs use, each to the name our highlighter knows it by. A new one is added here.
const languages: Record<string, Language> = {
  sh: "sh",
  bash: "bash",
  diff: "diff",
  json: "json",
  typescript: "typescript",
  txt: "plaintext",
  text: "plaintext",
};

// Each kind of aside takes the colour role of its job.
const tones: Record<string, Tone> = {
  note: "accent",
  tip: "success",
  caution: "warning",
  danger: "danger",
};

const classes = (el: Element) => {
  const c = el.properties.className;
  return Array.isArray(c) ? c.map(String) : [];
};
const hasClass = (el: Element, name: string) => classes(el).includes(name);
const isElement = (node: RootContent | ElementContent): node is Element => node.type === "element";

function textOf(node: RootContent | ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

function all(root: Element, test: (el: Element) => boolean): Element[] {
  const out: Element[] = [];
  const walk = (el: Element) => {
    for (const child of el.children) {
      if (!isElement(child)) continue;
      if (test(child)) out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}

function first(root: Element, test: (el: Element) => boolean, what: string): Element {
  const found = all(root, test)[0];
  if (!found) throw new Error(`The docs prose found no ${what} where the frame's markup should hold one.`);
  return found;
}

function attributes(el: Element): Attributes {
  const out: Attributes = {};
  for (const [key, value] of Object.entries(el.properties)) {
    if (value === undefined || value === null || value === false) continue;
    const info = find(schema, key);
    out[info.attribute] = value === true ? true : Array.isArray(value) ? value.join(info.commaSeparated ? ", " : " ") : String(value);
  }
  return out;
}

const special = (el: Element) =>
  el.tagName === "a" ||
  el.tagName === "starlight-tabs" ||
  hasClass(el, "expressive-code") ||
  hasClass(el, "starlight-aside") ||
  hasClass(el, "sl-heading-wrapper");

const holdsSpecial = (el: Element): boolean => special(el) || el.children.some((c) => isElement(c) && holdsSpecial(c));

export function proseOf(html: string, { stackTables = false } = {}): ProseNode[] {
  let tabsSeen = 0;

  const code = (el: Element): ProseNode => {
    const pre = first(el, (x) => x.tagName === "pre", "pre in a code block");
    const name = String(pre.properties.dataLanguage ?? "");
    const lang = languages[name];
    if (!lang) throw new Error(`The docs prose has a code block in "${name}". Add it to the languages in src/lib/prose.ts.`);
    // Expressive Code turns diff prefixes into line classes before we rebuild the block.
    const lines = all(pre, (x) => hasClass(x, "ec-line")).map((line) => {
      const text = textOf(line).replace(/\n$/, "");
      if (lang !== "diff") return text;
      if (hasClass(line, "ins")) return "+" + text;
      if (hasClass(line, "del")) return "-" + text;
      return text;
    });
    return { kind: "code", code: lines.join("\n"), lang };
  };

  function labelTable(table: Element) {
    const section = table.children.find((node) => isElement(node) && node.tagName === "thead");
    if (!section || !isElement(section)) return;
    const headers = all(section, (node) => node.tagName === "th").map((node) => textOf(node).trim());
    // Display changes on narrow screens can strip native table roles in Safari.
    table.properties.role = "table";
    table.properties["data-stack-table"] = "";
    for (const group of table.children.filter(isElement)) {
      if (group.tagName !== "thead" && group.tagName !== "tbody") continue;
      group.properties.role = "rowgroup";
      for (const row of group.children.filter(isElement)) {
        if (row.tagName !== "tr") continue;
        row.properties.role = "row";
        row.children.filter(isElement).forEach((cell, index) => {
          if (cell.tagName === "th") {
            cell.properties.role = "columnheader";
            cell.properties.scope = "col";
          } else if (cell.tagName === "td") {
            cell.properties.role = "cell";
            if (index === 0 || !headers[index]) return;
            cell.children.unshift({
              type: "element",
              tagName: "span",
              properties: { "aria-hidden": "true", "data-column-label": "" },
              children: [{ type: "text", value: headers[index] }],
            });
          }
        });
      }
    }
  }

  const aside = (el: Element): ProseNode => {
    const kind = classes(el).find((c) => c.startsWith("starlight-aside--"))?.slice("starlight-aside--".length) ?? "";
    const tone = tones[kind];
    if (!tone) throw new Error(`The docs prose has an aside of kind "${kind}", which takes no colour role.`);
    const title = textOf(first(el, (x) => hasClass(x, "starlight-aside__title"), "aside title")).trim();
    const content = first(el, (x) => hasClass(x, "starlight-aside__content"), "aside content");
    return { kind: "aside", tone, title, children: convert(content.children) };
  };

  const heading = (el: Element): { node: ProseNode; text: string } => {
    const h = el.children.find(isElement);
    const level = levels.find((l) => h?.tagName === `h${l}`);
    if (!h || !level) throw new Error("The docs prose found a heading wrapper with no h2 to h6 in it.");
    const label = textOf(first(el, (x) => hasClass(x, "sr-only"), "heading link label")).trim();
    return {
      node: { kind: "heading", level, id: String(h.properties.id), label, children: convert(h.children) },
      text: textOf(h).trim(),
    };
  };

  const tabs = (el: Element, label: string): ProseNode => {
    const labels = all(el, (x) => x.properties.role === "tab").map((t) => textOf(t).trim());
    const panels = all(el, (x) => x.properties.role === "tabpanel");
    if (labels.length === 0 || labels.length !== panels.length) throw new Error("The docs prose found tabs whose labels and panels do not pair up.");
    tabsSeen += 1;
    return {
      kind: "tabs",
      id: `prose-tabs-${tabsSeen}`,
      label: label || labels.join(", "),
      tabs: panels.map((p, i) => ({ id: `tab-${i + 1}`, label: labels[i], children: convert(p.children) })),
    };
  };

  function convert(nodes: (RootContent | ElementContent)[]): ProseNode[] {
    const out: ProseNode[] = [];
    // Tabs are named after the heading above them.
    let lastHeading = "";
    const push = (node: ProseNode) => {
      const last = out.at(-1);
      if (node.kind === "html" && last?.kind === "html") last.html += node.html;
      else out.push(node);
    };
    for (const node of nodes) {
      if (stackTables && isElement(node) && node.tagName === "table") labelTable(node);
      if (!isElement(node)) {
        push({ kind: "html", html: toHtml(node) });
      } else if (hasClass(node, "expressive-code")) {
        push(code(node));
      } else if (hasClass(node, "starlight-aside")) {
        push(aside(node));
      } else if (hasClass(node, "sl-heading-wrapper")) {
        const h = heading(node);
        lastHeading = h.text;
        push(h.node);
      } else if (node.tagName === "starlight-tabs") {
        push(tabs(node, lastHeading));
      } else if (node.tagName === "a" && typeof node.properties.href === "string") {
        const { href, ...attrs } = attributes(node);
        push({ kind: "link", href: String(href), attrs, children: convert(node.children) });
      } else if (holdsSpecial(node)) {
        push({ kind: "element", tag: node.tagName, attrs: attributes(node), children: convert(node.children) });
      } else {
        push({ kind: "html", html: toHtml(node) });
      }
    }
    return out;
  }

  return convert(fromHtml(html, { fragment: true }).children);
}
