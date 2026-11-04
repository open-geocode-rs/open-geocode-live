import { defineRouteMiddleware, type StarlightRouteData } from "@astrojs/starlight/route-data";
import { operationFor } from "./lib/api";

// Operation pages use the right column for the code sample, so they drop "On this page"
// and the previous/next pager. Runs after next(): the starlight-openapi middleware
// rebuilds pagination after ours would otherwise run.
export const onRequest = defineRouteMiddleware(async ({ locals }, next) => {
  await next();
  const route = locals.starlightRoute;
  relabel(route.sidebar);
  if (!operationFor(route.id)) return;
  route.toc = undefined;
  route.pagination = { prev: undefined, next: undefined };
});

// The plugin badges a QUERY batch as the POST it is documented on; give its sidebar
// link the method the page shows.
function relabel(entries: StarlightRouteData["sidebar"]) {
  for (const e of entries) {
    if (e.type === "group") relabel(e.entries);
    else if (e.badge) {
      const op = operationFor(e.href.replace(/^\/|\/$/g, ""));
      if (op?.alias) e.badge = { ...e.badge, text: op.method.toUpperCase(), class: `sl-openapi-method-${op.method}` };
    }
  }
}
