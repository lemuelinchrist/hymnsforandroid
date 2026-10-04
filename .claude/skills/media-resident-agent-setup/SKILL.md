---
name: media-resident-agent-setup
description: Set up (or rebuild from a blank-slate reformat) a resident, always-on Claude Code agent for the Hymns For Android repo on the `media` host - the toolchain for the svg-to-lilypond converter, a clone of the repo, and a boot-persistent tmux+systemd session with Remote Control under a stable name so the user can reach it 24/7 from their phone. Use when the user asks to set up Claude Code on media, get this project running there, or re-establish the resident agent after media was reformatted/rebuilt.
---

# Resident Claude Code agent on `media` (Hymns For Android)

Recipe for standing up (or rebuilding from scratch) a 24/7 Claude Code instance for **this repo** on `media`, a
headless Ubuntu server reached with `ssh media` (the host alias must already exist in the operator's local
`~/.ssh/config` - if `ssh media` doesn't resolve, stop and ask; don't guess an IP/hostname).

This mirrors the convention of the other resident agents on `media` (`claude-ministrybooks`, `claude-mediamanager`,
`claude-media`; the MinistryBooks project has the original of this recipe in its own
`.claude/skills/media-resident-agent-setup/SKILL.md`) but keeps this project fully separate: own tmux session, own
systemd unit, own Remote Control name.

**Names used here (change them in all places together):**
| Thing | Value |
|---|---|
| repo on media | `/home/lemuel/hymnsforandroid` (remote `git@github.com:lemuelinchrist/hymnsforandroid.git`) |
| tmux session | `claude-hymns` |
| systemd user units | `claude-agent-hymns.service`, supervisor script `claude-hymns-supervisor.sh` |
| Remote Control name | `hymnsforandroid` |

