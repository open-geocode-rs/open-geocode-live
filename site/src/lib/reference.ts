// What each API reference page says, read from the OpenAPI document as a tree of parts our own components draw.
// A schema becomes a list of blocks, and an object's properties become fields, each with its own blocks.
// The parts the document does not use (one-of choices, negated and recursive schemas, complex maps and
// named example sets) stop the build with a message, so a new use is drawn on purpose, not by accident.
import { capitalize, isNode, slug, type ApiOperation, type Node } from "./openapi";

export type Example = {
  /** The level of the "Example" heading, which follows the section it sits in. */
  level: number;
  /** Whether the example was made from the schema, since the document gives none. */
  generated: boolean;
  code: string;
  lang: "json" | "plaintext";
};

export type TypeLine = { text: string; format?: string };

export type Block =
  | { kind: "text"; markdown: string }
  | { kind: "title"; text: string }
  | { kind: "docs"; href: string; label: string }
  | { kind: "type"; type: TypeLine }
  | { kind: "tags"; label?: string; tags: string[] }
  | { kind: "example"; example: Example }
  | { kind: "object"; open: boolean; tags: string[]; fields: Field[] };

export type Field = {
  name: string;
  required: boolean;
  deprecated: boolean;
  /** The type shown beside the name. */
  type?: TypeLine;
  blocks: Block[];
};

export type Media = { mediaType: string; blocks: Block[] };

export type Section = {
  id: string;
  title: string;
  level: number;
  /** Markdown under the heading. */
  description?: string;
  fields?: Field[];
  media?: Media[];
  /** A section inside this one, such as a response's headers. */
  sections?: Section[];
};

export type OperationContent = {
  description?: string;
  docs?: { href: string; label: string };
  parameters?: Section;
  requestBody?: Section & { required: boolean };
  responses?: Section;
};

const str = (value: unknown) => (typeof value === "string" ? value : undefined);
const nodes = (value: unknown): Node[] => (Array.isArray(value) ? value.filter(isNode) : []);
const has = (value: Node, key: string) => Object.hasOwn(value, key) && value[key] !== undefined;

function unsupported(what: string): never {
  throw new Error(`The OpenAPI document uses ${what}, which the API reference does not draw yet. Draw it in src/lib/reference.ts.`);
}

function dictionaryType(schema: Node): string | undefined {
  const values = schema.additionalProperties;
  if (schema.type !== "object" || has(schema, "properties") || has(schema, "allOf")) return undefined;
  if (!isNode(values) || Object.keys(values).length !== 1) return undefined;
  const valueType = str(values.type);
  if (!valueType || !["string", "number", "integer", "boolean"].includes(valueType)) return undefined;
  const keys = schema.propertyNames;
  if (keys !== undefined && (!isNode(keys) || keys.type !== "string" || Object.keys(keys).length !== 1)) return undefined;
  return `Record<string, ${valueType === "integer" ? "number" : valueType}>`;
}

function check(schema: Node) {
  if (nodes(schema.oneOf).length > 0) unsupported("oneOf");
  if (nodes(schema.anyOf).length > 0) unsupported("anyOf");
  if (has(schema, "not")) unsupported("not");
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false && !dictionaryType(schema)) unsupported("additionalProperties");
}

const isArrayType = (type: unknown) => type === "array" || (Array.isArray(type) && type.includes("array"));

function isObjectSchema(schema: Node): boolean {
  return (
    schema.type === "object" ||
    "properties" in schema ||
    nodes(schema.oneOf).some(isObjectSchema) ||
    nodes(schema.anyOf).some(isObjectSchema) ||
    nodes(schema.allOf).some(isObjectSchema)
  );
}

const propertiesOf = (schema: Node): [string, Node][] =>
  isNode(schema.properties) ? Object.entries(schema.properties).filter((e): e is [string, Node] => isNode(e[1])) : [];

function requiredOf(schema: Node): string[] {
  const all = [schema.required, ...nodes(schema.allOf).map((s) => s.required)].flatMap((r) => (Array.isArray(r) ? r.map(String) : []));
  return [...new Set(all)];
}

