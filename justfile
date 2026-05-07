_default:
    @just --list

# Bundles scripts/ into dist/.
build:
    @vp i && vp check --fix && vp build

# Runs the sync server (Tailscale Funnel + WS for the game + local control
# socket for `just deploy`). Holds the connection open; pushes are explicit.
run:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'tailscale funnel reset >/dev/null 2>&1 || true' EXIT INT TERM
    tailscale funnel --bg --https=443 http://localhost:12525 >/dev/null
    DNS=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
    echo "Funnel up: wss://$DNS"
    vp run start

# Pushes the current dist/ to Bitburner via the running sync server.
deploy: build
    @curl -fsS -X POST http://127.0.0.1:12526/deploy
