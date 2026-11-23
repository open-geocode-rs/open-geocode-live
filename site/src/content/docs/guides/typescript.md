---
title: TypeScript
description: Install the OpenGeocode TypeScript client and get your first native GeoJSON result.
---

Use `@open-geocode/client` for native OpenGeocode GeoJSON from Node.js, Bun, Deno, or the browser. If your app already reads a Google, Mapbox, HERE or Precisely response, see [Compatibility](/docs/compatibility/) for the matching import and migration steps.

## Serve the example Pack

The native example uses Monaco. Use the [USA Pack](/docs/guides/download-packs/) for the requests in the vendor guides.

From an OpenGeocode checkout, build the CLI, then build and serve Monaco. See [Serve the API](/docs/guides/serve/) for options.

```sh
cargo build --locked --release --features tui --bin og
./target/release/og build --region monaco
./target/release/og serve monaco --bind 127.0.0.1:8080
```

## Install the client

Build the client from the SDK branch that contains the vendor adapters.

```sh
git clone --branch sdk-vendor-compat https://github.com/open-geocode-rs/og-sdk-js.git
cd og-sdk-js
bun install --frozen-lockfile
bun run --filter '@open-geocode/client' build
npm pack ./packages/client
```

In your app, pass the path to the tarball printed by `npm pack` to `npm install`.

## Geocode an address

This native request asks for one address-level result.

```typescript
import { createClient } from "@open-geocode/client";

const client = createClient({ baseUrl: "http://127.0.0.1:8080" });
const { features } = await client.geocode({
  q: "2 Avenue de Monte-Carlo, Monaco",
  layer: "address",
  limit: 1,
});

const match = features[0];
if (match) {
  const [longitude, latitude] = match.geometry.coordinates;
  console.log({ longitude, latitude, ...match.properties });
}
```

## Response

The excerpt shows the fields used above from the Monaco Pack. GeoJSON coordinates are longitude first.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [7.4270688, 43.7377547] },
      "properties": {
        "label": "2 Avenue de Monte-Carlo, Monaco, 98000, MC",
        "accuracy": "rooftop"
      }
    }
  ]
}
```

When there is no match, the API returns HTTP 200 with `features: []`. Use [accuracy](/docs/responses/#accuracy) to decide whether to place a pin.

## Handle errors

Every client throws a `GeocoderError` on failure. Use its `code` for application logic and `requestId` for troubleshooting. The error's `body` holds the original response. With the native client, `problem` also exposes the [OpenGeocode problem document](/docs/responses/).

See the [geocoding reference](/docs/api/operations/geocode/) for the full response schema.
