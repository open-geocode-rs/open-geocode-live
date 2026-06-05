#!/usr/bin/env sh
# Smoke test for the demo — same script for localhost, staging, and prod. Asserts
# the app chain works, and (with a tiles URL) that the tiles origin serves ranges.
# Non-zero exit on any failure.
#
#   scripts/smoke.sh <APP_BASE> [TILES_PMTILES_URL]
#   scripts/smoke.sh http://127.0.0.1:8787/open-geocode
#   scripts/smoke.sh https://example.com/open-geocode https://tiles.example.com/basemap.pmtiles

set -eu

APP="${1:?usage: smoke.sh <APP_BASE> [TILES_PMTILES_URL]}"
TILES="${2:-}"
fail=0

# HTTP status, or 000 if unreachable. `|| true` so one down endpoint doesn't abort
# the run under `set -e`.
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" || true; }

check() { # <label> <expected-code> <url...>
  label="$1"; want="$2"; shift 2
  got="$(code "$@")"
  if [ "$got" = "$want" ]; then
    printf '  PASS  %-44s %s\n' "$label" "$got"
  else
    printf '  FAIL  %-44s got %s, want %s\n' "$label" "$got" "$want"
    fail=1
  fi
}

# APP_BASE includes the mount path, e.g. http://127.0.0.1:8787/open-geocode
printf 'App chain @ %s\n' "$APP"
check "UI served (GET /)"            200 "$APP/"
# A static asset must be served by the asset layer (200), not fall through to the
# Worker — confirms asset matches never hit the request budget.
check "static asset served free (not Worker)" 200 "$APP/styles.css"
check "health through chain (/api/readyz)"  200 "$APP/api/readyz"
check "search through chain (/api/search)"  200 "$APP/api/search?q=King%20Street&limit=1"
check "autocomplete (/api/autocomplete)"    200 "$APP/api/autocomplete?q=King&limit=3"
check "unknown path -> Worker 404"          404 "$APP/nope"

# Tiles are served direct from public R2, off the Worker. A ranged GET should
# return 206. (CORS is browser-enforced, so it's not checked here.)
if [ -n "$TILES" ]; then
  printf 'Tiles origin @ %s\n' "$TILES"
  check "tiles: ranged GET -> 206"          206 -H "Range: bytes=0-15" "$TILES"
fi

[ "$fail" = "0" ] && printf 'OK\n' || printf 'FAILED\n'
exit "$fail"
