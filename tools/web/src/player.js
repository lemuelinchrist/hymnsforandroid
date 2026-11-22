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
  let firstTick = Infinity, lastNoteTick = 0;
  for (const e of events) {
    sec += (e.tick - lastTick) * tempo / div / 1e6;
    lastTick = e.tick;
    if (e.type === 'tempo') { tempo = e.tempo; continue; }
    if (e.type === 'on' && e.tick < firstTick) firstTick = e.tick;
    if (e.tick > lastNoteTick) lastNoteTick = e.tick;
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
  // dominant tempo across the sounding notes (ignoring tick-0 lead-in and trailing skip tempos)
  let mainTempo = 500000;
  const spans = new Map();
  let cur = 500000, pos = firstTick < lastNoteTick ? firstTick : 0;
  for (const e of events) {
    if (e.type !== 'tempo') continue;
    if (e.tick <= pos) cur = e.tempo;
    else if (e.tick < lastNoteTick) {
      spans.set(cur, (spans.get(cur) || 0) + (e.tick - pos));
      pos = e.tick;
      cur = e.tempo;
    }
  }
  if (lastNoteTick > pos) spans.set(cur, (spans.get(cur) || 0) + (lastNoteTick - pos));
  let best = 0;
  for (const [us, ticks] of spans) if (ticks > best) { best = ticks; mainTempo = us; }
  if (!best) mainTempo = cur;
  return {notes, length, tempo: mainTempo};     // tempo: microseconds to a quarter note
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

export function playing() { return current ? current.key : null; }

// the tempo of a tune's MIDI file in quarter notes a minute (fallback when a sheet has no midi.bpm), or 0 when it has none
export async function tuneTempo(url) {
  if (!url || /\.mp3$/.test(url)) return 0;
  try { return Math.round(60e6 / (await loadSong(url)).tempo); } catch (e) { return 0; }
}

// ---- playing a sheet (sheetplayer.js) ----
// The notes are made from the sheet itself (piano.js scoreOf), not read from a MIDI file, so it is the sheet as shown:
// its key, its chords and the piano part. Notes are made 2.5 s ahead; the sheet's own elements light up from a
// frame loop that reads the audio clock.
//   score: {events: [{q, d, note, vel, hand, ids}], length}  (q and d in quarter notes)
//   o: {from, bpm, speed, loop, mute: {m, f, l, c: true}, onFrame(q, ids), onEnd()}
export function playScore(score, o) {
  stop();
  const c = audio(), key = 'sheet';
  const out = c.createGain();
  out.connect(master);
  const spq = 60 / (o.bpm * (o.speed || 1));            // seconds to a quarter note
  const full = Math.max(0.25, score.length), from = Math.max(0, Math.min(o.from || 0, full - 0.25));
  const mute = o.mute || {};
  const evs = score.events.filter((e) => !mute[e.hand]);
  let first = 0;
  while (first < evs.length && evs[first].q < from - 1e-6) first++;
  const t0 = c.currentTime + 0.12;                      // when `from` sounds, the first time through
  const oscs = new Set();
  let i = first, lap = 0, stopped = false, timer = null, raf = 0, shown = '';
  const position = () => {
    const q = (c.currentTime - t0) / spq;
    return q < 0 ? from : o.loop ? (from + q) % full : Math.min(score.length, from + q);
  };
  const finish = () => control.stop();
  const tick = () => {
    if (stopped) return;
    const horizon = c.currentTime + 2.5;
    for (;;) {
      if (i >= evs.length) {
        if (!o.loop || !evs.length) break;
        if (t0 + ((lap + 1) * full - from) * spq > horizon) break;
        lap++; i = 0; continue;
      }
      const e = evs[i], when = t0 + (lap * full + e.q - from) * spq;
      if (when > horizon) break;
      i++;
      if (when < c.currentTime - 0.3) continue;         // the page was suspended: skip what is long past
      const osc = playNote(c, out, {note: e.note, vel: e.vel, dur: Math.max(0.08, e.d * spq * 0.97)}, Math.max(when, c.currentTime));
      oscs.add(osc);
      osc.onended = () => oscs.delete(osc);
    }
    if (!o.loop && c.currentTime > t0 + (full - from) * spq + 0.4) { finish(); return; }
    timer = setTimeout(tick, 200);
  };
  const frame = () => {
    if (stopped) return;
    const q = position(), ids = new Set();
    for (const e of evs) { if (e.q > q) break; if (e.ids.length && q < e.q + Math.max(e.d, 0.25)) e.ids.forEach((id) => ids.add(id)); }
    const list = Array.from(ids), sig = list.join(',');
    if (o.onFrame) o.onFrame(q, sig !== shown ? list : null);
    shown = sig;
    raf = requestAnimationFrame(frame);
  };
  const control = {
    key,
    position,
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      out.gain.setTargetAtTime(0, c.currentTime, 0.05);
      setTimeout(() => { for (const osc of oscs) { try { osc.stop(); } catch (e) { /* already done */ } } out.disconnect(); }, 400);
      if (current === control) current = null;
      if (o.onFrame) o.onFrame(position(), []);
      if (o.onEnd) o.onEnd();
    },
  };
  current = control;
  tick();
  frame();
  return control;
}

