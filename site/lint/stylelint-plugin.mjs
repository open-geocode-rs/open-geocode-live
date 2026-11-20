// Style rules 1 to 10 of the design system. Each message names what to use instead.
import selectorParser from "postcss-selector-parser";
import valueParser from "postcss-value-parser";
import stylelint from "stylelint";
import {
  budget,
  frameVariables,
  groupOf,
  groups,
  hostFile,
  isTokenFile,
  ownedClasses,
  primitivesFile,
  readers,
  rel,
  systemFiles,
  tokenFiles,
} from "./project.mjs";

const {
  createPlugin,
  utils: { report, ruleMessages },
} = stylelint;

const fileOf = (root, result) => rel(root.source?.input.file ?? result.opts.from ?? "");

function rule(name, check) {
  const ruleName = `og/${name}`;
  const messages = ruleMessages(ruleName, { found: (m) => m });
  const fn = () => (root, result) => {
    const file = fileOf(root, result);
    const say = (node, message) => report({ ruleName, result, node, message: `${message} (${ruleName})` });
    check({ root, file, say });
  };
  fn.ruleName = ruleName;
  fn.messages = messages;
  return createPlugin(ruleName, fn);
}

// Raw literals: a colour written out, or a number that is not 0 or 1.
const colourWords = new Set(["white", "black", "red", "green", "blue", "gray", "grey", "orange", "yellow", "purple", "pink", "silver", "navy", "teal", "maroon", "olive", "lime", "aqua", "fuchsia"]);
const colourFns = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/i;

function literalsIn(value, { insideMath = true } = {}) {
  const found = [];
  const walk = (nodes, inMath) => {
    for (const n of nodes) {
      if (n.type === "function") {
        if (n.value === "var") continue;
        if (colourFns.test(n.value)) {
          found.push(valueParser.stringify(n));
          continue;
        }
        const math = /^(calc|min|max)$/.test(n.value);
        if (math && !insideMath) continue;
        if (n.value === "steps") continue;
        walk(n.nodes, inMath || math);
      } else if (n.type === "word") {
        if (/^#[0-9a-f]{3,8}$/i.test(n.value)) found.push(n.value);
        else if (colourWords.has(n.value.toLowerCase())) found.push(n.value);
        else {
          const unit = valueParser.unit(n.value);
          if (unit && unit.number !== "" && !(Number(unit.number) === 0 && unit.unit === "")) {
            found.push(n.value);
          }
        }
      }
    }
  };
  walk(valueParser(value).nodes, false);
  return found;
}

// Rule 1. Every token name falls in a group, each group holds its budgeted count, and no token is made elsewhere.
const budgetRule = rule("budget", ({ root, file, say }) => {
  if (!isTokenFile(file)) {
    root.walkDecls(/^--/, (d) => {
      if (d.prop !== "--value") say(d, `${d.prop} makes a token outside the token files. Use an existing token`);
    });
    return;
  }
  const name = file.slice(file.lastIndexOf("/") + 1);
  const seen = new Map();
  root.walkDecls(/^--/, (d) => {
    const g = groupOf(d.prop);
    if (!g) say(d, `${d.prop} fits no group in lint/budget.json. Use a token of an existing group`);
    else if (g.file !== name) say(d, `${d.prop} belongs to group ${g.name}, which lives in ${g.file}`);
    else if (!seen.has(d.prop)) seen.set(d.prop, g.name);
  });
  for (const g of groups.filter((x) => x.file === name)) {
    const count = [...seen.values()].filter((x) => x === g.name).length;
    if (count !== g.count) say(root, `group ${g.name} has ${count} tokens and lint/budget.json allows exactly ${g.count}`);
  }
});

// Rule 2. Raw literals only in primitives.css.
const rawLiteralRule = rule("raw-literal", ({ root, file, say }) => {
  if (!isTokenFile(file) || file === primitivesFile) return;
  root.walkDecls(/^--/, (d) => {
    for (const lit of literalsIn(d.value)) say(d, `${d.prop} holds the raw value ${lit}. Raw values live only in primitives.css`);
  });
});

// Rule 3. Raw material is read only by the token files, and a component group only by its one component.
const privateRule = rule("private-token", ({ root, file, say }) => {
  if (isTokenFile(file)) return;
  root.walkDecls((d) => {
    for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) {
      const g = groupOf(m[1]);
      if (g?.kind === "raw") say(d, `${m[1]} is raw material, read only by the token files. Use a role or a scale`);
      if (g?.kind === "component" && g.reader !== file) say(d, `${m[1]} belongs to ${g.reader}. Use a role or a scale`);
    }
  });
});

