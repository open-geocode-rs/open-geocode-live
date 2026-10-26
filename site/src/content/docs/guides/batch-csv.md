---
title: Batch geocode a CSV
description: Geocode every row of a CSV file offline with open-geocode. Choose address columns and fallbacks, check answers against city, region and postcode columns, and read the audit file.
---

`open-geocode geocode batch` reads a CSV, geocodes each row against a Pack, and writes the same rows back with latitude and longitude columns.
Nothing leaves your machine, and there is no per-row fee.

```sh
open-geocode geocode batch \
  --pack "$HOME/Library/Application Support/open-geocode/packs/canada-ontario" \
  --input customers.csv \
  --output customers-geocoded.csv \
  --audit customers-audit.csv \
  --address-fields street,city \
  --locality-field city \
  --region-field province \
  --postcode-field postal_code
```

In og's demo recording, a CSV of 4,000 Luxembourg addresses matched every row in about a second, at 1.6 ms p50 and 5.4 ms p99.

## Outputs

- `--output`: your input columns, unchanged, with `lat` and `lon` added or filled in. Rename them with `--lat-column` and `--lon-column`.
- `--audit`: how each row was answered: status, the query sent, score, confidence, layer, accuracy, the matched label and address parts, and the source record. Use it to review rows that matched poorly.

## Choosing columns

- `--address-fields` lists the columns that are joined into one query, comma-separated.
  Repeat the option to add fallbacks, tried in order:

  ```sh
  --address-fields street,city,postal_code --address-fields street,city
  ```

- `--locality-field`, `--region-field` and `--postcode-field` name columns that are used to check that an answer is in the right place.

## Narrowing answers

| Option | What it does |
| --- | --- |
| `--country <codes>` | ISO 3166-1 alpha-2 codes to answer from, comma-separated. Defaults to every country in the Pack. |
| `--layer <layer>` | Only answer with one layer, for example `address`. |
| `--limit <n>` | How many candidates to inspect per query. Defaults to 10; `0` uses the engine's default. |

## Rows that already have coordinates

`--join-coordinates-from <csv>` with `--join-key <column>` copies coordinates from another CSV instead of geocoding.
`--join-lat-column` and `--join-lon-column` name its coordinate columns.

## From the interactive interface

Running `og` with no arguments also lets you pick a Pack and geocode a CSV file without writing the command out.
