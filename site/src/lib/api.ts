import { getCollection } from "astro:content";
import type { StarlightRouteData } from "@astrojs/starlight/route-data";
import openapi from "../../public/openapi.json";
import examplesJson from "../data/examples.json";

type Parameter = {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: { type?: string | string[]; $ref?: string };
};
type Operation = {
  operationId: string;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  responses?: Record<string, { description?: string; headers?: Record<string, unknown> }>;
};
// `alias` is a second method the operation answers the same, shown beside `method`.
export type ApiOperation = Operation & { method: string; alias?: string; path: string };

const OPERATIONS_BASE = "docs/api/operations/";

// OpenAPI 3.1 has no QUERY, so the engine documents a QUERY batch on its POST alias
// and marks it with the Accept-Query header. The site shows it as the QUERY it is.
function methodOf(method: string, op: Operation): Pick<ApiOperation, "method" | "alias"> {
  const query = Object.values(op.responses ?? {}).some((r) => r.headers && "Accept-Query" in r.headers);
  return method === "post" && query ? { method: "query", alias: "post" } : { method };
}

// starlight-openapi slugs pages by operationId; every og operationId is already a slug.
const operations = new Map<string, ApiOperation>(
  Object.entries(openapi.paths as Record<string, Record<string, Operation>>).flatMap(([path, item]) =>
    Object.entries(item).map(([method, op]) => [op.operationId, { ...op, ...methodOf(method, op), path }] as const),
  ),
);

export function allOperations(): ApiOperation[] {
  return [...operations.values()];
}

export function operationFor(id: string): ApiOperation | undefined {
  return id.startsWith(OPERATIONS_BASE) ? operations.get(id.slice(OPERATIONS_BASE.length)) : undefined;
}

// getEntry would warn on every generated API page, so look ids up in one set.
let docIds: Promise<Set<string>> | undefined;

export async function markdownPath(id: string): Promise<string | undefined> {
  docIds ??= getCollection("docs").then((docs) => new Set(docs.map((d) => d.id)));
  return operationFor(id) || (await docIds).has(id) ? `/${id}.md` : undefined;
}

