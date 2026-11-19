// The Android app's sheet viewer: the web app's sheet and toolbar (sheetpanel.js), the sheet alone, as the web app's
// #/sheet/E8. SheetMusicActivity opens index.html with:
//   id=E8            the sheet (assets/sheetMei/E8.mei)
//   lyrics=FR8       the hymn shown, when it is a translation that may have its own words under the sheet (sheetLyrics)
//   variant=guitar   the app's sheet setting (Piano or Guitar); the viewer starts on it
//   theme=dark       light, dark or black (the app's theme); paper=light: the reader's light paper in a dark theme
//   accent, accentNight  the book's day and night colours (#rrggbb)
//   tune=m123        the hymn's tune (res/raw/m123.mid): the sheet plays at its tempo
//   lang=zh-Hant     the app's language
// and gives it window.HymnsEdits (this device's chord edits, ChordEdits.java). It calls setInsets (the camera cutout)
// and setKeyboard (the on-screen keyboard) on the page, and closeEditor when Back is pressed while editing chords.
import {setHost} from './host.js';
import * as Edits from './edits.js';
import {useLanguage, tr} from './i18n.js';
import {createSheetPanel, sheetKeys} from './sheetpanel.js';
import {store} from './ui.js';
import * as Player from './player.js';

const params = new URLSearchParams(location.search);
const sheetId = params.get('id');
const lyricsId = params.get('lyrics');
const root = document.documentElement;

useLanguage(params.get('lang') || 'en');
const theme = params.get('theme') || (params.get('dark') === '1' ? 'dark' : 'light');
root.dataset.theme = ['light', 'dark', 'black'].includes(theme) ? theme : 'light';
// the reader's light paper (the app kept it before the viewer kept its own settings): taken over once
if (params.get('paper') === 'light' && store.get('sheetPaper', undefined) === undefined) store.set('sheetPaper', 'light');

// where the sheets come from: the app's assets, served over https (WebViewAssetLoader)
const bridge = window.HymnsEdits;
setHost({
  verovio: () => 'verovio-toolkit-wasm.js',
  mei: async (id) => {
    const r = await fetch('../sheetMei/' + encodeURIComponent(id) + '.mei');
    if (!r.ok) throw new Error('no sheet ' + id);
    return r.text();
  },
  lyrics: async (id) => {
    const r = await fetch('../sheetLyrics/' + encodeURIComponent(id) + '.json');
    return r.ok ? r.json() : null;
  },
  // this device's chord edits are the app's (ChordEdits.java, so Settings can export them); a browser trying the page
  // out keeps them as the web app does
  edits: bridge ? {
    get: async (id) => ({bars: JSON.parse(bridge.get(id) || '{}')}),
    put: async (id, bars) => { if (bridge.put(id, JSON.stringify(bars)) !== true) throw new Error('not saved'); },
  } : Edits,
  // Save MIDI: the app asks where to save it (a WebView does not download)
  ...(bridge && bridge.saveFile ? {saveFile: (name, type, bytes) => {
    let bin = '';
    const u8 = new Uint8Array(bytes.buffer || bytes);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    bridge.saveFile(name, btoa(bin));
  }} : {}),
});

const pane = document.querySelector('.sheet-pane');
const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : null);
const day = hex(params.get('accent')), night = hex(params.get('accentNight'));
if (day) pane.setAttribute('style', '--gd:' + day + ';--gn:' + (night || day));

const tune = /^m[0-9a-z]+$/.test(params.get('tune') || '') ? '/res/raw/' + params.get('tune') + '.mid' : null;
const close = () => { location.href = 'hymnsviewer://close'; };
const sheet = createSheetPanel(pane, {
  sheetId, lyricsId, id: lyricsId || sheetId,
  params: new URLSearchParams({v: params.get('variant') === 'guitar' ? 'guitar' : 'piano'}),
  full: true, tune, pinch: true,
  exit: {icon: 'prev', title: tr('Back'), run: close, first: true},
  onedit: (on) => { try { if (bridge && bridge.setEditing) bridge.setEditing(on); } catch (e) { /* Back closes the sheet */ } },
});

// Back while editing chords closes the editor (the app asks)
window.closeEditor = () => sheet.setEdit(false);
// the app calls this when the viewer is left (SheetMusicActivity.onPause): nothing keeps playing behind the next screen
window.stopPlaying = () => Player.stop();

// the camera cutout (CSS pixels): the toolbar and the music keep clear of it
window.setInsets = (top, right, bottom, left) => {
  root.style.setProperty('--it', top + 'px');
  root.style.setProperty('--ir', right + 'px');
  root.style.setProperty('--ib', bottom + 'px');
  root.style.setProperty('--il', left + 'px');
};
// the on-screen keyboard (CSS pixels it covers): the chord editor stays above it while a chord is typed
window.setKeyboard = (height) => root.style.setProperty('--kb', Math.max(0, height) + 'px');

// a keyboard on a tablet: the web app's keys for the sheet
const keys = Object.assign({' ': () => sheet.togglePlay(), Escape: () => (sheet.editing ? sheet.setEdit(false) : close())}, sheetKeys(() => sheet));
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return;
  const fn = keys[e.key];
  if (fn) { e.preventDefault(); fn(); }
});