function typeOf(schema: Node, seen = new WeakSet<object>()): string | undefined {
  if (seen.has(schema)) return "recursive";
  seen.add(schema);
  const types = Array.isArray(schema.type) ? schema.type.map(String) : typeof schema.type === "string" ? [schema.type] : [];
  if (types.includes("array") && isNode(schema.items)) {
    const inner = typeOf(schema.items, seen);
    return [inner ? `Array<${inner}>` : "Array", ...types.filter((t) => t !== "array")].join(" | ");
  }
  return types.length > 0 ? types.join(" | ") : undefined;
}

// A bound reads as a comparison. A bound of 0 is left out, as the reference has always shown it.
function bound(schema: Node, which: "minimum" | "maximum"): string | undefined {
  const exclusive = schema[which === "maximum" ? "exclusiveMaximum" : "exclusiveMinimum"];
  const sign = which === "maximum" ? "<" : ">";
  if (typeof exclusive === "number") return `${sign} ${exclusive}`;
  const value = schema[which];
  return value ? `${sign}${exclusive ? "" : "="} ${String(value)}` : undefined;
}

/** Only strings and numbers show as tags, and an empty string shows as its quotes. */
function tagsOf(values: unknown[]): string[] {
  return values
    .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
    .map((v) => (v === "" ? '""' : String(v)));
}