// Rule 4. A property takes only its own kind of token.
const space = ["space", "layout"];
const size = ["control", "icon", "container", "layout", "space"];
const colour = ["color", "own"];
const widths = ["border"];
const table = [
  [/^font$/, ["type"]],
  [/^letter-spacing$/, ["tracking"]],
  [/^(margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left|scroll-margin|scroll-padding|outline-offset|translate|text-underline-offset)(-|$)/, space],
  [/^((min-|max-)?(width|height|inline-size|block-size)|flex-basis|flex|grid-template-columns|grid-template-rows|grid-auto-columns|grid-auto-rows)$/, size],
  [/^border(-[a-z]+)*-radius$/, ["radius"]],
  [/^(border|outline)(-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end))?$/, [...widths, ...colour]],
  [/^(border(-[a-z]+)*-width|outline-width|stroke-width|text-decoration-thickness)$/, widths],
  [/^box-shadow$/, ["shadow", "own"]],
  [/^(color|background|background-color|border(-[a-z]+)*-color|outline-color|fill|stroke|text-decoration-color|caret-color|accent-color)$/, colour],
  [/^(transition|animation)$/, ["duration", "ease"]],
  [/^(transition|animation)-(duration|delay)$/, ["duration"]],
  [/^(transition|animation)-timing-function$/, ["ease"]],
  [/^z-index$/, ["z"]],
  [/^opacity$/, ["opacity"]],
  [/^scale$/, ["scale"]],
  [/^transform$/, ["scale", "space", "layout"]],
];
const forbidden = /^(font-size|line-height|font-weight|font-family)$/;

function familyOf(name, file) {
  if (name === "--value") return "value";
  if (name.startsWith("--tracking-")) return "tracking";
  const g = groupOf(name);
  if (!g) return "unknown";
  if (g.kind === "component") return g.reader === file ? "own" : `group ${g.name}`;
  if (g.kind === "role") return g.name;
  return g.name;
}

