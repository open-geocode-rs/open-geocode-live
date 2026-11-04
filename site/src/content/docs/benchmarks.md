---
title: Benchmarks
description: OpenGeocode accuracy on the MESSY STREETS benchmark against 12 geocoders including Google Maps, and speed against Photon and Pelias on the same Netherlands data and hardware.
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

The rows og was scored on: [bench/data/messy-streets](https://github.com/open-geocode-rs/open-geocode/tree/main/bench/data/messy-streets).

### Reading the results

og gives an answer to every query, as Google does, though 52 of them are fallback areas (full answers: 94.4%).
At GH1 it is within 0.9 points of every commercial API.
At street level (GH6) it leads OpenCage, is within 1.4 points of Geoapify and TomTom, and is behind the other commercial APIs (81.0% to 88.3%), which have proprietary address data.
Among open-source geocoders, og leads Pelias, Photon and Nominatim at every resolution.

## Speed: og vs Photon vs Pelias

Three geocoders served every OpenStreetMap address in the Netherlands, from the same 2026-11-01 extract.
Each ran alone on the same 32-vCPU machine, on its own cores with its memory capped, queried over loopback HTTP.

| | OpenGeocode | Photon | Pelias |
| --- | ---: | ---: | ---: |
| Disk (data + image) | **0.36 GB** | 3.94 GB | 7.00 GB |
| Build time | **1 min 55 s** | 6 min 50 s | 10 min 18 s |
| Ready after start | **0.36 s** | 4.8 s | 15.3 s |
| RAM while serving | **1.1 GiB** | 23.5 GiB | 39.4 GiB |
| Forward latency p50 / p99 | **0.72 / 4.2 ms** | 2.0 / 19.4 ms | 4.7 / 9.6 ms |
| Reverse latency p50 / p99 | **0.20 / 0.37 ms** | 1.8 / 3.0 ms | 5.3 / 10.5 ms |
| Max forward throughput | **14,087 req/s** | 2,194 req/s | 2,323 req/s |
| Max reverse throughput | **≥ 65,606 req/s** | 3,098 req/s | 2,406 req/s |
| Smallest machine for 100 req/s, forward | **1 vCPU / 1 GiB** | 2 vCPU / 4 GiB | 1 vCPU / 8 GiB |
| Smallest machine for 100 req/s, reverse | **1 vCPU / 256 MiB** | 1 vCPU / 4 GiB | 1 vCPU / 8 GiB |
| First answer within 100 m, forward / reverse | 98.9% / 98.8% | 99.7% / 99.9% | 99.5% / 100% |

### Notes

- Latency is one request at a time, so there is no queue.
- Throughput is the highest rate with p99 under 100 ms and at least 99.9% of requests answered, on 16 vCPU / 64 GiB. og turns away what it cannot take on at once, so the requests it takes stay fast.
- 65,606 req/s is the most the load generator could send, not og's limit.
- RAM while serving is the peak on 16 vCPU / 64 GiB, page cache included. Photon and Pelias size their heap to the machine, as their documentation says; the smallest-machine rows show what each needs.
- 256 MiB is the smallest size tried.
- The engines do different work per query. This is reported, not corrected for.
- The harness and how to run it again: [bench](https://github.com/open-geocode-rs/open-geocode/tree/main/bench).
