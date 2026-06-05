# open-geocode-live

Live demo deployment for the [`open-geocode`](https://github.com/open-geocode-rs/open-geocode)
geocoding engine, pinned here as a submodule.

A static UI behind a Cloudflare Worker, proxying to the engine runtime.

## Configure for your own deployment

Replace the `example.com` placeholders with your domain:

- `worker/wrangler.toml` — `[env.production]` route + zone, and `RUNTIME_ORIGIN`
- `deploy/cloudflared/config.yml` — the tunnel `hostname` (and `<TUNNEL_ID>`)
- `deploy/r2/cors.json` — the allowed origin for the tiles bucket
- `deploy/web/config.js` — copy from `config.example.js` and set your tiles URL (gitignored)

_Deployment write-up coming soon._
