#!/usr/bin/env sh
# Update the VM runtime to a released version: download the cargo-dist Linux
# binary for the given tag and restart the service.
#   sh deploy/update.sh v0.2.1
#
# The asset name follows cargo-dist's convention; confirm it against the first
# dist release and adjust ASSET if needed.
set -eu
VER="${1:?usage: update.sh vX.Y.Z}"
REPO="open-geocode-rs/open-geocode"
ASSET="open-geocode-x86_64-unknown-linux-musl.tar.xz"
URL="https://github.com/$REPO/releases/download/$VER/$ASSET"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$URL" -o "$tmp/og.tar.xz"
tar -xJf "$tmp/og.tar.xz" -C "$tmp"
sudo mkdir -p /opt/open-geocode/bin
sudo install -m 0755 "$(find "$tmp" -name open-geocode -type f | head -n1)" /opt/open-geocode/bin/open-geocode
sudo systemctl restart open-geocode
echo "deployed $VER"
