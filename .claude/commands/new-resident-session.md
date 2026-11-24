---
name: "New Resident Session"
description: "Start an additional boot-persistent, Remote Control-enabled Claude Code session for this repo on media, under the given name"
argument-hint: "<session-name>"
allowed-tools: Bash(scripts/tools/new_resident_session.sh:*), Bash(tmux capture-pane:*), Bash(tmux send-keys:*)
---

Create a resident Claude Code session named `$ARGUMENTS` for this repo (tmux `claude-<name>`, systemd user unit
`claude-agent-<name>.service`, `--dangerously-skip-permissions`, `--remote-control <name>`). The primary session is
`claude-hymns` (Remote Control name `hymnsforandroid`).

1. If `$ARGUMENTS` is empty, ask for a name and stop. Don't make one up.
2. From the repo root run `scripts/tools/new_resident_session.sh "$ARGUMENTS"`. It rejects invalid names (lowercase
   letters, digits, dashes) and refuses to overwrite an existing session or unit. If it refuses, say why and stop.
3. If it warns that Remote Control wasn't confirmed, look at `tmux capture-pane -t claude-$ARGUMENTS -p | tail -20`.
   If it shows the one-time "trust this folder" prompt, press Enter with `tmux send-keys -t claude-$ARGUMENTS Enter`
   and check again; otherwise report what the pane shows.
4. Report the session name and the claude.ai/code link the script printed. Remind the user that the session runs
   without permission prompts and shares this checkout, so two sessions editing files or running batches at once can collide.
