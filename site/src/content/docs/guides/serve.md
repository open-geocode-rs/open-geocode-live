---
title: Serve the API
description: Run the open-geocode HTTP API from a Pack, choose the bind address, check health and readiness, and deploy it on a VM or a scale-to-zero platform.
---

```sh
og serve canada-ontario
```

`og serve` takes a Pack in the og home by name, or a path to a Pack. It listens on `127.0.0.1:8080` unless you pass `--bind`:

```sh
og serve canada-ontario --bind 0.0.0.0:8080
```

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /search?q=` | Free-form forward geocoding. |
| `GET /geocode?address=` | Forward geocoding of an address already split into fields (`locality`, `region`, `postcode`). |
| `GET /autocomplete?q=` | Suggestions as a query is typed. |
| `GET /reverse?lon=&lat=` | The places at a point. |
| `GET /healthz` | Is the process alive? |
| `GET /readyz` | Can the server answer geocoding requests? |
| `GET /openapi.json` | The contract this server is serving. |

Forward endpoints accept `limit`, `layer` and `country`. `/search` and `/autocomplete` also take `focus` and `bbox`.
The [API reference](/docs/api/) lists every parameter.

The API is GET-only and stateless, so it caches well behind a CDN.

## Deploying

- **One file to ship.** Copy the Pack and the binary. There is no database to provision or migrate.
- **Memory-mapped.** The Pack is mapped, not loaded, so the server starts quickly and the operating system's page cache holds the parts that get used. On the Ontario benchmark the process's own memory was about 0.03 GiB, and the working set in the page cache was about 1.2 GiB.
- **Scale to zero.** Because start-up is cheap, og runs on platforms such as Cloud Run or Fly Machines and costs next to nothing between batches.
- **Updates.** Build a new Pack, swap the file, restart.

Use `/readyz` as a load balancer's readiness check and `/healthz` as its liveness check.
