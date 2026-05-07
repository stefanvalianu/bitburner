_default:
    @just --list

# Bundles scripts/ into dist/. The running sync server picks up the dist/
# changes and pushes them to Bitburner.
build:
    vp build

# Starts the sync server and exposes it on the public internet via Tailscale Funnel
run:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'tailscale funnel reset >/dev/null 2>&1 || true' EXIT INT TERM
    tailscale funnel --bg --https=443 http://localhost:12525 >/dev/null
    DNS=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
    echo "Funnel up: wss://$DNS"
    vp run start
