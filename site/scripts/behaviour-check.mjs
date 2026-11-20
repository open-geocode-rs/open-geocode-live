// Builds the site, then drives the parts of the frame and the shared components whose behaviour depends on timing,
// failures or nesting, which no build step sees. Each case says what it found. Pass --no-build to check the dist/ that
// is already built.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const site = fileURLToPath(new URL("..", import.meta.url));
if (!process.argv.includes("--no-build")) {
  execFileSync(fileURLToPath(new URL("../node_modules/.bin/astro", import.meta.url)), ["build"], { cwd: site, stdio: ["ignore", "ignore", "inherit"] });
}

/** @typedef {import("playwright").Page} Page */
/** @typedef {import("playwright").BrowserContextOptions} Options */

const desktop = { viewport: { width: 1440, height: 900 } };
// The copy feedback stays for --duration-feedback, 1500ms, so a wait past it sees the block at rest again.
const PAST_FEEDBACK = 2000;
const FRAGMENTS = "**/pagefind/fragment/**";

const server = await serve();
const browser = await chromium.launch();

/**
 * Opens a page in a fresh context, runs the case, and closes it. Uncaught errors in the page fail the case.
 * @param {string} path
 * @param {Options} options
 * @param {(tab: Page) => Promise<string[]>} run The problems found.
 * @param {(tab: Page) => Promise<void>} [before] Runs before the page loads.
 */
async function visit(path, options, run, before) {
  const context = await browser.newContext(options);
  const tab = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  tab.on("pageerror", (e) => errors.push(`uncaught in the page: ${e.message}`));
  try {
    if (before) await before(tab);
    await tab.goto(server.origin + path, { waitUntil: "networkidle" });
    return [...(await run(tab)), ...errors];
  } finally {
    await context.close();
  }
}

// Search.

/** @param {Page} tab */
const pageRows = (tab) => tab.locator("[data-search-results] > li > a:first-of-type").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
/** @param {Page} tab @param {number} count */
const rowsReach = (tab, count) => tab.waitForFunction((n) => document.querySelectorAll("[data-search-results] > li").length >= n, count);
/** @param {Page} tab @param {string} term */
async function search(tab, term) {
  await tab.keyboard.press("Control+k");
  await tab.locator("[data-search-input]").fill(term);
}
const more = (/** @type {Page} */ tab) => tab.locator("[data-search-more] button");

/** The first rows of a query, loaded one batch at a time with nothing in the way. */
async function rowsInOrder(/** @type {string} */ term, /** @type {number} */ batches) {
  /** @type {(string | null)[]} */
  let rows = [];
  await visit("/docs/quickstart/", desktop, async (tab) => {
    await search(tab, term);
    await rowsReach(tab, 5);
    for (let b = 1; b < batches; b++) {
      await more(tab).click();
      await rowsReach(tab, 5 * (b + 1));
    }
    rows = await pageRows(tab);
    return [];
  });
  return rows;
}

