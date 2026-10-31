---
title: Quickstart
description: Install OpenGeocode, build a Pack for Ontario in about a minute, serve it, and send your first forward and reverse geocoding queries.
---

Build a Pack for Ontario, Canada, serve it, and send it your first forward and reverse queries.
Any other region in the catalog works the same way.

:::note[Prerequisites]
Rust 1.88 or newer, with Cargo on your `PATH`. Get it from [rustup.rs](https://rustup.rs).
:::

## 1. Install og

Install og from source with Cargo.

```sh
cargo install --git https://github.com/open-geocode-rs/open-geocode --features tui
```

This installs two binaries:

- `og` builds and serves Packs, and opens the interactive interface.
- `open-geocode` runs batch CSV geocoding, benchmarks and lower-level Pack tools.

To check that og was installed, run:

```sh
og --version
```

```txt
og 0.x.y
```

## 2. Build a Pack

Build a Pack for Ontario with `og build`.

```sh
og build --region canada/ontario
```

og downloads Ontario's OpenStreetMap extract, then builds a Pack from it.
It prints one line per step as it goes, and a `Pack ready` line with the Pack's path, record count and size when it is done.

:::tip[Performance]
Ontario's 2 million addresses build in about a minute on a 24-core machine, into one 324 MB file.
:::

## 3. Serve it

Serve the Pack with `og serve`.

```sh
og serve canada-ontario
```

```txt
Serving <og home>/packs/canada-ontario at http://127.0.0.1:8080
```

The API is now listening on `http://127.0.0.1:8080`.

## 4. Query it

Forward geocode a free-form address with `/search`.

```sh
curl 'http://127.0.0.1:8080/search?q=10+King+Street+Toronto'
```

Reverse geocode a point with `/reverse`.
Longitude comes first, as in GeoJSON.

```sh
curl 'http://127.0.0.1:8080/reverse?lon=-79.38&lat=43.65'
```

Both return a GeoJSON `FeatureCollection`, so the result drops straight into a map library.
Each feature carries the matched address, its coordinates, an accuracy tier and a score.
See [Responses](/docs/responses/) for every field.

You've built a geocoder for Ontario and queried it.

## Use the interactive interface

og can also do all of this from the terminal.
Run `og` with no arguments:

```sh
og
```

Pick a region from the catalog, build it, search it, and geocode CSV files, without remembering a flag.

## Next steps

- [Build a Pack](/docs/guides/build-a-pack/): several regions in one Pack, OpenAddresses, memory limits.
- [Serve the API](/docs/guides/serve/): bind address, health checks and deploying.
- [Batch geocode a CSV](/docs/guides/batch-csv/): a whole file of addresses, offline.
- [API reference](/docs/api/): every endpoint and parameter.
