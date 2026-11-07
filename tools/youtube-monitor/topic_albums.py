#!/usr/bin/env python3
"""List the album playlists (OLAK5uy_...) of a YouTube "- Topic" channel, which has no tabs for yt-dlp.

usage: python3 -I topic_albums.py <channel id>   (prints one playlist id per line; then list each with
yt-dlp --flat-playlist). Reads the channel page and follows every continuation token (the "Albums & Singles" shelf).
Albums of the same artist filed under a second Topic channel come out too."""
import re,json,sys,urllib.request
cid=sys.argv[1]
H={'User-Agent':'Mozilla/5.0','Accept-Language':'zh-TW,en'}
html=urllib.request.urlopen(urllib.request.Request(f'https://www.youtube.com/channel/{cid}',headers=H)).read().decode()
key=re.search(r'"INNERTUBE_API_KEY":"([^"]+)"',html).group(1)
ver=re.search(r'"INNERTUBE_CLIENT_VERSION":"([^"]+)"',html).group(1)
data=json.loads(re.search(r'var ytInitialData = (\{.*?\});</script>',html).group(1))
toks=set(); pls={}
def walk(o):
    if isinstance(o,dict):
        for k,v in o.items():
            if k=='token' and isinstance(v,str) and len(v)>40: toks.add(v)
            if k=='playlistId' and isinstance(v,str) and v.startswith('OLAK'): pls.setdefault(v,'')
        if 'lockupViewModel' in o or 'gridPlaylistRenderer' in o: pass
        for v in o.values(): walk(v)
    elif isinstance(o,list):
        for v in o: walk(v)
def titles(o):
    s=json.dumps(o,ensure_ascii=False)
    for m in re.finditer(r'"(OLAK5uy_[\w-]+)"',s): pls.setdefault(m.group(1),'')
walk(data); titles(data)
seen=set()
while toks-seen:
  t=(toks-seen).pop(); seen.add(t)
  if True:
    body=json.dumps({'context':{'client':{'clientName':'WEB','clientVersion':ver,'hl':'zh-TW'}},'continuation':t}).encode()
    try:
        r=json.loads(urllib.request.urlopen(urllib.request.Request(f'https://www.youtube.com/youtubei/v1/browse?key={key}',data=body,headers={**H,'Content-Type':'application/json'})).read())
        titles(r); walk(r)
    except Exception as e: print('err',e,file=sys.stderr)
for p in pls: print(p)
