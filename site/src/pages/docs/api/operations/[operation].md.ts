import type { APIRoute, GetStaticPaths } from "astro";
import { operationMarkdown } from "../../../../lib/api";
import { allOperations, type ApiOperation } from "../../../../lib/openapi";

export const getStaticPaths = (() =>
  allOperations().map((op) => ({ params: { operation: op.slug }, props: { op } }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ op: ApiOperation }> = ({ props }) =>
  new Response(operationMarkdown(props.op), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
