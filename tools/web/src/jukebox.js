// The jukebox: a card on the hymn page, under the details, that plays the hymn's sheet music in a style picked from a
// list, with Play, Loop and the tempo. The web app's card is jukeboxNode in app.js; the Android app's card is native
// (content/JukeboxCard.java) and plays through its hidden sheet player (android/play.js). Both make the notes here, from
// the sheet as the viewer plays it (this device's chord edits, the tempo the sheet names), with piano.js and player.js.
// It needs music.js (window.LeadSheet) loaded before it plays.

import {soundDoc, bpmOf, handsOf, capoOf} from './sheet.js';
import {scoreOf, strumChoice, PRESETS, presetChoice} from './piano.js';
import * as Player from './player.js';

// random: true marks the styles that may be picked at random (a hymn with no part of its own opens on one; a category
// tab picks one of its random styles). Plain, Chorale, Pop, Steady and Melody alone are never picked by chance, only by hand.
// The categories and styles, in their order. JukeboxCard.java lists the same groups and ids (keep them alike).
// 'own' is the part the sheet names for itself (sheet.js handsOf: Chorale for most of the hymns with four parts), what
// the hymn page's Play plays; it is offered only for such a sheet. A hymn always opens on it (on Flowing when its sheet
// names none): a style picked is for that page only, not kept for the next hymn.
export const GROUPS = [
  {id: 'own', name: 'Hymn\'s own'},
  {id: 'piano', name: 'Piano'},
  {id: 'guitar', name: 'Guitar'},
  {id: 'melody', name: 'Melody'},
];

export const STYLES = [
  {id: 'own', group: 'own', name: 'The hymn\'s own style'},
  {id: 'plain', group: 'piano', name: 'Plain', preset: 'plain'},
  {id: 'chorale', group: 'piano', name: 'Chorale', preset: 'chorale', walk: true},
  {id: 'flowing', group: 'piano', name: 'Flowing', preset: 'flowing', shuffle: true, random: true},
  {id: 'lively', group: 'piano', name: 'Lively', preset: 'lively', shuffle: true, random: true},
  {id: 'walking', group: 'piano', name: 'Walking', preset: 'walking', random: true},
  {id: 'guitar-pick', group: 'guitar', name: 'Fingerpicking', strum: 'pick', shuffle: true, random: true},
  {id: 'guitar-folk', group: 'guitar', name: 'Folk strum', strum: 'folk', shuffle: true, random: true},
  {id: 'guitar-pop', group: 'guitar', name: 'Pop', strum: 'pop'},
  {id: 'guitar-steady', group: 'guitar', name: 'Steady', strum: 'steady'},
  {id: 'guitar-ballad', group: 'guitar', name: 'Ballad', strum: 'ballad', shuffle: true, random: true},
  {id: 'guitar-country', group: 'guitar', name: 'Country', strum: 'country', random: true},
  {id: 'melody', group: 'melody', name: 'Melody alone'},
];
export const DEFAULT_STYLE = 'own', FALLBACK_STYLE = 'flowing';   // a sheet without its own part: Flowing (piano.js DEFAULT)
export const MIN_SPEED = 0.5, MAX_SPEED = 1.5;   // of the sheet's tempo, by twentieths (as the viewer's Play)
const DEFAULT_BPM = 110;   // as sheetplayer.js and play.js

// the style an id means for a sheet: none or an unknown id is the default; 'own' for a sheet without its own part is
// Flowing; legacy picking ids map to the unified phrase-shuffled Fingerpicking
export function styleFor(id, hasOwn) {
  const norm = /^guitar-(travis|pick-flow|arp|harp|arp-flow)$/.test(id || '') ? 'guitar-pick' : id;
  const s = STYLES.find((x) => x.id === norm) || STYLES.find((x) => x.id === DEFAULT_STYLE);
  return s.id === 'own' && !hasOwn ? STYLES.find((x) => x.id === FALLBACK_STYLE) : s;
}

