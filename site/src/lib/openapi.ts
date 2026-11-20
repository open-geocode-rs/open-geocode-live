// The API reference, read from the OpenAPI document the engine publishes. Its operations, tags and routes,
// and the sidebar group that lists them. Nothing here needs the site's content, so the config reads it too.
import openapi from "../../public/openapi.json";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
/** A schema, parameter, response or any other object of the document, once its references are resolved. */
export type Node = { [key: string]: unknown };

// Operations are read in this order on each path, so a path's GET comes before its POST.
const methods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
/** The methods the reference shows, each with its own badge. */
const shown = ["get", "post", "query", "delete"] as const;
export type HttpMethod = (typeof shown)[number];
const isShown = (method: string): method is HttpMethod => (shown as readonly string[]).includes(method);

export const API_BASE = "docs/api";
const OPERATIONS_BASE = `${API_BASE}/operations/`;

export const isNode = (value: unknown): value is Node => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The document with every `$ref` resolved. A reference resolves to the very object it names, so a schema used
 * in many places is one object. A reference with keys beside it, such as its own `description`, resolves to a
 * new object of the named one with those keys laid over it.
 */
function resolved(document: Node): Node {
  const root = structuredClone(document);
  const targets = new Map<string, unknown>();
  const done = new WeakSet<object>();

  const target = (ref: string): unknown => {
    if (targets.has(ref)) return targets.get(ref);
    if (!ref.startsWith("#/")) throw new Error(`The API reference reads only references inside the document, not "${ref}".`);
    let value: unknown = root;
    for (const part of ref.slice(2).split("/")) {
      const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
      value = isNode(value) ? value[key] : undefined;
    }
    if (value === undefined) throw new Error(`The OpenAPI document has no "${ref}".`);
    targets.set(ref, value);
    return walk(value);
  };

  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      if (done.has(value)) return value;
      done.add(value);
      value.forEach((item, i) => (value[i] = walk(item)));
      return value;
    }
    if (!isNode(value)) return value;
    if (typeof value.$ref === "string") {
      const { $ref, ...beside } = value;
      const named = target($ref);
      return Object.keys(beside).length > 0 && isNode(named) ? { ...named, ...walk(beside) as Node } : named;
    }
    if (done.has(value)) return value;
    done.add(value);
    for (const key of Object.keys(value)) value[key] = walk(value[key]);
    return value;
  };

  return walk(root) as Node;
}

export const document = resolved(openapi as unknown as Node);

/** A heading id or a route segment, made the way the reference has always made them. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export type Tag = { name: string; description: string; slug: string };

export type ApiOperation = {
  operationId: string;
  summary?: string;
  description?: string;
  /** The method the site shows. */
  method: HttpMethod;
  /** A second method the operation answers the same, shown beside `method`. */
  alias?: HttpMethod;
  path: string;
  /** The page title, and the label of its sidebar link. */
  title: string;
  tag: string;
  slug: string;
  href: string;
  /** The operation with its references resolved. */
  node: Node;
  /** The operation as the document writes it, references and all. */
  raw: Node;
  /** The path item the operation sits on, with its references resolved. */
  item: Node;
};

// OpenAPI 3.1 has no QUERY, so the engine documents a QUERY batch on its POST alias
// and marks it with the Accept-Query header. The site shows it as the QUERY it is.
function methodOf(method: (typeof methods)[number], op: Node): Pick<ApiOperation, "method" | "alias"> {
  const responses = isNode(op.responses) ? Object.values(op.responses) : [];
  const query = responses.some((r) => isNode(r) && isNode(r.headers) && "Accept-Query" in r.headers);
  if (method === "post" && query) return { method: "query", alias: "post" };
  if (!isShown(method)) throw new Error(`The API reference has no badge for ${method.toUpperCase()}. Give the method one in Badge.`);
  return { method };
}

const paths = isNode(document.paths) ? document.paths : {};
const rawPaths = (openapi as unknown as Node).paths as Record<string, Record<string, Node>>;
// Each tag has an overview page, which says what its description says.
const tagList: Tag[] = (Array.isArray(document.tags) ? document.tags : []).filter(isNode).map((t) => {
  if (typeof t.description !== "string" || t.description.length === 0) throw new Error(`The tag "${String(t.name)}" has no description for its overview page.`);
  return { name: String(t.name), description: t.description, slug: slug(String(t.name)) };
});

const operationList: ApiOperation[] = Object.entries(paths).flatMap(([path, item]) =>
  methods.flatMap((method) => {
    const op = isNode(item) ? item[method] : undefined;
    if (!isNode(op)) return [];
    if (typeof op.operationId !== "string") throw new Error(`${method.toUpperCase()} ${path} has no operationId to name its page.`);
    const tags = Array.isArray(op.tags) ? op.tags.map(String) : [];
    if (tags.length !== 1) throw new Error(`${op.operationId} has ${tags.length} tags. The reference lists each operation under exactly one.`);
    if (!tagList.some((t) => t.name === tags[0])) throw new Error(`${op.operationId} is tagged "${tags[0]}", which the document's tags do not list.`);
    const summary = typeof op.summary === "string" ? op.summary : undefined;
    const opSlug = slug(op.operationId);
    return [
      {
        operationId: op.operationId,
        summary,
        description: typeof op.description === "string" ? op.description : undefined,
        ...methodOf(method, op),
        path,
        title: summary ?? op.operationId,
        tag: tags[0],
        slug: opSlug,
        href: `/${OPERATIONS_BASE}${opSlug}/`,
        node: op,
        raw: rawPaths[path][method],
        item: isNode(item) ? item : {},
      },
    ];
  }),
);

// Operations are grouped by tag in the document's order of tags, each in the order of its paths.
const byTag = tagList.map((tag) => ({ tag, operations: operationList.filter((op) => op.tag === tag.name) }));

export const info = isNode(document.info) ? document.info : {};
export const openapiVersion = String(document.openapi);
export const SERVER = (
  Array.isArray(document.servers) && isNode(document.servers[0]) ? String(document.servers[0].url) : "http://127.0.0.1:8080"
).replace(/\/$/, "");

export function allOperations(): ApiOperation[] {
  return byTag.flatMap((g) => g.operations);
}

export function operationsByTag(): { tag: Tag; operations: ApiOperation[] }[] {
  return byTag;
}

export function tags(): Tag[] {
  return tagList;
}

export const tagHref = (tag: Tag) => `/${OPERATIONS_BASE}tags/${tag.slug}/`;

export function operationFor(id: string): ApiOperation | undefined {
  return id.startsWith(OPERATIONS_BASE) ? operationList.find((op) => op.slug === id.slice(OPERATIONS_BASE.length)) : undefined;
}

/** Whether a page is one of the API reference pages the OpenAPI document makes. */
export function isApiPage(id: string): boolean {
  return id === API_BASE || id.startsWith(`${API_BASE}/`);
}

/** The sidebar group of the reference. A tag's group opens on its overview, and each operation's link names its method. */
export function apiSidebarGroup(label: string) {
  return {
    label,
    collapsed: false,
    items: [
      { label: "Overview", link: `/${API_BASE}/` },
      ...byTag.map(({ tag, operations }) => ({
        label: tag.name,
        collapsed: false,
        items: [
          { label: "Overview", link: tagHref(tag) },
          ...operations.map((op) => ({
            label: op.title,
            link: op.href,
            badge: { text: op.method.toUpperCase(), class: `method-${op.method}` },
          })),
        ],
      })),
    ],
  };
}
