// The Android app's hidden sheet player (SheetPlayer.java loads play.html and calls these):
//   sheetPlay('E142')   plays the sheet (assets/sheetMei/E142.mei) from the start, again and again, until sheetStop()
//   sheetStop()
// It plays the sheet as the viewer's Play does (piano.js scoreOf, player.js playScore): the viewer's own Both hands
// choice (the two share this page's origin, so its saved settings), this device's chord edits (HymnsPlay.edits), the
// tempo the sheet names (midi.bpm). The hymn page's Play button loops, as it does for a MIDI file.
import {soundDoc, bpmOf} from './sheet.js';
import {scoreOf, DEFAULT as PIANO_DEFAULT} from './piano.js';
import * as Player from './player.js';
import {store} from './ui.js';

const DEFAULT_BPM = 90;
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
    const hands = !!store.get('sheet', {}).hands;
    const choice = store.get('pianoOf', {})[id] || store.get('piano', PIANO_DEFAULT);
    const score = scoreOf(doc, choice, {hands});
    if (!score || !score.events.length) throw new Error('nothing to play in ' + id);
    if (mine !== token) return;                         // stopped (or another sheet) while loading
    let bpm = bpmOf(doc) || DEFAULT_BPM;
    while (bpm > 160) bpm /= 2;
    while (bpm < 50) bpm *= 2;
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
