// Reads the token files at build time, so the system page shows every token that exists and nothing else.
import budget from "../../../lint/budget.json";
import components from "../../styles/tokens/components.css?raw";
import host from "../../styles/tokens/host.css?raw";
import primitives from "../../styles/tokens/primitives.css?raw";
import roles from "../../styles/tokens/roles.css?raw";

export type Theme = "light" | "dark";

export interface Declaration {
  selector: string;
  media?: string;
  value: string;
}

export interface Token {
  name: string;
  file: string;
  group: string;
  kind: string;
  declarations: Declaration[];
}

const files: Record<string, string> = {
  "primitives.css": primitives,
  "roles.css": roles,
  "components.css": components,
  "host.css": host,
};

const groups = Object.entries(budget.groups).map(([name, g]) => ({ name, ...g, re: new RegExp(g.pattern) }));

function declarations(css: string): { name: string; decl: Declaration }[] {
  const out: { name: string; decl: Declaration }[] = [];
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const walk = (text: string, media?: string) => {
    for (const m of text.matchAll(/(@media[^{]+)\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}|([^{}@]+)\{([^{}]*)\}/g)) {
      if (m[1]) {
        walk(m[2], m[1].trim());
        continue;
      }
      const selector = m[3].trim().replace(/\s+/g, " ");
      for (const d of m[4].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        out.push({ name: d[1], decl: { selector, media, value: d[2].trim().replace(/\s+/g, " ") } });
      }
    }
  };
  walk(source);
  return out;
}

function read(): Token[] {
  const tokens = new Map<string, Token>();
  for (const [file, css] of Object.entries(files)) {
    for (const { name, decl } of declarations(css)) {
      const existing = tokens.get(name);
      if (existing) {
        existing.declarations.push(decl);
        continue;
      }
      const group = groups.find((g) => g.re.test(name));
      tokens.set(name, { name, file, group: group?.name ?? "ungrouped", kind: group?.kind ?? "ungrouped", declarations: [decl] });
    }
  }
  return [...tokens.values()];
}

export const tokens = read();

export const byGroup = (group: string) => tokens.filter((t) => t.group === group);
export const byKind = (kind: string) => tokens.filter((t) => t.kind === kind);

/** The groups in budget order, with their tokens and their budgeted count. */
export const groupList = groups.map((g) => ({ name: g.name, kind: g.kind, count: g.count, tokens: byGroup(g.name) }));

// The value a theme sees: the :root blocks, then its own wrapper's blocks, later blocks winning. Wide-screen media is ignored.
function scope(theme: Theme): Map<string, string> {
  const vars = new Map<string, string>();
  for (const css of Object.values(files)) {
    for (const { name, decl } of declarations(css)) {
      if (decl.media) continue;
      const parts = decl.selector.split(",").map((s) => s.trim());
      if (parts.some((p) => p === ":root" || p === "[data-theme]" || p === `[data-theme="${theme}"]`)) vars.set(name, decl.value);
    }
  }
  return vars;
}

const scopes: Record<Theme, Map<string, string>> = { light: scope("light"), dark: scope("dark") };

export function resolve(theme: Theme, name: string): string {
  const vars = scopes[theme];
  const sub = (value: string, seen: string[]): string =>
    value.replace(/var\((--[\w-]+)\)/g, (_, n: string) => {
      const v = vars.get(n);
      return v === undefined || seen.includes(n) ? `var(${n})` : sub(v, [...seen, n]);
    });
  return sub(vars.get(name) ?? "", [name]);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast of two solid colours, or undefined when either is not a plain hex. */
export function contrast(theme: Theme, fg: string, bg: string): number | undefined {
  const [a, b] = [resolve(theme, fg), resolve(theme, bg)];
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return undefined;
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** A token's colour as a hex value and an opacity, or undefined when the token is not a colour. */
export function paint(theme: Theme, name: string): { hex: string; alpha: number } | undefined {
  const value = resolve(theme, name);
  if (/^#[0-9a-f]{6}$/i.test(value)) return { hex: value, alpha: 1 };
  const mix = /^color-mix\(in srgb, (#[0-9a-f]{6}) ([\d.]+)%, transparent\)$/i.exec(value);
  return mix ? { hex: mix[1], alpha: Number(mix[2]) / 100 } : undefined;
}

/** The value as written in its token file, for the first declaration a theme sees. */
export function written(theme: Theme, token: Token): string {
  const own = token.declarations.find((d) => !d.media && d.selector.split(",").map((s) => s.trim()).includes(`[data-theme="${theme}"]`));
  return (own ?? token.declarations.find((d) => !d.media) ?? token.declarations[0]).value;
}

export const breakpoints = budget.breakpoints;
