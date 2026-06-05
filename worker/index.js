// Cloudflare Worker — the public front door. The static UI is served by Workers
// Static Assets before this code runs; the Worker only proxies <BASE>/api/* to
// the runtime, stripping the prefix (<BASE>/api/search -> /search). BASE_PATH is
// the mount path, so the same Worker runs at any prefix. In prod it presents a
// Cloudflare Access service token so only this Worker can reach the origin. Tiles
// are not served here — the browser fetches them direct from public R2.

// Route suffix, joined to env.BASE_PATH (the mount prefix) at request time.
const API_SUFFIX = "/api";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const base = env.BASE_PATH ?? ""; // e.g. "/open-geocode", or "" at root
    const apiPrefix = base + API_SUFFIX;

    if (url.pathname === apiPrefix || url.pathname.startsWith(apiPrefix + "/")) {
      return proxyToRuntime(request, url, env, apiPrefix);
    }

    // Reaching here means the path matched no static asset (assets are served
    // before the Worker runs) and is not an API route.
    return new Response("Not found", { status: 404 });
  },
};

async function proxyToRuntime(request, url, env, apiPrefix) {
  const origin = env.RUNTIME_ORIGIN;
  if (!origin) {
    return new Response("RUNTIME_ORIGIN is not configured", { status: 500 });
  }

  // <BASE>/api/search?q=.. -> <origin>/search?q=..
  const upstreamPath = url.pathname.slice(apiPrefix.length) || "/";
  const target = new URL(upstreamPath + url.search, origin);

  const headers = new Headers(request.headers);
  // Don't leak the public Host to the upstream; fetch sets it from the target.
  headers.delete("host");

  // In prod, present the Access service token so the tunnel origin only accepts
  // calls from this Worker (set via: wrangler secret put ACCESS_CLIENT_ID / _SECRET).
  if (env.ACCESS_CLIENT_ID && env.ACCESS_CLIENT_SECRET) {
    headers.set("CF-Access-Client-Id", env.ACCESS_CLIENT_ID);
    headers.set("CF-Access-Client-Secret", env.ACCESS_CLIENT_SECRET);
  }

  // The public API is GET-only; never forward a request body.
  return fetch(target, { method: request.method, headers });
}
