// The Android app's hidden sheet player (SheetPlayer.java loads play.html and calls these):
//   sheetPlay('E142')   plays the sheet (assets/sheetMei/E142.mei) from the start, again and again, until sheetStop()
//   sheetStop()
// It plays the sheet as the viewer's Play does (piano.js scoreOf, player.js playScore): the viewer's own Both hands
// choice when it is on (the two share this page's origin, so its saved settings; a sheet that names its piano part plays it), else a guitar's folk strum (the viewer's Strumming choice), this device's chord edits (HymnsPlay.edits), the
// tempo the sheet names (midi.bpm). The hymn page's Play button loops, as it does for a MIDI file.
import {soundDoc, bpmOf, handsOf, capoOf} from './sheet.js';
import {scoreOf, strumChoice, DEFAULT as PIANO_DEFAULT, STRUM_DEFAULT, SAVED} from './piano.js';
import * as Player from './player.js';
import {store} from './ui.js';

const DEFAULT_BPM = 110;   // as sheetplayer.js
const bridge = window.HymnsPlay;
let token = 0;

window.sheetPlay = async (id) => {
  const mine = ++token;
  Player.stop();
  try {
    const r = await fetch('../sheetMei/' + encodeURIComponent(id) + '.mei');
    if (!r.ok) throw new Error('no sheet ' + id);
    const xml = await r.text();
    let edits = {};
    try { edits = JSON.parse((bridge && bridge.edits(id)) || '{}'); } catch (e) { /* no edits */ }
    const doc = soundDoc(xml, edits);
    const named = handsOf(doc);   // a sheet of ours may name its piano part: then it plays both hands
    // Accompaniment: a sheet that names its piano part plays it, and so does the piano part the viewer's Both hands is
    // on for; otherwise (the default) a guitar strums the chords, as the guitar sheet's Strumming does: this hymn's
    // own strum choice, else the device's, else the folk strum in the Warm tone (piano.js STRUM_DEFAULT), in the shapes
    // above the sheet's capo.
    const piano = !!store.get('sheet', {}).hands || !!named;
    const strum = store.get(SAVED.strumOf, {})[id] || store.get(SAVED.strum, STRUM_DEFAULT);
    const choice = piano ? (store.get(SAVED.handsOf, {})[id] || named || store.get(SAVED.hands, PIANO_DEFAULT)) : strumChoice(strum, capoOf(doc));
    const score = scoreOf(doc, choice, {hands: true});
    if (!score || !score.events.length) throw new Error('nothing to play in ' + id);
    if (mine !== token) return;                         // stopped (or another sheet) while loading
    let bpm = bpmOf(doc) || DEFAULT_BPM;
    while (bpm > 250) bpm /= 2;
    while (bpm < 40) bpm *= 2;
    Player.playScore(score, {from: 0, bpm, loop: true, mute: {}});
  } catch (e) {
    console.error(e);
    if (bridge && bridge.failed) bridge.failed(String(e && e.message || e));
  }
};

window.sheetStop = () => {
  const mine = ++token;
  Player.stop();
  setTimeout(() => { if (mine === token) Player.rest(); }, 600);   // once the notes have faded; a new sheetPlay resumes it
};
