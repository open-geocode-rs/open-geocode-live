---
title: open-geocode vs Nominatim, Pelias and commercial APIs
description: How open-geocode compares with Nominatim, Pelias and commercial geocoding APIs on setup, infrastructure, batch geocoding, privacy, cost, speed and accuracy.
sidebar:
  label: Comparisons
---

| | open-geocode | Nominatim | Pelias | Commercial APIs |
| --- | --- | --- | --- | --- |
| Hosting | Self-hosted | Self-hosted | Self-hosted | Their servers |
| Infrastructure | One binary and one file | PostgreSQL with PostGIS | Elasticsearch and several services | None to run |
| Batch geocoding | CSV in, CSV out, from the command line | No batch endpoint | No batch endpoint | Usually, priced per row |
| Addresses leave your network | No | No | No | Yes |
| Cost per lookup | None | None | None | Fees after the free tier, plus rate limits |
| Data | OpenStreetMap, optional OpenAddresses | OpenStreetMap | OpenStreetMap, OpenAddresses, others | Proprietary |
| License | MIT | GPL-2.0 | MIT | Proprietary |

## vs Nominatim

Nominatim is the geocoder behind openstreetmap.org. Self-hosting it means running PostgreSQL with PostGIS, and a planet import takes days on a machine with 64 GB of RAM.

og's Planet Pack built in under 3 hours on a 32 GB desktop, as one 17.9 GB file.
On the same Ontario data and hardware, og's forward p50 service time was 1.0 ms against Nominatim's 40.0 ms, and its forward throughput was at least 40× higher.
On MESSY STREETS, og answered 100% of queries where Nominatim answered 68.2%.

## vs Pelias

Pelias runs on Elasticsearch plus several services, and its Ontario deployment was 5.88 GiB against og's 0.30 GiB.
og's forward p50 was 1.0 ms against 11.5 ms, and its forward throughput at least 10× higher.
On MESSY STREETS og leads Pelias at GH1 and GH4 and ties it at GH6.

## vs commercial APIs

Google, HERE, ArcGIS and others have proprietary address data, and are more precise at street level: Google's GH6 on MESSY STREETS is 88.3% against og's 67.7%.
og is the better fit when lookups are high-volume, when addresses are private, or when you need to work offline.

See [Benchmarks](/docs/benchmarks/) for method and caveats.
