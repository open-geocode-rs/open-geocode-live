// Builds the site, then drives the parts of the frame and the shared components whose behaviour depends on timing,
// failures or nesting, which no build step sees. Each case says what it found. Pass --no-build to check the dist/ that
// is already built.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const site = fileURLToPath(new URL("..", import.meta.url));
if (!process.argv.includes("--no-build")) {
  // Astro builds on the runtime that runs this check.
  execFileSync(process.execPath, [fileURLToPath(new URL("../node_modules/astro/bin/astro.mjs", import.meta.url)), "build"], { cwd: site, stdio: ["ignore", "ignore", "inherit"] });
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
/**
 * Serves the search index's script with code put in at the start of one of its functions.
 * @param {Page} tab
 * @param {string} at The text that opens the function.
 * @param {string} code
 */
const patchIndex = (tab, at, code) =>
  tab.route("**/pagefind/pagefind.js", async (route) => {
    const body = await (await route.fetch()).text();
    if (!body.includes(at)) throw new Error(`the search index's script has no ${at}`);
    await route.fulfill({ body: body.replace(at, at + code), contentType: "text/javascript" });
  });

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

  /** An index that fails to start is started again on the next keystroke, so search works once it can. */
  "search starts again after the index failed": () =>
    visit(
      "/docs/quickstart/",
      desktop,
      async (tab) => {
        await search(tab, "geocode");
        await tab.waitForTimeout(1000);
        await tab.locator("[data-search-input]").press("End");
        await tab.keyboard.type("s");
        await rowsReach(tab, 1).catch(() => undefined);
        const rows = await tab.locator("[data-search-results] > li").count();
        return rows ? [] : ["after the index failed once, no later search showed results"];
      },
      // The index fails the first time it is set up, as when a file of it does not arrive.
      (tab) => patchIndex(tab, "var options=async(new_options)=>{", "if(!globalThis.__ogFailed){globalThis.__ogFailed=true;throw new Error(\"index failed\")}"),
    ),

  /** A batch whose query is cleared while the index is dropped adds nothing to the cleared list. */
  "search drops a batch of a cleared query": () =>
    visit(
      "/docs/quickstart/",
      desktop,
      async (tab) => {
        await search(tab, "geocode");
        await rowsReach(tab, 5);
        let seen = 0;
        await tab.route(FRAGMENTS, (route) => (++seen === 2 ? route.abort() : route.continue()));
        await more(tab).click();
        // Cleared while the failed batch drops the index.
        await tab.waitForTimeout(300);
        await tab.locator("[data-search-input]").fill("");
        await tab.waitForTimeout(1500);
        const rows = await tab.locator("[data-search-results] > li").count();
        const shown = await more(tab).isVisible();
        return rows || shown ? [`the cleared search shows ${rows} rows${shown ? " and Load more" : ""}`] : [];
      },
      // Dropping the index takes a while, as it may on a slow device.
      (tab) => patchIndex(tab, "var destroy=async()=>{", "await new Promise((r)=>setTimeout(r,1000));"),
    ),

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

  /** On a screen without hover, the copy button of a plain block shows without a hover. */
  "copy button shows on touch": () =>
    visit("/docs/quickstart/", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, async (tab) => {
      const hidden = await tab.locator("[data-codeblock-float]").evaluateAll((all) => all.filter((e) => getComputedStyle(e).opacity !== "1").length);
      return hidden ? [`${hidden} copy buttons are invisible until a hover that cannot happen`] : [];
    }),

  // Tabs.

  /** Tabs inside a tab panel change only their own tabs and panels, and the outer tabs only theirs. */
  "nested tabs stay apart": () =>
    visit(
      "/docs/api/operations/create/",
      desktop,
      async (tab) => {
        const outer = tab.locator("[data-tabs]:not([data-nested-probe])").first();
        const inner = tab.locator("[data-nested-probe]");
        const selected = (/** @type {import("playwright").Locator} */ root) =>
          root.evaluate((r) =>
            [...r.querySelectorAll('[role="tab"]')].filter((t) => t.closest("[data-tabs]") === r).map((t) => t.getAttribute("aria-selected") === "true"),
          );
        const problems = [];
        await inner.locator('[role="tab"]').nth(1).click();
        const outerAfterInner = await selected(outer);
        if (!outerAfterInner[0]) problems.push(`clicking an inner tab changed the outer tabs to ${JSON.stringify(outerAfterInner)}`);
        await outer.locator(':scope > [role="tablist"] [role="tab"]').nth(1).click();
        await outer.locator(':scope > [role="tablist"] [role="tab"]').nth(0).click();
        const innerAfterOuter = await selected(inner);
        if (!innerAfterOuter[1]) problems.push(`switching the outer tabs changed the inner tabs to ${JSON.stringify(innerAfterOuter)}`);
        return problems;
      },
      // Nest a copy of the first tabs in its own first panel, with ids of its own, before the page's scripts run.
      (tab) =>
        tab.addInitScript(() => {
          document.addEventListener("readystatechange", () => {
            if (document.readyState !== "interactive") return;
            const outer = document.querySelector("[data-tabs]");
            if (!outer) return;
            const copy = /** @type {HTMLElement} */ (outer.cloneNode(true));
            copy.setAttribute("data-nested-probe", "");
            for (const e of copy.querySelectorAll("[id], [aria-controls], [aria-labelledby]")) {
              for (const name of ["id", "aria-controls", "aria-labelledby"]) {
                const v = e.getAttribute(name);
                if (v) e.setAttribute(name, `nested-${v}`);
              }
            }
            outer.querySelector('[role="tabpanel"]')?.append(copy);
          });
        }),
    ),

  /** A hidden panel paints nothing, even a child that sets its own visibility, such as a code block's Copied! tag. */
  "hidden panels paint nothing": () =>
    visit("/docs/api/operations/create/", { ...desktop, permissions: ["clipboard-read", "clipboard-write"] }, async (tab) => {
      const root = tab.locator("[data-tabs]").first();
      const first = root.locator('[role="tabpanel"]').first();
      const block = first.locator("[data-codeblock]").first();
      if ((await block.count()) === 0) return ["the first tab panel holds no code block to copy"];
      await block.hover();
      await block.locator("[data-copy]").click();
      await root.locator('[role="tab"]').nth(1).click();
      await tab.mouse.move(0, 0);
      const box = await first.boundingBox();
      if (!box) return ["the hidden panel has no box"];
      const during = await tab.screenshot({ clip: box });
      await tab.waitForTimeout(PAST_FEEDBACK);
      const after = await tab.screenshot({ clip: box });
      return during.equals(after) ? [] : ["the hidden panel painted over the shown one while its code block said Copied!"];
    }),

  /** Tabs inside underline tabs keep their own look. */
  "underline tabs leave nested tabs alone": () =>
    visit("/docs/api/operations/create/", desktop, async (tab) => {
      const looks = await tab.evaluate(() => {
        const outer = document.querySelector('[data-tabs][data-variant="underline"]');
        if (!outer) return undefined;
        // The same tabs set as default, once on their own and once inside the underline tabs' first panel.
        const plain = () => {
          const copy = /** @type {HTMLElement} */ (outer.cloneNode(true));
          for (const e of [copy, ...copy.querySelectorAll("[data-variant]")]) e.setAttribute("data-variant", "default");
          return copy;
        };
        const alone = plain();
        document.body.append(alone);
        const nested = plain();
        outer.querySelector('[role="tabpanel"]')?.append(nested);
        const look = (/** @type {Element} */ root) =>
          [...root.querySelectorAll('[role="tab"]')].slice(0, 2).map((t) => {
            const c = getComputedStyle(t);
            return [c.font, c.padding, c.borderBottomColor, c.marginBottom].join(" ");
          });
        return { alone: look(alone), nested: look(nested) };
      });
      if (!looks) return ["no underline tabs on the page"];
      return JSON.stringify(looks.alone) === JSON.stringify(looks.nested) ? [] : [`default tabs inside underline tabs look ${JSON.stringify(looks.nested)}, on their own ${JSON.stringify(looks.alone)}`];
    }),

  // Buttons.

  /** A button joined to the next control has no end edge or end corners, whatever its variant. */
  "joined buttons keep their joined edge": () =>
    visit("/docs/quickstart/", desktop, async (tab) => {
      const edges = await tab.evaluate(() => {
        const joined = document.querySelector('.button[data-join="start"]');
        if (!joined) return undefined;
        return ["solid", "outline", "ghost", "pill", "raised", "raised-solid"].map((variant) => {
          const copy = /** @type {HTMLElement} */ (joined.cloneNode(true));
          copy.setAttribute("data-variant", variant);
          joined.after(copy);
          const c = getComputedStyle(copy);
          const edge = [c.borderInlineEndWidth, c.borderStartEndRadius, c.borderEndEndRadius];
          copy.remove();
          return { variant, edge };
        });
      });
      if (!edges) return ["no joined button on the page"];
      return edges.filter((e) => e.edge.some((v) => v !== "0px")).map((e) => `a joined ${e.variant} button keeps its end edge, ${e.edge.join(" ")}`);
    }),

  // Landing.

  /** Enter after an input method's composition searches at once, and only the Enter that confirms the characters is held. */
  "enter after a composition searches": () =>
    visit("/", desktop, async (tab) => {
      let searches = 0;
      await tab.route("**/api/geocode**", (route) => {
        searches++;
        return route.fulfill({ json: [] });
      });
      const send = (/** @type {string[]} */ events) =>
        tab.locator("og-address-morph input").first().evaluate((input, list) => {
          const el = /** @type {HTMLInputElement} */ (input);
          el.readOnly = false;
          el.value = "東京都千代田区";
          for (const e of list) {
            if (e === "start") el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
            else if (e === "end") el.dispatchEvent(new CompositionEvent("compositionend", { data: "東京" }));
            // The Enter that confirms the characters, which some browsers send just after the composition ends.
            else if (e === "confirm") el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true }));
            else el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
          }
        }, events);
      const problems = [];
      // Characters picked with the pointer: the composition ends with no key at all.
      await send(["start", "end", "enter"]);
      await tab.waitForTimeout(500);
      if (searches !== 1) problems.push(`after a composition ended by the pointer, the first Enter made ${searches} searches, expected 1`);
      await tab.reload({ waitUntil: "networkidle" });
      searches = 0;
      await send(["start", "end", "confirm"]);
      await tab.waitForTimeout(500);
      if (searches !== 0) problems.push(`the Enter that confirmed the characters made ${searches} searches, expected none`);
      return problems;
    }),
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
