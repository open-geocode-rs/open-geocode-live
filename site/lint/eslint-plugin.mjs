// Script and markup rules 11 and 12 of the design system, and the content rule for docs written in MDX. Each message
// names what to use instead.

const colourLiteral = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(/i;
const timers = new Set(["setTimeout", "setInterval"]);
const waits = new Set(["wait", "sleep", "delay", "pause"]);
const landing = (file) => /(^|\/)src\/components\/landing\//.test(file);
const ui = (file) => /(^|\/)src\/components\/ui\//.test(file);
const SHOW_LIMIT = 6;

const nameOf = (callee) => (callee.type === "Identifier" ? callee.name : callee.type === "MemberExpression" && !callee.computed ? callee.property.name : undefined);

function constInit(context, node, id) {
  let scope = context.sourceCode.getScope(node);
  while (scope) {
    const v = scope.set.get(id.name);
    if (v) {
      const def = v.defs[0];
      return def?.type === "Variable" && def.parent.kind === "const" ? def.node.init : undefined;
    }
    scope = scope.upper;
  }
  return undefined;
}

/** The number a timing argument comes to, when it is written in this file, with the object it came through. */
function numberIn(context, node) {
  if (!node) return undefined;
  if (node.type === "Literal" && typeof node.value === "number") return { via: undefined };
  if (node.type === "UnaryExpression" && node.argument.type === "Literal") return { via: undefined };
  if (node.type === "Identifier") {
    const init = constInit(context, node, node);
    return init ? numberIn(context, init) : undefined;
  }
  if (node.type === "MemberExpression" && node.object.type === "Identifier" && !node.computed) {
    const init = constInit(context, node, node.object);
    if (init?.type !== "ObjectExpression") return undefined;
    const prop = init.properties.find((p) => p.type === "Property" && (p.key.name ?? p.key.value) === node.property.name);
    return prop && numberIn(context, prop.value) ? { via: node.object.name } : undefined;
  }
  if (node.type === "BinaryExpression") return numberIn(context, node.left) ?? numberIn(context, node.right);
  return undefined;
}

const scripts = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const file = context.filename.split("\\").join("/");
    const say = (node, message) => context.report({ node, message: `${message} (og/scripts)` });
    const timing = (arg, what) => {
      const n = numberIn(context, arg);
      if (!n) return;
      if (n.via === "SHOW" && landing(file)) return;
      say(arg, `${what} takes a number written in this file. Take the timing from src/lib/motion.ts`);
    };
    const text = (node, value) => {
      if (colourLiteral.test(value)) say(node, "A colour written in a script. Read a colour role instead");
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") text(node, node.value);
      },
      TemplateElement(node) {
        text(node, node.value.cooked ?? "");
      },
      AssignmentExpression(node) {
        const l = node.left;
        if (l.type === "MemberExpression" && ((l.object.type === "MemberExpression" && l.object.property.name === "style") || l.property.name === "style")) {
          say(node, "A write to .style. Set data attributes and style them, or setProperty(\"--value\", n) for data");
        }
      },
      CallExpression(node) {
        const name = nameOf(node.callee);
        const callee = node.callee;
        if (callee.type === "MemberExpression" && callee.object.type === "MemberExpression" && callee.object.property.name === "style") {
          const first = node.arguments[0];
          if (!(name === "setProperty" && first?.type === "Literal" && first.value === "--value")) {
            say(node, "A write to .style. Only setProperty(\"--value\", n) is allowed");
          }
        }
        if (name === "setAttribute" && node.arguments[0]?.type === "Literal" && node.arguments[0].value === "style") {
          say(node, "A style attribute set from a script. Set data attributes and style them");
        }
        if (timers.has(name)) timing(node.arguments[1], name);
        if (waits.has(name)) timing(node.arguments[0], name);
        if (name === "animate") {
          const opts = node.arguments[1];
          if (opts?.type === "ObjectExpression") {
            for (const p of opts.properties) if (p.type === "Property" && ["duration", "delay", "endDelay"].includes(p.key.name)) timing(p.value, "animate");
          } else timing(opts, "animate");
        }
      },
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier" || node.id.name !== "SHOW") return;
        if (!landing(file)) say(node, "SHOW frame timings are allowed only under src/components/landing/");
        else if (node.init?.type === "ObjectExpression" && node.init.properties.length > SHOW_LIMIT) {
          say(node, `SHOW has ${node.init.properties.length} entries and may have at most ${SHOW_LIMIT}`);
        }
      },
    };
  },
};

const controls = new Set(["button", "input", "textarea", "select"]);
const valueOnly = /^\s*--value\s*:\s*[^;]+;?\s*$/;

