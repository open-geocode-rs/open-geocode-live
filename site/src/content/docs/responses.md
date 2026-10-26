---
title: Responses
description: Every open-geocode answer is a GeoJSON FeatureCollection. This page explains the feature properties, layers, accuracy tiers, score and confidence, and the RFC 9457 error format.
---

Every answer from og is one GeoJSON `FeatureCollection`. Forward and reverse answers have the same shape.
The only differences: forward features carry a `score` (and a `confidence` once the Pack is calibrated), and reverse features carry a `distance_m`.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-79.0, 43.0] },
      "properties": {
        "id": "osm:node:10",
        "layer": "address",
        "accuracy": "rooftop",
        "name": "10 King Street",
        "label": "10 King Street, M5V 1A1",
        "address": { "housenumber": "10", "street": "King Street", "postcode": "M5V 1A1" },
        "context": {
          "locality": { "id": "osm:relation:3", "name": "Toronto" },
          "region": { "id": "osm:relation:2", "name": "Ontario" },
          "country": { "id": "osm:relation:1", "name": "Canada" }
        },
        "score": 5.459071,
        "confidence": 0.9890131,
        "source": { "dataset": "osm", "object_type": "node", "object_id": 10 }
      }
    }
  ],
  "geocoding": {
    "version": "1",
    "query": "10 king street, m5v 1a1",
    "attribution": "© OpenStreetMap contributors, ODbL"
  }
}
```

Coordinates are `[longitude, latitude]`, as GeoJSON requires.

## Layers

`layer` says what kind of record a feature is: `address`, `street`, `interpolation`, `postcode`, `poi`, `place`, `neighbourhood`, `locality`, `district`, `region` or `country`.
Pass `layer=` to a forward endpoint to only get one kind.

## Accuracy

`accuracy` says how the point relates to the thing it names, from most to least precise:

| accuracy | The point is |
| --- | --- |
| `rooftop` | the point of an address or POI |
| `interpolated` | a house number placed along a range or between its neighbours |
| `street` | a point on a street or address-range line |
| `centroid` | the centre of a mapped way or relation |
| `approximate` | a point standing for something larger, such as a place node or a postcode |

## Score and confidence

- `score` ranks answers within one response. Compare scores within a response, not across queries.
- `confidence` is a probability from 0 to 1 that the answer is right. It is only present on a Pack that has been calibrated with `open-geocode geocode calibrate`, which fits it to held-out address points.

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
