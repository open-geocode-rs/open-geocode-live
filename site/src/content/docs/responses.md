---
title: Responses
description: Native forward and reverse lookups return GeoJSON FeatureCollections. This page explains the feature properties, layers, accuracy tiers, score and confidence, and the RFC 9457 error format.
---

The native forward and reverse endpoints return GeoJSON `FeatureCollection` objects. Forward results include a ranking score. Reverse results include the distance from the query point in metres.

Look up the Empire State Building on the [USA Pack](/docs/guides/download-packs/).

```sh
curl --get 'http://127.0.0.1:8080/geocode' \
  --data-urlencode 'q=350 Fifth Avenue, New York, NY 10118' \
  --data 'layer=address' --data 'limit=1'
```

```json
{
  "type": "FeatureCollection",
  "geocoding": {
    "version": "1",
    "query": "350 Fifth Avenue, New York, NY 10118",
    "attribution": [
      {
        "text": "© OpenStreetMap contributors",
        "licence": "ODbL 1.0",
        "url": "https://www.openstreetmap.org/copyright"
      },
      {
        "text": "Timezone boundaries © OpenStreetMap contributors",
        "licence": "ODbL 1.0",
        "url": "https://github.com/evansiroky/timezone-boundary-builder"
      }
    ]
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [
          -73.9850334,
          40.7484288
        ]
      },
      "properties": {
        "id": "osm:node:883234965",
        "layer": "address",
        "accuracy": "rooftop",
        "name": "350 5th Avenue",
        "label": "350 5th Avenue, New York, NY, 10118",
        "timezone": "America/New_York",
        "address_lines": [
          "350 5th Avenue",
          "New York, NY 10118",
          "United States"
        ],
        "address": {
          "housenumber": "350",
          "street": "5th Avenue",
          "locality": "New York",
          "region": "NY",
          "postcode": "10118",
          "street_parts": {
            "name": "5th",
            "type": "Avenue"
          }
        },
        "context": {
          "neighbourhood": {
            "id": "osm:relation:7340060",
            "name": "Manhattan Community Board 5"
          },
          "sublocality": {
            "id": "osm:relation:8398124",
            "name": "Manhattan"
          },
          "locality": {
            "id": "osm:relation:175905",
            "name": "New York"
          },
          "region": {
            "id": "osm:relation:61320",
            "name": "New York",
            "code": "US-NY"
          },
          "country": {
            "id": "derived:country:US",
            "name": "United States",
            "code": "US"
          },
          "place": {
            "id": "osm:relation:3954665",
            "name": "Manhattan Island"
          }
        },
        "source": {
          "dataset": "osm"
        },
        "score": 0.0,
        "match": {
          "housenumber": "matched",
          "street": "matched",
          "locality": "matched",
          "region": "matched",
          "postcode": "matched"
        }
      }
    }
  ]
}
```

Coordinates are `[longitude, latitude]`, as GeoJSON requires.

## Layers

`layer` says what kind of record a feature is: `address`, `street`, `interpolation`, `postcode`, `poi`, `place`, `neighbourhood`, `locality`, `district`, `region` or `country`.
Pass `layer=` to `/geocode`, `/autocomplete` or `/reverse` to only get one kind.

## Accuracy

`accuracy` says how the point relates to the thing it names, from most to least precise:

| accuracy | The point is |
| --- | --- |
| `rooftop` | the point of an address or POI |
| `interpolated` | a house number placed along a range or between its neighbours |
| `street` | a point on a street or address-range line |
| `centroid` | the centre of a mapped way or relation |
| `approximate` | a point standing for something larger, such as a town or a postcode |

## Score and confidence

- `score` ranks results within one response, highest first.
  It is not a probability, and it can't be compared across queries or Packs.
  To judge a single result, use `confidence`, or `accuracy` and `layer`.
- `confidence` is the probability, from 0 to 1, that the result is the address the query asks for.
  Of results at 0.8, about 8 in 10 are correct.
  It is only present on a Pack calibrated with `open-geocode geocode calibrate`, which fits it to held-out address points.
- `fallback` is `true` when nothing matched and the result is the most precise area the query names instead, such as its postcode or town.
  Its `confidence` is 0.

## Errors

Errors are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem documents, served as `application/problem+json`.
Branch on `error_code`, which is one of a fixed set. `title` and `detail` are prose and may be reworded.

| error_code | Meaning |
| --- | --- |
| `invalid_query` | The query text can't be searched. |
| `invalid_coordinate` | A longitude or latitude is out of range. |
| `limit_too_large` | `limit` is above the maximum. |
| `malformed_parameter` | A parameter couldn't be parsed. |
| `not_found` | No such endpoint. |
| `method_not_allowed` | The API is GET-only. |
| `internal_error` | Something failed on the server. |

The full schemas are in the [API reference](/docs/api/) and in [`/openapi.json`](/openapi.json).
