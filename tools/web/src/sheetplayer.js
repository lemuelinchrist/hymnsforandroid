// "Play sheet": plays the sheet as it is shown (its key, this device's chord edits, and the piano part when Both hands
// is on, else the melody with the chords softly under it), lights up the notes as they sound and follows them down the
// page. Tap a note to play from there. The notes come from piano.js (scoreOf), the sound from player.js (playScore).
// The controls are a row under the sheet's toolbar.

import * as Player from './player.js';
import {scoreOf} from './piano.js';
import {tr} from './i18n.js';

const SPEEDS = [[0.5, '½×'], [0.75, '¾×'], [1, '1×'], [1.25, '1¼×']];
const DEFAULT_BPM = 90;

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
  const prefs = Object.assign({speed: 1, loop: false, mel: true, acc: true, follow: true}, store.get('sheetPlayer', {}));
  const keep = () => store.set('sheetPlayer', prefs);
  const root = el('div', 'sheet-player', null, {role: 'group', 'aria-label': tr('Play the sheet')});
  root.hidden = true;

  const bPlay = el('button', 'tb primary', null, {type: 'button'});
  const bStart = el('button', 'tb icon', null, {type: 'button', title: tr('From the start'), 'aria-label': tr('From the start')});
  bStart.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M6 5h2.4v14H6zM19 5.5v13L9.8 12z"/></svg>';
  const speed = el('select', 'sp-speed', null, {title: tr('Speed'), 'aria-label': tr('Speed')});
  SPEEDS.forEach(([v, label]) => speed.appendChild(el('option', null, label, {value: String(v)})));
  const toggle = (label, title, key) => {
    const b = el('button', 'tb toggle', label, {type: 'button', title, 'aria-pressed': String(prefs[key])});
    b.addEventListener('click', () => { prefs[key] = !prefs[key]; keep(); b.setAttribute('aria-pressed', String(prefs[key])); if (key === 'mel' || key === 'acc' || key === 'loop') restart(); });
    return b;
  };
  const bLoop = toggle(tr('Loop'), tr('Play again and again'), 'loop');
  const bMel = toggle(tr('Melody'), tr('Play the melody or leave it out'), 'mel');
  const bAcc = toggle(tr('Accompaniment'), tr('Play the accompaniment (the left hand, or the chords) or leave it out'), 'acc');
  const bFollow = toggle(tr('Follow'), tr('Scroll the sheet to follow the music'), 'follow');
  const bSave = el('button', 'tb', tr('Save MIDI'), {type: 'button', title: tr('Save what is on the sheet as a MIDI file')});
  const where = el('span', 'sp-where');
  const bClose = el('button', 'tb icon', '✕', {type: 'button', title: tr('Close the player'), 'aria-label': tr('Close the player')});
  root.append(bPlay, bStart, speed, bLoop, bMel, bAcc, bFollow, bSave, el('span', 'grow'), where, bClose);
  speed.value = String(prefs.speed);

  let score = null, scoreXml = '', scoreChoice = '', ctl = null, from = 0, bpm = DEFAULT_BPM, lastRender = -1, tempoFor = null, lastScroll = 0, starting = 0;
  let shownWhere = '';

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
      if (first && prefs.follow && ids && Date.now() - lastScroll > 600) {
        const r = first.getBoundingClientRect(), room = view.panelHeight || 0;
        if (r.top < 150 || r.bottom > window.innerHeight - room - 60) { lastScroll = Date.now(); first.scrollIntoView({block: 'center', behavior: 'smooth'}); }
      }
    }
    if (score) {
      let bar = 1;
      for (const b of score.barAt) { if (b.q > q + 1e-6) break; bar = b.bar; }
      const text = tr('Bar {0}', bar) + ' · ♩ = ' + Math.round(bpm * prefs.speed);
      if (text !== shownWhere) { shownWhere = text; where.textContent = text; }
    }
  };

  function show(playing) {
    bPlay.textContent = playing ? '■ ' + tr('Stop') : '▶ ' + tr('Play');
    bPlay.setAttribute('aria-pressed', String(playing));
    document.body.classList.toggle('sheet-playing', playing);
    if (onchange) onchange();
  }

  async function start(at = from) {
    const sc = currentScore();
    if (!sc || !sc.events.length) return;
    const mine = ++starting;
    stopTune();
    from = at;
    const b = await tempo();
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
  speed.addEventListener('change', () => { prefs.speed = parseFloat(speed.value) || 1; keep(); restart(); });
  bClose.addEventListener('click', () => api.close());
  bSave.addEventListener('click', () => {
    const sc = currentScore();
    if (!sc) return;
    const name = (view.shownId || 'sheet') + (view.state.hands ? '-piano' : '') + '.mid';
    const url = URL.createObjectURL(new Blob([Player.toMidi(sc, bpm * prefs.speed, view.title.textContent)], {type: 'audio/midi'}));
    const a = el('a', null, null, {href: url, download: name});
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

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
    destroy() { stop(); root.remove(); document.body.classList.remove('sheet-playing'); },
  };
  return api;
}