/** A value as an example shows it. Text as it is, anything else as JSON. */
function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value.toString();
  if (value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

function example(value: unknown, level: number, generated: boolean, mediaType?: string): Block {
  const code = formatValue(value).trim();
  let lang: Example["lang"] = "plaintext";
  if (mediaType === "application/json") lang = "json";
  else {
    try {
      JSON.parse(code);
      lang = "json";
    } catch {
      lang = "plaintext";
    }
  }
  return { kind: "example", example: { level, generated, code, lang } };
}

type Context = { level: number; hideExample: boolean; nested: boolean; parents: Node[]; mediaType?: string };

/** A schema's own blocks. Its title, description, type and limits, its fields if it is an object, and its example. */
function schemaBlocks(schema: Node, ctx: Context): Block[] {
  check(schema);
  const out: Block[] = [];
  const title = str(schema.title);
  if (title) out.push({ kind: "title", text: title });
  const description = str(schema.description);
  if (description) out.push({ kind: "text", markdown: description });
  if (isNode(schema.externalDocs)) {
    out.push({ kind: "docs", href: String(schema.externalDocs.url), label: str(schema.externalDocs.description) ?? "More information" });
  }
  const dictionary = dictionaryType(schema);
  if (dictionary) out.push({ kind: "type", type: { text: dictionary } });
  else if (isObjectSchema(schema)) out.push(objectBlock(schema, ctx));
  else if (nodes(schema.allOf).length > 0) {
    for (const part of nodes(schema.allOf)) out.push(...valueBlocks(part, { ...ctx, parents: [...ctx.parents, schema] }));
  } else out.push(...valueBlocks(schema, ctx));
  if (!ctx.hideExample && schema.example !== undefined) out.push(example(schema.example, ctx.level, false, ctx.mediaType));
  return out;
}

/** The blocks of a schema that is not an object. Its type, its limits, its allowed values, and the object its items are. */
function valueBlocks(schema: Node, ctx: Context): Block[] {
  check(schema);
  const out: Block[] = [];
  const items = isNode(schema.items) ? schema.items : undefined;
  if (items && [...ctx.parents, schema].includes(items)) unsupported("a recursive schema");
  const type = typeOf(schema);
  if (typeof schema.type === "string" || Array.isArray(schema.type)) {
    if (type) out.push({ kind: "type", type: { text: type, format: str(schema.format) } });
  }
  const limits = tagsOf([
    schema.default ? `default: ${String(schema.default)}` : undefined,
    schema.nullable ? "nullable" : undefined,
    bound(schema, "minimum"),
    bound(schema, "maximum"),
    schema.minLength ? `>= ${String(schema.minLength)} characters` : undefined,
    schema.maxLength ? `<= ${String(schema.maxLength)} characters` : undefined,
    schema.minItems ? `>= ${String(schema.minItems)} items` : undefined,
    schema.maxItems ? `<= ${String(schema.maxItems)} items` : undefined,
    schema.pattern ? `/${String(schema.pattern)}/` : undefined,
    schema.multipleOf ? `multiple of ${String(schema.multipleOf)}` : undefined,
    schema.uniqueItems ? "unique items" : undefined,
  ]);
  if (limits.length > 0) out.push({ kind: "tags", tags: limits });
  if (schema.const) {
    const values = tagsOf([schema.const]);
    if (values.length > 0) out.push({ kind: "tags", label: "Allowed value:", tags: values });
  }
  const allowed = Array.isArray(schema.enum) ? schema.enum : items && Array.isArray(items.enum) ? items.enum : undefined;
  if (allowed) {
    const values = tagsOf(allowed);
    if (values.length > 0) out.push({ kind: "tags", label: "Allowed values:", tags: values });
  }
  const inner = { ...ctx, nested: true, parents: [...ctx.parents, schema] };
  if (items && isObjectSchema(items)) out.push(...schemaBlocks(items, inner));
  // Items of a plain type show in the type line, so their own blocks are not drawn. They are still walked, to stop the
  // build on what they use that the reference cannot draw.
  else if (items) valueBlocks(items, inner);
  return out;
}

/** An object's fields. Its own properties, then those of the schemas it is built from. */
function objectBlock(schema: Node, ctx: Context): Block {
  const parents = [...ctx.parents, schema];
  const required = requiredOf(schema);
  const limits = tagsOf([
    schema.minProperties ? `>= ${String(schema.minProperties)} properties` : undefined,
    schema.maxProperties ? `<= ${String(schema.maxProperties)} properties` : undefined,
  ]);
  const fieldsOf = (owner: Node, within: Node[]): Field[] =>
    propertiesOf(owner).map(([name, property]) => {
      if (within.includes(property) || (isNode(property.items) && within.includes(property.items))) unsupported("a recursive schema");
      // A property's own example is a value of the property, not a body of the media type.
      const inner = { ...ctx, nested: true, parents: within, mediaType: undefined };
      return field(name, required.includes(name), false, schemaBlocks(property, inner));
    });
  const fields = fieldsOf(schema, parents);
  const parts = (owner: Node, within: Node[]) => {
    for (const part of nodes(owner.allOf)) {
      check(part);
      if (within.includes(part)) unsupported("a recursive schema");
      fields.push(...fieldsOf(part, [...within, owner]));
      parts(part, [...within, owner]);
    }
  };
  parts(schema, ctx.parents);
  return { kind: "object", open: !ctx.nested, tags: limits, fields };
}

// A field reads as its name and type on one line, then what it means, its limits, its example and its fields.
const order: Record<Block["kind"], number> = { type: 0, title: 1, text: 1, docs: 1, tags: 2, example: 3, object: 4 };

function field(name: string, required: boolean, deprecated: boolean, blocks: Block[]): Field {
  const typeBlock = blocks.find((b): b is Extract<Block, { kind: "type" }> => b.kind === "type");
  const rest = blocks.filter((b) => b !== typeBlock).sort((a, b) => order[a.kind] - order[b.kind]);
  const type = typeBlock?.type ?? (rest.some((b) => b.kind === "object") ? { text: "object" } : undefined);
  return { name, required, deprecated, type, blocks: rest };
}

// A whole body reads as its type and limits, what it means, then its fields, then one example of all of it.
const bodyOrder: Record<Block["kind"], number> = { type: 0, tags: 1, title: 2, text: 2, docs: 2, object: 3, example: 4 };

/** A parameter, or a header, with its description and example. Its schema's description comes first. */
function parameterField(parameter: Node, name: string, level: number): Field {
  if (has(parameter, "content")) unsupported("a parameter with content");
  if (has(parameter, "examples")) unsupported("a parameter with named examples");
  const description = str(parameter.description);
  const schema = isNode(parameter.schema) ? parameter.schema : undefined;
  const isObject = schema ? isObjectSchema(schema) : false;
  const blocks: Block[] = [];
  if (isObject && description) blocks.push({ kind: "text", markdown: description });
  if (schema) blocks.push(...schemaBlocks(schema, { level, hideExample: parameter.example !== undefined, nested: false, parents: [] }));
  if (!isObject && description) blocks.push({ kind: "text", markdown: description });
  if (parameter.example !== undefined) blocks.push(example(parameter.example, level, false));
  return field(name, parameter.required === true, parameter.deprecated === true, blocks);
}

// Headers a client always sends are not parameters a reader chooses.
const ignoredHeaders = new Set(["accept", "authorization", "content-type"]);

function parametersOf(op: ApiOperation): Section | undefined {
  const byLocation = new Map<string, Map<string, Node>>();
  for (const parameter of [...nodes(op.item.parameters), ...nodes(op.node.parameters)]) {
    const where = String(parameter.in);
    const name = String(parameter.name);
    if (where === "body" || (where === "header" && ignoredHeaders.has(name.toLowerCase()))) continue;
    const list = byLocation.get(where) ?? new Map<string, Node>();
    list.set(name, parameter);
    byLocation.set(where, list);
  }
  if (byLocation.size === 0) return undefined;
  // Path parameters come first, since the path is read before the query.
  const locations = [...byLocation].sort((a, b) => (a[0] === "path" ? -1 : b[0] === "path" ? 1 : 0));
  return {
    id: "parameters",
    title: "Parameters",
    level: 2,
    sections: locations.map(([where, list]) => {
      const title = `${capitalize(where)} Parameters`;
      return { id: slug(title), title, level: 3, fields: [...list.values()].map((p) => parameterField(p, String(p.name), 4)) };
    }),
  };
}

// Precedence of the values a schema may give as its own example.
function authoredValue(schema: Node): unknown {
  if (has(schema, "const")) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (has(schema, "default")) return schema.default;
  if (has(schema, "example")) return schema.example;
  return undefined;
}

/** The example a schema gives, built up from its parts. With `make`, a value is made for every part that gives none. */
function exampleValue(root: Node, make: boolean): unknown {
  const seen = new WeakSet<Node>();
  const visit = (schema: Node): unknown => {
    if (seen.has(schema)) return make ? (isArrayType(schema.type) ? [] : isObjectSchema(schema) ? {} : primitive(schema)) : undefined;
    seen.add(schema);
    try {
      const own = authoredValue(schema);
      if (own !== undefined) return own;
      // The schema's own fields, then those of the objects it is built from, as its field list orders them.
      const fields: Node = {};
      for (const [name, property] of propertiesOf(schema)) {
        if (make && property.readOnly === true) continue;
        const v = visit(property);
        if (v !== undefined) fields[name] = v;
      }
      const parts = nodes(schema.allOf);
      if (parts.length > 0) {
        const objects: Node[] = [];
        let firstValue: unknown;
        for (const part of parts) {
          const value = visit(part);
          if (firstValue === undefined && value !== undefined) firstValue = value;
          if (isObjectSchema(part) && isNode(value)) objects.push(value);
        }
        if (objects.length > 0) {
          const value: Node = { ...fields };
          for (const [name, v] of Object.entries(Object.assign({}, ...objects))) if (!Object.hasOwn(value, name)) value[name] = v;
          return value;
        }
        if (firstValue !== undefined && Object.keys(fields).length === 0) return firstValue;
      }
      if (isObjectSchema(schema)) {
        if (Object.keys(fields).length > 0) return fields;
        return make ? {} : undefined;
      }
      if (isArrayType(schema.type)) {
        if (isNode(schema.items)) {
          if (seen.has(schema.items)) return make ? [] : undefined;
          const v = visit(schema.items);
          if (v !== undefined) return [v];
        }
        return make ? ["example"] : undefined;
      }
      return make ? primitive(schema) : undefined;
    } finally {
      seen.delete(schema);
    }
  };
  return visit(root);
}

// A made-up value of a type, for a generated example.
function primitive(schema: Node): unknown {
  const types = Array.isArray(schema.type) ? schema.type.map(String) : [String(schema.type)];
  const type = types.find((t) => t !== "null") ?? types[0];
  if (type === "boolean") return true;
  if (type === "integer" || type === "number") return 1;
  if (type === "string") {
    const formats: Record<string, string> = {
      binary: "binary",
      date: "2026-04-15",
      "date-time": "2026-04-15T12:00:00Z",
      email: "hello@example.com",
      uri: "https://example.com",
      uuid: "2489E9AD-2EE2-8E00-8EC9-32D5F69181C0",
    };
    return formats[String(schema.format)] ?? "example";
  }
  return "example";
}

type Entry = { mediaType: string; schema?: Node; example?: unknown; generated: boolean };

function entriesOf(content: unknown, kind: "request" | "response"): Entry[] {
  if (!isNode(content)) return [];
  return Object.entries(content).map(([mediaType, media]) => {
    const m = isNode(media) ? media : {};
    if (has(m, "examples")) unsupported("named examples");
    const schema = isNode(m.schema) ? m.schema : undefined;
    const entry: Entry = { mediaType, schema, example: m.example, generated: false };
    // A JSON body with no example of its own shows its schema's, or one made from the schema.
    if (entry.example !== undefined || !schema || !mediaType.includes("json")) return entry;
    const authored = exampleValue(schema, false);
    if (authored !== undefined) return kind === "response" ? { ...entry, example: authored } : entry;
    const made = exampleValue(schema, true);
    return made === undefined ? entry : { ...entry, example: made, generated: true };
  });
}

function mediaOf(entries: Entry[], level: number): Media[] {
  return entries.map((e) => {
    const blocks: Block[] = e.schema
      ? schemaBlocks(e.schema, { level, hideExample: e.example !== undefined, nested: false, parents: [], mediaType: e.mediaType })
      : [];
    if (e.example !== undefined) blocks.push(example(e.example, level, e.generated, e.mediaType));
    return { mediaType: e.mediaType, blocks: blocks.sort((a, b) => bodyOrder[a.kind] - bodyOrder[b.kind]) };
  });
}

function requestBodyOf(op: ApiOperation): OperationContent["requestBody"] {
  const body = op.node.requestBody;
  if (!isNode(body)) return undefined;
  return {
    id: "request-body",
    title: "Request Body",
    level: 2,
    required: body.required === true,
    description: str(body.description),
    media: mediaOf(entriesOf(body.content, "request"), 3),
  };
}

function responsesOf(op: ApiOperation): Section | undefined {
  if (!isNode(op.node.responses)) return undefined;
  const all = Object.entries(op.node.responses).filter((e): e is [string, Node] => isNode(e[1]));
  // The default response comes last.
  const ordered = [...all.filter(([name]) => name !== "default"), ...all.filter(([name]) => name === "default")];
  return {
    id: "responses",
    title: "Responses",
    level: 2,
    sections: ordered.map(([name, response]) => {
      const headers = isNode(response.headers)
        ? Object.entries(response.headers).filter((e): e is [string, Node] => isNode(e[1]) && e[0].toLowerCase() !== "content-type")
        : [];
      return {
        id: slug(name),
        title: name,
        level: 3,
        description: str(response.description),
        media: mediaOf(entriesOf(response.content, "response"), 4),
        sections:
          headers.length > 0
            ? [{ id: "headers", title: "Headers", level: 4, fields: headers.map(([header, h]) => parameterField(h, header, 5)) }]
            : undefined,
      };
    }),
  };
}

export function operationContent(op: ApiOperation): OperationContent {
  if (has(op.node, "callbacks")) unsupported("callbacks");
  if (has(op.node, "security")) unsupported("security");
  const docs = isNode(op.node.externalDocs)
    ? { href: String(op.node.externalDocs.url), label: str(op.node.externalDocs.description) ?? "More information" }
    : undefined;
  const content = {
    description: op.description,
    docs,
    parameters: parametersOf(op),
    requestBody: requestBodyOf(op),
    responses: responsesOf(op),
  };
  uniqueIds([content.parameters, content.requestBody, content.responses]);
  return content;
}

// Each section's heading is an anchor on the page, so its id is unique there. Several responses can each have a
// Headers section, so a repeated id takes the count of earlier uses, as headers-1, and the first keeps its own.
function uniqueIds(sections: (Section | undefined)[]) {
  const taken = new Set<string>();
  const visit = (section: Section) => {
    let id = section.id;
    for (let n = 1; taken.has(id); n++) id = `${section.id}-${n}`;
    taken.add(id);
    section.id = id;
    section.sections?.forEach(visit);
  };
  sections.forEach((s) => s && visit(s));
}
