---
title: Build a Pack
description: Build an open-geocode Pack from OpenStreetMap for one region or several, add OpenAddresses points, cap memory and disk use, and resume a stopped build.
---

A Pack is the one file og answers from. It holds the records, their text index and their spatial index.
`og build` downloads a region's OpenStreetMap extract and builds a Pack from it.

```sh
og build --region canada/ontario
```

## Regions

`--region` takes a catalog id such as `canada/ontario`.
Run `og` with no arguments to browse the catalog.

Repeat `--region` to build one Pack that covers several regions and is served by one process:

```sh
og build --region canada/ontario --region canada/quebec --name canada-east
```

`--name` sets what a multi-region Pack is called. It defaults to the region ids joined together.

## Add OpenAddresses

```sh
export OA_TOKEN=...
og build --region canada/ontario --openaddresses
```

This adds the OpenAddresses points for the countries the Pack covers, leaving out addresses OpenStreetMap already has.
It needs an OpenAddresses API token in `OA_TOKEN`.

## Memory and disk

| Option | What it does |
| --- | --- |
| `--memory-budget-mb <MiB>` | Memory for the build's buffers. When not set, og sizes it to what the machine can spare. |
| `--scratch-budget-mb <MiB>` | The most scratch disk the build may hold at once. The build compresses its spill harder as it nears the cap, and stops early if it can't fit. |
| `--force` | Build even when the pre-flight check finds too little memory or disk. |

For scale: the whole planet, from OpenStreetMap alone, built in 2 h 51 min on a 24-core, 32 GB desktop with a 9 GB memory budget.
The result was one 17.9 GB file with 233.7 million records.

## Stopped builds

| Option | What it does |
| --- | --- |
| `--resume` | Continue a stopped build of this Pack from its last checkpoint, or start over if there is none. |
| `--fresh` | Clear what a stopped build left behind and start over. |
| `--download` | Download the extract again even if one is already on disk. |

## Where files go

og keeps its files in its home directory: `OG_HOME` if set, otherwise the platform's local data directory (`~/Library/Application Support/open-geocode` on macOS).

```text
<home>/pbf/<region id>.osm.pbf    a downloaded extract
<home>/packs/<region slug>/       a Pack
<home>/builds.jsonl               one line per finished build
```

## Data licensing

A Pack built from OpenStreetMap is a derivative of ODbL-licensed data.
Every API response carries the attribution (`© OpenStreetMap contributors, ODbL`). Follow the license terms of the data you build from.
