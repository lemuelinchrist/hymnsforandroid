---
name: "Remove Resident Session"
description: "Fully remove a resident Claude Code session for this repo on media (service, files, tmux session), under the given name"
argument-hint: "<session-name>"
allowed-tools: Bash(scripts/tools/remove_resident_session.sh:*), Bash(tmux ls:*)
---

Remove the resident session named `$ARGUMENTS` (one made by `/new-resident-session`). Deleting a session in the Claude
app only drops its Remote Control link; this stops the agent itself.

1. If `$ARGUMENTS` is empty, ask which session to remove and stop. Don't guess.
2. From the repo root run `scripts/tools/remove_resident_session.sh "$ARGUMENTS"`. It only touches sessions of this repo,
   and refuses the primary `hymns` session and the session it runs inside unless `--force` is given. If it refuses, say
   why and stop; rerun with `--force` only if the user explicitly confirms (warn first that removing the current session
   ends this conversation).
3. Check with `tmux ls` that `claude-$ARGUMENTS` is gone and report which sessions are still running.
