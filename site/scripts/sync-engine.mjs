// Copy the engine's HTTP contract and its committed example answers into the site.
// The copies are committed so the site builds without an engine checkout; rerun
// after the contract changes.
//
//   ENGINE_DIR=../../open-geocode node scripts/sync-engine.mjs

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
// Default is the engine cloned beside this repo, not the pinned submodule: the site
// documents the engine as it is now, the submodule pins what the demo deploys.
const engine = resolve(site, process.env.ENGINE_DIR ?? "../../open-geocode");
const contract = join(engine, "contract");

if (!existsSync(join(contract, "openapi.json"))) {
  console.error(`no contract at ${contract}; set ENGINE_DIR to an open-geocode checkout`);
  process.exit(1);
}

copyFileSync(join(contract, "openapi.json"), join(site, "public", "openapi.json"));

// Each answer is paired with the request src/contract_tests.rs sends to produce it,
// so a page never shows a response its request would not return.
const EXAMPLES = {
  search: ["/search?q=10%20King%20Street", "search-address"],
  autocomplete: ["/autocomplete?q=Quee", "autocomplete"],
  geocode: ["/geocode?address=10%20King%20Street&postcode=M5V%201A1", "geocode-address"],
  reverse: ["/reverse?lon=-79.0&lat=43.0", "reverse-address"],
};

const examples = Object.fromEntries(
  Object.entries(EXAMPLES).map(([operationId, [request, file]]) => [
    operationId,
    // Kept as text: a JSON round trip turns the engine's -79.0 into -79.
    { request, response: readFileSync(join(contract, "responses", `${file}.json`), "utf8").trimEnd() },
  ]),
);
writeFileSync(join(site, "src", "data", "examples.json"), JSON.stringify(examples, null, 2) + "\n");

console.log(`Synced the contract and ${Object.keys(examples).length} examples from ${contract}`);
