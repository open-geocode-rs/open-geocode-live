---
title: What is open-geocode?
description: open-geocode (og) is a self-hosted address geocoder in pure Rust. It answers forward, autocomplete, reverse and batch queries from one file built from OpenStreetMap and OpenAddresses.
---

open-geocode, or og, is a self-hosted geocoding engine written in pure Rust.
It turns addresses and place names into coordinates, and coordinates back into addresses, using only open data: OpenStreetMap, plus OpenAddresses if you add it.

Everything og answers from lives in one file, called a **Pack**.
You build a Pack for a region once, then serve it. There is no PostgreSQL, Elasticsearch or other service to keep running, and updating means swapping in a new file.

## What it does

- **Forward geocoding**: free-form text (`/search`) or an address already split into fields (`/geocode`).
- **Autocomplete**: suggestions as someone types (`/autocomplete`).
- **Reverse geocoding**: the nearest address to a point, with its locality, region and country taken from real admin boundaries (`/reverse`).
- **Batch geocoding**: a CSV in, the same CSV out with `lat` and `lon` columns (`open-geocode geocode batch`).

Every forward answer carries an accuracy tier (`rooftop`, `interpolated`, `street`, `centroid` or `approximate`) and a score. A Pack that has been calibrated also returns a `confidence` between 0 and 1.

## When to use it

- You geocode enough addresses that per-lookup fees or rate limits from a commercial API matter.
- The addresses are private and shouldn't be sent to a third party.
- You want an open-source geocoder without the days-long imports and database servers of Nominatim or Pelias.

## How it is built

- **Parser**: a semi-Markov CRF that labels the parts of an address. It is trained on every build, from the addresses that Pack serves.
- **Search**: a Tantivy text index and FST dictionaries, with typo tolerance from Levenshtein automata and Unicode transliteration across scripts.
- **Reverse**: Hilbert-packed R-trees and point-in-polygon tests on admin boundaries.
- **Serving**: the Pack is memory-mapped, so a server starts quickly and can run on scale-to-zero platforms such as Cloud Run or Fly Machines.

## Next steps

- [Quickstart](/docs/quickstart/): build a Pack and send your first query.
- [Benchmarks](/docs/benchmarks/): accuracy and speed against other geocoders.
- [API reference](/docs/api/): every endpoint and parameter.
