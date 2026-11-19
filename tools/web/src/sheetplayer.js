// Plays the sheet as it is shown (its key, this device's chord edits, and the piano part when Both hands is on, else the
// melody with the chords softly under it), lights up the notes and the bar as they sound and follows them down the page
// (until the reader scrolls: then it waits for the next Play). Tap a note to play from there. The notes come from
// piano.js (scoreOf), the sound from player.js (playScore). The controls are a row under the sheet's toolbar.

import * as Player from './player.js';
import {scoreOf} from './piano.js';
import {tr} from './i18n.js';
import {host} from './host.js';

const MIN_SPEED = 0.5, MAX_SPEED = 1.5;   // of the tune's tempo, by twentieths
const DEFAULT_BPM = 90;
// what is heard: everything, the melody alone, or the accompaniment alone (the left hand, or the chords)
const PARTS = [['all', 'All', true, true], ['mel', 'Melody', true, false], ['acc', 'Accompaniment', false, true]];

function el(tag, cls, text, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
const param = (id) => id.replace(/_\d+$/, '');   // an element the left hand's notation split into tied pieces: lh3n1_1 -> lh3n1

// view: the SheetView; tune: the url of the hymn's tune file (its tempo is the sheet's tempo); store: {get, set} for what is
// kept between hymns; stopTune(): stops the tune's own Play button; onchange(): the toolbar's button follows
export function createSheetPlayer(view, {tune, store, stopTune, onchange}) {
  const prefs = Object.assign({speed: 1, loop: false, mel: true, acc: true}, store.get('sheetPlayer', {}));
  if (!prefs.mel && !prefs.acc) prefs.mel = prefs.acc = true;
  prefs.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, +prefs.speed || 1));
  const keep = () => store.set('sheetPlayer', prefs);
  const root = el('div', 'sheet-player', null, {role: 'group', 'aria-label': tr('Play the sheet')});
  root.hidden = true;

  const bPlay = el('button', 'tb primary', null, {type: 'button'});
  const bStart = el('button', 'tb icon', null, {type: 'button', title: tr('From the start'), 'aria-label': tr('From the start')});
  bStart.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M6 5h2.4v14H6zM19 5.5v13L9.8 12z"/></svg>';
  // the tempo: a slider from half to one and a half times the tune's, showing the beats a minute; a double tap is the tune's
  const speed = el('input', 'sp-speed', null, {type: 'range', min: String(MIN_SPEED), max: String(MAX_SPEED), step: '0.05',
    title: tr('Tempo (double tap: the tune\'s)'), 'aria-label': tr('Tempo')});
  const tempoLabel = el('span', 'sp-tempo');
  const tempoBox = el('label', 'sp-tempo-box');
  tempoBox.append(tempoLabel, speed);
  const bLoop = el('button', 'tb toggle', tr('Loop'), {type: 'button', title: tr('Play again and again'), 'aria-pressed': String(prefs.loop)});
  bLoop.addEventListener('click', () => { prefs.loop = !prefs.loop; keep(); bLoop.setAttribute('aria-pressed', String(prefs.loop)); restart(); });
  const parts = el('div', 'seg sp-parts', null, {role: 'group', 'aria-label': tr('What is heard')});
  const partBtns = PARTS.map(([id, label, mel, acc]) => {
    const b = el('button', 'tb', tr(label), {type: 'button', 'data-part': id,
      title: id === 'all' ? tr('The melody and the accompaniment') : id === 'mel' ? tr('The melody alone') : tr('The accompaniment alone (the left hand, or the chords)')});
    b.addEventListener('click', () => { prefs.mel = mel; prefs.acc = acc; keep(); showParts(); restart(); });
    parts.appendChild(b);
    return b;
  });
  const showParts = () => partBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(PARTS[i][2] === prefs.mel && PARTS[i][3] === prefs.acc)));
  showParts();
  const where = el('span', 'sp-where', null, {'aria-live': 'off'});
  const bClose = el('button', 'tb icon close', '✕', {type: 'button', title: tr('Close the player'), 'aria-label': tr('Close the player')});
  // two groups, centered: what plays (Play, from the start, the tempo) and what is heard (All | Melody | Accompaniment, Loop);
  // on a narrow screen the second sits under the first, each whole
  const playGroup = el('div', 'sp-group'), hearGroup = el('div', 'sp-group');
  playGroup.append(bPlay, bStart, tempoBox);
  hearGroup.append(parts, bLoop);
  root.append(playGroup, hearGroup, where, bClose);
  speed.value = String(prefs.speed);

  let score = null, scoreXml = '', scoreChoice = '', ctl = null, from = 0, bpm = DEFAULT_BPM, lastRender = -1, tempoFor = null, lastScroll = 0, starting = 0;
  let shownWhere = '', shownBar = 0, barRender = -1;
  const showTempo = () => { tempoLabel.textContent = '♩ = ' + Math.round(bpm * prefs.speed); };
  showTempo();

  // the page follows the music until the reader scrolls it; the next Play follows again
  let follow = true;
  const byHand = () => { if (ctl) follow = false; };
  window.addEventListener('wheel', byHand, {passive: true});
  window.addEventListener('touchmove', byHand, {passive: true});

  // the bar that sounds, shaded behind the music (an element of the sheet's box, under the drawing)
  const shade = el('div', 'sp-bar', null, {'aria-hidden': 'true'});
  shade.hidden = true;
  view.root.prepend(shade);
  function shadeBar(bar) {
    if (bar === shownBar && view.renders === barRender) return;
    shownBar = bar; barRender = view.renders;
    const g = bar && view.music.querySelectorAll('g.measure')[bar - 1];
    if (!g) { shade.hidden = true; return; }
    // the staves, the chords and the words of the bar (not the whole measure: some carry marks drawn far above it)
    const parts = Array.from(g.querySelectorAll('g.staff, g.harm, g.verse')).map((e) => e.getBoundingClientRect()).filter((x) => x.height > 0);
    const m = g.getBoundingClientRect(), box = view.root.getBoundingClientRect();
    const top = parts.length ? Math.min(...parts.map((x) => x.top)) : m.top, bottom = parts.length ? Math.max(...parts.map((x) => x.bottom)) : m.bottom;
    Object.assign(shade.style, {left: (m.left - box.left) + 'px', top: (top - box.top - 4) + 'px', width: m.width + 'px', height: (bottom - top + 8) + 'px'});
    shade.hidden = false;
  }

  // the notes of the sheet as it is now; made again only when what it sounds like changed
  const handsOn = () => !!(view.state.hands && view.piano && !view.state.guitar && view.state.staff);
  const choiceNow = () => JSON.stringify(handsOn() ? view.piano : null);
  const stale = () => !score || scoreXml !== view.soundXml || scoreChoice !== choiceNow();
  function currentScore() {
    if (!stale()) return score;
    const doc = new DOMParser().parseFromString(view.soundXml, 'application/xml');
    score = scoreOf(doc, view.piano, {hands: handsOn()});
    scoreXml = view.soundXml; scoreChoice = choiceNow();
    return score;
  }

  async function tempo() {
    if (view.baseBpm) { tempoFor = null; return (bpm = view.baseBpm); }   // a sheet of ours names its own tempo (midi.bpm)
    if (tempoFor !== tune) {
      tempoFor = tune; bpm = (await Player.tuneTempo(tune)) || DEFAULT_BPM;
      // some files count the beat as an eighth (250) or a thirty-second (990): a hymn moves at 50 to 160
      while (bpm > 160) bpm /= 2;
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
  let lit = [];
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
      const text = tr('Bar {0}', bar);
      if (text !== shownWhere) { shownWhere = text; where.textContent = text; }
      shadeBar(bar);
    }
  };

  function show(playing) {
    bPlay.textContent = playing ? '■ ' + tr('Stop') : '▶ ' + tr('Play');
    bPlay.setAttribute('aria-pressed', String(playing));
    where.hidden = !playing;
    if (!playing) { shade.hidden = true; shownBar = 0; }
    document.body.classList.toggle('sheet-playing', playing);
    if (onchange) onchange();
  }

  async function start(at = from) {
    const sc = currentScore();
    if (!sc || !sc.events.length) return;
    const mine = ++starting;
    stopTune();
    from = at;
    follow = true;
    const b = await tempo();
    showTempo();
    if (mine !== starting) return;                      // another start came meanwhile
    try {
      ctl = Player.playScore(sc, {from, bpm: b, speed: prefs.speed, loop: prefs.loop, mute: {m: !prefs.mel, f: !prefs.mel, l: !prefs.acc, c: !prefs.acc},
        onFrame, onEnd: () => { ctl = null; lit = []; show(false); mark(null); }});
      show(true);
    } catch (e) {
      show(false);
      throw e;
    }
  }
  function stop() { starting++; if (ctl) { const c = ctl; ctl = null; c.stop(); } }
  function restart() { if (ctl) { const q = ctl.position(); stop(); start(q); } }

  bPlay.addEventListener('click', () => { if (ctl) stop(); else { if (from >= (score ? score.length - 0.25 : 0)) from = 0; start().catch(() => {}); } });
  bStart.addEventListener('click', () => { from = 0; if (ctl) { stop(); start(0); } else onFrame(0, null); });
  speed.addEventListener('input', () => { prefs.speed = parseFloat(speed.value) || 1; showTempo(); });
  speed.addEventListener('change', () => { keep(); restart(); });
  speed.addEventListener('dblclick', () => { speed.value = '1'; prefs.speed = 1; showTempo(); keep(); restart(); });
  bClose.addEventListener('click', () => api.close());
  async function saveMidi() {
    const sc = currentScore();
    if (!sc) return;
    await tempo();
    const name = (view.shownId || 'sheet') + (view.state.hands ? '-piano' : '') + '.mid';
    host.saveFile(name, 'audio/midi', Player.toMidi(sc, bpm * prefs.speed, view.title.textContent));
  }

  // tap a note, or a bar, to play from there (not while editing chords: a tap picks a bar then)
  view.music.addEventListener('click', (e) => {
    if (root.hidden || view.editing || !score) return;
    let q = null;
    for (let n = e.target; n && n !== view.music && q == null; n = n.parentNode) {
      const id = n.id && param(n.id);
      if (id && id in score.idQ) q = score.idQ[id];
    }
    if (q == null) {                                    // no note: the bar it is in, also its empty space
      const bars = Array.from(view.music.querySelectorAll('g.measure'));
      const bar = bars.find((g) => { const r = g.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
      const at = bar && score.barAt.find((b) => b.bar === bars.indexOf(bar) + 1);
      if (at) q = at.q;
    }
    if (q == null) return;
    from = q;
    if (ctl) { stop(); start(from); } else start(from).catch(() => {});
  });

  const api = {
    el: root,
    get open() { return !root.hidden; },
    get playing() { return !!ctl; },
    // show the row and play from the start (or from where a tap left it)
    toggle() {
      if (root.hidden) { root.hidden = false; show(false); bPlay.click(); } else if (ctl) stop(); else bPlay.click();
    },
    close() { stop(); root.hidden = true; from = 0; show(false); },
    // the sheet's sound changed (another key, chords, style): go on from the same place with the new notes
    refresh() { if (!score || !stale()) return; if (ctl) restart(); else score = null; },
    available(on) { if (!on && !root.hidden) api.close(); },
    saveMidi,
    destroy() {
      stop(); root.remove(); shade.remove(); document.body.classList.remove('sheet-playing');
      window.removeEventListener('wheel', byHand); window.removeEventListener('touchmove', byHand);
    },
  };
  return api;
}
