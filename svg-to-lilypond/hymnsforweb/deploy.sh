#!/usr/bin/env bash
# Builds Hymns for Web and (re)starts it as a user service that runs all the time.
#
#   ./deploy.sh
#
# - the data comes from the private snapshot of sqlite/hymns.sql (not the shared app/.../hymns.sqlite) and the
#   app's sheetMei / viewer folders
# - ~/hymnsforweb-app/   what the service runs (serve.py + dist/); safe to switch git branches meanwhile
# - ~/hymnsforweb-data/  the saved chord edits (edits/) and their history (history/); deploying never touches it
# - the service is the user unit hymnsforweb.service on port 8765 (user lingering keeps it running without a login)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
APP="$HOME/hymnsforweb-app"
DATA="$HOME/hymnsforweb-data"

(cd "$REPO/svg-to-lilypond/tools" && python3 -c "import verify")        # refreshes build/hymns_snapshot.sqlite from sqlite/hymns.sql
ASSETS="$REPO/svg-to-lilypond/build/web_assets"
mkdir -p "$ASSETS"
ln -sfn "$REPO/svg-to-lilypond/build/hymns_snapshot.sqlite" "$ASSETS/hymns.sqlite"
ln -sfn "$REPO/app/src/main/assets/sheetMei" "$ASSETS/sheetMei"
ln -sfn "$REPO/app/src/main/assets/viewer" "$ASSETS/viewer"

nice -n 10 python3 "$HERE/build.py" --assets "$ASSETS"

mkdir -p "$APP" "$DATA/edits" "$HOME/.config/systemd/user"
rsync -a --delete "$HERE/dist/" "$APP/dist/"
cp "$HERE/serve.py" "$APP/serve.py"
cp "$HERE/hymnsforweb.service" "$HOME/.config/systemd/user/hymnsforweb.service"
systemctl --user daemon-reload
systemctl --user enable hymnsforweb.service >/dev/null 2>&1
systemctl --user restart hymnsforweb.service
sleep 1
systemctl --user --no-pager --lines=0 status hymnsforweb.service | sed -n 1,3p
IP="$(hostname -I | awk '{print $1}')"
echo "Open http://$IP:8765/ on the tablet (this machine: http://localhost:8765/)"
