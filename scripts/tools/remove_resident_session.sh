#!/bin/bash
# Removes a resident Claude Code session made by new_resident_session.sh: disables and deletes its systemd user
# unit and supervisor script, and kills its tmux session. (Deleting a session in the Claude app only drops the
# Remote Control link; the agent keeps running until this is done.)
#
# Usage: remove_resident_session.sh [--force] <name>
#   --force  needed to remove the primary `hymns` session or the session this script runs inside
set -euo pipefail

FORCE=0
if [[ "${1:-}" == "--force" ]]; then FORCE=1; shift; fi
NAME="${1:-}"
[[ -n "$NAME" ]] || { echo "usage: $0 [--force] <name>" >&2; exit 2; }

SESSION="claude-$NAME"
UNIT_DIR="$HOME/.config/systemd/user"
SUPERVISOR="$UNIT_DIR/claude-$NAME-supervisor.sh"
SERVICE="claude-agent-$NAME.service"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Only touch sessions that work in this repo; other projects' agents are refused.
if [[ ! -f "$SUPERVISOR" ]] || ! grep -qx "DIR=$DIR" "$SUPERVISOR"; then
    echo "error: no resident session named '$NAME' for $DIR ($SUPERVISOR missing or for another project)" >&2; exit 1
fi
if [[ "$NAME" == "hymns" && $FORCE -eq 0 ]]; then
    echo "error: 'hymns' is the primary resident session; pass --force to remove it" >&2; exit 1
fi
CURRENT=""
[[ -z "${TMUX:-}" ]] || CURRENT=$(tmux display-message -p '#S' 2>/dev/null || true)
if [[ "$CURRENT" == "$SESSION" && $FORCE -eq 0 ]]; then
    echo "error: this is the session running this script; removing it ends this conversation. Pass --force to do it anyway" >&2; exit 1
fi

# Delete the files first, so the removal is complete even if this kills our own session.
systemctl --user disable "$SERVICE" 2>/dev/null || true
rm -f "$UNIT_DIR/$SERVICE" "$SUPERVISOR"
systemctl --user daemon-reload
echo "ok: removed $SERVICE and $(basename "$SUPERVISOR")"
systemctl --user stop "$SERVICE" 2>/dev/null || true
tmux kill-session -t "$SESSION" 2>/dev/null || true
echo "ok: stopped $NAME (tmux $SESSION)"
