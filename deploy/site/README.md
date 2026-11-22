# Public lookup limits

The public site serves four canonical GET lookups at `/api/autocomplete`, `/api/geocode`, `/api/places`, and `/api/reverse`. The instance still accepts `/api/search` and the three existing `/api/try/*` paths during migration. All eight share a per-client budget and an aggregate concurrency cap. Static files do not enter the proxy. The separate engine hostname stays outside this configuration and should require Cloudflare Access.

## Origin rollout

1. Build the proxy with `bun build --compile deploy/site/demo-proxy.ts --outfile ./og-demo-proxy`. Install the binary to `/usr/local/libexec/og-demo-proxy` and the unit to `/etc/systemd/system/open-geocode-demo-proxy.service`.
2. The unit defaults to the installed lookup licence filter on loopback port 8088. Verify that this backend is available before starting the proxy. Set `OG_DEMO_UPSTREAM_PORT` in a systemd drop-in if a different backend is approved. Point directly at the engine only after verifying that the served Pack excludes withdrawn data.
3. Start the service, verify a canonical lookup and its legacy equivalent, then validate and reload Caddy. This rollout keeps the engine timeouts as configured. The proxy allows four upstream lookups at a time, refuses excess work with `503`, and gives admitted requests up to seven seconds. Caddy's timeout is longer so clients can receive the proxy's structured response.
4. Check static docs while driving concurrent lookup traffic in staging. Watch edge `429` responses, origin `503` and `504` responses, and lookup tail latency before adjusting limits. Log aggregate counts without storing address queries or client IPs.

## Cloudflare

Create a rate-limit rule in the `opengeocode.com` zone using this path expression, IP as the counting characteristic, 50 requests per 10 seconds as the initial threshold, and Block for 10 seconds. Check real traffic and shared-IP false positives before enforcing. Keep the rule in sync with the Caddy allowlist until the aliases are retired.

```text
http.request.uri.path in {
  "/api/autocomplete" "/api/geocode" "/api/places" "/api/reverse"
  "/api/search" "/api/try/geocode" "/api/try/places" "/api/try/reverse"
}
```

Cloudflare's counters are approximate and scoped by location. The origin cap applies across all edge locations. CF credentials and Access service tokens belong in the deployment secret store.
