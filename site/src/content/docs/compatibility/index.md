---
title: Compatibility
description: Use Google, Mapbox, HERE or Precisely request and response formats with a self-hosted OpenGeocode server.
---

Keep the geocoding API your app already uses. Point supported requests at OpenGeocode to get vendor-shaped responses from your own Pack.

## Compare adapters

Find your API version below. Open its guide for the endpoint change and compatibility limits.

| Adapter | Forward and reverse | Suggestions and lookup | Place search | Batch geocoding |
| --- | --- | --- | --- | --- |
| [Google](/docs/compatibility/google/) | Geocoding v4 | Places (New) v1 | Text and Nearby Search | Unavailable |
| [Mapbox](/docs/compatibility/mapbox/) | Geocoding v6 | Search Box v1 | Search Box forward and category search | Geocoding v6, one request |
| [HERE](/docs/compatibility/here/) | Geocoding and Search v7 | Autosuggest and Lookup | Discover and Browse | Batch v7, file jobs |
| [Precisely](/docs/compatibility/precisely/) | Geo Addressing v1 | Autocomplete and address lookup | Unavailable | Bulk Geo Addressing v2, file jobs |

## Change the endpoint

- **Direct HTTP.** Swap the vendor host for your server URL and the vendor prefix from its guide. Keep the method, versioned path and request payload. Use your gateway's authentication in place of vendor credentials.
- **OpenGeocode SDK.** Import the vendor client and set `baseUrl` to your server URL. The client adds the vendor prefix. A client configured with vendor credentials alone calls the vendor directly.
- **Existing vendor SDK.** Use it if you can configure it to send the supported HTTP requests to OpenGeocode. Otherwise, use the HTTP example or the OpenGeocode SDK in the vendor guide.

Try an example with the [USA Pack](/docs/guides/download-packs/). Use the [native TypeScript client](/docs/guides/typescript/) if your app consumes OpenGeocode GeoJSON.

## Move lookup IDs with your traffic

OpenGeocode issues its own IDs. Keep search, suggestions and the follow-up lookup on the same backend. To migrate records keyed by a vendor ID, search again using the address or coordinates you have and store the new ID. Before switching traffic, replay the requests your app depends on against your target Pack.
