// Plays a hymn's tune, as the Android app's Play button does: the app's MIDI file for the hymn's tune code
// (res/raw/m<tune>.mid), looped until stopped. Browsers cannot play MIDI, so the file is read here and played with
// Web Audio: Salamander Grand Piano (Yamaha C5, CC-BY 3.0 by Alexander Holm) sampled every minor 3rd from A1 to C7
// (vendor/piano/*.mp3, lazy-cached offline), with velocity-sensitive warmth, smooth damper release, a subtle room tail,
// and a tiny synthesized fallback while samples load or if unavailable. One tune is an MP3; that one plays as audio.
// The sheet's guitar strums play on a sampled steel-string guitar (FluidR3 GM, vendor/guitar) in the tone chosen.

let ctx = null, master = null;
let current = null;                       // {key, stop()}
const files = new Map();                  // url -> Promise of the parsed song

// ---- multi-sampled acoustic grand piano (Salamander Yamaha C5) ----

const SAMPLES = [
  [33, 'A1'], [36, 'C2'], [39, 'Ds2'], [42, 'Fs2'],
  [45, 'A2'], [48, 'C3'], [51, 'Ds3'], [54, 'Fs3'],
  [57, 'A3'], [60, 'C4'], [63, 'Ds4'], [66, 'Fs4'],
  [69, 'A4'], [72, 'C5'], [75, 'Ds5'], [78, 'Fs5'],
  [81, 'A5'], [84, 'C6'], [87, 'Ds6'], [90, 'Fs6'],
  [93, 'A6'], [96, 'C7'],
];
// Stage 1 core tier (5 samples, ~355 KB): loads first so slow mobile data starts playing grand piano almost immediately;
// Stage 2 loads the remaining 17 samples quietly in the background and upgrades subsequent notes seamlessly.
const CORE_MIDIS = new Set([36, 48, 60, 72, 84]);
const CORE_SAMPLES = SAMPLES.filter(([m]) => CORE_MIDIS.has(m));
const EXTRA_SAMPLES = SAMPLES.filter(([m]) => !CORE_MIDIS.has(m));
const rawSamples = new Map();             // midi -> Promise<ArrayBuffer | null>
const decodedByCtx = new WeakMap();       // BaseAudioContext -> {map: Map<midi, AudioBuffer>, pending: Set<number>, core: Promise|null, full: Promise|null}

function sampleUrl(name) {
  return new URL('vendor/piano/' + name + '.mp3', import.meta.url).href;
}

function fetchSample(midi, name) {
  if (!rawSamples.has(midi)) {
    const p = fetch(sampleUrl(name))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null)
      .then((buf) => { if (!buf) rawSamples.delete(midi); return buf; });   // retry next Play if user was offline
    rawSamples.set(midi, p);
  }
  return rawSamples.get(midi);
}

function loadPiano(c, {all = false} = {}) {
  let state = decodedByCtx.get(c);
  if (!state) { state = {map: new Map(), pending: new Set(), core: null, full: null}; decodedByCtx.set(c, state); }
  const loadList = (list) => Promise.all(list.map(async ([midi, name]) => {
    if (state.map.has(midi) || state.pending.has(midi)) return;
    state.pending.add(midi);
    try {
      const raw = await fetchSample(midi, name);
      if (raw) state.map.set(midi, await c.decodeAudioData(raw.slice(0)));
    } catch (e) { /* synth fallback covers missing samples */ }
    finally { state.pending.delete(midi); }
  })).then(() => state.map);

  const coreMissing = CORE_SAMPLES.some(([m]) => !state.map.has(m));
  if (!state.core || (coreMissing && !CORE_SAMPLES.some(([m]) => state.pending.has(m)))) {
    state.core = loadList(CORE_SAMPLES);
  }
  const extraMissing = EXTRA_SAMPLES.some(([m]) => !state.map.has(m));
  if (!state.full || (extraMissing && !EXTRA_SAMPLES.some(([m]) => state.pending.has(m)))) {
    state.full = state.core.then(() => loadList(EXTRA_SAMPLES));
  }
  return all ? state.full : state.core;
}

