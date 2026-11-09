---
title: Serve the API
description: Run the OpenGeocode HTTP API from a Pack, choose the bind address, check health and readiness, and deploy it on a VM or a scale-to-zero platform.
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

og serves `/geocode`, `/places`, `/autocomplete` and `/reverse` for geocoding, `/jobs` for CSV files, `/healthz` and `/readyz` for health, `/version` for the build and Pack it is serving, and `/openapi.json` for its contract.
See the [API reference](/docs/api/) for every endpoint and parameter.

Single lookups are GET and stateless, so they cache well behind a CDN.
`/geocode`, `/places` and `/reverse` also take a batch of up to 1,000 lookups as a JSON array, sent as `QUERY` or `POST`.
Responses are compressed with zstd or gzip when the client's `Accept-Encoding` allows it.

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
  On `SIGTERM` og finishes the requests in flight before it exits, so a rolling restart drops nothing.

## Docker

An image for `linux/amd64` and `linux/arm64` is published to the GitHub Container Registry, tagged `latest` and `sha-<commit>`, whenever CI passes on `main`.
Mount a Pack at `/packs/pack`:

```sh
docker run -p 8080:8080 -v ~/.local/share/open-geocode/packs/canada-ontario:/packs/pack:ro ghcr.io/open-geocode-rs/open-geocode
```

:::tip[Performance]
On the Netherlands benchmark, og served every address in the country at 100 requests a second within 1 GiB of memory, page cache included.
Photon needed 4 GiB for the same load, and Pelias 8 GiB.
:::
