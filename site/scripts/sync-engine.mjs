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
// documents the engine as it is now, the submodule pins the VM runtime's version.
const engine = resolve(site, process.env.ENGINE_DIR ?? "../../open-geocode");
const contract = join(engine, "contract");

if (!existsSync(join(contract, "openapi.json"))) {
  console.error(`no contract at ${contract}; set ENGINE_DIR to an open-geocode checkout`);
  process.exit(1);
}

copyFileSync(join(contract, "openapi.json"), join(site, "public", "openapi.json"));

// Each answer is paired with the request src/contract_tests.rs sends to produce it,
// so a page never shows a response its request would not return. An operation with
// no committed answer shows its request alone. Batches are sent as QUERY, which the
// contract answers exactly as the POST its tests send.
const JOB = "4f9c2a7e1b8d4c6fa3e5d7b9c1f2a4e6";
const EXAMPLES = {
  search: { request: "/search?q=10%20King%20Street", response: "search-address" },
  autocomplete: { request: "/autocomplete?q=Quee", response: "autocomplete" },
  geocode: { request: "/geocode?address=10%20King%20Street&postcode=M5V%201A1", response: "geocode-address" },
  reverse: { request: "/reverse?lon=-79.0&lat=43.0", response: "reverse-address" },
  geocode_batch: {
    method: "query",
    request: "/geocode?country=CA",
    body: [
      { id: "row-1", address: "10 King Street", postcode: "M5V 1A1" },
      { id: "row-2", address: "" },
    ],
    response: "batch-geocode",
  },
  reverse_batch: {
    method: "query",
    request: "/reverse",
    body: [
      { id: "a", lon: -79.3832, lat: 43.6532 },
      { id: "b", lon: -75.6972, lat: 45.4215 },
    ],
  },
  version: { request: "/version" },
  create: { method: "post", request: "/jobs?country=CA", upload: { file: "addresses.csv", type: "text/csv" }, answer: "text" },
  status: { request: `/jobs/${JOB}` },
  results: { request: `/jobs/${JOB}/results`, answer: "text" },
  cancel: { method: "post", request: `/jobs/${JOB}/cancel` },
  delete: { method: "delete", request: `/jobs/${JOB}`, answer: "none" },
};

const examples = Object.fromEntries(
  Object.entries(EXAMPLES).map(([operationId, { response, ...example }]) => [
    operationId,
    response
      ? // Kept as text: a JSON round trip turns the engine's -79.0 into -79.
        { ...example, response: readFileSync(join(contract, "responses", `${response}.json`), "utf8").trimEnd() }
      : example,
  ]),
);
writeFileSync(join(site, "src", "data", "examples.json"), JSON.stringify(examples, null, 2) + "\n");

console.log(`Synced the contract and ${Object.keys(examples).length} examples from ${contract}`);