function nearestSample(map, note) {
  if (!map || !map.size) return null;
  let bestMidi = -1, bestDist = Infinity, bestBuf = null;
  for (const [m, buf] of map) {
    const d = Math.abs(note - m);
    if (d < bestDist) { bestDist = d; bestMidi = m; bestBuf = buf; }
  }
  return bestBuf ? {midi: bestMidi, buf: bestBuf} : null;
}

// Lightweight stereo room impulse response (~0.95s exponentially decaying filtered noise) so close-mic'd piano samples
// sit in a warm, natural acoustic space without needing an audio file.
function createRoomIR(c) {
  const rate = c.sampleRate, len = Math.floor(rate * 0.95);
  const ir = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let seed = (ch + 1) * 0x51f15e, lp = 0;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = (seed / 0x7fffffff) - 1;
      const t = i / len;
      lp = lp * 0.72 + white * 0.28;                     // warm wood/room damping
      const env = Math.pow(1 - t, 3.2) * (i < rate * 0.012 ? i / (rate * 0.012) : 1);
      d[i] = lp * env * 0.55;
    }
  }
  return ir;
}

function makeBus(c) {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  const bus = c.createGain();
  bus.gain.value = 0.85;
  bus.connect(comp).connect(c.destination);
  // Subtle room send (dry stays crisp; ~15% warm acoustic tail)
  try {
    const conv = c.createConvolver();
    conv.buffer = createRoomIR(c);
    const wet = c.createGain();
    wet.gain.value = 0.15;
    bus.connect(conv).connect(wet).connect(comp);
  } catch (e) { /* fallback: dry only */ }
  return bus;
}

function audio() {
  if (!ctx) {
    // iPhone: play even with the ring/silent switch on, like a music app (Safari 17+)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
    // 'playback': a larger audio buffer. The default (low latency) makes tablets and phones crackle when many notes sound
    ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint: 'playback'});
    master = makeBus(ctx);
  }
  if (ctx.state === 'suspended') ctx.resume();
  loadPiano(ctx);
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