const kindRule = rule("token-kind", ({ root, file, say }) => {
  if (isTokenFile(file)) return;
  root.walkDecls((d) => {
    if (d.prop.startsWith("--")) return;
    if (forbidden.test(d.prop)) {
      say(d, `${d.prop} is set only by a type role. Write font: var(--type-…)`);
      return;
    }
    const names = [...d.value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
    if (names.length === 0) return;
    const allowed = table.find(([re]) => re.test(d.prop))?.[1];
    for (const n of names) {
      const fam = familyOf(n, file);
      if (fam === "value" && allowed === size) continue;
      if (!allowed) say(d, `${d.prop} takes no token, but reads ${n}`);
      else if (!allowed.includes(fam)) say(d, `${d.prop} takes ${allowed.map((a) => (a === "own" ? "its component's own group" : `--${a}-*`)).join(", ")}, not ${n}`);
    }
  });
});

// Rule 5. Every token is read, and every scale and role from at least two files outside the token files and the system page.
const unreadRule = rule("unread-token", ({ root, file, say }) => {
  if (!isTokenFile(file)) return;
  const who = readers();
  const frame = frameVariables();
  const seen = new Set();
  root.walkDecls(/^--/, (d) => {
    if (seen.has(d.prop)) return;
    seen.add(d.prop);
    const g = groupOf(d.prop);
    if (g?.kind === "host") {
      if (!frame.has(d.prop)) say(d, `${d.prop} is not read by the docs frame. Remove it`);
      return;
    }
    const files = [...(who.get(d.prop) ?? [])].filter((f) => f !== file);
    if (files.length === 0) {
      say(d, `${d.prop} is read by no file`);
      return;
    }
    if (g?.kind === "scale" || g?.kind === "role") {
      const users = files.filter((f) => !tokenFiles.includes(f) && !systemFiles(f));
      if (users.length < 2) say(d, `${d.prop} is read by ${users.length} file${users.length === 1 ? "" : "s"} outside the token files and the system page, and needs 2`);
    }
  });
});

// Rule 6. No raw value outside primitives.css.
const unitless1 = /^(flex|flex-grow|flex-shrink|order|opacity)$/;
const percentOk = table.find(([re]) => re.test("width"))[0];
const keywordOnly = /^(content|grid-template-areas|grid-area|quotes|font-feature-settings)$/;
const rawValueRule = rule("raw-value", ({ root, file, say }) => {
  if (file === primitivesFile) return;
  root.walkDecls((d) => {
    if (d.prop.startsWith("--") || keywordOnly.test(d.prop) || d.prop === "rotate") return;
    for (const lit of literalsIn(d.value, { insideMath: false })) {
      const unit = valueParser.unit(lit);
      if (unit && unit.unit === "" && unit.number === "1" && unitless1.test(d.prop)) continue;
      if (unit && unit.unit === "%" && percentOk.test(d.prop)) continue;
      if (unit && unit.unit === "fr") continue;
      // A size may be a whole number of the element's own lines, or the full height of the window.
      if (unit && unit.unit === "lh" && Number.isInteger(Number(unit.number)) && percentOk.test(d.prop)) continue;
      if ((lit === "100vh" || lit === "100dvh") && percentOk.test(d.prop)) continue;
      say(d, `${d.prop} holds the raw value ${lit}. Use a token`);
    }
  });
});

// Rule 7. Media widths come from the breakpoints in lint/budget.json, in the min-width form.
const mediaRule = rule("media-width", ({ root, say }) => {
  root.walkAtRules("media", (a) => {
    for (const m of a.params.matchAll(/\(\s*([a-z-]+)\s*:\s*([^)]+)\)/g)) {
      const [, feature, value] = m;
      if (!/width|height/.test(feature)) continue;
      if (feature !== "min-width") say(a, `@media uses ${feature}. Use (min-width: …) with ${budget.breakpoints.join(", ")}`);
      else if (!budget.breakpoints.includes(value.trim())) say(a, `@media width ${value.trim()} is not a breakpoint. Use ${budget.breakpoints.join(", ")}`);
    }
  });
});

// Rule 8. calc(), min() and max() hold only tokens, 100%, 100vw, 100vh, 100dvh and the multiplier -1,
// and in a size, the percentages rule 6 allows there.
// primitives.css is where raw values live, so its arithmetic is raw material too, and rule 1 closes that file.
const calcRule = rule("calc", ({ root, file, say }) => {
  if (file === primitivesFile) return;
  root.walkDecls((d) => {
    valueParser(d.value).walk((n) => {
      if (n.type !== "function" || !/^(calc|min|max)$/.test(n.value)) return;
      const bad = [];
      const sizePercent = percentOk.test(d.prop);
      const walk = (nodes) => {
        for (const x of nodes) {
          if (x.type === "function" && x.value === "var") continue;
          if (x.type === "function") walk(x.nodes);
          else if (x.type === "word" && !/^(100%|100vw|100vh|100dvh|-1|[-+*/])$/.test(x.value) && !(sizePercent && /^\d+(\.\d+)?%$/.test(x.value))) bad.push(x.value);
        }
      };
      walk(n.nodes);
      for (const b of bad) say(d, `${n.value}() holds ${b}. Only tokens, 100%, 100vw, 100vh, 100dvh and the multiplier -1 may appear`);
      return false;
    });
  });
});

