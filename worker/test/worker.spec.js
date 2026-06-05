import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../index.js";

// Unit-test the Worker's logic — /api prefix stripping, proxy target, headers,
// and the non-asset 404 — with the outbound fetch stubbed. Asset serving is the
// platform's job (before the Worker runs), so it's covered by the smoke test.

const RUNTIME = "http://127.0.0.1:8080";
// The Worker never reads ctx, but fetch handlers receive one.
const ctx = { waitUntil() {}, passThroughOnException() {} };

/** Replace the global fetch with a spy returning a canned upstream response. */
function stubUpstream(response = new Response("upstream-ok", { status: 200 })) {
  const spy = vi.fn(async () => response);
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.restoreAllMocks());

describe("/api/* proxying", () => {
  it("strips the /api prefix and forwards path + query to RUNTIME_ORIGIN", async () => {
    const spy = stubUpstream();
    const res = await worker.fetch(
      new Request("https://app.example/api/search?q=King%20Street&limit=2"),
      { RUNTIME_ORIGIN: RUNTIME },
      ctx,
    );
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    const [target, init] = spy.mock.calls[0];
    expect(String(target)).toBe(`${RUNTIME}/search?q=King%20Street&limit=2`);
    expect(init.method).toBe("GET");
  });

  it("maps bare /api to the upstream root /", async () => {
    const spy = stubUpstream();
    await worker.fetch(new Request("https://app.example/api"), { RUNTIME_ORIGIN: RUNTIME }, ctx);
    expect(String(spy.mock.calls[0][0])).toBe(`${RUNTIME}/`);
  });

  it("does not forward the public Host header upstream", async () => {
    const spy = stubUpstream();
    await worker.fetch(
      new Request("https://app.example/api/healthz"),
      { RUNTIME_ORIGIN: RUNTIME },
      ctx,
    );
    expect(spy.mock.calls[0][1].headers.get("host")).toBeNull();
  });

  it("attaches CF Access service-token headers when both secrets are present", async () => {
    const spy = stubUpstream();
    await worker.fetch(
      new Request("https://app.example/api/search?q=a"),
      { RUNTIME_ORIGIN: RUNTIME, ACCESS_CLIENT_ID: "id-123", ACCESS_CLIENT_SECRET: "secret-xyz" },
      ctx,
    );
    const headers = spy.mock.calls[0][1].headers;
    expect(headers.get("cf-access-client-id")).toBe("id-123");
    expect(headers.get("cf-access-client-secret")).toBe("secret-xyz");
  });

  it("omits Access headers when the secrets are absent (local dev)", async () => {
    const spy = stubUpstream();
    await worker.fetch(new Request("https://app.example/api/search?q=a"), { RUNTIME_ORIGIN: RUNTIME }, ctx);
    expect(spy.mock.calls[0][1].headers.get("cf-access-client-id")).toBeNull();
  });

  it("returns 500 and does not call upstream when RUNTIME_ORIGIN is unset", async () => {
    const spy = stubUpstream();
    const res = await worker.fetch(new Request("https://app.example/api/search?q=a"), {}, ctx);
    expect(res.status).toBe(500);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("non-API routing", () => {
  it("returns a 404 for a non-asset, non-api path without calling upstream", async () => {
    const spy = stubUpstream();
    const res = await worker.fetch(new Request("https://app.example/nope"), { RUNTIME_ORIGIN: RUNTIME }, ctx);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("BASE_PATH mounting (app served at a sub-path)", () => {
  const BASE = "/open-geocode";

  it("strips <BASE>/api before forwarding to the Runtime", async () => {
    const spy = stubUpstream();
    await worker.fetch(
      new Request("https://app.example/open-geocode/api/search?q=King"),
      { RUNTIME_ORIGIN: RUNTIME, BASE_PATH: BASE },
      ctx,
    );
    expect(String(spy.mock.calls[0][0])).toBe(`${RUNTIME}/search?q=King`);
  });

  it("404s a prefix-less /api when BASE_PATH is set, without calling upstream", async () => {
    const spy = stubUpstream();
    const res = await worker.fetch(
      new Request("https://app.example/api/search?q=King"),
      { RUNTIME_ORIGIN: RUNTIME, BASE_PATH: BASE },
      ctx,
    );
    expect(res.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });
});
