---
title: Serve the API
description: Run the open-geocode HTTP API from a Pack, choose the bind address, check health and readiness, and deploy it on a VM or a scale-to-zero platform.
---

Use `og serve` to serve a Pack's HTTP API.

```sh
og serve canada-ontario
```

```txt
Serving <og home>/packs/canada-ontario at http://127.0.0.1:8080
```

`og serve` takes a Pack in the og home by name, such as `canada-ontario`, or a path to a Pack anywhere on disk.

### `--bind`

og listens on `127.0.0.1:8080` by default, so only this machine can reach it.
To listen on another address or port, use `--bind`.

```sh
og serve canada-ontario --bind 0.0.0.0:8080
```

## Endpoints

og serves `/search`, `/geocode`, `/autocomplete` and `/reverse` for geocoding, `/healthz` and `/readyz` for health, and `/openapi.json` for the contract it is serving.
See the [API reference](/docs/api/) for every endpoint and parameter.

The API is GET-only and stateless, so it caches well behind a CDN.

## Health checks

Use `/healthz` as a load balancer's liveness check, and `/readyz` as its readiness check.
`/healthz` answers as soon as the server is listening.
`/readyz` answers `503` until the Pack is open, then `200`.
Both return an empty body.

## Deploying

og is designed to be easy to deploy.

- **One file to ship**. Copy the binary and the Pack. There is no database to provision or migrate.
- **Memory-mapped**. The Pack is mapped, not loaded, so the server starts quickly and the operating system's page cache holds the parts that get used.
- **Scale to zero**. Because start-up is cheap, og runs on platforms such as Cloud Run or Fly Machines, and costs next to nothing between batches.
- **Updates**. Build a new Pack, swap the file, and restart.

:::tip[Performance]
On the Ontario benchmark, the og process's own memory was about 0.03 GiB.
The working set in the page cache was about 1.2 GiB, against 4.60 GiB for Pelias and 2.75 GiB for Nominatim.
:::
