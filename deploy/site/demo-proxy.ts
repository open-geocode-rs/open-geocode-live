import { isIP } from "node:net";

const paths = {
  "/autocomplete": ["q", "limit", "layer", "country", "focus", "bbox"],
  "/geocode": ["q", "focus", "bbox", "address", "locality", "region", "postcode", "limit", "layer", "country"],
  "/places": ["q", "ids", "limit", "country", "focus", "bbox"],
  "/reverse": ["lon", "lat", "layer"],
} as const;

const aliases: ReadonlyMap<string, keyof typeof paths> = new Map([
  ["/api/autocomplete", "/autocomplete"],
  ["/api/geocode", "/geocode"],
  ["/api/places", "/places"],
  ["/api/reverse", "/reverse"],
  ["/api/search", "/geocode"],
  ["/api/try/geocode", "/geocode"],
  ["/api/try/places", "/places"],
  ["/api/try/reverse", "/reverse"],
]);

const WINDOW_MS = 10_000;
const REQUESTS_PER_CLIENT = 50;
const MAX_CLIENTS = 10_000;
const MAX_RESULTS = 10;
const MAX_RESPONSE_BYTES = 512 * 1024;

function problem(status: number, detail: string, retryAfter?: number) {
  const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/problem+json" });
  if (retryAfter !== undefined) headers.set("Retry-After", String(retryAfter));
  return Response.json({ status, detail }, { status, headers });
}

async function boundedBody(response: Response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return new Blob(chunks);
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Lookup response exceeds demo size limit");
    }
    chunks.push(value);
  }
}

export function demoHandler({
  upstream,
  maxConcurrent = 4,
  deadlineMs = 7_000,
  now = () => performance.now(),
}: {
  upstream: URL;
  maxConcurrent?: number;
  deadlineMs?: number;
  now?: () => number;
}) {
  const clients = new Map<string, { count: number; expires: number }>();
  let sweepAt = 0;
  let inFlight = 0;

  return async (request: Request) => {
    const url = new URL(request.url);
    const path = aliases.get(url.pathname);
    if (!path) return problem(404, "Unknown demo lookup");
    if (request.method !== "GET") return problem(405, "The demo only supports GET");
    if (request.body || request.headers.has("transfer-encoding") || Number(request.headers.get("content-length")) > 0) {
      return problem(400, "Demo lookups do not accept a request body");
    }
    if (url.search.length > 4096) return problem(414, "Lookup query is too long");

    const params = new URLSearchParams();
    const legacy = url.pathname === "/api/search";
    const allowed: readonly string[] = legacy ? ["q"] : paths[path];
    for (const [key, value] of url.searchParams) {
      if (!allowed.includes(key)) continue;
      if (params.has(key)) return problem(400, `Parameter ${key} must appear once`);
      params.set(key, value);
    }
    const ids = params.get("ids");
    const idCount = ids?.split(",").length ?? 0;
    if (idCount > MAX_RESULTS) return problem(400, `Use at most ${MAX_RESULTS} place IDs in the demo`);
    if (path !== "/reverse") {
      const limit = params.get("limit") ?? "0";
      if (!/^\d+$/.test(limit) || Number(limit) > MAX_RESULTS) {
        return problem(400, `Use a result limit between 0 and ${MAX_RESULTS} in the demo`);
      }
      params.set("limit", String(legacy ? 1 : Number(limit) || idCount || 5));
    }

    // The loopback Caddy listener replaces this header with Cloudflare's client IP.
    const ip = request.headers.get("X-Og-Demo-IP") ?? "";
    const version = isIP(ip);
    const key = version === 6 ? new URL(`http://[${ip}]`).hostname : version === 4 ? ip : "";
    const time = now();
    if (time >= sweepAt) {
      for (const [client, bucket] of clients) if (bucket.expires <= time) clients.delete(client);
      sweepAt = time + WINDOW_MS;
    }
    let bucket = clients.get(key);
    if (!bucket || bucket.expires <= time) {
      if (!bucket && clients.size >= MAX_CLIENTS) return problem(503, "Demo lookup capacity is full", 1);
      bucket = { count: 0, expires: time + WINDOW_MS };
      clients.set(key, bucket);
    }
    if (bucket.count >= REQUESTS_PER_CLIENT) {
      return problem(429, "Too many demo lookups. Try again shortly.", Math.ceil((bucket.expires - time) / 1000));
    }
    bucket.count += 1;
    if (inFlight >= maxConcurrent) return problem(503, "Demo lookup capacity is full", 1);

    const target = new URL(path, upstream);
    target.search = params.toString();
    const headers = new Headers({ "Accept-Encoding": "identity" });
    if (!legacy && (path === "/autocomplete" || path === "/geocode") && !params.has("focus") && version) {
      headers.set("CF-Connecting-IP", ip);
      headers.set("X-Og-Site-Focus", "1");
    }

    inFlight += 1;
    const timeout = AbortSignal.timeout(deadlineMs);
    try {
      const response = await fetch(target, {
        headers,
        // A disconnected browser must not free a slot while the licence filter still has work.
        signal: timeout,
        redirect: "error",
      });
      const body = await boundedBody(response);
      const reply = new Headers({ "Cache-Control": "no-store" });
      for (const name of ["Content-Type", "Retry-After", "X-Request-Id"]) {
        const value = response.headers.get(name);
        if (value) reply.set(name, value);
      }
      return new Response(body, { status: response.status, headers: reply });
    } catch {
      return timeout.aborted
        ? problem(504, "The demo lookup timed out")
        : problem(502, "The lookup service is unavailable");
    } finally {
      inFlight -= 1;
    }
  };
}

if (import.meta.main) {
  const port = Number(process.env.OG_DEMO_UPSTREAM_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 8089) {
    throw new Error("Set OG_DEMO_UPSTREAM_PORT to the port of the verified lookup backend");
  }
  Bun.serve({
    hostname: "127.0.0.1",
    port: 8089,
    idleTimeout: 10,
    maxRequestBodySize: 1,
    fetch: demoHandler({ upstream: new URL(`http://127.0.0.1:${port}`) }),
  });
}
