---
title: Benchmarks
description: OpenGeocode accuracy on the MESSY STREETS benchmark against 12 geocoders including Google Maps, and speed against Pelias and Nominatim on the same Ontario data and hardware.
---

## Accuracy: MESSY STREETS

[MESSY STREETS](https://arxiv.org/abs/2609.01612) (Gaere and von Wangenheim, SIGSPATIAL 2026) is a benchmark of addresses copied verbatim from the web, each verified to exist.
The paper scored 12 geocoders on its gold tier: 10 runs of 100 rows at each resolution, 959 distinct inputs.

og was given the same rows, each as one free-text query with default settings, the way the paper queried the others.
Ranked by CRR, as the paper ranks them:

| Geocoder | CRR (%) | GH1 (%) ±2500 km | GH4 (%) ±20 km | GH6 (%) ±0.6 km |
| --- | ---: | ---: | ---: | ---: |
| Google Maps v3 | 100.0±0.0 | 100.0±0.0 | 98.6±0.7 | 88.3±2.0 |
| MapQuest v1 | 100.0±0.0 | 98.5±0.5 | 97.1±0.5 | 84.0±1.5 |
| **OpenGeocode** † \* | **100.0** | **99.1** | **93.9** | **78.0** |
| ArcGIS | 99.8±0.3 | 99.8±0.3 | 97.9±1.3 | 85.3±2.8 |
| Geoapify v1 | 99.7±0.4 | 99.2±0.5 | 96.3±1.2 | 79.1±3.7 |
| Here v7 | 99.1±0.6 | 99.0±0.5 | 97.6±0.5 | 85.1±2.0 |
| Mapbox v5 | 99.1±0.5 | 98.6±0.7 | 95.1±1.5 | 81.0±2.9 |
| OpenCage v1 | 98.4±1.0 | 97.4±1.0 | 90.2±1.8 | 68.2±2.9 |
| Azure Maps | 97.2±0.8 | 97.1±0.9 | 94.8±1.5 | 81.3±3.7 |
| Pelias v1 † | 96.6±1.8 | 94.1±2.5 | 85.9±3.3 | 67.8±4.4 |
| TomTom v2 | 94.0±1.3 | 93.9±1.4 | 91.8±1.7 | 79.4±3.6 |
| Photon † | 88.1±1.0 | 88.0±1.1 | 84.9±1.1 | 62.8±2.5 |
| Nominatim † | 68.2±4.3 | 68.2±4.3 | 66.6±4.7 | 55.6±3.6 |

- **CRR**: the share of queries that got any answer.
- **GH1, GH4, GH6**: the share whose first answer falls in the target's geohash cell at that precision.
- **†**: an open-source geocoder.
- Rows other than og's are the paper's, measured against public endpoints in June 2026.

\* og ran a Planet Pack built from OpenStreetMap and OpenAddresses in October 2026: the whole planet in one 26.3 GB file with 630.9 million records, memory-mapped when served.
It was built in 5 h 20 min on a 24-core, 32 GB desktop with a 9 GB memory budget.
52 inputs were answered with a fallback area (a postcode, town or country).
Counting only full answers, CRR is 94.4%.
From OpenStreetMap alone (17.9 GB, 233.7 million records, built in 2 h 51 min), GH6 is 67.7%.

### Reading the results

og gives an answer to every query, as Google does, though 52 of them are fallback areas (full answers: 94.4%).
At GH1 it is within 0.9 points of every commercial API.
At street level (GH6) it leads OpenCage, is within 1.4 points of Geoapify and TomTom, and is behind the other commercial APIs (81.0% to 88.3%), which have proprietary address data.
Among open-source geocoders, og leads Pelias, Photon and Nominatim at every resolution.

## Speed: og vs Pelias vs Nominatim

Three geocoders served the same Ontario OpenStreetMap extract (about 2.03 million addresses).
Each ran alone in Docker with the same cap of 4 CPUs and 10 GB, queried over loopback HTTP, on a 24-core, 32 GB Windows 11 host.

- **Service time** is measured closed-loop with a single client, so there is no queue and overload can't inflate it.
- **Throughput** is measured open-loop: the highest steady arrival rate that keeps p99 under 100 ms.

| | OpenGeocode | Pelias | Nominatim |
| --- | ---: | ---: | ---: |
| Deployable footprint | **0.30 GiB** | 5.88 GiB | 5.92 GiB |
| RAM while serving | **~1.2 GiB** | 4.60 GiB | 2.75 GiB |
| Forward service time p50 / p99 | **1.0 / 2.0 ms** | 11.5 / 67.6 ms | 40.0 / 1384.7 ms |
| Reverse service time p50 / p99 | **1.0 / 1.5 ms** | 5.0 / 9.5 ms | 7.5 / 14.2 ms |
| Forward throughput (req/s, p99 < 100 ms) | **1000** | 100 | 25 |
| Reverse throughput (req/s, p99 < 100 ms) | **1000** | 500 | 100 |
| Addresses indexed | 2,032,851 | 2,036,529 | 2,037,682 |

### Notes

- og memory-maps its Pack. The process itself used about 0.03 GiB; the ~1.2 GiB is the working set held in the operating system's page cache.
- 1000 req/s is where the load grid stopped, not og's ceiling.
- The footprint is the single-file Pack, 324 MB for Ontario. The serving rows were measured on an earlier multi-file Pack (1.28 GiB) and have not been re-run.
- The engines do different work per query (Pelias parses with libpostal, Nominatim resolves its place hierarchy). This is reported, not corrected for.
- Nominatim's forward p99 is a real heavy tail under the CPU cap, not overload. Its p50 is 40 ms.
- Everything ran on one host with CPU capped and cache and disk shared, so ratios travel better than absolute numbers.
- Only the ~2.03 million addresses are directly comparable; each engine also indexes different extra layers.
