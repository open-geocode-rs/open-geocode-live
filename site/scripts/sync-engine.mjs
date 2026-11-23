// Site examples come from release Packs. Engine contract fixtures use synthetic records.
import { copyFileSync, existsSync } from "node:fs";
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

console.log(`Synced the OpenAPI contract from ${contract}`);