// for the tests: a score rendered without a speaker (peak level, how loud on the whole, how many seconds long)
export async function renderScoreForTest(score, bpm, seconds = 10) {
  const c = new OfflineAudioContext(1, 44100 * seconds, 44100);
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  const g = c.createGain();
  g.gain.value = 0.5;
  g.connect(comp).connect(c.destination);
  const spq = 60 / bpm;
  for (const e of score.events) if (e.q * spq < seconds) playNote(c, g, {note: e.note, vel: e.vel, dur: Math.max(0.08, e.d * spq * 0.97)}, e.q * spq + 0.05);
  const data = (await c.startRendering()).getChannelData(0);
  let peak = 0, sum = 0;
  for (const v of data) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  return {peak, rms: Math.sqrt(sum / data.length), notes: score.events.length};
}

// a score as a standard MIDI file (format 1: the melody and the notes added to it on one track, the left hand and the
// chords on the other), at `bpm` quarter notes a minute
export function toMidi(score, bpm, title = '') {
  const DIV = 480, bytes = [];
  const push = (...b) => b.forEach((x) => bytes.push(x & 0xff));
  const vlq = (v, into) => { const parts = [v & 0x7f]; while ((v >>= 7) > 0) parts.unshift((v & 0x7f) | 0x80); into.push(...parts); };
  const text = (s) => Array.from(new TextEncoder().encode(s));
  const track = (events, ch, name, tempo) => {
    const t = [];
    const nm = text(name).slice(0, 100);
    vlq(0, t); t.push(0xff, 0x03, nm.length, ...nm);
    if (tempo) { const us = Math.round(60e6 / bpm); vlq(0, t); t.push(0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff); vlq(0, t); t.push(0xff, 0x58, 4, 4, 2, 24, 8); }
    vlq(0, t); t.push(0xc0 | ch, 0);                                  // acoustic grand piano
    const list = [];
    for (const e of events) {
      const on = Math.round(e.q * DIV), off = Math.max(on + 1, Math.round((e.q + e.d * 0.97) * DIV));
      list.push([on, 1, 0x90 | ch, e.note, Math.max(1, Math.min(127, e.vel))], [off, 0, 0x80 | ch, e.note, 0]);
    }
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);                  // an off before an on at the same tick
    let at = 0;
    for (const [tick, , st, n, v] of list) { vlq(tick - at, t); t.push(st, n, v); at = tick; }
    vlq(0, t); t.push(0xff, 0x2f, 0);
    return t;
  };
  const hands = {right: score.events.filter((e) => e.hand === 'm' || e.hand === 'f'), left: score.events.filter((e) => e.hand === 'l' || e.hand === 'c')};
  const tracks = [track(hands.right, 0, title || 'Melody', true)];
  if (hands.left.length) tracks.push(track(hands.left, 1, 'Left hand', false));
  push(0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, DIV >> 8, DIV & 0xff);
  for (const t of tracks) { push(0x4d, 0x54, 0x72, 0x6b, t.length >>> 24, t.length >>> 16, t.length >>> 8, t.length); bytes.push(...t); }
  return new Uint8Array(bytes);
}

// play a tune file (midi/<hash>.mid or .mp3); key says what is playing (the hymn ID). Must be called from a tap.
export async function play(url, key) {
  stop();
  audio();                                             // unlock audio inside the tap, before anything is awaited
  const token = current = {key, stop() {}};
  if (/\.mp3$/.test(url)) {
    const el = new Audio(url);
    el.loop = true;
    const ctl = {key, stop() { el.pause(); el.src = ''; }};
    current = ctl;
    try {
      await el.play();
    } catch (e) {
      if (current === ctl) current = null;
      ctl.stop();
      throw e;
    }
    if (current !== ctl) ctl.stop();
    return;
  }
  const song = await loadSong(url);
  if (current !== token) return;                       // stopped (or another tune) while loading
  current = loopMidi(song, key);
}

// start the audio inside a tap that will play something later (the sheet is still being drawn); iOS needs it
export function unlock() { audio(); }

export function stop() {
  if (current) current.stop();
  current = null;
}

// after stop(): the audio output is let go (a running context keeps its stream open, silent, on Android); play starts it again
export function rest() { if (ctx && ctx.state === 'running') ctx.suspend(); }

// a tune is cached once played; this fetches them all for offline use. Resolves to the number that could not be fetched.
export async function prefetch(urls, onProgress, parallel = 8) {
  let done = 0, failed = 0;
  const queue = urls.slice();
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      try { if (!(await fetch(u)).ok) failed++; } catch (e) { failed++; }   // offline: try the rest
      if (onProgress) onProgress(++done / urls.length);
    }
  };
  await Promise.all(Array.from({length: parallel}, worker));
  return failed;
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