function playSynthNote(c, out, n, at) {
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

function playNote(c, out, n, at, bufs) {
  const map = bufs || (decodedByCtx.get(c) && decodedByCtx.get(c).map);
  const hit = nearestSample(map, n.note);
  if (!hit) return playSynthNote(c, out, n, at);

  const vel = Math.max(0.05, Math.min(1, n.vel / 127));
  const freq = 440 * Math.pow(2, (n.note - 69) / 12);
  const src = c.createBufferSource();
  src.buffer = hit.buf;
  src.playbackRate.value = Math.pow(2, (n.note - hit.midi) / 12);

  // Velocity-responsive warmth: soft notes (left hand, pads) get a mellower felt-hammer roll-off; loud notes stay open
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  const cutoff = Math.min(18000, Math.max(freq * 2.4, 900 + Math.pow(vel, 1.7) * 16500));
  filter.frequency.setValueAtTime(cutoff, at);

  const g = c.createGain();
  const level = 1.45 * Math.pow(vel, 1.35) * (n.note < 48 ? 0.88 : 1);
  const end = at + n.dur;
  const relTau = 0.075 + 0.085 * Math.max(0, Math.min(1, (76 - n.note) / 40));   // treble damps faster, bass rings warmer
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(level, at + 0.004);
  g.gain.setValueAtTime(level, Math.max(at + 0.005, end));
  g.gain.setTargetAtTime(0.0001, end, relTau);

  src.connect(filter).connect(g).connect(out);
  src.start(at);
  src.stop(end + relTau * 5.5 + 0.08);
  return src;
}

// ---- a guitar for the strums (piano.js marks those notes inst: 'guitar', with the tone chosen) ----
// FluidR3 GM's steel-string acoustic guitar (Frank Wen, CC-BY 3.0; vendor/guitar/*.mp3) sampled every minor 3rd from
// E2 to E5, loaded when a sheet first plays a guitar part (then cached offline like the piano). Until they are there, or
// if they cannot be had, the plucked string below plays instead.
const GUITAR_SAMPLES = [[40, 'E2'], [43, 'G2'], [46, 'Bb2'], [49, 'Db3'], [52, 'E3'], [55, 'G3'], [58, 'Bb3'], [61, 'Db4'],
  [64, 'E4'], [67, 'G4'], [70, 'Bb4'], [73, 'Db5'], [76, 'E5']];
const GUITAR_LEVEL = 4.8;   // the samples are quiet: this makes them as loud as the plucked string (measured, RMS)
// The tone: how far up the highs reach (a low-pass that opens with harder strums), a cut of the pick's brightness above
// 3 kHz, how soft the attack is (the pick's click), a little warmth from the body. Warm is the usual; Bright is the
// samples as they are. What the filters take away is given back a little, so a softer tone is not just quieter.
export const GUITAR_TONES = {
  bright: {lp: 3000, span: 9000, shelf: 0, attack: 0.002, body: 0},
  warm: {lp: 2200, span: 4200, shelf: -4, attack: 0.004, body: 2},
  mellow: {lp: 1600, span: 2600, shelf: -7, attack: 0.007, body: 3},
  soft: {lp: 1200, span: 1700, shelf: -10, attack: 0.012, body: 3},
};
const guitarRaw = new Map();             // midi -> Promise<ArrayBuffer | null>
const guitarDecoded = new WeakMap();     // BaseAudioContext -> {map: Map<midi, AudioBuffer>, ready: Promise | null}
function loadGuitar(c) {
  let state = guitarDecoded.get(c);
  if (!state) { state = {map: new Map(), ready: null}; guitarDecoded.set(c, state); }
  if (!state.ready || state.map.size < GUITAR_SAMPLES.length) {
    state.ready = Promise.all(GUITAR_SAMPLES.map(async ([midi, name]) => {
      if (state.map.has(midi)) return;
      if (!guitarRaw.has(midi)) {
        guitarRaw.set(midi, fetch(new URL('vendor/guitar/' + name + '.mp3', import.meta.url).href)
          .then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
          .then((b) => { if (!b) guitarRaw.delete(midi); return b; }));   // offline: try again next time
      }
      try {
        const raw = await guitarRaw.get(midi);
        if (raw) state.map.set(midi, await c.decodeAudioData(raw.slice(0)));
      } catch (e) { /* the plucked string plays it */ }
    })).then(() => state.map);
  }
  return state.ready;
}

function playSampledGuitar(c, out, n, at, hit) {
  const T = GUITAR_TONES[n.tone] || GUITAR_TONES.warm;
  const vel = Math.max(0.05, Math.min(1, n.vel / 127));
  const src = c.createBufferSource();
  src.buffer = hit.buf;
  src.playbackRate.value = Math.pow(2, (n.note - hit.midi) / 12);
  const body = c.createBiquadFilter();
  body.type = 'peaking'; body.frequency.value = 200; body.Q.value = 0.8; body.gain.value = T.body;
  const shelf = c.createBiquadFilter();
  shelf.type = 'highshelf'; shelf.frequency.value = 3000; shelf.gain.value = T.shelf;
  const tone = c.createBiquadFilter();                   // harder strums are brighter; a chuck (mute) is dull and short
  tone.type = 'lowpass'; tone.Q.value = 0.4;
  tone.frequency.value = n.mute ? 1200 : T.lp + T.span * Math.pow(vel, 1.3);
  const g = c.createGain();
  const level = 0.42 * Math.pow(vel, 1.2) * GUITAR_LEVEL * (n.mute ? 0.9 : 1) * Math.pow(10, -T.shelf / 60);
  const end = at + (n.mute ? Math.min(n.dur, 0.035) : n.dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(level, at + T.attack);
  g.gain.setValueAtTime(level, Math.max(at + T.attack + 0.001, end));
  g.gain.setTargetAtTime(0.0001, end, n.mute ? 0.025 : 0.07);   // the next strum damps it; a chuck at once
  src.connect(body).connect(shelf).connect(tone).connect(g).connect(out);
  src.start(at);
  src.stop(end + 0.45);
  return src;
}

// A plucked string made in the browser (Karplus-Strong): a short burst of noise goes round a delay line of one period,
// averaged with itself each time, so the high partials die first, as on a string. One buffer per note and audio context,
// made when first needed (a few ms); nothing to download.
const guitarByCtx = new WeakMap();
function guitarBuffer(c, note) {
  let m = guitarByCtx.get(c);
  if (!m) guitarByCtx.set(c, m = new Map());
  if (m.has(note)) return m.get(note);
  const sr = c.sampleRate, f = 440 * Math.pow(2, (note - 69) / 12), len = Math.floor(sr * 3.2);
  const buf = c.createBuffer(1, len, sr), y = buf.getChannelData(0);
  const n = Math.max(2, Math.round(sr / f - 0.5));      // the averaging adds half a sample to the loop
  const t60 = 1.6 + 3.2 * Math.max(0, Math.min(1, (76 - note) / 36));   // low strings ring longer
  const rho = Math.min(0.9995, Math.pow(0.001, 1 / (f * t60)));
  let seed = note * 7919 + 17, prev = 0, mean = 0;
  for (let i = 0; i < n; i++) {                          // the pluck: noise, a little softened (a pick, not a hammer)
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    prev = prev * 0.45 + ((seed / 0x7fffffff) * 2 - 1) * 0.55;
    y[i] = prev; mean += prev / n;
  }
  for (let i = 0; i < n; i++) y[i] -= mean;
  for (let i = n; i < len; i++) y[i] = rho * 0.5 * (y[i - n] + y[i - n - 1 < 0 ? 0 : i - n - 1]);
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(y[i]));
  if (peak > 0) for (let i = 0; i < len; i++) y[i] *= 0.9 / peak;
  m.set(note, buf);
  return buf;
}

function playGuitar(c, out, n, at) {
  const state = guitarDecoded.get(c), hit = state && nearestSample(state.map, n.note);
  if (hit) return playSampledGuitar(c, out, n, at, hit);
  const vel = Math.max(0.05, Math.min(1, n.vel / 127));
  const src = c.createBufferSource();
  src.buffer = guitarBuffer(c, n.note);
  const body = c.createBiquadFilter();                   // the wooden body: a little warmth low down
  body.type = 'peaking'; body.frequency.value = 180; body.Q.value = 0.8; body.gain.value = 4;
  const tone = c.createBiquadFilter();                   // harder strums are brighter; a chuck (mute) is dull and short
  tone.type = 'lowpass'; tone.Q.value = 0.4;
  tone.frequency.value = n.mute ? 1500 : 2200 + 5200 * Math.pow(vel, 1.3);
  const g = c.createGain();
  const level = 0.42 * Math.pow(vel, 1.2) * (n.mute ? 0.9 : 1), end = at + (n.mute ? Math.min(n.dur, 0.035) : n.dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(level, at + 0.002);
  g.gain.setValueAtTime(level, Math.max(at + 0.003, end));
  g.gain.setTargetAtTime(0.0001, end, n.mute ? 0.025 : 0.07);   // the next strum damps it; a chuck at once
  src.connect(body).connect(tone).connect(g).connect(out);
  src.start(at);
  src.stop(Math.min(at + 3.2, end + 0.45));
  return src;
}
const playAny = (c, out, n, at, bufs) => n.inst === 'guitar' ? playGuitar(c, out, n, at) : playNote(c, out, n, at, bufs);

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
  const lapLen = o.loop ? full + (score.loopGap || 0) : full;   // round again, an upbeat's missing beats are a rest first
  const mute = o.mute || {};
  const evs = score.events.filter((e) => !mute[e.hand]);
  let first = 0;
  while (first < evs.length && evs[first].q < from - 1e-6) first++;
  const t0Ref = {t0: 0, started: false};
  const oscs = new Set();
  let i = first, laps = 0, stopped = false, timer = null, raf = 0, shown = '';
  const position = () => {
    if (!t0Ref.started) return from;
    const q = (c.currentTime - t0Ref.t0) / spq;
    return q < 0 ? from : o.loop ? (from + q) % lapLen : Math.min(score.length, from + q);
  };
  const finish = () => control.stop();
  const tick = () => {
    if (stopped) return;
    const horizon = c.currentTime + 2.5;
    for (;;) {
      if (i >= evs.length) {
        if (!o.loop || !evs.length) break;
        if (t0Ref.t0 + ((laps + 1) * lapLen - from) * spq > horizon) break;
        laps++; i = 0; continue;
      }
      const e = evs[i], when = t0Ref.t0 + (laps * lapLen + e.q - from) * spq + (e.off || 0);
      if (when > horizon) break;
      i++;
      if (when < c.currentTime - 0.3) continue;         // the page was suspended: skip what is long past
      const osc = playAny(c, out, {note: e.note, vel: e.vel, inst: e.inst, mute: e.mute, tone: e.tone, dur: Math.max(0.08, e.d * spq * 0.97)}, Math.max(when, c.currentTime));
      oscs.add(osc);
      osc.onended = () => oscs.delete(osc);
    }
    if (!o.loop && c.currentTime > t0Ref.t0 + (full - from) * spq + 0.4) { finish(); return; }
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
  const begin = () => {
    if (stopped) return;
    t0Ref.t0 = c.currentTime + 0.1;
    t0Ref.started = true;
    tick();
    frame();
  };
  // the samples it needs first (the piano's core, the guitar's when it strums), or at most 1.5 s of waiting for them
  const state = decodedByCtx.get(c), strums = evs.some((e) => e.inst === 'guitar');
  const gState = guitarDecoded.get(c), gReady = !strums || (gState && gState.map.size === GUITAR_SAMPLES.length);
  if (state && CORE_SAMPLES.every(([m]) => state.map.has(m)) && gReady) { loadPiano(c); begin(); }
  else Promise.race([Promise.all([loadPiano(c), strums ? loadGuitar(c) : null]), new Promise((r) => setTimeout(r, 1500))]).then(begin);
  return control;
}

// for the tests: a score rendered without a speaker (peak level, how loud on the whole, how many seconds long)
export async function renderScoreForTest(score, bpm, seconds = 10) {
  const c = new OfflineAudioContext(2, 44100 * seconds, 44100);
  const g = makeBus(c);
  const bufs = await loadPiano(c, {all: true});
  const spq = 60 / bpm;
  const guitar = score.events.some((e) => e.inst === 'guitar') ? await loadGuitar(c) : new Map();
  for (const e of score.events) if (e.q * spq < seconds) playAny(c, g, {note: e.note, vel: e.vel, inst: e.inst, mute: e.mute, tone: e.tone, dur: Math.max(0.08, e.d * spq * 0.97)}, Math.max(0.01, e.q * spq + 0.05 + (e.off || 0)), bufs);
  const data = (await c.startRendering()).getChannelData(0);
  let peak = 0, sum = 0;
  for (const v of data) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  return {peak, rms: Math.sqrt(sum / data.length), notes: score.events.length, sampled: bufs.size, guitar: guitar.size};
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
    const tps = bpm / 60 * DIV;
    for (const e of events) {
      const shift = Math.round((e.off || 0) * tps);
      const on = Math.max(0, Math.round(e.q * DIV) + shift), off = Math.max(on + 1, Math.round((e.q + e.d * 0.97) * DIV));
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
  const [song] = await Promise.all([loadSong(url), Promise.race([loadPiano(audio()), new Promise((r) => setTimeout(r, 1500))])]);
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
  const c = new OfflineAudioContext(2, 44100 * seconds, 44100);
  const g = makeBus(c);
  const bufs = await loadPiano(c, {all: true});
  for (const n of song.notes) if (n.t < seconds) playNote(c, g, n, n.t + 0.05, bufs);
  const buf = await c.startRendering();
  const data = buf.getChannelData(0);
  let peak = 0, sum = 0;
  for (const v of data) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  return {notes: song.notes.length, length: song.length, peak, rms: Math.sqrt(sum / data.length), sampled: bufs.size, samples: withSamples ? Array.from(data) : undefined};
}

export {parseMidi};