// what the card needs to know of a sheet before it plays: whether there is a melody to play (a sheet of chords only
// has none), whether it names its own piano part, and its tempo in quarter notes a minute
export function sheetInfo(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const ids = Array.from(doc.getElementsByTagName('identifier'));
  return {
    playable: !ids.some((e) => e.getAttribute('type') === 'kind' && e.textContent.trim() === 'chords'),
    own: !!handsOf(doc),
    bpm: tempoOf(doc),
  };
}

function tempoOf(doc) {
  let bpm = bpmOf(doc) || DEFAULT_BPM;
  while (bpm > 250) bpm /= 2;
  while (bpm < 40) bpm *= 2;
  return Math.round(bpm);
}

// The notes of a sheet in a style: {score, bpm, mute} (mute: the parts not heard, for player.js), or null when there is
// nothing to play. edits: this device's chord edits of the sheet ({bar: ...}) or null. seed: phrase-shuffle take (0 = hymn's own).
// walk: More walking (Chorale).
export function jukeboxScore(xml, edits, styleId, loop, seed = 0, walk = false) {
  const doc = soundDoc(xml, edits || null);
  const own = handsOf(doc);
  const style = styleFor(styleId, !!own);
  let choice = null, mute = {};
  if (style.id === 'own') choice = own;
  else if (style.preset) choice = presetChoice(PRESETS.find((p) => p.id === style.preset));
  else if (style.strum) choice = strumChoice({kind: style.strum, tone: 'warm', seed: seed | 0}, capoOf(doc));   // in the guitar sheet's shapes, above its capo
  else mute = {c: true, f: true, l: true};   // the melody alone: without the chords the viewer plays softly under it
  if (seed && choice && choice.lh) choice.lh.seed = seed | 0;
  if (walk && choice && choice.lh) choice.lh.walk = true;
  const score = scoreOf(doc, choice, {hands: !!choice, loop: !!loop});
  if (!score || !score.events.some((e) => !mute[e.hand])) return null;
  return {score, bpm: tempoOf(doc), mute};
}

// The jukebox's player. load() -> {xml, edits}: the sheet (once); onBar(bar, bars): the bar that sounds now (only
// when it changes); onStop(): it stopped by itself (the end, or another Play took the sound), not by stop().
// play({style, loop, speed, seed}) starts it from the start, or, while it plays, goes on from where it is with the new choice.
export function jukeboxPlayer({load, onBar, onStop}) {
  let sheet = null, ctl = null, token = 0, shownBar = 0;
  const barOf = (score, q) => {
    let bar = 1;
    for (const b of score.barAt) { if (b.q > q + 1e-6) break; bar = b.bar; }
    return bar;
  };
  async function play(o) {
    const from = ctl ? ctl.position() : 0;
    const mine = ++token;
    Player.unlock();                                 // inside the tap: iOS lets the sound start only there
    if (!sheet) sheet = await load();
    if (mine !== token) return false;                // stopped, or played again, while loading
    const made = jukeboxScore(sheet.xml, sheet.edits, o.style, o.loop, o.seed | 0, !!o.walk);
    if (!made) throw new Error('nothing to play');
    const {score, bpm, mute} = made;
    shownBar = 0;
    const speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, +o.speed || 1));
    // the old notes stop here: their onEnd sees another token, so it is not a stop
    ctl = Player.playScore(score, {from: o.loop ? from : Math.min(from, score.length - 0.25), bpm, speed, loop: !!o.loop, mute, barsOnly: !!o.barsOnly, frameGap: o.barsOnly ? 120 : 0,
      onFrame: (q) => {
        if (mine !== token) return;
        const bar = barOf(score, q);
        if (bar !== shownBar) { shownBar = bar; if (onBar) onBar(bar, score.bars); }
      },
      onEnd: () => { if (mine !== token) return; ctl = null; shownBar = 0; if (onStop) onStop(); }});
    return true;
  }
  return {
    play,
    stop() { token++; shownBar = 0; if (ctl) { const c = ctl; ctl = null; c.stop(); } },
    get playing() { return !!ctl; },
  };
}