export function operationMarkdown(op: ApiOperation): string {
  const route = `\`${op.method.toUpperCase()} ${op.path}\``;
  const lines = [`# ${op.summary ?? op.operationId}`, "", op.alias ? `${route}, or \`${op.alias.toUpperCase()} ${op.path}\`` : route, ""];
  if (op.description) lines.push(op.description, "");
  if (op.parameters?.length) {
    lines.push("## Parameters", "", "| Name | In | Required | Type | Description |", "| --- | --- | --- | --- | --- |");
    for (const p of op.parameters) {
      const type = [p.schema?.type ?? p.schema?.$ref?.split("/").pop() ?? ""].flat().join(" | ");
      const description = (p.description ?? "").replace(/\s*\n\s*/g, " ").replaceAll("|", "\\|");
      lines.push(`| \`${p.name}\` | ${p.in} | ${p.required ? "yes" : "no"} | ${type} | ${description} |`);
    }
    lines.push("");
  }
  if (op.responses) {
    lines.push("## Responses", "");
    for (const [status, r] of Object.entries(op.responses)) lines.push(`- \`${status}\`: ${r.description ?? ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

type Crumb = { label: string; href: string };
type Entry = StarlightRouteData["sidebar"][number];

function firstHref(entries: Entry[]): string | undefined {
  for (const e of entries) {
    const href = e.type === "link" ? e.href : firstHref(e.entries);
    if (href) return href;
  }
}

// Groups have no page of their own, so a crumb links to the group's first page.
export function breadcrumbs(sidebar: Entry[], trail: Crumb[] = []): Crumb[] | undefined {
  for (const e of sidebar) {
    if (e.type === "link") {
      if (e.isCurrent) return trail;
      continue;
    }
    const found = breadcrumbs(e.entries, [...trail, { label: e.label, href: firstHref(e.entries) ?? "#" }]);
    if (found) return found;
  }
}

export const SERVER = (openapi.servers?.[0]?.url ?? "http://127.0.0.1:8080").replace(/\/$/, "");

// A request is a GET unless it names a method. `body` is sent as JSON, `upload` as a
// file of that media type, and `answer` is how the reply is read: JSON unless said.
export type Example = {
  method?: string;
  request: string;
  body?: unknown;
  upload?: { file: string; type: string };
  answer?: "json" | "text" | "none";
  response?: string;
};
const examples = examplesJson as Record<string, Example>;

export function exampleFor(op: ApiOperation): Example {
  return examples[op.operationId] ?? { method: op.method, request: op.path };
}

export type Snippet = { id: string; label: string; lang: "sh" | "js" | "python"; code: string };

const indent = (text: string, by: string) => text.replaceAll("\n", `\n${by}`);

export function snippetsFor(example: Example): Snippet[] {
  const { request, body, upload, answer = "json" } = example;
  const method = (example.method ?? "get").toUpperCase();
  const url = SERVER + request;
  const { pathname, searchParams } = new URL(url);
  const json = body === undefined ? undefined : JSON.stringify(body, null, 2);
  const type = upload?.type ?? (json ? "application/json" : undefined);

  const curl = [`curl${method === "GET" ? "" : ` -X ${method}`} '${url}'`];
  if (type) curl.push(`-H 'Content-Type: ${type}'`);
  if (json) curl.push(`-d '${JSON.stringify(body)}'`);
  if (upload) curl.push(`--data-binary @${upload.file}`);

  const init = [];
  if (method !== "GET") init.push(`method: "${method}",`);
  if (type) init.push(`headers: { "Content-Type": "${type}" },`);
  if (json) init.push(`body: JSON.stringify(${indent(json, "  ")}),`);
  if (upload) init.push(`body: await readFile("${upload.file}"),`);
  const js = [
    ...(upload ? ['import { readFile } from "node:fs/promises";', ""] : []),
    init.length ? `const response = await fetch("${url}", {\n  ${init.join("\n  ")}\n});` : `const response = await fetch("${url}");`,
    ...(answer === "none" ? [] : [`const answer = await response.${answer}();`]),
  ].join("\n");

  const args = [`"${SERVER}${pathname}"`];
  if (searchParams.size) args.push(`params={${[...searchParams].map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join(", ")}}`);
  if (json) args.push(`json=${indent(json, "    ")}`);
  if (upload) args.push("data=rows", `headers={"Content-Type": "${type}"}`);
  const read = { json: ".json()", text: ".text", none: "" }[answer];
  // requests has a function per standard method; QUERY goes through requests.request.
  const standard = ["GET", "POST", "DELETE"].includes(method);
  const fn = standard ? `requests.${method.toLowerCase()}` : "requests.request";
  if (!standard) args.unshift(`"${method}"`);
  const call = `${fn}(\n    ${args.join(",\n    ")},\n)${read}`;
  const python = upload
    ? `import requests\n\nwith open("${upload.file}", "rb") as rows:\n    answer = ${indent(call, "    ")}`
    : args.length === 1
      ? `import requests\n\n${answer === "none" ? "" : "answer = "}${fn}(${args[0]})${read}`
      : `import requests\n\n${answer === "none" ? "" : "answer = "}${call}`;

  return [
    { id: "curl", label: "cURL", lang: "sh", code: curl.join(" \\\n  ") },
    { id: "javascript", label: "JavaScript", lang: "js", code: js },
    { id: "python", label: "Python", lang: "python", code: python },
  ];
}

// Each method's icon: GET takes an answer in, POST sends one out, QUERY looks many up,
// DELETE removes.
export const METHOD_ICONS: Record<string, string> = {
  get: "M17 7 7 17M17 17H7V7",
  post: "M7 17 17 7M7 7h10v10",
  query: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  delete: "M18 6 6 18M6 6l12 12",
};
