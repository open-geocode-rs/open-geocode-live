import { defineRouteMiddleware } from "@astrojs/starlight/route-data";
import { operationFor } from "./lib/api";

// Operation pages use the right column for the code sample, so they drop "On this page"
// and the previous/next pager. Runs after next(): the starlight-openapi middleware
// rebuilds pagination after ours would otherwise run.
export const onRequest = defineRouteMiddleware(async ({ locals }, next) => {
  await next();
  const route = locals.starlightRoute;
  if (!operationFor(route.id)) return;
  route.toc = undefined;
  route.pagination = { prev: undefined, next: undefined };
});
