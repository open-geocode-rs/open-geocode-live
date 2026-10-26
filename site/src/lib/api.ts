import { getCollection } from "astro:content";
import openapi from "../../public/openapi.json";

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
  responses?: Record<string, { description?: string }>;
};
export type ApiOperation = Operation & { method: string; path: string };

const OPERATIONS_BASE = "docs/api/operations/";

// starlight-openapi slugs pages by operationId; every og operationId is already a slug.
const operations = new Map<string, ApiOperation>(
  Object.entries(openapi.paths as Record<string, Record<string, Operation>>).flatMap(([path, item]) =>
    Object.entries(item).map(([method, op]) => [op.operationId, { ...op, method, path }] as const),
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
  const lines = [`# ${op.summary ?? op.operationId}`, "", `\`${op.method.toUpperCase()} ${op.path}\``, ""];
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

