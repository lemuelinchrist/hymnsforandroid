// The editor's sound: a small piano-like voice (or a plain organ tone, which shows lengths better) and a player that
// schedules a list of events a little ahead of the clock, so it can loop, stop at once and follow the tempo.
(function () {
  'use strict';
  var ac = null, out = null, wave = null, live = [];
  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      var comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      out = ac.createGain(); out.gain.value = 0.9; out.connect(comp); comp.connect(ac.destination);
      // a few harmonics of a struck string
      var re = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), im = new Float32Array([0, 1, 0.52, 0.28, 0.14, 0.09, 0.05, 0.03, 0.015]);
      wave = ac.createPeriodicWave(re, im);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  // one note: pitch (MIDI), start (context time), length (seconds), loudness 0..1, voice 'piano' | 'organ' | 'soft'
  function note(p, t, dur, vel, voice) {
    ctx();
    var o = ac.createOscillator(), g = ac.createGain(), v = vel == null ? 0.25 : vel, end;
    o.frequency.value = 440 * Math.pow(2, (p - 69) / 12);
    if (voice === 'organ' || voice === 'soft') {
      o.type = voice === 'soft' ? 'sine' : 'triangle';
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.015);
      g.gain.setValueAtTime(v, t + Math.max(0.02, dur - 0.04)); g.gain.linearRampToValueAtTime(0, t + dur);
      end = t + dur + 0.02;
    } else {
      o.setPeriodicWave(wave);
      var ring = Math.max(0.5, 2.6 - (p - 36) * 0.03);   // low strings ring longer
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 1.5, t + 0.006);
      g.gain.setTargetAtTime(v * 0.5, t + 0.006, 0.09); g.gain.setTargetAtTime(0.0001, t + 0.25, ring);
      g.gain.cancelScheduledValues(t + Math.max(0.03, dur)); g.gain.setTargetAtTime(0, t + Math.max(0.03, dur), 0.06);   // the key is let go
      end = t + Math.max(0.03, dur) + 0.4;
    }
    o.connect(g); g.connect(out); o.start(t); o.stop(end);
    var h = {o: o, g: g}; live.push(h);
    o.onended = function () { var i = live.indexOf(h); if (i >= 0) live.splice(i, 1); try { g.disconnect(); } catch (e) {} };
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
    var base = ac.currentTime + 0.08, lap = 0, k = 0;
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
    r.timer = setInterval(tick, 25); tick();
    return r;
  }
  window.LeadSound = {ctx: ctx, note: note, click: click, hush: hush, play: play, stop: stop, playing: function () { return !!run; },
    now: function () { return ctx().currentTime; }};
})();
