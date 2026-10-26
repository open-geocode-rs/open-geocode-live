---
title: Quickstart
description: Install open-geocode, build a Pack for Ontario in about a minute, serve it, and send your first forward and reverse geocoding queries.
---

This page takes you from nothing to a running geocoder for Ontario, Canada.
Any other region in the catalog works the same way.

## 1. Install

og is installed from source with Cargo. You need Rust 1.88 or newer.

```sh
cargo install --git https://github.com/open-geocode-rs/open-geocode --features tui
```

This installs two binaries:

- `og`: builds and serves Packs, and has an interactive interface.
- `open-geocode`: batch CSV geocoding, benchmarks and lower-level Pack tools.

## 2. Build a Pack

```sh
og build --region canada/ontario
```

og downloads the region's OpenStreetMap extract and builds a Pack from it.
Ontario's 2 million addresses take about a minute on a 24-core machine.

## 3. Serve it

```sh
og serve canada-ontario
```

The API now listens on `http://127.0.0.1:8080`.

## 4. Query it

Forward geocode a free-form address:

```sh
curl 'http://127.0.0.1:8080/search?q=10+King+Street+Toronto'
```

Reverse geocode a point. Longitude comes first, as in GeoJSON:

```sh
curl 'http://127.0.0.1:8080/reverse?lon=-79.38&lat=43.65'
```

Both return a GeoJSON `FeatureCollection`, so the result drops straight into a map library. [Responses](/docs/responses/) explains the fields.

## Use the interactive interface

Run `og` with no arguments to pick a region, build it, search it and geocode CSV files from the terminal.

## Next steps

- [Build a Pack](/docs/guides/build-a-pack/): several regions in one Pack, OpenAddresses, memory limits.
- [Batch geocode a CSV](/docs/guides/batch-csv/)
- [API reference](/docs/api/)
