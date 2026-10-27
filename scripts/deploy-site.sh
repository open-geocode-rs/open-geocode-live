#!/usr/bin/env sh
# Build the site for its public URL and copy it to the VM that serves it
# (deploy/site/Caddyfile). The URL goes into canonical links and the sitemap.
#
#   sh scripts/deploy-site.sh <ssh-host> <site-url>
#   sh scripts/deploy-site.sh ubuntu@my-vm https://example.com
set -eu
HOST="${1:?usage: deploy-site.sh <ssh-host> <site-url>}"
URL="${2:?usage: deploy-site.sh <ssh-host> <site-url>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/site"
SITE_URL="$URL" npm run build
# --delete, so pages removed from the site stop being served.
rsync -az --delete dist/ "$HOST:/var/www/open-geocode-site/"
echo "deployed $URL"
