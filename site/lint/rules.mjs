// Script and markup rules 11 and 12 of the design system, as visitors over an ESTree tree. oxlint runs the script rule
// over script files and the frontmatter and script blocks of Astro files. lint/markup.mjs runs both rules over the
// markup of Astro files and the markup rule over the docs. Each message names what to use instead.

const colourLiteral = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(/i;
const timers = new Set(["setTimeout", "setInterval"]);
const waits = new Set(["wait", "sleep", "delay", "pause"]);
// Methods of a style declaration that only read it.
const styleReads = new Set(["getPropertyValue", "getPropertyPriority", "item"]);
const landing = (file) => /(^|\/)src\/components\/landing\//.test(file);
const ui = (file) => /(^|\/)src\/components\/ui\//.test(file);
const SHOW_LIMIT = 6;

const nameOf = (callee) => (callee.type === "Identifier" ? callee.name : callee.type === "MemberExpression" && !callee.computed ? callee.property.name : undefined);
const isStyle = (node) => node?.type === "MemberExpression" && !node.computed && node.property.name === "style";

/**
 * The number a timing argument comes to, when it is written in this file, with the object it came through.
 * `constInit(node, id)` gives the initialiser of the const that `id` names where `node` sits, if there is one.
 * A sum or product is written through an object only when every part that holds a number is, so `SHOW.pause + 900`
 * counts as a number written in the file.
 */
function numberIn(constInit, node) {
  if (!node) return undefined;
  if (node.type === "Literal" && typeof node.value === "number") return { via: undefined };
  if (node.type === "UnaryExpression" && node.argument.type === "Literal") return { via: undefined };
  if (node.type === "Identifier") {
    const init = constInit(node, node);
    return init ? numberIn(constInit, init) : undefined;
  }
  if (node.type === "MemberExpression" && node.object.type === "Identifier" && !node.computed) {
    const init = constInit(node, node.object);
    if (init?.type !== "ObjectExpression") return undefined;
    const prop = init.properties.find((p) => p.type === "Property" && (p.key.name ?? p.key.value) === node.property.name);
    return prop && numberIn(constInit, prop.value) ? { via: node.object.name } : undefined;
  }
  if (node.type === "BinaryExpression") {
    const left = numberIn(constInit, node.left);
    const right = numberIn(constInit, node.right);
    if (!left || !right) return left ?? right;
    return left.via === right.via ? left : { via: undefined };
  }
  return undefined;
}

/** The visitors of og/scripts. `say(node, message)` reports a finding. */
export function scriptVisitors({ file, say, constInit }) {
  const report = (node, message) => say(node, `${message} (og/scripts)`);
  const timing = (arg, what) => {
    const n = numberIn(constInit, arg);
    if (!n) return;
    if (n.via === "SHOW" && landing(file)) return;
    report(arg, `${what} takes a number written in this file. Take the timing from src/lib/motion.ts`);
  };
  const text = (node, value) => {
    if (colourLiteral.test(value)) report(node, "A colour written in a script. Read a colour role instead");
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
      if (l.type === "MemberExpression" && (isStyle(l.object) || isStyle(l))) {
        report(node, "A write to .style. Set data attributes and style them, or setProperty(\"--value\", n) for data");
      }
    },
    CallExpression(node) {
      const name = nameOf(node.callee);
      const callee = node.callee;
      if (callee.type === "MemberExpression" && isStyle(callee.object) && !styleReads.has(name)) {
        const first = node.arguments[0];
        if (!(name === "setProperty" && first?.type === "Literal" && first.value === "--value")) {
          report(node, "A write to .style. Only setProperty(\"--value\", n) is allowed");
        }
      }
      if (name === "setAttribute" && node.arguments[0]?.type === "Literal" && node.arguments[0].value === "style") {
        report(node, "A style attribute set from a script. Set data attributes and style them");
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
      if (!landing(file)) report(node, "SHOW frame timings are allowed only under src/components/landing/");
      else if (node.init?.type === "ObjectExpression" && node.init.properties.length > SHOW_LIMIT) {
        report(node, `SHOW has ${node.init.properties.length} entries and may have at most ${SHOW_LIMIT}`);
      }
    },
  };
}

const controls = new Set(["button", "input", "textarea", "select"]);
const valueOnly = /^\s*--value\s*:\s*[^;]+;?\s*$/;

/** The message for a raw control written in a file, or undefined when the tag is not one or the file may use it. */
export function rawControl(tag, file) {
  if (!controls.has(tag) || ui(file)) return undefined;
  return `A raw <${tag}>. Use the ${tag === "button" ? "Button" : tag === "select" ? "Menu" : "Input"} component from src/components/ui/ (og/markup)`;
}

export const styleAttribute = "A style attribute may carry only --value. Style through classes and data attributes (og/markup)";

/** Whether a style attribute's value, as an ESTree JSX attribute value, carries only --value. */
export function styleValueOk(v) {
  return (
    (v?.type === "Literal" && valueOnly.test(String(v.value))) ||
    (v?.type === "JSXExpressionContainer" && v.expression.type === "TemplateLiteral" && valueOnly.test(v.expression.quasis.map((q) => q.value.cooked).join("0")))
  );
}

/** The visitors of og/markup over JSX elements. */
export function markupVisitors({ file, say }) {
  return {
    JSXOpeningElement(node) {
      const tag = node.name.type === "JSXIdentifier" ? node.name.name : undefined;
      const control = rawControl(tag, file);
      if (control) say(node, control);
      for (const attr of node.attributes) {
        if (attr.type !== "JSXAttribute" || attr.name.name !== "style") continue;
        if (!styleValueOk(attr.value)) say(attr, styleAttribute);
      }
    },
  };
}
