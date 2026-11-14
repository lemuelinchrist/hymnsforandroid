#!/usr/bin/env python3
"""One still-card video per track of a local album, ready to upload to YouTube (the HymnsForAndroid channel).

usage: make_album_videos.py <album folder with the audio files> <out folder> "<Album title>" <card colour #rrggbb> [--keep-order-file order.txt]
Card: 1080x1080 square in the colour with the album title in white Georgia Italic, centred on a black 1920x1080 frame;
1 fps h264 + aac 256k (ffmpeg, -tune stillimage). File name = the YouTube title: the track number prefix and a
trailing "(#123)" hymn tag are dropped, nothing else is changed (spelling stays as in the original file).
Needs Pillow and an ffmpeg with libx264 (the transcribe venv's imageio ffmpeg works); Georgia from C:\\Windows\\Fonts."""
import sys, re, subprocess, pathlib, textwrap
from PIL import Image, ImageDraw, ImageFont
src, out, title, colour = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3], sys.argv[4]
FFMPEG = '/home/lemue/venvs/transcribe/bin/ffmpeg'
out.mkdir(parents=True, exist_ok=True)
img = Image.new('RGB', (1920, 1080), 'black')
d = ImageDraw.Draw(img)
d.rectangle([420, 0, 1499, 1079], fill=colour)
size = 96
font = ImageFont.truetype('/mnt/c/Windows/Fonts/georgiai.ttf', size)
lines = textwrap.wrap(title, 16)
while max(d.textlength(l, font=font) for l in lines) > 900 and size > 40:
    size -= 4; font = ImageFont.truetype('/mnt/c/Windows/Fonts/georgiai.ttf', size)
h = len(lines) * int(size * 1.25)
y = 540 - h // 2
for l in lines:
    d.text((960 - d.textlength(l, font=font) / 2, y), l, font=font, fill='white'); y += int(size * 1.25)
card = out / '_card.png'; img.save(card)
for f in sorted(src.iterdir()):
    if f.suffix.lower() not in ('.ogg', '.mp3', '.wma', '.m4a'): continue
    name = re.sub(r'^\s*\d{1,2}\s*[-.)]\s*', '', f.stem)
    name = re.sub(r'\s*\(#\d+\)\s*$', '', name).strip()
    safe = re.sub(r'[<>:"/\\|?*]', '', name)
    dst = out / (safe + '.mp4')
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '1', '-i', str(card), '-i', str(f),
                    '-c:v', 'libx264', '-tune', 'stillimage', '-r', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k',
                    '-shortest', str(dst)], check=True)
    print(dst.name, flush=True)
card.unlink()