const cases = {
  /** Two quick Load more presses add the next two batches in order, even when the first is slower. */
  "search batches stay in order": async () => {
    const expected = await rowsInOrder("geocode", 3);
    return visit("/docs/quickstart/", desktop, async (tab) => {
      await search(tab, "geocode");
      await rowsReach(tab, 5);
      let seen = 0;
      await tab.route(FRAGMENTS, async (route) => {
        // The first batch after the first page is held back, so the one after it lands first if nothing orders them.
        if (++seen <= 5) await new Promise((r) => setTimeout(r, 1200));
        await route.continue();
      });
      await more(tab).click();
      await more(tab).click({ timeout: 500 }).catch(() => undefined);
      await rowsReach(tab, 15);
      await tab.waitForTimeout(1500);
      const rows = await pageRows(tab);
      return JSON.stringify(rows) === JSON.stringify(expected) ? [] : [`rows came as ${JSON.stringify(rows)}, expected ${JSON.stringify(expected)}`];
    });
  },

  /** A batch that fails part way shows what loaded, keeps its place, and loads the rest on the next press. */
  "search resumes after a failed batch": async () => {
    const expected = await rowsInOrder("geocode", 3);
    return visit("/docs/quickstart/", desktop, async (tab) => {
      await search(tab, "geocode");
      await rowsReach(tab, 5);
      let seen = 0;
      // The second hit of the next batch fails to load.
      await tab.route(FRAGMENTS, (route) => (++seen === 2 ? route.abort() : route.continue()));
      await more(tab).click();
      await tab.waitForTimeout(1500);
      const problems = [];
      const shown = await pageRows(tab);
      if (JSON.stringify(shown) !== JSON.stringify(expected.slice(0, 6))) problems.push(`after the failure the rows are ${JSON.stringify(shown)}, expected the first 6 in order`);
      if (!(await more(tab).isVisible())) problems.push("Load more is gone after the failure, so the rest cannot be loaded");
      await tab.unroute(FRAGMENTS);
      if (await more(tab).isVisible()) {
        await more(tab).click();
        await rowsReach(tab, 11).catch(() => undefined);
        await tab.waitForTimeout(500);
        const after = await pageRows(tab);
        if (JSON.stringify(after) !== JSON.stringify(expected.slice(0, 11))) problems.push(`after the retry the rows are ${JSON.stringify(after)}, expected the first 11 in order`);
      }
      return problems;
    });
  },

  /** While a new query is pending, Enter and Load more do nothing with the old query's results. */
  "search acts only on the current query": async () => {
    const enter = await visit("/docs/quickstart/", desktop, async (tab) => {
      await search(tab, "benchmarks");
      await rowsReach(tab, 1);
      const old = await tab.locator("[data-search-results] a").first().getAttribute("href");
      await tab.locator("[data-search-input]").fill("zzqxw");
      await tab.locator("[data-search-input]").press("Enter");
      await tab.waitForTimeout(1000);
      return tab.url().endsWith(old ?? "") ? [`Enter on a new query opened ${old}, the old query's first result`] : [];
    });
    const expected = (await rowsInOrder("address", 1)).slice(0, 5);
    const load = await visit("/docs/quickstart/", desktop, async (tab) => {
      await search(tab, "geocode");
      await rowsReach(tab, 5);
      await tab.locator("[data-search-input]").fill("address");
      await more(tab).click();
      await tab.waitForTimeout(1500);
      const rows = await pageRows(tab);
      return JSON.stringify(rows) === JSON.stringify(expected) ? [] : [`Load more during a new query left the rows ${JSON.stringify(rows)}, expected ${JSON.stringify(expected)}`];
    });
    return [...enter, ...load];
  },

  // Theme.

  /** A chosen theme holds when the system's theme changes, even where the choice cannot be saved. */
  "theme choice holds without storage": () =>
    visit(
      "/docs/",
      { ...desktop, colorScheme: "light" },
      async (tab) => {
        await tab.locator("og-theme-select summary").first().click();
        await tab.locator('og-theme-select [role="menuitemradio"][data-value="dark"]').first().click();
        const chosen = await tab.evaluate(() => document.documentElement.dataset.theme);
        // Each change is let settle, or the two cancel out before the page hears either.
        await tab.emulateMedia({ colorScheme: "dark" });
        await tab.waitForTimeout(200);
        await tab.emulateMedia({ colorScheme: "light" });
        await tab.waitForTimeout(200);
        const now = await tab.evaluate(() => document.documentElement.dataset.theme);
        return chosen === "dark" && now === "dark" ? [] : [`chose Dark (page ${chosen}), then the system went dark and light and the page is ${now}`];
      },
      // Storage that cannot be written, as when it is full or the browser keeps nothing.
      (tab) =>
        tab.addInitScript(() => {
          Storage.prototype.setItem = () => {
            throw new DOMException("full", "QuotaExceededError");
          };
        }),
    ),

  // Code blocks.

  /** A refused clipboard falls back to copying the selection, and says Copied! only when a copy worked. */
  "copy works without the clipboard": async () => {
    const refuse = (/** @type {Page} */ tab, /** @type {boolean} */ fallback) =>
      tab.addInitScript((works) => {
        navigator.clipboard.writeText = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
        const copy = document.execCommand.bind(document);
        document.execCommand = (command, ...rest) => (command === "copy" ? works && copy(command, ...rest) : copy(command, ...rest));
      }, fallback);
    const press = async (/** @type {Page} */ tab) => {
      const block = tab.locator("[data-codeblock]").first();
      await block.hover();
      await block.locator("[data-copy]").click();
      await tab.waitForTimeout(300);
      return block.locator("[data-status]").textContent();
    };
    const copied = await visit("/docs/quickstart/", desktop, async (tab) => ((await press(tab)) === "Copied!" ? [] : ["the fallback copy did not say Copied!"]), (tab) => refuse(tab, true));
    const failed = await visit("/docs/quickstart/", desktop, async (tab) => ((await press(tab)) === "" ? [] : ["said Copied! when no copy worked"]), (tab) => refuse(tab, false));
    return [...copied, ...failed];
  },
};

let failed = 0;
try {
  for (const [name, run] of Object.entries(cases)) {
    const problems = await run();
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok"} ${name}${problems.map((p) => `\n  ${p}`).join("")}`);
  }
} finally {
  await browser.close();
  await server.stop();
}
console.log(failed ? `behaviour check failed, ${failed} of ${Object.keys(cases).length} cases` : `all ${Object.keys(cases).length} cases behave`);
process.exit(failed ? 1 : 0);
