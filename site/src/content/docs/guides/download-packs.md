---
title: Download Packs
description: Find prebuilt OpenGeocode Packs for the planet and individual regions.
tableOfContents: false
editUrl: false
prev: false
next: false
---

Download a prebuilt Pack to run OpenGeocode on your own server.

| Pack | Updated | Size | Download |
| --- | --- | ---: | --- |
| **United States** | <time datetime="2026-11-22">Nov 22, 2026</time> | 8.00 GB | <a href="https://downloads.opengeocode.com/packs/2026-11-22-s11/usa.ogp" download="usa.ogp">usa.ogp</a> |
| **Planet** | — | — | Not published |

The USA Pack uses schema 11 and includes OpenStreetMap, OpenAddresses and TIGER data. Install a compatible version of OpenGeocode using the [Quickstart](/docs/quickstart/#1-install-og). See the [download index](https://downloads.opengeocode.com/) for the checksum and data attribution.

## Serve the Pack

From the directory containing the download, run:

```sh
og serve ./usa.ogp --bind 127.0.0.1:8080
```

See [Serve the API](/docs/guides/serve/) for more options. To use another region today, [build a Pack](/docs/guides/build-a-pack/).
