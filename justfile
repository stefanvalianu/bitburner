_default:
    @just --list

# Bundles scripts/ into dist/.
build:
    @vp i && vp check --fix && vp build

# Runs the sync server (Tailscale Funnel + WS for the game + local control socket for `just deploy`). Holds the connection open; pushes are explicit. Pass --local to skip Tailscale Funnel and run only on localhost.
run *FLAGS="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [[ " {{FLAGS}} " == *" --local "* ]]; then
        echo "Local mode: ws://localhost:12525"
    else
        trap 'tailscale funnel reset >/dev/null 2>&1 || true' EXIT INT TERM
        tailscale funnel --bg --https=443 http://localhost:12525 >/dev/null
        DNS=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
        echo "Funnel up: wss://$DNS"
    fi
    vp run start

# Pushes the current dist/ to Bitburner via the running sync server.
deploy: build
    @curl -fsS -X POST http://127.0.0.1:12526/deploy

# Opens VSCode and attaches to (or creates) a tmux session with two panes for the shell and the running sync server
init:
    #!/usr/bin/env bash
    set -euo pipefail
    SESSION="bitburner"
    DIR="{{justfile_directory()}}"

    code "$DIR/bitwarden.code-workspace"

    if ! tmux has-session -t "$SESSION" 2>/dev/null; then
        P0=$(tmux new-session -d -s "$SESSION" -c "$DIR" -P -F '#{pane_id}')
        P1=$(tmux split-window -h -t "$P0" -c "$DIR" -P -F '#{pane_id}')
        tmux select-layout -t "$SESSION" even-horizontal
        tmux send-keys -t "$P1" 'just run' C-m
        tmux select-pane -t "$P0"
    fi

    if [ -n "${TMUX:-}" ]; then
        tmux switch-client -t "$SESSION"
    else
        tmux attach-session -t "$SESSION"
    fi
