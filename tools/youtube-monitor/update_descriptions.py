#!/usr/bin/env python3
"""Update YouTube video descriptions for HymnsForAndroid channel videos.

Reads linked HymnsForAndroid videos from tools/youtube-monitor/recordings.tsv,
builds descriptions with the web app link (mentioning Sheet Music only when
app/src/main/assets/sheetMei/<id>.mei exists) and lyrics from hymns.sqlite,
and updates each video's snippet.description via the YouTube Data API v3.

Credentials are read from ~/.config/hymnsforandroid/client_secret.json and the
OAuth token is cached at ~/.config/hymnsforandroid/youtube_token.json.
"""

import argparse
import csv
import html
import os
import re
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RECORDINGS_TSV = Path(__file__).resolve().parent / "recordings.tsv"
DB_PATH = REPO_ROOT / "app" / "src" / "main" / "assets" / "hymns.sqlite"
MEI_DIR = REPO_ROOT / "app" / "src" / "main" / "assets" / "sheetMei"

CONFIG_DIR = Path.home() / ".config" / "hymnsforandroid"
CLIENT_SECRET = CONFIG_DIR / "client_secret.json"
TOKEN_FILE = CONFIG_DIR / "youtube_token.json"

SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]
WEB_APP_URL = "https://lemuelinchrist.github.io/hymnsforandroid/"
MAX_TITLE_LEN = 100
MAX_DESC_LEN = 5000


def get_stanzas(conn: sqlite3.Connection, hymn_id: str) -> list[tuple[str, str]]:
    """Return ordered (no, text) stanzas, falling back through parent_hymn."""
    seen = set()
    cur = hymn_id
    while cur and cur not in seen:
        seen.add(cur)
        stanzas = conn.execute(
            "SELECT no, text FROM stanza WHERE parent_hymn=? ORDER BY n_order",
            (cur,),
        ).fetchall()
        if stanzas:
            return stanzas
        row = conn.execute(
            "SELECT parent_hymn FROM hymns WHERE _id=?", (cur,)
        ).fetchone()
        cur = row[0] if row else None
    return []


def clean_stanza_text(raw: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", raw or "", flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text).strip()


def format_stanza(no: str, raw_text: str) -> str:
    body = clean_stanza_text(raw_text)
    if not body:
        return ""
    key = (no or "").strip().lower()
    if key == "chorus":
        return f"Chorus\n{body}"
    if key in ("", "-", "beginning-note", "end-note", "verse"):
        return body
    return f"{no.strip()}\n{body}"


def build_title(current_title: str, hymn_id: str) -> str:
    base = (current_title or "").strip()
    if re.search(rf"(?:^|\W){re.escape(hymn_id)}$", base):
        new_title = base
    else:
        new_title = f"{base} - {hymn_id}"
    if len(new_title) > MAX_TITLE_LEN:
        raise ValueError(
            f"{hymn_id}: title length {len(new_title)} exceeds {MAX_TITLE_LEN}: {new_title!r}"
        )
    return new_title


def build_description(conn: sqlite3.Connection, hymn_id: str) -> str:
    has_sheet = (MEI_DIR / f"{hymn_id}.mei").is_file()
    link = f"{WEB_APP_URL}#/h/{hymn_id}"
    if has_sheet:
        header = f"{hymn_id} Hymn & Sheet Music: {link}"
    else:
        header = f"{hymn_id} Hymn: {link}"

    parts = [header]
    for no, raw_text in get_stanzas(conn, hymn_id):
        block = format_stanza(no, raw_text)
        if block:
            parts.append(block)
    parts.append(f"---\nHymns For Android Web App: {WEB_APP_URL}")

    desc = "\n\n".join(parts)
    if len(desc) > MAX_DESC_LEN:
        raise ValueError(
            f"{hymn_id}: description length {len(desc)} exceeds {MAX_DESC_LEN}"
        )
    return desc


def load_targets(video_filter: str | None) -> list[dict[str, str]]:
    with RECORDINGS_TSV.open(encoding="utf-8") as f:
        rows = [
            r
            for r in csv.DictReader(f, delimiter="\t")
            if r["youtube channel"] == "HymnsForAndroid" and r["hymns"].strip()
        ]
    if video_filter:
        rows = [r for r in rows if r["video id"] == video_filter]
    return rows


def get_youtube_service():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    creds = None
    if TOKEN_FILE.is_file():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CLIENT_SECRET.is_file():
                raise FileNotFoundError(f"Missing {CLIENT_SECRET}")
            flow = InstalledAppFlow.from_client_secrets_file(
                str(CLIENT_SECRET), SCOPES
            )
            creds = flow.run_local_server(port=0)
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
        os.chmod(TOKEN_FILE, 0o600)
    return build("youtube", "v3", credentials=creds)


def fetch_snippets(youtube, video_ids: list[str]) -> dict[str, dict]:
    snippets: dict[str, dict] = {}
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i : i + 50]
        resp = youtube.videos().list(part="snippet", id=",".join(batch)).execute()
        for item in resp.get("items", []):
            snippets[item["id"]] = item["snippet"]
    return snippets


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Push updates to YouTube (without this flag, only does a dry run).",
    )
    parser.add_argument(
        "--video",
        help="Only process a single YouTube video ID (useful for testing).",
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="Print the full generated description in dry-run mode.",
    )
    args = parser.parse_args()

    targets = load_targets(args.video)
    if not targets:
        print("No matching HymnsForAndroid videos found.", file=sys.stderr)
        return 1

    conn = sqlite3.connect(str(DB_PATH))
    planned: list[tuple[str, str, str, str]] = []
    for r in targets:
        vid = r["video id"]
        hid = r["hymns"].strip()
        title = r["title"]
        desc = build_description(conn, hid)
        planned.append((vid, hid, title, desc))

    if not args.apply:
        print(f"Dry run: {len(planned)} video(s) prepared (pass --apply to update).")
        for vid, hid, title, desc in planned[: (len(planned) if args.show else 3)]:
            planned_title = build_title(title, hid)
            print(f"\n=== {vid} ({hid}: {planned_title}) [{len(desc)} chars] ===")
            print(desc if args.show else desc.splitlines()[0])
        if not args.show and len(planned) > 3:
            print(f"\n... and {len(planned) - 3} more. Use --video <ID> --show to inspect one.")
        return 0

    youtube = get_youtube_service()
    snippets = fetch_snippets(youtube, [vid for vid, _, _, _ in planned])

    updated = 0
    skipped = 0
    missing = 0
    for vid, hid, title, desc in planned:
        snippet = snippets.get(vid)
        if not snippet:
            print(f"[MISSING] {vid} ({hid}: {title}) not returned by API")
            missing += 1
            continue
        new_title = build_title(snippet["title"], hid)
        if snippet.get("description", "") == desc and snippet["title"] == new_title:
            print(f"[SKIP] {vid} ({hid}) already up to date")
            skipped += 1
            continue

        new_snippet = {
            "title": new_title,
            "description": desc,
            "categoryId": snippet["categoryId"],
        }
        for opt_key in ("tags", "defaultLanguage", "defaultAudioLanguage"):
            if opt_key in snippet:
                new_snippet[opt_key] = snippet[opt_key]

        youtube.videos().update(
            part="snippet",
            body={"id": vid, "snippet": new_snippet},
        ).execute()
        print(f"[UPDATED] {vid} ({hid}: {new_title})")
        updated += 1

    print(f"\nDone: updated={updated}, skipped={skipped}, missing={missing}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
