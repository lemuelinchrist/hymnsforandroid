// Plays a hymn's tune, as the Android app's Play button does: the app's MIDI file for the hymn's tune code
// (res/raw/m<tune>.mid), looped until stopped. Browsers cannot play MIDI, so the file is read here and played with
// Web Audio: a small synthesized piano (a few harmonics, a brightness that fades, a decay that is longer for low
// notes). No samples, so nothing more to download and it works offline. One tune is an MP3; that one plays as audio.

let ctx = null, master = null;
let current = null;                       // {key, stop()}
const files = new Map();                  // url -> Promise of the parsed song

function audio() {
  if (!ctx) {
    // iPhone: play even with the ring/silent switch on, like a music app (Safari 17+)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
    // 'playback': a larger audio buffer. The default (low latency) makes tablets and phones crackle when many notes sound
    ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint: 'playback'});
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ---- reading a standard MIDI file into [{t, dur, note, vel}] in seconds ----

function parseMidi(buf) {
  const d = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  if (buf.byteLength < 14 || str(0, 4) !== 'MThd') throw new Error('not a MIDI file');
  const ntrk = d.getUint16(10), div = d.getUint16(12);
  if (div & 0x8000) throw new Error('SMPTE time is not supported');
  const events = [];   // {tick, type: 'on'|'off'|'tempo', ch, note, vel, tempo}
  let p = 8 + d.getUint32(4);
  for (let t = 0; t < ntrk && p + 8 <= buf.byteLength; t++) {
    if (str(p, 4) !== 'MTrk') break;
    const end = Math.min(buf.byteLength, p + 8 + d.getUint32(p + 4));
    p += 8;
    let tick = 0, status = 0;
    const vlq = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80 && p < end); return v; };
    while (p < end) {
      tick += vlq();
      let st = d.getUint8(p);
      if (st & 0x80) p++; else st = status;            // running status
      if (st === 0xff) {
        const type = d.getUint8(p++), len = vlq();
        if (type === 0x51 && len === 3) events.push({tick, type: 'tempo', tempo: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2)});
        if (type === 0x2f) { p = end; break; }
        p += len;
      } else if (st === 0xf0 || st === 0xf7) {
        p += vlq();
      } else {
        status = st;
        const hi = st & 0xf0, ch = st & 0x0f;
        if (hi === 0xc0 || hi === 0xd0) { p += 1; continue; }
        const a = d.getUint8(p), b = d.getUint8(p + 1);
        p += 2;
        if (ch === 9) continue;                         // drums: none in the hymns, and not a piano sound
        if (hi === 0x90 && b > 0) events.push({tick, type: 'on', ch, note: a, vel: b});
        else if (hi === 0x80 || hi === 0x90) events.push({tick, type: 'off', ch, note: a});
      }
    }
    p = end;
  }
  // ticks to seconds, following the tempo changes of all tracks
  events.sort((x, y) => x.tick - y.tick || (x.type === 'tempo' ? -1 : 0) - (y.type === 'tempo' ? -1 : 0));
  let tempo = 500000, lastTick = 0, sec = 0;
  const open = new Map(), notes = [];
  for (const e of events) {
    sec += (e.tick - lastTick) * tempo / div / 1e6;
    lastTick = e.tick;
    if (e.type === 'tempo') { tempo = e.tempo; continue; }
    const k = e.ch * 128 + e.note;
    if (e.type === 'on') {
      if (open.has(k)) { const n = open.get(k); n.dur = sec - n.t; }
      const n = {t: sec, dur: 0.5, note: e.note, vel: e.vel};
      open.set(k, n);
      notes.push(n);
    } else if (open.has(k)) {
      open.get(k).dur = Math.max(0.05, sec - open.get(k).t);
      open.delete(k);
    }
  }
  const start = notes.length ? notes[0].t : 0;
  for (const n of notes) n.t -= start;                 // no silence before the first note
  const length = notes.reduce((m, n) => Math.max(m, n.t + n.dur), 0);
  return {notes, length};
}

// ---- the piano ----

let wave = null;
function pianoWave(c) {
  if (!wave) {
    const amps = [0, 1, 0.42, 0.25, 0.12, 0.09, 0.05, 0.035, 0.02, 0.012];
    wave = c.createPeriodicWave(new Float32Array(amps.length), new Float32Array(amps));
  }
  return wave;
}

