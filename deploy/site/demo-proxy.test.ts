import { afterAll, beforeEach, expect, test } from "bun:test";
import { demoHandler } from "./demo-proxy";

let requests: { url: string; headers: Headers }[] = [];
let answer: () => Response | Promise<Response>;
const upstream = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    requests.push({ url: request.url, headers: new Headers(request.headers) });
    return answer();
  },
});
afterAll(() => upstream.stop(true));
beforeEach(() => {
  requests = [];
  answer = () => Response.json({ features: [] });
});

const click = (path: string, ip = "203.0.113.10", init: RequestInit = {}) =>
  new Request(`http://demo.test${path}`, { headers: { "X-Og-Demo-IP": ip }, ...init });

test("canonical lookups and legacy routes share a per-client limit", async () => {
  let time = 0;
  const run = demoHandler({ upstream: upstream.url, now: () => time });
  for (let i = 0; i < 50; i++) {
    const response = await run(click(i % 2 ? "/api/autocomplete?q=Ams" : "/api/try/places?q=Amsterdam"));
    expect(response.status).toBe(200);
  }
  const blocked = await run(click("/api/search?q=Amsterdam"));
  expect(blocked.status).toBe(429);
  expect(blocked.headers.get("Retry-After")).toBe("10");
  expect(blocked.headers.get("Cache-Control")).toBe("no-store");
  expect(requests).toHaveLength(50);
  expect((await run(click("/api/search?q=Amsterdam", "203.0.113.11"))).status).toBe(200);
  time = 10_000;
  expect((await run(click("/api/search?q=Amsterdam"))).status).toBe(200);
});

test("only GET lookup parameters reach the backend", async () => {
  const run = demoHandler({ upstream: upstream.url });
  for (const [path, method, expected] of [
    ["/jobs", "POST", 404],
    ["/api/jobs", "GET", 404],
    ["/api/geocode", "POST", 405],
    ["/api/places", "QUERY", 405],
    ["/api/autocomplete?q=a&q=b", "GET", 400],
    [`/api/places?ids=${Array(11).fill("osm:node:1").join(",")}`, "GET", 400],
    ["/api/places?q=a&limit=11", "GET", 400],
  ] as const) {
    expect((await run(click(path, undefined, { method }))).status).toBe(expected);
  }
  expect(requests).toHaveLength(0);
  expect((await run(click("/api/autocomplete?q=AMS&focus=4.89,52.37&limit=3&unknown=ignored"))).status).toBe(200);
  const auto = new URL(requests[0].url);
  expect(auto.pathname).toBe("/autocomplete");
  expect([...auto.searchParams]).toEqual([["q", "AMS"], ["focus", "4.89,52.37"], ["limit", "3"]]);
  expect(requests[0].headers.has("CF-Connecting-IP")).toBe(false);
  await run(click("/api/geocode?q=Amsterdam"));
  expect(requests[1].headers.get("CF-Connecting-IP")).toBe("203.0.113.10");
  expect(requests[1].headers.get("X-Og-Site-Focus")).toBe("1");
  await run(click("/api/search?q=Amsterdam&limit=10"));
  expect(new URL(requests[2].url).searchParams.get("limit")).toBe("1");
  expect(requests[2].headers.has("CF-Connecting-IP")).toBe(false);
});

test("saturation refuses work even after the browser disconnects", async () => {
  const run = demoHandler({ upstream: upstream.url, maxConcurrent: 1 });
  const entered = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<Response>();
  answer = () => {
    entered.resolve();
    return finished.promise;
  };
  const client = new AbortController();
  const first = run(click("/api/geocode?q=Slow", undefined, { signal: client.signal }));
  await entered.promise;
  client.abort();
  const busy = await run(click("/api/autocomplete?q=AMS", "203.0.113.11"));
  expect(busy.status).toBe(503);
  expect(busy.headers.get("Retry-After")).toBe("1");
  expect(requests).toHaveLength(1);
  finished.resolve(Response.json({ ok: true }));
  expect((await first).status).toBe(200);
  answer = () => Response.json({ features: [] });
  expect((await run(click("/api/places?q=AMS"))).status).toBe(200);
});

test("accepts legitimate work over a second", async () => {
  const run = demoHandler({ upstream: upstream.url });
  answer = async () => {
    await Bun.sleep(1_100);
    return Response.json({ features: [] });
  };
  expect((await run(click("/api/autocomplete?q=AMS"))).status).toBe(200);
});

test("a stalled backend and an oversized response release their slots", async () => {
  const run = demoHandler({ upstream: upstream.url, deadlineMs: 50, maxConcurrent: 1 });
  answer = async () => {
    await Bun.sleep(350);
    return Response.json({ features: [] });
  };
  expect((await run(click("/api/autocomplete?q=AMS"))).status).toBe(504);
  answer = () => new Response("x".repeat(512 * 1024 + 1));
  expect((await run(click("/api/places?q=AMS"))).status).toBe(502);
  answer = () => Response.json({ features: [] }, { status: 503, headers: { "Retry-After": "2" } });
  const response = await run(click("/api/geocode?q=AMS"));
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("2");
});