**Decisions made for this project (don't re-litigate unless asked):**
- Runs with `--dangerously-skip-permissions`, like the other resident agents. The harness will NOT enforce any
  rule here; only `CLAUDE.local.md` (below) and the agent's own judgment do. **Say so when reporting back.**
- Runs directly inside the repo checkout. Machine-local resident-agent context goes in `CLAUDE.local.md`, which is
  NOT in this repo's `.gitignore`, so exclude it per-clone via `.git/info/exclude` (no repo change needed).
- This project has no `CLAUDE.md`; project rules live in `AGENTS.md` (read automatically) plus the skills in
  `.claude/skills/` (notably `svg-to-lilypond`, `hymn-provisioning`).
- The Android build, emulator and Gradle flows (`android-emulator-control`, `github-release`) are **Windows-only**
  on the operator's PC. The media agent does the converter work (`svg-to-lilypond/`), not Android builds.

## Step 0 - confirm reachability
```
ssh -o BatchMode=yes -o ConnectTimeout=5 media 'echo connected && whoami && uname -a'
```
If it fails, stop and ask the user.

## Step 1 - Claude Code CLI present and logged in?
```
ssh media 'which claude || ls ~/.local/bin/claude; ~/.local/bin/claude --version'
```
If missing: `ssh media 'curl -fsSL https://claude.ai/install.sh | bash'` (ensure `~/.local/bin` is on `PATH`).
Login needs interactive OAuth - ask the user to run `ssh media` and `claude` once; cannot be scripted.

## Step 2 - toolchain for the converter (needs sudo)
The converter needs: LilyPond, `rsvg-convert`, ImageMagick (`convert`), the `sqlite3` CLI, Python 3 with
`fontTools numpy Pillow`, and the URW fonts (`C059` stands in for Century Schoolbook L for text-width measurement).
Check, then install only what is missing (`media` has passwordless sudo for the user; verify with `sudo -n true`):
```
ssh media 'for p in lilypond librsvg2-bin sqlite3 imagemagick fonts-urw-base35 python3-numpy python3-pil python3-fonttools; do dpkg -s $p >/dev/null 2>&1 && echo "have $p" || echo "MISSING $p"; done'
ssh media 'sudo apt-get install -y lilypond librsvg2-bin sqlite3 python3-numpy python3-pil python3-fonttools'   # only the MISSING ones
```
Notes:
- The converter was developed on LilyPond **2.24.3**; Ubuntu 26.04 ships 2.24.4. Patch versions can change glyph
  outline shapes: run the regression list (Step 6); if it reports `unknown glyph ids`, follow the "Unknown glyph
  ids" section of the `svg-to-lilypond` skill to rebuild the glyph catalog, and record the version in
  `svg-to-lilypond/DESIGN.md`.
- `media` has 8 cores / ~14 GB shared with other services: use `-j 6` (not the 15 used on the 16-core dev PC).
- Python here is 3.14; the tools only use the standard library plus the three packages above.

## Step 2b - Android build toolchain (optional; not needed for the converter)
Lets the media agent build the debug APK (`./gradlew :app:assembleDebug`). It does NOT give an emulator, and release
signing (`keystore.properties`, the `.jks` keys) stays a PC-only concern. The build needs JDK 17 (AGP 8.13.2 / Gradle
8.13; no JDK existed on media), the Android SDK with platform 36, and `bash` + `sqlite3` (the `:sqlite:importSql` task
runs `cat hymns.sql | sqlite3 ...`).
```
ssh media 'sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openjdk-17-jdk-headless unzip'
```
Command-line tools (no root; the version number changes, so read it from Google's index instead of hard-coding):
```
ssh media 'curl -fsS https://dl.google.com/android/repository/repository2-3.xml | grep -A40 "cmdline-tools;latest" | grep -m1 -E "linux.*zip|<url>.*linux"'
# 2026-10-05: commandlinetools-linux-16111833_latest.zip, sha1 e025545c62a8e64c7559119566a569fb1dec5f60 (verify with sha1sum -c)
ssh media 'mkdir -p ~/android-sdk/cmdline-tools && cd /tmp && curl -fsSO https://dl.google.com/android/repository/commandlinetools-linux-<N>_latest.zip && unzip -q commandlinetools-linux-<N>_latest.zip -d ~/android-sdk/cmdline-tools && mv ~/android-sdk/cmdline-tools/cmdline-tools ~/android-sdk/cmdline-tools/latest'
ssh media 'export ANDROID_HOME=$HOME/android-sdk; yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME "platform-tools" "platforms;android-36" "build-tools;36.0.0"'
```
(`sdkmanager` is deprecated in favour of a new "Android CLI" but still works; accepting the SDK licenses is part of
installing, so mention it to the user. Result: about 490 MB in `~/android-sdk`.)

**`local.properties` is tracked in git and holds a Windows `sdk.dir`.** On media, point it at the SDK without making a
git-visible change:
```
ssh media 'cd ~/hymnsforandroid && git update-index --skip-worktree local.properties && printf "sdk.dir=/home/lemuel/android-sdk\n" > local.properties'
```
(If `git pull` ever complains about `local.properties`, run `git update-index --no-skip-worktree local.properties`,
`git checkout local.properties`, pull, then redo the two commands. Never commit this file from media.)

Verify (about 1.5 minutes; use `bash`, not `sh`: `/bin/sh` is dash and the wrapper fails; `--no-daemon` so no Gradle
daemon stays resident next to the other services):
```
ssh media 'cd ~/hymnsforandroid && ./gradlew :app:assembleDebug --no-daemon 2>&1 | tail -5'
```
Expect `BUILD SUCCESSFUL` and `app/build/outputs/apk/debug/HymnsForAndroidv5.4.6-PianoAndGuitar.apk` (about 98.7 MB). The
build also regenerates the git-ignored `app/src/main/assets/hymns.sqlite`; `git status` still shows `.gradle/`,
`app/build/`, `build/` as untracked (same as on the PC) - never `git add` them.

## Step 3 - clone/update the repo
```
ssh media 'test -d ~/hymnsforandroid/.git && (cd ~/hymnsforandroid && git pull --ff-only) || git clone git@github.com:lemuelinchrist/hymnsforandroid.git ~/hymnsforandroid'
```
About 1.2 GB (the SVG assets dominate). Needs GitHub SSH access from media (`ssh -T git@github.com` should greet the
user). Then set a repo-local identity (don't touch media's global git config, other agents share it) and exclude the
persona file:
```
ssh media 'cd ~/hymnsforandroid && git config user.name "Lemuel" && git config user.email "lemuelinchrist@gmail.com" && grep -qx CLAUDE.local.md .git/info/exclude || echo CLAUDE.local.md >> .git/info/exclude'
```
Generated output (`svg-to-lilypond/build/`) is git-ignored; `build/hymns_snapshot.sqlite` is rebuilt automatically from
`sqlite/hymns.sql` on first use.

## Step 4 - persona file (machine-local, never committed)
Create `~/hymnsforandroid/CLAUDE.local.md` on media:
```markdown
# Resident agent context - media host (Hymns For Android)

You are a Claude Code instance running persistently on `media`, started at boot via systemd
(`claude-agent-hymns.service`) in a tmux session (`claude-hymns`), reachable through Claude Code's Remote Control
under the name `hymnsforandroid`. This session runs with `--dangerously-skip-permissions`: every tool call
executes immediately with no confirmation prompt. Nothing technically stops you from committing, pushing or
deleting - only your own judgment does. No human is reliably watching this tmux session in real time.

Rules for this unattended context (the user relaxed these on 2026-10-05: more freedom, still reviewable):
- Git: you MAY commit and push, but only on the work branch `media/work` (create it from master with
  `git switch -c media/work`; push only `origin media/work`). Never commit or push `master`, never push any other branch,
  never force-push, never rewrite pushed history. Commit in small logical steps with clear messages and the attribution
  lines the harness gives you. If master moves, merge `origin/master` into `media/work`. The user merges to master.
- Files: main area is `svg-to-lilypond/`. You may also edit `app/` and `sqlite/` (shipped SVGs, `sqlite/hymns.sql`) when
  a task needs it, but ONLY on `media/work`, documented in DESIGN.md. A hymn's tune code names its MIDI file
  (`res/raw/m<tune>.mid`), so changing a tune code can break playback.
- Never build or sign release artifacts here (the keystore belongs to the PC), never touch Play Store or GitHub
  releases, never commit `local.properties` (skip-worktree).
- Do not read or write `app/src/main/assets/hymns.sqlite` (Gradle rewrites it); the checks use
  `svg-to-lilypond/build/hymns_snapshot.sqlite`.
- Compute: shared machine. At most `-j 8`, batches under `nice -n 10`, ONE batch at a time (they share `build/`), long
  jobs in the background with output to a file under `svg-to-lilypond/build/`.
- Autonomy: decide small ambiguities and record them in DESIGN.md. Stop and wait for the user before anything
  irreversible or outside this repo: deleting branches/history, merging to master, releases, credentials/keys,
  installing/removing system packages, touching other services or projects on this host.
- Reporting: short plain-language status after each major task; summarize commits and pushes at the end.

## Where the knowledge lives
- `AGENTS.md`: project overview. `svg-to-lilypond/DESIGN.md` (especially section 18 and the log in section 17): the
  full technical record of the SVG -> LilyPond converter. `.claude/skills/svg-to-lilypond/SKILL.md`: how to run it,
  read results, and the traps already found. Keep DESIGN.md updated with anything new you learn.
- Current numbers (2026-10-05): piano 3,077/3,179 and guitar 3,068/3,179 sheets accepted; the rest are `REVIEW`
  with concrete reasons.

## Your purpose right now
Continue the converter work on the user's instruction, received via Remote Control. Until told otherwise: stay idle,
don't start long jobs on your own initiative.
```

## Step 5 - systemd unit (boot persistence)
Linger must be on so the user systemd instance survives without a login session:
```
ssh media 'loginctl show-user $(whoami) | grep -i linger'
```
If `Linger=no`, ask the user before `loginctl enable-linger $(whoami)` (persistent account setting). (It is `yes` on
`media` as of 2026-10-05.)

**Don't use a bare `Type=oneshot` + `tmux new-session -d` unit** - `tmux` forks and returns, so systemd never
supervises the real `claude` process, and a boot-time tmux socket race is recorded as success. Use the polling
supervisor below (`Type=simple` + `Restart=always`); it self-heals both failure modes.

`~/.config/systemd/user/claude-hymns-supervisor.sh` (`chmod +x`):
```bash
#!/bin/bash
# Supervises the claude-hymns tmux session: relaunches claude inside it whenever the session isn't there
# (crash, manual kill, first boot). Runs under systemd as Type=simple + Restart=always.
SESSION=claude-hymns
DIR=/home/lemuel/hymnsforandroid
CLAUDE=/home/lemuel/.local/bin/claude

while true; do
    if ! tmux has-session -t "$SESSION" 2>/dev/null; then
        tmux new-session -d -s "$SESSION" -c "$DIR" \
            "$CLAUDE" --dangerously-skip-permissions --remote-control hymnsforandroid -n hymnsforandroid
    fi
    sleep 10
done
```
`~/.config/systemd/user/claude-agent-hymns.service`:
```ini
[Unit]
Description=Resident Claude Code agent (tmux session: claude-hymns)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/home/lemuel/.config/systemd/user/claude-hymns-supervisor.sh
ExecStop=/usr/bin/tmux kill-session -t claude-hymns
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```
`--remote-control hymnsforandroid -n hymnsforandroid` gives the session a **stable, meaningful Remote Control name**
(avoid random names; the user runs several peer sessions).

Enable and start:
```
ssh media 'systemctl --user daemon-reload && systemctl --user enable claude-agent-hymns.service && systemctl --user start claude-agent-hymns.service'
```
**Caution:** `ExecStop` kills the tmux session outright. If you are running as the resident agent itself, `restart`
kills your own conversation mid-turn. `daemon-reload` is always safe; `start/restart/stop` are not - check with the
user first.

## Step 6 - clear the trust prompt, verify, and check the toolchain
First launch in a new directory shows a "trust this folder" prompt. **The highlighted default is "No, exit"** -
pressing Enter alone would quit the session. Move to "Yes, I trust this folder" first:
```
ssh media 'tmux capture-pane -t claude-hymns -p | tail -20'
ssh media 'tmux send-keys -t claude-hymns Down; sleep 1; tmux send-keys -t claude-hymns Enter'   # only if the trust prompt is showing
```
(The prompt is about the user's own repo clone; confirm that is true before trusting.)
Verify the session: `ssh media 'tmux capture-pane -t claude-hymns -p | tail -15'` should show the normal prompt box with
Remote Control active and the name `hymnsforandroid`; `ListAgents` should list a `hymnsforandroid` Remote Control row.

Verify the converter toolchain (about 2-4 minutes at `-j 6`; run it in the repo, not in the resident session):
```
ssh media 'cd ~/hymnsforandroid/svg-to-lilypond && python3 tools/regress.py -j 6 2>&1 | tail -6'
```
Expect `36/36 as expected`. Any `BAD` line: read the reason first (missing package, `unknown glyph ids` from a
LilyPond version difference, font path) before touching code.

## Verified setup (2026-10-05)
Done once from the PC: packages installed (LilyPond 2.24.4, librsvg2-bin, sqlite3, python3-numpy/pil/fonttools; the rest
was already there), repo cloned over GitHub SSH (36 s, 864 MB), repo-local git identity set, `CLAUDE.local.md`
excluded via `.git/info/exclude`, `python3 tools/regress.py -j 6` -> `36/36 as expected` on LilyPond 2.24.4, service
enabled and started, trust prompt cleared, `ListAgents` shows `hymnsforandroid` as a Remote Control row. Not tested:
an actual host reboot (Linger=yes, unit enabled). Android toolchain (Step 2b) added the same day: JDK 17.0.20, SDK
platform 36 / build-tools 36.0.0, `./gradlew :app:assembleDebug --no-daemon` -> BUILD SUCCESSFUL in 1m37s.

## Keeping media and the PC in sync
Work happens in two checkouts (the PC and media). Only commit from one at a time and `git pull --ff-only` before
starting. The resident agent doesn't commit unless asked, so uncommitted work lives only on media's disk: ask it to
report what it changed, or have it commit when the user says so. Generated `build/` output is not shared.

## Report back
Tell the user the Remote Control name (`hymnsforandroid`), and remind them that `--dangerously-skip-permissions` means
the commit/push and scope rules are enforced only by `CLAUDE.local.md`/judgment, not by the harness.
