import type { APIRoute, GetStaticPaths } from "astro";
import { allOperations, operationMarkdown, type ApiOperation } from "../../../../lib/api";

export const getStaticPaths = (() =>
  allOperations().map((op) => ({ params: { operation: op.operationId }, props: { op } }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ op: ApiOperation }> = ({ props }) =>
  new Response(operationMarkdown(props.op), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