function playNote(c, out, n, at) {
  const freq = 440 * Math.pow(2, (n.note - 69) / 12);
  const vel = n.vel / 127;
  const osc = c.createOscillator();
  osc.setPeriodicWave(pianoWave(c));
  osc.frequency.value = freq;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  const bright = Math.min(12000, freq * (6 + 10 * vel));
  filter.frequency.setValueAtTime(bright, at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 300), at + 1.2);
  const g = c.createGain();
  const peak = 0.16 * (0.35 + 0.65 * vel) * (n.note < 48 ? 0.8 : 1);
  const decay = 0.45 + 2.6 * Math.max(0, (84 - n.note) / 48);   // low notes ring longer
  const end = at + n.dur;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.006);
  g.gain.setTargetAtTime(peak * 0.25, at + 0.006, decay);
  g.gain.setTargetAtTime(0.0001, end, 0.09);           // the key is released
  osc.connect(filter).connect(g).connect(out);
  osc.start(at);
  osc.stop(end + 0.6);
  return osc;
}

// ---- playing a tune, looped ----

async function loadSong(url) {
  if (!files.has(url)) {
    files.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(parseMidi).catch((e) => { files.delete(url); throw e; }));
  }
  return files.get(url);
}

function loopMidi(song, key) {
  const c = audio();
  const out = c.createGain();
  out.connect(master);
  const oscs = new Set();
  let timer = null, stopped = false;
  const gap = 1.2;                                     // seconds between one time through and the next
  const ahead = 2.5, every = 400;                      // notes are made 2.5 s ahead, not the whole tune at once
  let at = c.currentTime + 0.15, i = 0;                // when this time through starts; the next note to make
  const tick = () => {
    if (stopped) return;
    const horizon = c.currentTime + ahead;
    while (at + (i < song.notes.length ? song.notes[i].t : song.length + gap) < horizon) {
      if (i >= song.notes.length) { at += song.length + gap; i = 0; continue; }
      const n = song.notes[i++], when = at + n.t;
      if (when < c.currentTime - 0.3) continue;        // the page was suspended: skip what is long past
      const o = playNote(c, out, n, Math.max(when, c.currentTime));
      oscs.add(o);
      o.onended = () => oscs.delete(o);
    }
    timer = setTimeout(tick, every);
  };
  tick();
  return {
    key,
    stop() {
      stopped = true;
      clearTimeout(timer);
      const now = c.currentTime;
      out.gain.setTargetAtTime(0, now, 0.05);
      setTimeout(() => { for (const o of oscs) { try { o.stop(); } catch (e) { /* already done */ } } out.disconnect(); }, 400);
    },
  };
}

function loopAudio(url, key) {
  const el = new Audio(url);
  el.loop = true;
  el.play();
  return {key, stop() { el.pause(); el.src = ''; }};
}

export function playing() { return current ? current.key : null; }

// play a tune file (midi/<hash>.mid or .mp3); key says what is playing (the hymn ID). Must be called from a tap.
export async function play(url, key) {
  stop();
  audio();                                             // unlock audio inside the tap, before anything is awaited
  const token = current = {key, stop() {}};
  if (/\.mp3$/.test(url)) {
    current = loopAudio(url, key);
    return;
  }
  const song = await loadSong(url);
  if (current !== token) return;                       // stopped (or another tune) while loading
  current = loopMidi(song, key);
}

export function stop() {
  if (current) current.stop();
  current = null;
}

// a tune is cached once played; this fetches them all for offline use
export function prefetch(urls, onProgress) {
  let done = 0;
  const queue = urls.slice();
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      try { await fetch(u); } catch (e) { /* offline: try the rest */ }
      if (onProgress) onProgress(++done / urls.length);
    }
  };
  return Promise.all(Array.from({length: 8}, worker));
}

// for the tests: the parser, and a tune rendered without a speaker (peak level, seconds)
export async function renderForTest(url, seconds = 8, withSamples = false) {
  const song = parseMidi(await (await fetch(url)).arrayBuffer());
  const c = new OfflineAudioContext(1, 44100 * seconds, 44100);
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  const g = c.createGain();
  g.gain.value = 0.5;
  g.connect(comp).connect(c.destination);
  for (const n of song.notes) if (n.t < seconds) playNote(c, g, n, n.t + 0.05);
  const buf = await c.startRendering();
  const data = buf.getChannelData(0);
  let peak = 0, sum = 0;
  for (const v of data) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  return {notes: song.notes.length, length: song.length, peak, rms: Math.sqrt(sum / data.length), samples: withSamples ? Array.from(data) : undefined};
}

export {parseMidi};
