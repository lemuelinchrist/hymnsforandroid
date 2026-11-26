// The Android app's hidden sheet player (SheetPlayer.java loads play.html and calls these):
//   sheetPlay('E142')   plays the sheet (assets/sheetMei/E142.mei) from the start, again and again, until sheetStop()
//   sheetStop()
// It plays the sheet as the viewer's Play does (piano.js scoreOf, player.js playScore): the viewer's own Both hands
// choice when it is on (the two share this page's origin, so its saved settings; a sheet that names its piano part plays it), else a guitar's folk strum (the viewer's Strumming choice), this device's chord edits (HymnsPlay.edits), the
// tempo the sheet names (midi.bpm). The hymn page's Play button loops, as it does for a MIDI file.
//   sheetPlay('E142', {style: 'flowing', loop: false, speed: 1, n: 7})
//                       the jukebox card (JukeboxCard.java): plays it in that style (jukebox.js); called again while it
//                       plays, it goes on from the same place with the new choice. It tells the app the bar that sounds,
//                       HymnsPlay.bar(n, bar, bars), and that it stopped by itself (the end), HymnsPlay.ended(n); n is the
//                       app's number for this play, so it can tell an old play's word from the current one's.
import {soundDoc, bpmOf, handsOf, capoOf} from './sheet.js';
import {scoreOf, strumChoice, DEFAULT as PIANO_DEFAULT, STRUM_DEFAULT, SAVED} from './piano.js';
import * as Player from './player.js';
import {store} from './ui.js';
import {jukeboxPlayer} from './jukebox.js';

const DEFAULT_BPM = 110;   // as sheetplayer.js
const bridge = window.HymnsPlay;
let token = 0;

// the jukebox's player, for one sheet at a time, and the app's number of the play it is making now
let juke = null, jukeId = null, jukeN = 0;
async function loadSheet(id) {
  const r = await fetch('../sheetMei/' + encodeURIComponent(id) + '.mei');
  if (!r.ok) throw new Error('no sheet ' + id);
  let edits = {};
  try { edits = JSON.parse((bridge && bridge.edits(id)) || '{}'); } catch (e) { /* no edits */ }
  return {xml: await r.text(), edits};
}
function jukebox(id, o) {
  token++;                                            // a plain Play still loading is dropped
  // a new Play reads the sheet again (its chord edits may have changed in the viewer); a change while it plays does not
  if (juke && (jukeId !== id || !juke.playing)) { juke.stop(); juke = null; }
  if (!juke) {
    jukeId = id;
    juke = jukeboxPlayer({load: () => loadSheet(id),
      onBar: (bar, bars) => { if (bridge && bridge.bar) bridge.bar(jukeN, bar, bars); },
      onStop: () => { if (bridge && bridge.ended) bridge.ended(jukeN); }});
  }
  jukeN = o.n | 0;
  juke.play(o).catch((e) => {
    console.error(e);
    if (bridge && bridge.failed) bridge.failed(String(e && e.message || e));
    if (bridge && bridge.ended) bridge.ended(o.n | 0);
  });
}

window.sheetPlay = async (id, o) => {
  if (o) { jukebox(id, o); return; }
  if (juke) juke.stop();
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
  if (juke) juke.stop();
  Player.stop();
  setTimeout(() => { if (mine === token) Player.rest(); }, 600);   // once the notes have faded; a new sheetPlay resumes it
};
