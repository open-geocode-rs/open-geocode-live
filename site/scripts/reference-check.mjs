// Checks how the API reference reads schemas the published document does not use yet, so a later edit to the
// document cannot draw a wrong page without failing here. Loads src/lib/reference.ts as the build does.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const site = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ root: site, configFile: false, cacheDir: join(tmpdir(), "og-reference-check"), logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom" });

const problems = [];
try {
  /** @type {typeof import("../src/lib/reference")} */
  const { operationContent } = await vite.ssrLoadModule("/src/lib/reference.ts");

  /** An operation that answers 200 with a JSON body of this schema. */
  const answering = (/** @type {Record<string, unknown>} */ schema) =>
    /** @type {import("../src/lib/openapi").ApiOperation} */ (
      /** @type {unknown} */ ({ node: { responses: { 200: { description: "OK", content: { "application/json": { schema } } } } }, item: {} })
    );
  /** The example the reference shows for that body, parsed. */
  const exampleOf = (/** @type {Record<string, unknown>} */ schema) => {
    const media = operationContent(answering(schema)).responses?.sections?.[0]?.media?.[0];
    const block = media?.blocks.find((b) => b.kind === "example");
    return block?.kind === "example" ? JSON.parse(block.example.code) : undefined;
  };
  const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) => JSON.stringify(a) === JSON.stringify(b);

  // The items of an array are checked like any other schema, so an alternative the reference cannot draw stops the build.
  for (const [name, items] of /** @type {const} */ ([
    ["oneOf", { oneOf: [{ type: "string" }, { type: "number" }] }],
    ["anyOf", { anyOf: [{ type: "string" }, { type: "number" }] }],
    ["nested oneOf", { type: "array", items: { oneOf: [{ type: "string" }, { type: "number" }] } }],
  ])) {
    try {
      operationContent(answering({ type: "object", properties: { values: { type: "array", items } } }));
      problems.push(`array items with ${name} drew a page instead of stopping the build`);
    } catch (e) {
      if (!String(e).includes("does not draw yet")) throw e;
    }
  }
  // Arrays of a plain type still draw.
  operationContent(answering({ type: "object", properties: { tags: { type: "array", items: { type: "string", enum: ["a", "b"] } } } }));

  // A schema's own fields join those of the schemas it is built from, as its field list does, in authored and made examples.
  const authored = exampleOf({
    type: "object",
    properties: { tenant: { type: "string", example: "acme" } },
    allOf: [{ type: "object", properties: { id: { type: "string", example: "x1" } } }],
  });
  if (!same(authored, { tenant: "acme", id: "x1" })) problems.push(`authored example of own fields and allOf is ${JSON.stringify(authored)}`);
  const made = exampleOf({ type: "object", properties: { tenant: { type: "string" } }, allOf: [{ type: "object", properties: { id: { type: "string" } } }] });
  if (!same(made, { tenant: "example", id: "example" })) problems.push(`made example of own fields and allOf is ${JSON.stringify(made)}`);
  // An allOf alone keeps its example.
  const parts = exampleOf({ allOf: [{ type: "object", properties: { id: { type: "string", example: "x1" } } }] });
  if (!same(parts, { id: "x1" })) problems.push(`example of an allOf alone is ${JSON.stringify(parts)}`);
} finally {
  await vite.close();
}

for (const p of problems) console.log(p);
console.log(problems.length ? `reference check failed, ${problems.length} problems` : "the reference reads every schema shape it is given");
process.exit(problems.length ? 1 : 0);