// Rule 9. Selectors and the cascade: no !important, no ids, specificity at most 0,3,0, only our own markup,
// frame variables only in host.css, theme queries only in the token files.
function specificity(selector) {
  let [a, b, c] = [0, 0, 0];
  const visit = (sel) => {
    sel.nodes.forEach((n) => {
      if (n.type === "id") a++;
      else if (n.type === "class" || n.type === "attribute") b++;
      else if (n.type === "tag") c++;
      else if (n.type === "pseudo") {
        if (n.value === ":where") return;
        if ([":is", ":not", ":has", ":global"].includes(n.value)) {
          const best = n.nodes.map((s) => specificity(s)).sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0] ?? [0, 0, 0];
          a += best[0];
          b += best[1];
          c += best[2];
        } else if (n.value.startsWith("::")) c++;
        else b++;
      }
    });
  };
  visit(selector);
  return [a, b, c];
}
const selectorRule = rule("selector", ({ root, file, say }) => {
  const owned = ownedClasses();
  root.walkDecls((d) => {
    if (d.important) say(d, `${d.prop} uses !important. Fix the specificity instead`);
    if (d.prop.startsWith("--sl-") && file !== hostFile) say(d, `${d.prop} is a docs frame variable. Set it only in host.css`);
  });
  root.walkAtRules("media", (a) => {
    if (/prefers-color-scheme/.test(a.params) && !isTokenFile(file)) say(a, "A theme query outside the token files. Use the colour roles");
  });
  root.walkRules((r) => {
    if (r.parent?.type === "atrule" && /keyframes/.test(r.parent.name)) return;
    selectorParser((sels) => {
      sels.each((sel) => {
        const [a, b, c] = specificity(sel);
        if (a > 0) say(r, `${r.selector} uses an id. Use a class`);
        if (a > 0 || b > 3) say(r, `${sel.toString().trim()} has specificity ${a},${b},${c}, above 0,3,0`);
        sel.walk((n) => {
          if (n.type === "class" && !owned.has(n.value)) say(r, `.${n.value} is not a class our markup gives out. Style only markup we own`);
          if (n.type === "attribute" && n.attribute === "data-theme" && !isTokenFile(file)) say(r, `${r.selector} switches on the theme. Use the colour roles`);
        });
      });
    }).processSync(r.selector);
  });
});

// Rule 10. Motion.
const timeProps = /^(transition|animation)(-duration|-delay)?$/;
const motionProps = /^(transform|translate|rotate|scale|inset|top|right|bottom|left|inset-[a-z-]+|margin.*)$/;
const inMedia = (node, re) => {
  for (let p = node.parent; p; p = p.parent) if (p.type === "atrule" && p.name === "media" && re.test(p.params)) return true;
  return false;
};
const motionRule = rule("motion", ({ root, say }) => {
  root.walkDecls((d) => {
    if (/^transition(-property)?$/.test(d.prop) && /(^|[\s,])all([\s,]|$)/.test(d.value)) say(d, "transition: all. Name each property");
    if (/(^|[\s,])ease-in([\s,]|$)/.test(d.value)) say(d, "ease-in on UI. Use var(--ease-out)");
    if (/scale\(\s*0\s*\)/.test(d.value) || (d.prop === "scale" && d.value.trim() === "0")) say(d, "scale(0). Start from var(--scale-press) with opacity 0");
    if (timeProps.test(d.prop)) {
      if (/--duration-feedback/.test(d.value)) say(d, "--duration-feedback is for scripts only. Use another --duration-*");
      const words = valueParser(d.value).nodes.filter((n) => n.type === "word" && /^-?[\d.]+m?s$/.test(n.value));
      for (const w of words) say(d, `${d.prop} holds the time ${w.value}. Use var(--duration-*)`);
    }
    const rule = d.parent;
    if (rule?.type === "rule" && /:hover/.test(rule.selector) && !inMedia(d, /hover:\s*hover/)) {
      say(d, `${rule.selector} styles hover outside @media (hover: hover) and (pointer: fine)`);
    }
  });
  root.walkAtRules(/keyframes$/, (k) => {
    let moves = false;
    k.walkDecls((d) => {
      if (motionProps.test(d.prop)) moves = true;
    });
    if (moves && !inMedia(k, /prefers-reduced-motion:\s*no-preference/)) say(k, `@keyframes ${k.params} moves things. Put it inside @media (prefers-reduced-motion: no-preference)`);
  });
});

/** The rule that needs the pages: rule 5, run on its own as lint:usage. */
export const usage = [unreadRule];

export default [budgetRule, rawLiteralRule, privateRule, kindRule, unreadRule, rawValueRule, mediaRule, calcRule, selectorRule, motionRule];
