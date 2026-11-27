// Plays the sheet as it is shown (its key, this device's chord edits, and the piano part when Both hands is on, else the
// melody with the chords softly under it), lights up the notes and the bar as they sound and follows them down the page
// (until the reader scrolls: then it waits for the next Play). Tap a note to play from there. The notes come from
// piano.js (scoreOf), the sound from player.js (playScore). Controls live in the unified bottom dock (pianopanel.js).

import * as Player from './player.js';
import {scoreOf, strumChoice} from './piano.js';
import {host} from './host.js';

export const MIN_SPEED = 0.5, MAX_SPEED = 1.5;   // of the tune's tempo, by twentieths
const DEFAULT_BPM = 110;   // hymnal.net's own tunes run 90 to 130 (median 120); the same as the MIDI files we made ourselves
const PARTS = [['all', true, true], ['mel', true, false], ['acc', false, true]];

function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
const param = (id) => id.replace(/_\d+$/, '');   // an element the left hand's notation split into tied pieces: lh3n1_1 -> lh3n1

// view: the SheetView; tune: the url of the hymn's tune file (its tempo is the sheet's tempo); store: {get, set} for what is
// kept between hymns; stopTune(): stops the tune's own Play button; onchange({started}): playback state or settings changed;
// onprogress(bar, bars): the sounding bar moved.
export function createSheetPlayer(view, {tune, store, stopTune, onchange, onprogress}) {
  const prefs = Object.assign({speed: 1, loop: false, mel: true, acc: true}, store.get('sheetPlayer', {}), {speed: 1});   // the tempo is not kept: every hymn starts at its own
  if (!prefs.mel && !prefs.acc) prefs.mel = prefs.acc = true;
  const keep = () => store.set('sheetPlayer', {loop: prefs.loop, mel: prefs.mel, acc: prefs.acc});

  let score = null, scoreXml = '', scoreChoice = '', ctl = null, from = 0, bpm = DEFAULT_BPM, lastRender = -1, tempoFor = null, lastScroll = 0, starting = 0;
  let open = false, canPlay = true, shownBar = 0, totalBars = 0, barRender = -1, shownStartBar = 0, startRender = -1;

  // the page follows the music until the reader scrolls it; the next Play follows again
  let follow = true;
  const byHand = () => { if (ctl) follow = false; };
  window.addEventListener('wheel', byHand, {passive: true});
  window.addEventListener('touchmove', byHand, {passive: true});

  // the selected start measure (red, stays visible while stopped) and the bar that sounds, shaded behind the music
  const startShade = el('div', 'sp-start-bar', {'aria-hidden': 'true'});
  const shade = el('div', 'sp-bar', {'aria-hidden': 'true'});
  startShade.hidden = true;
  shade.hidden = true;
  view.root.prepend(startShade, shade);

  function placeBar(boxEl, bar) {
    const g = bar && view.music.querySelectorAll('g.measure')[bar - 1];
    if (!g) { boxEl.hidden = true; return; }
    const parts = Array.from(g.querySelectorAll('g.staff, g.harm, g.verse')).map((e) => e.getBoundingClientRect()).filter((x) => x.height > 0);
    const m = g.getBoundingClientRect(), box = view.root.getBoundingClientRect();
    const top = parts.length ? Math.min(...parts.map((x) => x.top)) : m.top, bottom = parts.length ? Math.max(...parts.map((x) => x.bottom)) : m.bottom;
    Object.assign(boxEl.style, {left: (m.left - box.left) + 'px', top: (top - box.top - 4) + 'px', width: m.width + 'px', height: (bottom - top + 8) + 'px'});
    boxEl.hidden = false;
  }
  function shadeBar(bar) {
    if (bar === shownBar && view.renders === barRender) return;
    shownBar = bar; barRender = view.renders;
    placeBar(shade, bar);
  }
  function barOf(q) {
    const sc = score || currentScore();
    if (!sc) return 0;
    let bar = 1;
    for (const b of sc.barAt) { if (b.q > q + 1e-6) break; bar = b.bar; }
    return bar;
  }
  function showStartBar(force = false) {
    if (!open || from <= 0) { startShade.hidden = true; shownStartBar = 0; return; }
    const bar = barOf(from);
    if (!force && bar === shownStartBar && view.renders === startRender) return;
    shownStartBar = bar; startRender = view.renders;
    placeBar(startShade, bar);
  }
  const musicObserver = new MutationObserver(() => { if (open) showStartBar(true); });
  musicObserver.observe(view.music, {childList: true});

  const handsOn = () => !!(view.state.hands && view.piano && !view.state.guitar && view.state.staff);
  const strumOn = () => !!(view.state.guitar && view.strum);   // the guitar sheet always plays strummed
  const accompaniment = () => (handsOn() ? view.piano : strumOn() ? strumChoice(view.strum, view.info.capo) : null);
  const choiceNow = () => JSON.stringify([accompaniment(), prefs.loop]);
  const stale = () => !score || scoreXml !== view.soundXml || scoreChoice !== choiceNow();
  function currentScore() {
    if (!stale()) return score;
    const doc = new DOMParser().parseFromString(view.soundXml, 'application/xml');
    const with_ = accompaniment();
    score = scoreOf(doc, with_ || view.piano, {hands: !!with_, loop: prefs.loop});
    scoreXml = view.soundXml; scoreChoice = choiceNow();
    totalBars = score ? score.bars : 0;
    return score;
  }

  async function tempo() {
    if (view.baseBpm) { tempoFor = null; return (bpm = view.baseBpm); }
    if (tempoFor !== tune) {
      tempoFor = tune; bpm = (await Player.tuneTempo(tune)) || DEFAULT_BPM;
      while (bpm > 250) bpm /= 2;
      while (bpm < 50) bpm *= 2;
    }
    return bpm;
  }

  const mark = (ids) => {
    view.music.querySelectorAll('.playing').forEach((e) => e.classList.remove('playing'));
    if (!ids) return;
    let first = null;
    for (const id of ids) {
      const sel = '[id="' + id + '"], [id^="' + id + '_"]';
      view.music.querySelectorAll(sel).forEach((e) => { e.classList.add('playing'); if (!first) first = e; });
    }
    return first;
  };
  let lit = [], lastReportedBar = 0;
  const onFrame = (q, ids) => {
    if (ids || view.renders !== lastRender) {
      if (ids) lit = ids;
      lastRender = view.renders;
      const first = mark(lit);
      if (first && follow && ids && Date.now() - lastScroll > 600) {
        const r = first.getBoundingClientRect(), room = view.panelHeight || 0;
        if (r.top < 150 || r.bottom > window.innerHeight - room - 60) { lastScroll = Date.now(); first.scrollIntoView({block: 'center', behavior: 'smooth'}); }
      }
    }
    if (score) {
      let bar = 1;
      for (const b of score.barAt) { if (b.q > q + 1e-6) break; bar = b.bar; }
      shadeBar(bar);
      showStartBar();
      if (bar !== lastReportedBar) {
        lastReportedBar = bar;
        if (onprogress) onprogress(bar, score.bars);
      }
    }
  };

  function show(playing, started = false) {
    if (!playing) {
      shade.hidden = true; shownBar = 0; lastReportedBar = 0;
      if (onprogress) onprogress(0, totalBars);
    }
    document.body.classList.toggle('sheet-playing', playing);
    if (onchange) onchange({started: playing && started});
  }

  async function start(at = from, again = false) {
    const sc = currentScore();
    if (!sc || !sc.events.length) return;
    const mine = ++starting;
    Player.unlock();
    stopTune();
    open = true;
    showStartBar();
    follow = true;
    const b = await tempo();
    if (mine !== starting) return;
    try {
      ctl = Player.playScore(sc, {from: at, bpm: b, speed: prefs.speed, loop: prefs.loop, mute: {m: !prefs.mel, f: !prefs.mel, l: !prefs.acc, c: !prefs.acc},
        onFrame, onEnd: () => { ctl = null; lit = []; show(false); mark(null); }});
      show(true, !again);
    } catch (e) {
      show(false);
      throw e;
    }
  }
  function stop() { starting++; if (ctl) { const c = ctl; ctl = null; c.stop(); } }
  let gap = 0;
  function again(q) { gap++; stop(); start(q, true).catch(() => {}).finally(() => { gap--; }); }
  function restart() { if (ctl) again(ctl.position()); }

  // tap a note, or a bar, to play from there (not while editing chords: a tap picks a bar then)
  view.music.addEventListener('click', (e) => {
    if (!open || view.editing || !score) return;
    let q = null;
    for (let n = e.target; n && n !== view.music && q == null; n = n.parentNode) {
      const id = n.id && param(n.id);
      if (id && id in score.idQ) q = score.idQ[id];
    }
    if (q == null) {
      const bars = Array.from(view.music.querySelectorAll('g.measure'));
      const bar = bars.find((g) => { const r = g.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
      const at = bar && score.barAt.find((b) => b.bar === bars.indexOf(bar) + 1);
      if (at) q = at.q;
    }
    if (q == null) return;
    from = q;
    showStartBar();
    if (ctl) again(q);
    else start(q).catch(() => {});
  });

  async function saveMidi() {
    const sc = currentScore();
    if (!sc) return;
    await tempo();
    const name = (view.shownId || 'sheet') + (view.state.hands ? '-piano' : '') + '.mid';
    host.saveFile(name, 'audio/midi', Player.toMidi(sc, bpm * prefs.speed, view.title.textContent));
  }

  const api = {
    get playing() { return !!(ctl || gap); },
    get open() { return open; },
    get from() { return from; },
    get loop() { return !!prefs.loop; },
    get speed() { return prefs.speed; },
    get baseBpm() { return view.baseBpm || bpm; },
    get currentBpm() { return Math.round((view.baseBpm || bpm) * prefs.speed); },
    get part() { return prefs.mel && prefs.acc ? 'all' : prefs.mel ? 'mel' : 'acc'; },
    get bar() { return lastReportedBar; },
    get bars() { return totalBars; },
    setLoop(on) { prefs.loop = !!on; keep(); restart(); if (onchange) onchange({}); },
    setSpeed(v, commit = false) {
      prefs.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, parseFloat(v) || 1));
      if (commit) { keep(); restart(); }
      if (onchange) onchange({});
    },
    setPart(id) {
      const row = PARTS.find((p) => p[0] === id) || PARTS[0];
      prefs.mel = row[1]; prefs.acc = row[2];
      keep(); restart();
      if (onchange) onchange({});
    },
    fromStart() {
      from = 0; showStartBar();
      if (ctl) again(0);
      else { onFrame(0, null); if (onchange) onchange({}); }
    },
    toggle() {
      if (!canPlay) return;
      if (ctl) { stop(); return; }
      open = true;
      if (from >= (score ? score.length - 0.25 : 0)) { from = 0; showStartBar(); }
      start(from).catch(() => {});
    },
    available(ok) { canPlay = !!ok; if (!ok) api.close(); },
    refresh() {
      if (view.baseBpm) bpm = view.baseBpm;
      if (ctl && stale()) again(ctl.position());
      else if (open) { currentScore(); showStartBar(true); }
      if (onchange) onchange({});
    },
    close() {
      stop(); open = false; from = 0; startShade.hidden = true; shade.hidden = true; shownBar = 0; shownStartBar = 0; lastReportedBar = 0;
      if (onchange) onchange({});
    },
    saveMidi,
    destroy() {
      stop(); open = false; musicObserver.disconnect();
      window.removeEventListener('wheel', byHand); window.removeEventListener('touchmove', byHand);
      startShade.remove(); shade.remove();
    },
  };
  return api;
}
