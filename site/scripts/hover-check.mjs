// Builds the site, then moves the pointer across every pair of neighbouring hover targets and samples their computed
// styles on every frame. A hover fill must switch at once, as in the original, so the check fails on any frame where a
// target's fill sits between its rest and its hover value, which is a cross-fade between neighbours. In the landing
// header it also fails on any frame, while the pointer moves from one open menu to its neighbour, where no band shows.
// Pass --no-build to check the dist/ that is already built.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const site = fileURLToPath(new URL("..", import.meta.url));
if (!process.argv.includes("--no-build")) {
  execFileSync(fileURLToPath(new URL("../node_modules/.bin/astro", import.meta.url)), ["build"], { cwd: site, stdio: ["ignore", "ignore", "inherit"] });
}

// Rows of neighbouring hover targets, each read by its fill.
const rows = [
  { page: "/docs/", name: "docs header links", selector: "header .header-link" },
  { page: "/docs/", name: "sidebar links", selector: ".nav-link", limit: 6 },
  { page: "/docs/api/operations/autocomplete/", name: "page actions", selector: "[data-copy-markdown], .actions summary" },
  { page: "/docs/api/operations/autocomplete/", name: "request panel controls", selector: ".request-controls select, [data-copy-request]" },
  { page: "/", name: "landing header menus", selector: ".og-nav .og-menu > .button", bands: ".og-nav .og-menu-panel" },
];

const problems = [];
const server = await serve();
const browser = await chromium.launch();
try {
  for (const row of rows) {
    const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await tab.goto(server.origin + row.page, { waitUntil: "networkidle" });
    const count = Math.min(await tab.locator(row.selector).count(), row.limit ?? Infinity);
    if (count < 2) {
      problems.push(`${row.name}: found ${count} targets for ${row.selector}, so no pair was checked`);
      await tab.close();
      continue;
    }
    // The fill each target has at rest, and on hover once settled.
    await tab.mouse.move(2, 890);
    await tab.waitForTimeout(500);
    const fill = (i) => tab.locator(row.selector).nth(i).evaluate((e) => getComputedStyle(e).backgroundColor);
    const rest = [];
    const lit = [];
    for (let i = 0; i < count; i++) rest.push(await fill(i));
    for (let i = 0; i < count; i++) {
      await tab.locator(row.selector).nth(i).hover();
      await tab.waitForTimeout(500);
      lit.push(await fill(i));
    }
    for (let i = 0; i + 1 < count; i++) {
      const a = await tab.locator(row.selector).nth(i).boundingBox();
      const b = await tab.locator(row.selector).nth(i + 1).boundingBox();
      await tab.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await tab.waitForTimeout(600);
      // Sample every frame in the page while the pointer moves to the neighbour.
      await tab.evaluate(
        ({ selector, limit, bands }) => {
          const w = /** @type {Window & { __frames: { fills: string[]; shown: number }[]; __sampling: boolean }} */ (window);
          w.__frames = [];
          w.__sampling = true;
          const step = () => {
            const targets = [...document.querySelectorAll(selector)].slice(0, limit);
            const shown = bands
              ? [...document.querySelectorAll(bands)].filter((p) => {
                  const c = getComputedStyle(p);
                  return c.visibility === "visible" && Number(c.opacity) > 0.99;
                }).length
              : -1;
            w.__frames.push({ fills: targets.map((t) => getComputedStyle(t).backgroundColor), shown });
            if (w.__sampling) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        },
        { selector: row.selector, limit: count, bands: row.bands ?? null },
      );
      // The pointer goes in a straight line from the centre of one target to the centre of the next, so it crosses
      // the gap between neighbours side by side and stacked alike.
      const steps = 8;
      const from = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
      const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      let at = from;
      for (let s = 1; s <= steps; s++) {
        at = { x: from.x + ((to.x - from.x) * s) / steps, y: from.y + ((to.y - from.y) * s) / steps };
        await tab.mouse.move(at.x, at.y);
        await tab.waitForTimeout(30);
      }
      // A sweep that ends anywhere but on the neighbour tested nothing.
      const reached = await tab.locator(row.selector).nth(i + 1).evaluate((e, p) => e.contains(document.elementFromPoint(p.x, p.y)), at);
      if (!reached) problems.push(`${row.name}: the pointer never reached target ${i + 2}`);
      await tab.waitForTimeout(400);
      const frames = await tab.evaluate(() => {
        const w = /** @type {Window & { __frames: { fills: string[]; shown: number }[]; __sampling: boolean }} */ (window);
        w.__sampling = false;
        return w.__frames;
      });
      let partial = 0;
      let bandless = 0;
      for (const f of frames) {
        for (const k of [i, i + 1]) if (f.fills[k] !== rest[k] && f.fills[k] !== lit[k]) partial++;
        if (row.bands && f.shown === 0) bandless++;
      }
      if (partial) problems.push(`${row.name}: ${partial} frames with a part-lit fill moving from target ${i + 1} to ${i + 2}`);
      if (bandless) problems.push(`${row.name}: ${bandless} frames with no band moving from menu ${i + 1} to ${i + 2}`);
      console.log(`${row.name} ${i + 1} to ${i + 2}: ${frames.length} frames, ${partial} part-lit, ${row.bands ? `${bandless} with no band` : "no bands"}`);
    }
    await tab.close();
  }
} finally {
  await browser.close();
  await server.stop();
}

for (const p of problems) console.log(p);
console.log(problems.length ? `hover check failed, ${problems.length} problems` : "every hover switches at once and no band drops");
process.exit(problems.length ? 1 : 0);
