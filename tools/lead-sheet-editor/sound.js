// The editor's sound: Salamander Grand Piano (Yamaha C5, CC-BY 3.0 by Alexander Holm) served from /piano/*.mp3 and the
// strums' steel-string guitar from /guitar/*.mp3,
// with a small synthesized fallback while loading and a plain organ tone (which shows lengths clearly), plus a player
// that schedules events a little ahead of the clock, so it can loop, stop at once and follow the tempo.
(function () {
  'use strict';
  var SAMPLES = [
    [33, 'A1'], [36, 'C2'], [39, 'Ds2'], [42, 'Fs2'],
    [45, 'A2'], [48, 'C3'], [51, 'Ds3'], [54, 'Fs3'],
    [57, 'A3'], [60, 'C4'], [63, 'Ds4'], [66, 'Fs4'],
    [69, 'A4'], [72, 'C5'], [75, 'Ds5'], [78, 'Fs5'],
    [81, 'A5'], [84, 'C6'], [87, 'Ds6'], [90, 'Fs6'],
    [93, 'A6'], [96, 'C7']
  ];
  var ac = null, out = null, wave = null, live = [], bufs = {}, loading = null, loaded = false;

  function createRoomIR(c) {
    var rate = c.sampleRate, len = Math.floor(rate * 0.95), ir = c.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch), seed = (ch + 1) * 0x51f15e, lp = 0;
      for (var i = 0; i < len; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        var white = (seed / 0x7fffffff) - 1, t = i / len;
        lp = lp * 0.72 + white * 0.28;
        var env = Math.pow(1 - t, 3.2) * (i < rate * 0.012 ? i / (rate * 0.012) : 1);
        d[i] = lp * env * 0.55;
      }
    }
    return ir;
  }

  function loadSamples() {
    if (loading || !ac) return loading;
    loading = Promise.all(SAMPLES.map(function (s) {
      return fetch('/piano/' + s[1] + '.mp3')
        .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
        .then(function (raw) { return raw ? ac.decodeAudioData(raw) : null; })
        .then(function (buf) { if (buf) bufs[s[0]] = buf; })
        .catch(function () {});
    })).then(function () { loaded = true; });
    return loading;
  }

  // The guitar of the strums: FluidR3 GM's steel-string guitar (Frank Wen, CC-BY 3.0) served from /guitar/*.mp3, one
  // sample every minor third from E2 to E5, loaded with the piano; the same settings as the web app's 'warm' tone
  // (tools/web/src/player.js). Until they are there the piano plays the strum.
  var GSAMPLES = [[40, 'E2'], [43, 'G2'], [46, 'Bb2'], [49, 'Db3'], [52, 'E3'], [55, 'G3'], [58, 'Bb3'], [61, 'Db4'],
    [64, 'E4'], [67, 'G4'], [70, 'Bb4'], [73, 'Db5'], [76, 'E5']], gbufs = {};
  function loadGuitar() {
    return Promise.all(GSAMPLES.map(function (s) {
      return fetch('/guitar/' + s[1] + '.mp3')
        .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
        .then(function (raw) { return raw ? ac.decodeAudioData(raw) : null; })
        .then(function (buf) { if (buf) gbufs[s[0]] = buf; })
        .catch(function () {});
    }));
  }
  function nearestGuitar(p) {
    var best = null, bestDist = Infinity;
    GSAMPLES.forEach(function (s) { var b = gbufs[s[0]], d = Math.abs(p - s[0]); if (b && d < bestDist) { bestDist = d; best = {midi: s[0], buf: b}; } });
    return best;
  }
  // one guitar string: pitch, start, length (s), loudness 0..1 (a harder strum is brighter), o.mute = a chuck
  function guitar(p, t, dur, vel, o) {
    var hit = nearestGuitar(p);
    if (!hit) return note(p, t, dur, vel * 0.55, 'piano');
    var mute = !!(o && o.mute), v = Math.max(0.05, Math.min(1, vel));
    var src = ac.createBufferSource(); src.buffer = hit.buf; src.playbackRate.value = Math.pow(2, (p - hit.midi) / 12);
    var body = ac.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 200; body.Q.value = 0.8; body.gain.value = 2;
    var shelf = ac.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 3000; shelf.gain.value = -4;
    var tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.Q.value = 0.4;
    tone.frequency.value = mute ? 1200 : 2200 + 4200 * Math.pow(v, 1.3);
    var g = ac.createGain(), level = 0.42 * Math.pow(v, 1.2) * 4.8 * (mute ? 0.9 : 1) * Math.pow(10, 4 / 60);
    var end = t + (mute ? Math.min(dur, 0.035) : dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(level, t + 0.004);
    g.gain.setValueAtTime(level, Math.max(t + 0.005, end)); g.gain.setTargetAtTime(0.0001, end, mute ? 0.025 : 0.07);
    src.connect(body); body.connect(shelf); shelf.connect(tone); tone.connect(g); g.connect(out);
    src.start(t); src.stop(end + 0.45);
    var h = {o: src, g: g}; live.push(h);
    src.onended = function () { var i = live.indexOf(h); if (i >= 0) live.splice(i, 1); try { g.disconnect(); } catch (e) {} };
    return h;
  }

  function nearestSample(p) {
    var best = null, bestDist = Infinity;
    for (var i = 0; i < SAMPLES.length; i++) {
      var m = SAMPLES[i][0], b = bufs[m];
      if (!b) continue;
      var d = Math.abs(p - m);
      if (d < bestDist) { bestDist = d; best = {midi: m, buf: b}; }
    }
    return best;
  }

  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      var comp = ac.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
      out = ac.createGain(); out.gain.value = 0.9; out.connect(comp); comp.connect(ac.destination);
      try {
        var conv = ac.createConvolver(); conv.buffer = createRoomIR(ac);
        var wet = ac.createGain(); wet.gain.value = 0.14;
        out.connect(conv); conv.connect(wet); wet.connect(comp);
      } catch (e) {}
      // fallback harmonics while samples load
      var re = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), im = new Float32Array([0, 1, 0.52, 0.28, 0.14, 0.09, 0.05, 0.03, 0.015]);
      wave = ac.createPeriodicWave(re, im);
      loadSamples(); loadGuitar();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  // one note: pitch (MIDI), start (context time), length (seconds), loudness 0..1, voice 'piano' | 'organ' | 'soft'
  function note(p, t, dur, vel, voice) {
    ctx();
    var v = vel == null ? 0.25 : vel, g = ac.createGain(), src, end;
    if (voice === 'organ' || voice === 'soft') {
      src = ac.createOscillator();
      src.frequency.value = 440 * Math.pow(2, (p - 69) / 12);
      src.type = voice === 'soft' ? 'sine' : 'triangle';
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.015);
      g.gain.setValueAtTime(v, t + Math.max(0.02, dur - 0.04)); g.gain.linearRampToValueAtTime(0, t + dur);
      end = t + dur + 0.02;
      src.connect(g); g.connect(out);
    } else {
      var hit = nearestSample(p);
      if (hit) {
        src = ac.createBufferSource();
        src.buffer = hit.buf;
        src.playbackRate.value = Math.pow(2, (p - hit.midi) / 12);
        var norm = Math.max(0.1, Math.min(1, v / 0.28));
        var freq = 440 * Math.pow(2, (p - 69) / 12);
        var flt = ac.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 0.5;
        flt.frequency.setValueAtTime(Math.min(18000, Math.max(freq * 2.4, 900 + Math.pow(norm, 1.7) * 16500)), t);
        var level = 1.45 * Math.pow(norm, 1.3) * (p < 48 ? 0.88 : 1);
        var relEnd = t + Math.max(0.04, dur);
        var relTau = 0.075 + 0.085 * Math.max(0, Math.min(1, (76 - p) / 40));
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(level, t + 0.004);
        g.gain.setValueAtTime(level, Math.max(t + 0.005, relEnd));
        g.gain.setTargetAtTime(0.0001, relEnd, relTau);
        end = relEnd + relTau * 5.5 + 0.08;
        src.connect(flt); flt.connect(g); g.connect(out);
      } else {
        src = ac.createOscillator();
        src.frequency.value = 440 * Math.pow(2, (p - 69) / 12);
        src.setPeriodicWave(wave);
        var ring = Math.max(0.5, 2.6 - (p - 36) * 0.03);   // low strings ring longer
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 1.5, t + 0.006);
        g.gain.setTargetAtTime(v * 0.5, t + 0.006, 0.09); g.gain.setTargetAtTime(0.0001, t + 0.25, ring);
        g.gain.cancelScheduledValues(t + Math.max(0.03, dur)); g.gain.setTargetAtTime(0, t + Math.max(0.03, dur), 0.06);
        end = t + Math.max(0.03, dur) + 0.4;
        src.connect(g); g.connect(out);
      }
    }
    src.start(t); src.stop(end);
    var h = {o: src, g: g}; live.push(h);
    src.onended = function () { var i = live.indexOf(h); if (i >= 0) live.splice(i, 1); try { g.disconnect(); } catch (e) {} };
    return h;
  }
  function click(t, strong) {
    ctx();
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square'; o.frequency.value = strong ? 1600 : 1100;
    g.gain.setValueAtTime(strong ? 0.16 : 0.09, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.05);
  }
  function hush() {
    if (!ac) return;
    var t = ac.currentTime;
    live.slice().forEach(function (h) { try { h.g.gain.cancelScheduledValues(t); h.g.gain.setTargetAtTime(0, t, 0.015); h.o.stop(t + 0.1); } catch (e) {} });
  }

  // play({events, from, to, unit, loop, onEvent, onEnd}): events are [{t, d, fire(when, seconds)}] with t and d in
  // sixteenths, sorted by t; unit is the length of a sixteenth in seconds. onEvent(event) is called when one sounds.
  var run = null;
  function stop(quiet) {
    if (!run) return;
    clearInterval(run.timer); run.marks.forEach(clearTimeout); hush();
    var end = run.onEnd; run = null; if (end && !quiet) end();
  }
  function play(o) {
    stop(true); ctx();
    var r = run = {marks: [], onEnd: o.onEnd}, events = o.events, span = Math.max(1, o.to - o.from);
    var base = 0, lap = 0, k = 0;
    while (k < events.length && events[k].t < o.from) k++;
    var first = k;
    function tick() {
      if (run !== r) return;
      var horizon = ac.currentTime + 0.18;
      for (;;) {
        if (k >= events.length || events[k].t >= o.to) {
          var lapEnd = base + (lap + 1) * span * o.unit;
          if (!o.loop) { if (ac.currentTime >= lapEnd + 0.05) stop(); return; }
          if (lapEnd > horizon) return;
          lap++; k = first; if (first >= events.length || events[first].t >= o.to) return;
        }
        var e = events[k], when = base + (lap * span + e.t - o.from) * o.unit;
        if (when > horizon) return;
        e.fire(Math.max(when, ac.currentTime), Math.min(e.d, o.to - e.t) * o.unit);
        if (o.onEvent && e.show) (function (ev) { r.marks.push(setTimeout(function () { if (run === r) o.onEvent(ev); }, Math.max(0, (when - ac.currentTime) * 1000))); })(e);
        k++;
      }
    }
    function begin() {
      if (run !== r) return;
      base = ac.currentTime + 0.08;
      r.timer = setInterval(tick, 25); tick();
    }
    if (loaded || !loading) begin();
    else Promise.race([loading, new Promise(function (res) { setTimeout(res, 1200); })]).then(begin);
    return r;
  }
  window.LeadSound = {ctx: ctx, note: note, guitar: guitar, click: click, hush: hush, play: play, stop: stop, playing: function () { return !!run; },
    now: function () { return ctx().currentTime; }};
})();
