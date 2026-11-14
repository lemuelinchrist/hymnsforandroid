#!/usr/bin/env python3
"""Check all monitored YouTube channels (except Hymn Singing) for new songs.

Supports both regular channels (via yt-dlp --flat-playlist on /videos,
/releases, /playlists) and "- Topic" channels (via topic_albums.py + yt-dlp).
A video is considered accounted for if its ID appears in:
  - databaseProvisioner/src/main/resources/NycypcdYoutube.txt
  - the channel's *_known.tsv / tgb_kids_series.tsv files
  - tools/youtube-monitor/recordings.tsv (unless --no-recordings is passed)

Exit code: 0 = no new videos, 1 = new videos found, 2 = listing error.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
MATCHED = REPO / "databaseProvisioner" / "src" / "main" / "resources" / "NycypcdYoutube.txt"
RECORDINGS = HERE / "recordings.tsv"
TOPIC_ALBUMS = HERE / "topic_albums.py"


@dataclass(frozen=True)
class ChannelSpec:
    key: str
    name: str
    channel_id: str | None = None
    handle: str | None = None
    tabs: tuple[str, ...] = ("videos",)
    topic_channels: tuple[str, ...] = ()
    known_files: tuple[str, ...] = ()
    releases_cache: str | None = None


CHANNELS: tuple[ChannelSpec, ...] = (
    ChannelSpec(
        key="nycypcd",
        name="NYCYPCD",
        channel_id="UC_1giUVT14MRXyEFtQZgmKQ",
        handle="NYCYPCD",
        tabs=("videos", "releases"),
        known_files=("nycypcd_known.tsv",),
        releases_cache="nycypcd_releases.tsv",
    ),
    ChannelSpec(
        key="lsm",
        name="Living Stream Ministry - Topic",
        topic_channels=("UCrr3HofwiRkJBR-WgUixRlQ",),
        known_files=("lsm_known.tsv",),
    ),
    ChannelSpec(
        key="tgb-topic",
        name="Taiwan Gospel Book Room - Topic",
        topic_channels=("UCYE5AHiolvE8tj-LYgPuzig", "UCZolsL-QScygLdBTc36TbUQ"),
        known_files=("tgb_known.tsv",),
    ),
    ChannelSpec(
        key="loving-the-lord",
        name="Loving the Lord - Topic",
        topic_channels=("UCF0V197WENYJAGHzYRFbUog",),
        known_files=("lovingthelord_known.tsv",),
    ),
    ChannelSpec(
        key="josephs",
        name="Joseph's Storehouses",
        handle="JosephsStorehouses",
        tabs=("videos",),
        known_files=("josephs_known.tsv",),
    ),
    ChannelSpec(
        key="melody-of-lilies",
        name="Melody of Lilies",
        handle="MelodyofLilies",
        tabs=("videos", "releases", "playlists"),
        known_files=("melodyoflilies_known.tsv",),
    ),
    ChannelSpec(
        key="tgb-official",
        name="臺灣福音書房 (official channel)",
        channel_id="UCW4K7RJzb3bhrBgbhT2OBLA",
        tabs=("videos",),
        known_files=("tgb_known.tsv", "tgb_kids_series.tsv"),
    ),
    ChannelSpec(
        key="hymnsforandroid",
        name="HymnsForAndroid",
        channel_id="UCoUeyvqjfW8WCCFi7xgTWhA",
        handle="HymnsForAndroid",
        tabs=("videos",),
        known_files=(),
    ),
)


def find_ytdlp(explicit: str | None) -> str:
    if explicit:
        return explicit
    sibling = Path(sys.executable).parent / "yt-dlp"
    if sibling.is_file():
        return str(sibling)
    found = shutil.which("yt-dlp")
    if found:
        return found
    raise FileNotFoundError("yt-dlp not found; pass --ytdlp PATH")


def read_tsv(path: Path) -> list[list[str]]:
    if not path.is_file():
        return []
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            if line.strip() and not line.startswith("#"):
                rows.append(line.rstrip("\n").split("\t"))
    return rows


def load_recordings_index() -> tuple[set[str], set[str]]:
    """Return (video_ids, album_ids) already recorded in recordings.tsv."""
    video_ids: set[str] = set()
    album_ids: set[str] = set()
    if not RECORDINGS.is_file():
        return video_ids, album_ids
    with RECORDINGS.open(encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            vid = (r.get("video id") or "").strip()
            aid = (r.get("album id") or "").strip()
            if vid:
                video_ids.add(vid)
            if aid:
                album_ids.add(aid)
    return video_ids, album_ids


def ytdlp_flat(ytdlp: str, url: str, fmt: str) -> list[str] | None:
    r = subprocess.run(
        [ytdlp, "--flat-playlist", "--print", fmt, "--socket-timeout", "30", url],
        capture_output=True,
        text=True,
        timeout=300,
    )
    if r.returncode != 0:
        return None
    return [line for line in r.stdout.splitlines() if line.strip()]


def channel_base_url(spec: ChannelSpec) -> str:
    if spec.channel_id:
        return f"https://www.youtube.com/channel/{spec.channel_id}"
    if spec.handle:
        return f"https://www.youtube.com/@{spec.handle}"
    raise ValueError(f"{spec.key}: neither channel_id nor handle set")


def collect_playlist_items(
    ytdlp: str,
    playlists: list[tuple[str, str]],
    seen_videos: dict[str, str],
    skip_album_ids: set[str],
    cache_path: Path | None = None,
    pause: float = 3.0,
) -> int:
    """Fetch tracks for playlists not in skip_album_ids. Returns failed playlist count."""
    cached_by_album: dict[str, list[list[str]]] = {}
    if cache_path and cache_path.is_file():
        for r in read_tsv(cache_path):
            cached_by_album.setdefault(r[0], []).append(r)
        for rows in cached_by_album.values():
            for r in rows:
                if len(r) >= 4:
                    seen_videos.setdefault(r[2], f"[{r[1]}] {r[3]}")

    failures = 0
    for aid, atitle in playlists:
        if aid in cached_by_album or aid in skip_album_ids:
            continue
        time.sleep(pause)
        lines = ytdlp_flat(
            ytdlp,
            f"https://www.youtube.com/playlist?list={aid}",
            "%(id)s|%(title)s",
        )
        if lines is None:
            print(f"  (failed playlist {aid}: {atitle})", file=sys.stderr)
            failures += 1
            continue
        new_rows = []
        for line in lines:
            vid, title = (line.split("|", 1) + [""])[:2]
            if len(vid) == 11:
                label = f"[{atitle}] {title}" if atitle else title
                seen_videos.setdefault(vid, label)
                new_rows.append([aid, atitle, vid, title, ""])
        if cache_path:
            cached_by_album[aid] = new_rows
            with cache_path.open("w", encoding="utf-8") as f:
                f.write("# album id, album, video id, track, seconds\n")
                for rows in cached_by_album.values():
                    for r in rows:
                        f.write("\t".join(r) + "\n")
    return failures


def list_topic_albums(channel_id: str) -> list[str]:
    r = subprocess.run(
        [sys.executable, "-I", str(TOPIC_ALBUMS), channel_id],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or f"topic_albums failed for {channel_id}")
    return [line.strip() for line in r.stdout.splitlines() if line.strip()]


def fetch_channel_videos(
    ytdlp: str,
    spec: ChannelSpec,
    known_album_ids: set[str],
    refresh_albums: bool,
    pause: float,
) -> tuple[dict[str, str], int]:
    videos: dict[str, str] = {}
    failures = 0
    skip_albums = set() if refresh_albums else known_album_ids

    if spec.channel_id or spec.handle:
        base = channel_base_url(spec)
        for tab in spec.tabs:
            if tab == "videos":
                lines = ytdlp_flat(ytdlp, f"{base}/videos", "%(id)s|%(title)s")
                if lines is None:
                    raise RuntimeError(f"could not list {base}/videos")
                for line in lines:
                    vid, title = (line.split("|", 1) + [""])[:2]
                    if len(vid) == 11:
                        videos.setdefault(vid, title)
            elif tab in ("releases", "playlists"):
                lines = ytdlp_flat(ytdlp, f"{base}/{tab}", "%(id)s|%(title)s")
                if not lines:
                    continue
                pls = [tuple((l.split("|", 1) + [""])[:2]) for l in lines]
                cache = HERE / spec.releases_cache if (tab == "releases" and spec.releases_cache) else None
                # Only immutable OLAK5uy_ releases can be safely skipped by album id
                tab_skip = skip_albums if tab == "releases" else set()
                failures += collect_playlist_items(
                    ytdlp, pls, videos, tab_skip, cache_path=cache, pause=pause
                )

    for tcid in spec.topic_channels:
        album_ids = list_topic_albums(tcid)
        pls = [(aid, "") for aid in album_ids]
        failures += collect_playlist_items(
            ytdlp, pls, videos, skip_albums, pause=pause
        )

    return videos, failures


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--channel",
        action="append",
        dest="channels",
        help="Channel key to check (repeatable; default: all 8 channels).",
    )
    ap.add_argument("--list", action="store_true", help="List channel keys and exit.")
    ap.add_argument("--ytdlp", help="Path to yt-dlp binary.")
    ap.add_argument(
        "--no-recordings",
        action="store_true",
        help="Do not treat recordings.tsv entries as already seen.",
    )
    ap.add_argument(
        "--refresh-albums",
        action="store_true",
        help="Re-list already-cached Topic/Release albums.",
    )
    ap.add_argument(
        "--pause",
        type=float,
        default=3.0,
        help="Seconds to pause between playlist requests (default: 3.0).",
    )
    ap.add_argument("--json", help="Write JSON report to this path.")
    args = ap.parse_args()

    if args.list:
        for c in CHANNELS:
            print(f"{c.key:18s} {c.name}")
        return 0

    by_key = {c.key: c for c in CHANNELS}
    if args.channels:
        unknown = [k for k in args.channels if k not in by_key]
        if unknown:
            print(f"Unknown channel key(s): {', '.join(unknown)}", file=sys.stderr)
            return 2
        selected = [by_key[k] for k in args.channels]
    else:
        selected = list(CHANNELS)

    ytdlp = find_ytdlp(args.ytdlp)
    matched_ids = {r[1] for r in read_tsv(MATCHED) if len(r) >= 2}
    rec_video_ids, rec_album_ids = load_recordings_index()

    report: dict[str, dict] = {}
    any_new = False
    any_error = False

    for spec in selected:
        known_ids: set[str] = set()
        for kf in spec.known_files:
            for r in read_tsv(HERE / kf):
                if r:
                    known_ids.add(r[0])

        accounted = set(matched_ids) | known_ids
        if not args.no_recordings:
            accounted |= rec_video_ids

        try:
            videos, failures = fetch_channel_videos(
                ytdlp, spec, rec_album_ids, args.refresh_albums, args.pause
            )
        except Exception as e:
            print(f"[{spec.key}] ERROR: {e}", file=sys.stderr)
            any_error = True
            continue

        new_items = [
            {"id": vid, "title": title}
            for vid, title in videos.items()
            if vid not in accounted
        ]
        if new_items:
            any_new = True
        if failures:
            any_error = True

        print(
            f"[{spec.key}] {spec.name}: {len(videos)} listed, "
            f"{len(new_items)} NEW"
            + (f" ({failures} playlist errors)" if failures else "")
        )
        for item in new_items:
            print(f"  https://www.youtube.com/watch?v={item['id']}  {item['title']}")

        report[spec.key] = {
            "name": spec.name,
            "listed": len(videos),
            "new": new_items,
            "playlist_errors": failures,
        }

    if args.json:
        Path(args.json).write_text(
            json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    if any_error:
        return 2
    return 1 if any_new else 0


if __name__ == "__main__":
    raise SystemExit(main())
