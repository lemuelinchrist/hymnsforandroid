// What the sheet code (sheet.js, sheetpanel.js and the rest) needs from the app it runs in. The web app and the Android
// app's sheet viewer run the same sheet code; each tells it here where things come from (setHost at its start):
//   verovio()        the url of the Verovio script
//   mei(id)          the MEI text of a sheet (a promise; throws when there is none)
//   lyrics(id)       the words of another language for a sheet (sheetLyrics: a promise of the JSON text's object, or null)
//   edits            this device's chord edits: get(sheet) -> {bars} | null, put(sheet, bars) (promises; edits.js by default)
//   saveFile(name, type, bytes)   gives the reader a file (Save MIDI); by default the browser downloads it
//   print(title, done)   prints the page as it is now (Print in ⋯), calls done() when printing is over; by default the
//                        browser's print dialog
import * as Edits from './edits.js';

export const host = {
  verovio: () => 'verovio/verovio-toolkit-wasm.js',
  mei: async (id) => { throw new Error('no sheet ' + id); },
  lyrics: async () => null,
  edits: Edits,
  saveFile: (name, type, bytes) => {
    const url = URL.createObjectURL(new Blob([bytes], {type}));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  print: (title, done) => {
    const after = () => { removeEventListener('afterprint', after); done(); };
    addEventListener('afterprint', after);
    window.print();
  },
};

export function setHost(parts) {
  Object.assign(host, parts);
}
