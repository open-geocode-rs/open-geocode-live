# open-geocode-live

The website and deployment for the [`open-geocode`](https://github.com/open-geocode-rs/open-geocode)
geocoding engine, which is pinned here as a submodule.

One VM runs both halves, and neither takes public inbound traffic. A cloudflared
tunnel carries every request in from Cloudflare's edge.

| Part                | Source                | On the VM                                       |
| ------------------- | --------------------- | ----------------------------------------------- |
| Site and docs       | `site/` (Astro)       | Static files served by Caddy on `127.0.0.1:8081` |
| Geocoding runtime   | `open-geocode/`       | `open-geocode.service` on `127.0.0.1:8080`       |
| Tunnel              | `deploy/cloudflared/` | `cloudflared.service`, one hostname per service  |

## Deploy the site

```sh
sh scripts/deploy-site.sh <ssh-host> https://example.com
```

This builds `site/` for that URL and copies it to `/var/www/open-geocode-site/`.
Caddy serves the new files straight away, with no restart.

First-time setup on the VM:

1. Install Caddy, put `deploy/site/Caddyfile` at `/etc/caddy/Caddyfile`, and reload
   it.
2. Add the site's hostname to the tunnel (`deploy/cloudflared/config.yml`), route
   its DNS to the tunnel, and restart cloudflared.

## Deploy the runtime

```sh
sh deploy/update.sh vX.Y.Z
```

This installs a released Linux binary to `/opt/open-geocode/bin` and restarts
`open-geocode.service` (`deploy/open-geocode.service`). To build the binary from
the pinned submodule instead, run `sh scripts/build-runtime.sh`.

To try the runtime locally as a Linux container with a Pack mounted, run
`docker compose up --build`.

## Configure for your own deployment

Replace the `example.com` placeholders and `<TUNNEL_ID>` in
`deploy/cloudflared/config.yml`. The tunnel credentials stay on the VM and are
gitignored.