const markup = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const file = context.filename.split("\\").join("/");
    const say = (node, message) => context.report({ node, message: `${message} (og/markup)` });
    return {
      JSXOpeningElement(node) {
        const tag = node.name.type === "JSXIdentifier" ? node.name.name : undefined;
        if (controls.has(tag) && !ui(file)) say(node, `A raw <${tag}>. Use the ${tag === "button" ? "Button" : tag === "select" ? "Menu" : "Input"} component from src/components/ui/`);
        for (const attr of node.attributes) {
          if (attr.type !== "JSXAttribute" || attr.name.name !== "style") continue;
          const v = attr.value;
          const ok =
            (v?.type === "Literal" && valueOnly.test(String(v.value))) ||
            (v?.type === "JSXExpressionContainer" &&
              v.expression.type === "TemplateLiteral" &&
              valueOnly.test(v.expression.quasis.map((q) => q.value.cooked).join("0")));
          if (!ok) say(attr, "A style attribute may carry only --value. Style through classes and data attributes");
        }
      },
    };
  },
};

const offsets = new Map();

// Lints each client script of an Astro file as its own block, with lines mapped back to the file.
const astroScripts = {
  meta: { name: "astro-scripts" },
  preprocess(text, filename) {
    const blocks = [text];
    const lines = [0];
    offsets.set(filename, lines);
    for (const m of text.matchAll(/(<script[^>]*>)([\s\S]*?)<\/script>/g)) {
      const start = m.index + m[1].length;
      lines.push(text.slice(0, start).split("\n").length - 1);
      blocks.push({ text: m[2], filename: `${lines.length - 1}.ts` });
    }
    return blocks;
  },
  postprocess(messages, filename) {
    const lines = offsets.get(filename) ?? [0];
    offsets.delete(filename);
    return messages.flatMap((list, i) => list.map((m) => (i === 0 ? m : { ...m, line: m.line + lines[i], endLine: m.endLine && m.endLine + lines[i] })));
  },
  supportsAutofix: false,
};

// An MDX page is docs content. The docs prose reads the frame's rendered markup and draws each part through the
// system, so a page may use only the parts it knows how to draw, and no markup of its own that sets a look.
// The parts it draws, by the name a page imports them under from the frame's components.
const proseParts = new Set(["Tabs", "TabItem"]);
const frameComponents = "@astrojs/starlight/components";

/** Parses an MDX page to an empty program, so the content rule can read its text. */
export const mdxParser = {
  meta: { name: "og-mdx" },
  parseForESLint(text) {
    const lines = text.split("\n");
    const end = { line: lines.length, column: lines.at(-1).length };
    const ast = { type: "Program", body: [], sourceType: "module", range: [0, text.length], loc: { start: { line: 1, column: 0 }, end }, tokens: [], comments: [] };
    return { ast, visitorKeys: { Program: [] } };
  },
};

const content = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      Program(node) {
        const text = context.sourceCode.text;
        const at = (index) => context.sourceCode.getLocFromIndex(index);
        const say = (index, message) => context.report({ node, loc: at(index), message });
        // Code blocks are content, so what they show is not checked.
        const prose = text.replace(/^(```|~~~)[\s\S]*?^\1/gm, (block) => block.replace(/[^\n]/g, " "));
        for (const m of prose.matchAll(/^import\s+(.+?)\s+from\s+["']([^"']+)["'];?\s*$/gm)) {
          if (m[2] !== frameComponents) {
            say(m.index, `An MDX page imports from ${m[2]}. Docs content takes only the frame's ${[...proseParts].join(", ")}, which the docs prose draws through the system`);
            continue;
          }
          const names = m[1].replace(/[{}]/g, "").split(",").map((n) => n.trim()).filter(Boolean);
          for (const n of names) if (!proseParts.has(n)) say(m.index, `An MDX page imports ${n}, which the docs prose cannot draw. Use ${[...proseParts].join(", ")} or Markdown`);
        }
        for (const m of prose.matchAll(/<([A-Za-z][\w.]*)([^>]*)>/g)) {
          const [, tag, attrs] = m;
          if (/^[A-Z]/.test(tag) && !proseParts.has(tag)) say(m.index, `An MDX page uses <${tag}>, which the docs prose cannot draw. Use ${[...proseParts].join(", ")} or Markdown`);
          if (/^[a-z]/.test(tag)) say(m.index, `An MDX page writes the element <${tag}>. Write Markdown, so the docs prose draws it through the system`);
          if (/\b(style|class|className)\s*=/.test(attrs)) say(m.index, `An MDX page sets a look on <${tag}> with an attribute. Style lives in the system's components`);
        }
      },
    };
  },
};

export default {
  meta: { name: "og" },
  rules: { scripts, markup, content },
  processors: { "astro-scripts": astroScripts },
};
