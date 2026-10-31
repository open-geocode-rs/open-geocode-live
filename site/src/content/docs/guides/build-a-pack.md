---
title: Build a Pack
description: Build an OpenGeocode Pack from OpenStreetMap for one region or several, add OpenAddresses points, cap memory and disk use, and resume a stopped build.
---

A Pack is the one file og answers from.
It holds the records, their text index and their spatial index.

Use `og build` to download a region's OpenStreetMap extract and build a Pack from it.

```sh
og build --region canada/ontario
```

## Pick a region

`--region` takes a catalog id, such as `canada/ontario` or `germany`.
To browse the catalog, run `og` with no arguments.

### Several regions

To build one Pack that covers several regions and is served by one process, repeat `--region`.

```sh
og build --region canada/ontario --region canada/quebec --name canada-east
```

`--name` sets what the Pack is called.
It defaults to the region ids joined together.

:::note
og refuses two regions where one contains the other, such as `canada` and `canada/ontario`, because the Pack would index the same places twice.
Build the wider one alone.
:::

## Add OpenAddresses

OpenStreetMap does not have every address.
To fill the gaps, add `--openaddresses`.

```sh
export OA_TOKEN=...
og build --region canada/ontario --openaddresses
```

og adds the OpenAddresses points for the countries the Pack covers, leaving out addresses OpenStreetMap already has.
It needs an OpenAddresses API token in `OA_TOKEN`.

## Memory and disk

Before it starts, og checks that the machine has enough memory and disk for the build.
These flags change what it may use.

### `--memory-budget-mb`

Sets the memory, in MiB, for the build's buffers.
When it is not set, og sizes the budget to what the machine can spare.

```sh
og build --region germany --memory-budget-mb 8192
```

### `--scratch-budget-mb`

Sets the most scratch disk, in MiB, the build may hold at once.
As the build nears the cap, it compresses its spill harder.
If it still can't fit, it stops early.

### `--force`

Builds even when the pre-flight check finds too little memory or disk.

:::tip[Performance]
The whole planet, from OpenStreetMap alone, built in 2 h 51 min on a 24-core, 32 GB desktop with a 9 GB memory budget.
The result was one 17.9 GB file with 233.7 million records.
:::

## Stopped builds

Press Ctrl-C to stop a build.
og keeps its last checkpoint, so you can pick it up again.
Press Ctrl-C twice to quit at once.

### `--resume`

Continues a stopped build of this Pack from its last checkpoint.
If there is no checkpoint, it starts over.

```sh
og build --region canada/ontario --resume
```

### `--fresh`

Clears what a stopped build left behind, and starts over.

### `--download`

Downloads the extract again, even if one is already on disk.

## Where files go

og keeps its files in its home directory.
That is `OG_HOME` if it is set, otherwise the platform's local data directory, such as `~/.local/share/open-geocode` on Linux or `~/Library/Application Support/open-geocode` on macOS.

```text
<home>/pbf/<region id>.osm.pbf    a downloaded extract
<home>/packs/<region slug>/       a Pack
<home>/builds.jsonl               one line per finished build
```

## Data licensing

A Pack built from OpenStreetMap is a derivative of ODbL-licensed data.
Every API response carries the attribution `© OpenStreetMap contributors, ODbL`.
Follow the license terms of the data you build from.
