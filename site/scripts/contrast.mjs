// Prints every text role against the background and the surface in both themes, read from the token files,
// and every badge's text on its own fill laid over the background and the surface.
// Exits 1 when a text pair is under 4.5 to 1, or the focus outline or a control's edge is under 3 to 1 on the background.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const tokens = new URL("../src/styles/tokens/", import.meta.url);
const read = (name) => readFileSync(fileURLToPath(new URL(name, tokens)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// Declarations per selector list, in file order.
function blocks(css) {
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    const decls = new Map();
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decls.set(d[1], d[2].trim());
    out.push({ selector, decls });
  }
  return out;
}

const all = ["primitives.css", "roles.css", "components.css"].flatMap((f) => blocks(read(f)));

// A page in a theme matches the :root blocks and the blocks for its own wrapper, and later blocks win.
function scope(theme) {
  const vars = new Map();
  for (const b of all) {
    const parts = b.selector.split(",").map((s) => s.trim());
    if (parts.some((p) => p === ":root" || p === "[data-theme]" || p === `[data-theme="${theme}"]`)) {
      for (const [k, v] of b.decls) vars.set(k, v);
    }
  }
  return vars;
}

function resolve(vars, value, seen = new Set()) {
  return value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    if (seen.has(name)) throw new Error(`cycle at ${name}`);
    const v = vars.get(name);
    if (v === undefined) throw new Error(`unknown token ${name}`);
    return resolve(vars, v, new Set([...seen, name]));
  });
}

// A colour as sRGB channels from 0 to 1 and an alpha. It is a hex colour, or a color-mix in srgb of two colours, either
// of which may be transparent or itself a color-mix. A brand step mixes two colours, and a tint mixes one with transparent.
function split(args) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "(") depth++;
    else if (args[i] === ")") depth--;
    else if (args[i] === "," && depth === 0) { parts.push(args.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(args.slice(start).trim());
  return parts;
}

function rgba(value) {
  const v = value.trim();
  if (v === "transparent") return { channels: [0, 0, 0], alpha: 0 };
  const fn = /^color-mix\(([\s\S]*)\)$/i.exec(v);
  if (fn) {
    const [space, ...colours] = split(fn[1]);
    if (space !== "in srgb" || colours.length !== 2) throw new Error(`not a colour: ${value}`);
    const parsed = colours.map((c) => {
      const m = /^([\s\S]*?)\s+([\d.]+)%$/.exec(c);
      return m ? { colour: rgba(m[1]), share: Number(m[2]) / 100 } : { colour: rgba(c), share: undefined };
    });
    const [a, b] = parsed;
    if (a.share === undefined && b.share === undefined) a.share = b.share = 0.5;
    else if (a.share === undefined) a.share = 1 - b.share;
    else if (b.share === undefined) b.share = 1 - a.share;
    // Premultiplied mixing, as the browser does it.
    const alpha = a.colour.alpha * a.share + b.colour.alpha * b.share;
    const channels = [0, 1, 2].map((i) =>
      alpha === 0 ? 0 : (a.colour.channels[i] * a.colour.alpha * a.share + b.colour.channels[i] * b.colour.alpha * b.share) / alpha,
    );
    return { channels, alpha };
  }
  const h = v.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a colour: ${value}`);
  return { channels: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255), alpha: 1 };
}

// A tint laid over a solid colour.
function over(top, base) {
  const t = rgba(top);
  const b = rgba(base);
  return { channels: t.channels.map((c, i) => c * t.alpha + b.channels[i] * (1 - t.alpha)), alpha: 1 };
}

function luminance(colour) {
  const { channels } = typeof colour === "string" ? rgba(colour) : colour;
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const text = [
  "--color-foreground",
  "--color-foreground-secondary",
  "--color-foreground-muted",
  "--color-accent",
  "--color-success",
  "--color-warning",
  "--color-danger",
  "--method-get-ink",
  "--method-post-ink",
  "--method-query-ink",
  "--method-delete-ink",
];
const marks = ["--color-focus", "--color-border-strong"];
// Each badge's text and the fill behind it, as Badge.astro pairs them.
const badges = [
  ["neutral", "--color-foreground-secondary", "--color-control-hover"],
  ["accent", "--color-accent-strong", "--color-accent-subtle"],
  ["success", "--color-success", "--color-success-subtle"],
  ["warning", "--color-warning", "--color-warning-subtle"],
  ["danger", "--color-danger", "--color-danger-subtle"],
  ["get", "--method-get-ink", "--method-get-fill"],
  ["post", "--method-post-ink", "--method-post-fill"],
  ["query", "--method-query-ink", "--method-query-fill"],
  ["delete", "--method-delete-ink", "--method-delete-fill"],
];

let failed = 0;
const rows = [];
for (const theme of ["dark", "light"]) {
  const vars = scope(theme);
  const background = resolve(vars, "var(--color-background)");
  const surface = resolve(vars, "var(--color-surface)");
  for (const role of text) {
    const fg = resolve(vars, `var(${role})`);
    for (const [on, bg] of [["background", background], ["surface", surface]]) {
      const r = ratio(fg, bg);
      const pass = r >= 4.5;
      if (!pass) failed++;
      rows.push([theme, role, fg, on, r.toFixed(2), "4.5", pass ? "pass" : "FAIL"]);
    }
  }
  for (const [name, ink, fill] of badges) {
    const fg = resolve(vars, `var(${ink})`);
    const tint = resolve(vars, `var(${fill})`);
    for (const [on, bg] of [["background", background], ["surface", surface]]) {
      const r = ratio(fg, over(tint, bg));
      const pass = r >= 4.5;
      if (!pass) failed++;
      rows.push([theme, `badge ${name}`, fg, `fill over ${on}`, r.toFixed(2), "4.5", pass ? "pass" : "FAIL"]);
    }
  }
  for (const role of marks) {
    const fg = resolve(vars, `var(${role})`);
    const r = ratio(fg, background);
    const pass = r >= 3;
    if (!pass) failed++;
    rows.push([theme, role, fg, "background", r.toFixed(2), "3", pass ? "pass" : "FAIL"]);
  }
}

const head = ["theme", "role", "value", "on", "ratio", "needs", "result"];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (r) => r.map((c, i) => c.padEnd(widths[i])).join("  ");
console.log(line(head));
for (const r of rows) console.log(line(r));
console.log(failed === 0 ? `all ${rows.length} pairs pass` : `${failed} of ${rows.length} pairs fail`);
process.exit(failed === 0 ? 0 : 1);
