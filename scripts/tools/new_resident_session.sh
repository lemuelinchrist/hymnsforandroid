#!/bin/bash
# Creates an additional resident Claude Code session for this repo on `media`: a boot-persistent tmux
# session supervised by a systemd user unit, with Remote Control under a stable name.
#
# Usage: new_resident_session.sh <name>      (e.g. hymns-2 -> tmux claude-hymns-2, unit claude-agent-hymns-2.service)
set -euo pipefail

NAME="${1:-}"
[[ -n "$NAME" ]] || { echo "usage: $0 <name>" >&2; exit 2; }
[[ "$NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "error: name must be lowercase letters, digits and dashes (got '$NAME')" >&2; exit 2; }

SESSION="claude-$NAME"
UNIT_DIR="$HOME/.config/systemd/user"
SUPERVISOR="$UNIT_DIR/claude-$NAME-supervisor.sh"
SERVICE="claude-agent-$NAME.service"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLAUDE="$HOME/.local/bin/claude"

# Never clobber anything that exists (other resident agents live on this host too).
if tmux has-session -t "$SESSION" 2>/dev/null; then echo "error: tmux session '$SESSION' already exists" >&2; exit 1; fi
for f in "$SUPERVISOR" "$UNIT_DIR/$SERVICE"; do
    [[ ! -e "$f" ]] || { echo "error: $f already exists" >&2; exit 1; }
done

mkdir -p "$UNIT_DIR"

cat > "$SUPERVISOR" <<EOF
#!/bin/bash
# Supervises the $SESSION tmux session: relaunches claude whenever the session is gone (crash, manual kill, boot).
SESSION=$SESSION
DIR=$DIR
CLAUDE=$CLAUDE

while true; do
    if ! tmux has-session -t "\$SESSION" 2>/dev/null; then
        tmux new-session -d -s "\$SESSION" -c "\$DIR" \\
            "\$CLAUDE" --dangerously-skip-permissions --remote-control $NAME -n $NAME
    fi
    sleep 10
done
EOF
chmod +x "$SUPERVISOR"

cat > "$UNIT_DIR/$SERVICE" <<EOF
[Unit]
Description=Resident Claude Code agent (tmux session: $SESSION)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$SUPERVISOR
ExecStop=/usr/bin/tmux kill-session -t $SESSION
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE"

for _ in $(seq 1 12); do
    sleep 5
    if tmux capture-pane -t "$SESSION" -p 2>/dev/null | grep -q '/remote-control is active'; then
        tmux capture-pane -t "$SESSION" -p | grep -o 'https://claude.ai/code/session_[A-Za-z0-9]*' | head -1 || true
        echo "ok: $NAME is up (tmux $SESSION, unit $SERVICE)"
        exit 0
    fi
done
echo "warning: Remote Control not confirmed after 60s; current pane:" >&2
tmux capture-pane -t "$SESSION" -p 2>/dev/null | tail -20 >&2 || true
exit 1
