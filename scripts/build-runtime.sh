#!/usr/bin/env sh
# Build the prod runtime binary from the PINNED engine submodule and extract it to
# dist/open-geocode-linux for shipping to the VM. The submodule (open-geocode/) is
# locked to a commit, so the binary tracks a known engine version.
#
#   sh scripts/build-runtime.sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/open-geocode/Cargo.toml" ] || {
  echo "engine submodule not initialized — run: git submodule update --init"; exit 1;
}
docker build -f "$ROOT/deploy/runtime/Dockerfile" -t open-geocode-runtime:linux "$ROOT/open-geocode"
cid="$(docker create open-geocode-runtime:linux)"
mkdir -p "$ROOT/dist"
docker cp "$cid:/usr/local/bin/open-geocode" "$ROOT/dist/open-geocode-linux"
docker rm "$cid" >/dev/null
echo "Built dist/open-geocode-linux from engine@$(git -C "$ROOT/open-geocode" rev-parse --short HEAD)"
