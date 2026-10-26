---
title: What is open-geocode?
description: open-geocode (og) is a self-hosted address geocoder in pure Rust. It answers forward, autocomplete, reverse and batch queries from one file built from OpenStreetMap and OpenAddresses.
---

open-geocode is a fast, self-hosted geocoder for addresses.
It ships as a single binary called `og`, and it answers every query from a single file called a **Pack**.

```sh
og build --region canada/ontario   # build a Pack from OpenStreetMap
og serve canada-ontario            # serve its HTTP API on port 8080
og                                 # or do both from the interactive interface
```

At its core is the Pack.
You build one for a region, from city to planet, then serve it.
There is no PostgreSQL, Elasticsearch or other service to keep running, and an update is a new file swapped in.

## What's inside

- **Forward geocoding**: turn free-form text into coordinates with [`/search`](/docs/api/operations/search/), or an address already split into fields with [`/geocode`](/docs/api/operations/geocode/).
- **Autocomplete**: suggest addresses as someone types with [`/autocomplete`](/docs/api/operations/autocomplete/).
- **Reverse geocoding**: find the nearest address to a point, with its locality, region and country, with [`/reverse`](/docs/api/operations/reverse/).
- **Batch geocoding**: geocode a whole CSV offline with [`open-geocode geocode batch`](/docs/guides/batch-csv/).
- **Interactive interface**: pick a region, build it, search it and geocode CSV files from the terminal with `og`.

New to og?
Start with the [Quickstart](/docs/quickstart/): it builds a Pack for Ontario and sends your first query in a few minutes.

## What is geocoding?

Geocoding turns an address written as text, such as `10 King Street, Toronto`, into coordinates on a map.
Reverse geocoding goes the other way: it turns a point, such as one from a phone's GPS, into the address at that spot.

A geocoder needs two things: data that says where every address is, and a search engine that can find the right one from messy input.
Commercial APIs such as Google Maps own both, and charge per lookup.
Open-source geocoders such as Nominatim and Pelias use open data, but need a database or search cluster to run.

og uses only open data, OpenStreetMap plus OpenAddresses if you add it, and needs nothing else to run.
See [Benchmarks](/docs/benchmarks/) for how it measures up against them.

## Design goals

- **Speed**. On the same Ontario data and hardware, og answers a forward query in 1.0 ms at the median, against 11.5 ms for Pelias and 40.0 ms for Nominatim. It holds 10x the throughput of Pelias. See [Benchmarks](/docs/benchmarks/).
- **One file**. A Pack holds the records, their text index and their spatial index. To deploy og, copy the binary and the Pack. Ontario's Pack is 324 MB.
- **Fast builds**. Ontario's 2 million addresses build in about a minute on a 24-core machine. The whole planet builds in under 3 hours on a 32 GB desktop.
- **Accuracy**. [MESSY STREETS](https://arxiv.org/abs/2609.01612) is a benchmark of real addresses copied verbatim from the web. og answers all of them, 94.4% with a full answer rather than a fallback area, and its first answer lands within about 20 km of the target 93.9% of the time.
- **Privacy**. og runs on your own hardware. No address leaves your network, and there is no per-lookup fee.
- **Scale to zero**. The Pack is memory-mapped, not loaded, so a server starts quickly. og runs on platforms such as Cloud Run or Fly Machines and costs next to nothing between batches.

## How it works

- **Parser**: a semi-Markov CRF labels the parts of an address. og trains it on every build, from the addresses that Pack serves.
- **Search**: a Tantivy text index and FST dictionaries find candidates. Levenshtein automata tolerate typos, and Unicode transliteration matches across scripts.
- **Reverse**: Hilbert-packed R-trees find nearby records, and point-in-polygon tests on real admin boundaries name their locality, region and country.
- **Results**: every forward answer carries an accuracy tier (`rooftop`, `interpolated`, `street`, `centroid` or `approximate`) and a score. A calibrated Pack also returns a `confidence` between 0 and 1. See [Responses](/docs/responses/).
