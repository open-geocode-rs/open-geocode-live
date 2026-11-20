// Builds the site, then checks the system page against the token files and the component table.
// Fails unless the page shows exactly the tokens the four token files define, a cell for every
// variant, size and state of every shared component, and no sideways scroll at 390 wide.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const site = fileURLToPath(new URL("..", import.meta.url));
const at = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

execFileSync(at("node_modules/.bin/astro"), ["build"], { cwd: site, stdio: ["ignore", "ignore", "inherit"] });

const files = ["primitives", "roles", "components", "host"].map((f) => `src/styles/tokens/${f}.css`);
const defined = new Set(
  files.flatMap((f) =>
    [...readFileSync(at(f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
  ),
);

const html = readFileSync(at("dist/system/index.html"), "utf8");
const shown = new Set([...html.matchAll(/data-token="([^"]+)"/g)].map((m) => m[1]));
const cells = new Set([...html.matchAll(/data-cell="([^"]+)"/g)].map((m) => m[1]));

const problems = [];
for (const t of defined) if (!shown.has(t)) problems.push(`token missing from the page: ${t}`);
for (const t of shown) if (!defined.has(t)) problems.push(`token on the page but in no token file: ${t}`);

// The component table of the spec's step 2. A component with one variant or one size uses "default".
const table = {
  Button: {
    variants: ["solid", "outline", "ghost", "raised", "raised-solid"],
    sizes: ["sm", "md", "lg"],
    states: ["rest", "hover", "focus", "pressed", "disabled"],
    flags: ["icon-only"],
  },
  Input: { variants: ["text", "textarea", "select"], sizes: ["md", "lg"], states: ["rest", "hover", "focus", "disabled", "invalid"] },
  Badge: {
    variants: ["neutral", "accent", "success", "warning", "danger", "get", "post", "query", "delete"],
    sizes: ["default"],
    states: ["rest"],
  },
  Kbd: { variants: ["default"], sizes: ["default"], states: ["rest"] },
  Menu: { variants: ["default", "outline"], sizes: ["2xs", "xs", "sm", "md"], states: ["closed", "open", "item-hover", "item-focus", "item-current"] },
  Tabs: { variants: ["default", "underline"], sizes: ["md"], states: ["rest", "hover", "focus", "current"] },
  Card: { variants: ["plain", "framed"], sizes: ["default"], states: ["rest"] },
  CodeBlock: { variants: ["plain", "terminal", "titled", "command", "numbered"], sizes: ["default"], states: ["rest", "copied"] },
  Icon: { variants: ["default"], sizes: ["sm", "md", "lg", "xl"], states: ["rest"] },
  Link: { variants: ["inline", "standalone"], sizes: ["inherit"], states: ["rest", "hover", "focus"] },
};

let expected = 0;
for (const [component, t] of Object.entries(table)) {
  for (const v of t.variants) {
    for (const s of t.sizes) {
      for (const st of t.states) {
        expected++;
        if (!cells.has(`${component}:${v}:${s}:${st}`)) problems.push(`cell missing: ${component}:${v}:${s}:${st}`);
      }
      for (const f of t.flags ?? []) {
        expected++;
        if (!cells.has(`${component}:${v}:${s}:rest:${f}`)) problems.push(`cell missing: ${component}:${v}:${s}:rest:${f}`);
      }
    }
  }
}

// A state grid may scroll inside its own box, but the page itself never scrolls sideways on a phone.
const server = await serve();
const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await tab.goto(`${server.origin}/system/`, { waitUntil: "networkidle" });
  const [scroll, inner] = await tab.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  console.log(`at 390 wide the page is ${scroll}px wide in a ${inner}px window`);
  if (scroll > inner) problems.push(`the page scrolls sideways at 390 wide, ${scroll}px in ${inner}px`);
} finally {
  await browser.close();
  await server.stop();
}

console.log(`tokens defined ${defined.size}, shown ${shown.size}`);
console.log(`cells expected ${expected}, distinct cells on the page ${cells.size}`);
for (const p of problems) console.log(p);
console.log(problems.length === 0 ? "system page matches" : `${problems.length} problems`);
process.exit(problems.length === 0 ? 0 : 1);
